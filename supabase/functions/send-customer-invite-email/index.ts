declare const Deno: {
    env: {
        get(name: string): string | undefined;
    };
};

type CustomerInvite = {
    id: string;
    company_id: string;
    invited_email: string | null;
    invited_name: string | null;
    invite_code: string | null;
    status: string | null;
};

type CompanyRecord = {
    id: string;
    name: string | null;
    public_name: string | null;
    dba_name: string | null;
};

type FunctionEnv = {
    supabaseUrl: string;
    publishableKey: string;
    publicAppUrl: string;
    fromEmail: string;
    resendApiKey: string;
    sendgridApiKey: string;
};

const CUSTOMER_INVITE_ROUTE = '/customer-invite';

export default {
    async fetch(req: Request): Promise<Response> {
        if (req.method === 'OPTIONS') {
            return handleOptions(req);
        }

        if (req.method !== 'POST') {
            return json(req, { ok: false, message: 'Method not allowed.' }, 405);
        }

        try {
            const env = loadFunctionEnv();
            const authToken = getBearerToken(req);

            if (!authToken) {
                return json(req, { ok: false, message: 'Not authenticated.' }, 401);
            }

            if (!env.resendApiKey && !env.sendgridApiKey) {
                return json(req, { ok: false, message: 'Email sending is not configured yet. Copy the invite message for now.' }, 501);
            }

            const body = await readJsonBody(req);
            const invitationId = String(body.invitation_id || body.invitationId || '').trim();

            if (!invitationId) {
                return json(req, { ok: false, message: 'Customer invitation id is required.' }, 400);
            }

            const invite = await loadInvite(env, authToken, invitationId);

            if (!invite?.invited_email || !invite.invite_code) {
                return json(req, { ok: false, message: 'Customer invite email or code is missing.' }, 400);
            }

            if (normalizeStatus(invite.status) !== 'pending') {
                return json(req, { ok: false, message: 'Only pending customer invites can be emailed.' }, 400);
            }

            const company = await loadCompany(env, authToken, invite.company_id);
            const companyName = companyNameFromRecord(company);
            const inviteLink = buildInviteLink(env.publicAppUrl, invite.invite_code);
            const subject = `${companyName} invited you to connect your home`;
            const text = [
                `Hi${invite.invited_name ? ` ${invite.invited_name}` : ''},`,
                '',
                `${companyName} invited you to securely connect your HomeOS home.`,
                '',
                `Open this link: ${inviteLink}`,
                `Invite code: ${invite.invite_code}`,
                '',
                'This connection shares only basic home/customer information. Private HomeOS photos, documents, and history are not shared by this invite.',
            ].join('\n');

            const html = text
                .split('\n')
                .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : '<br />'))
                .join('');

            const sendResult = env.resendApiKey
                ? await sendWithResend(env, invite.invited_email, subject, text, html)
                : await sendWithSendGrid(env, invite.invited_email, subject, text, html);

            if (!sendResult.ok) {
                return json(req, { ok: false, message: sendResult.message }, sendResult.status);
            }

            return json(req, { ok: true, message: 'Customer invite email sent.' });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unexpected email invite error.';
            return json(req, { ok: false, message }, 500);
        }
    },
};

function handleOptions(req: Request) {
    const { allowed, headers } = corsHeaders(req);

    return new Response(allowed ? 'ok' : 'forbidden', {
        status: allowed ? 200 : 403,
        headers,
    });
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders(req).headers,
            'Content-Type': 'application/json; charset=utf-8',
        },
    });
}

function corsHeaders(req: Request) {
    const origin = req.headers.get('Origin') ?? '';
    const allowedOrigin = resolveAllowedCorsOrigin(origin);
    const headers: Record<string, string> = {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };

    if (allowedOrigin) {
        headers['Access-Control-Allow-Origin'] = allowedOrigin;
    }

    return {
        allowed: !origin || !!allowedOrigin,
        headers,
    };
}

function resolveAllowedCorsOrigin(origin: string) {
    if (!origin) return '';

    const allowedOrigins = new Set<string>();
    const publicAppUrl = Deno.env.get('PUBLIC_APP_URL');

    if (publicAppUrl) {
        try {
            allowedOrigins.add(new URL(publicAppUrl).origin);
        } catch {
            // Invalid public app URL is reported during POST env validation.
        }
    }

    for (const configuredOrigin of parseCsv(Deno.env.get('CUSTOMER_INVITE_CORS_ORIGINS'))) {
        try {
            allowedOrigins.add(new URL(configuredOrigin).origin);
        } catch {
            // Ignore malformed CORS entries instead of widening access.
        }
    }

    return allowedOrigins.has(origin) ? origin : '';
}

function loadFunctionEnv(): FunctionEnv {
    return {
        supabaseUrl: normalizeUrl(requireEnv('SUPABASE_URL')),
        publishableKey: getPublishableKey(),
        publicAppUrl: normalizeUrl(requireEnv('PUBLIC_APP_URL')),
        fromEmail: requireEnv('INVITE_FROM_EMAIL'),
        resendApiKey: Deno.env.get('RESEND_API_KEY') || '',
        sendgridApiKey: Deno.env.get('SENDGRID_API_KEY') || '',
    };
}

function getPublishableKey() {
    const keys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
    const firstKey = parseCsv(keys)[0];

    return firstKey || Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
}

function requireEnv(name: string) {
    const value = Deno.env.get(name);

    if (!value) {
        throw new Error('Email sending is not configured yet. Copy the invite message for now.');
    }

    return value;
}

function normalizeUrl(value: string) {
    const url = new URL(value);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Email sending is not configured yet. Copy the invite message for now.');
    }

    return url.toString().replace(/\/+$/, '');
}

function getBearerToken(req: Request) {
    const header = req.headers.get('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);

    return match?.[1] || '';
}

async function readJsonBody(req: Request) {
    try {
        const body = await req.json();
        return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    } catch {
        return {};
    }
}

async function loadInvite(env: FunctionEnv, authToken: string, invitationId: string) {
    const url = new URL('/rest/v1/company_customer_invitations', env.supabaseUrl);
    url.searchParams.set('id', `eq.${invitationId}`);
    url.searchParams.set('select', 'id,company_id,invited_email,invited_name,invite_code,status');
    url.searchParams.set('limit', '1');

    const response = await fetch(url, {
        headers: restHeaders(env, authToken),
    });

    if (!response.ok) {
        throw new Error('Customer invite could not be loaded for email delivery.');
    }

    const rows = (await response.json()) as CustomerInvite[];

    return rows[0] || null;
}

async function loadCompany(env: FunctionEnv, authToken: string, companyId: string) {
    const url = new URL('/rest/v1/companies', env.supabaseUrl);
    url.searchParams.set('id', `eq.${companyId}`);
    url.searchParams.set('select', 'id,name,public_name,dba_name');
    url.searchParams.set('limit', '1');

    const response = await fetch(url, {
        headers: restHeaders(env, authToken),
    });

    if (!response.ok) {
        return null;
    }

    const rows = (await response.json()) as CompanyRecord[];

    return rows[0] || null;
}

function restHeaders(env: FunctionEnv, authToken: string) {
    return {
        apikey: env.publishableKey,
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
    };
}

async function sendWithResend(env: FunctionEnv, to: string, subject: string, text: string, html: string) {
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.resendApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: env.fromEmail,
            to,
            subject,
            text,
            html,
        }),
    });

    return response.ok
        ? { ok: true, status: 200, message: 'Customer invite email sent.' }
        : { ok: false, status: response.status, message: 'Email sending failed. Copy the invite message for now.' };
}

async function sendWithSendGrid(env: FunctionEnv, to: string, subject: string, text: string, html: string) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.sendgridApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: env.fromEmail },
            subject,
            content: [
                { type: 'text/plain', value: text },
                { type: 'text/html', value: html },
            ],
        }),
    });

    return response.ok
        ? { ok: true, status: 200, message: 'Customer invite email sent.' }
        : { ok: false, status: response.status, message: 'Email sending failed. Copy the invite message for now.' };
}

function buildInviteLink(publicAppUrl: string, inviteCode: string) {
    const url = new URL(CUSTOMER_INVITE_ROUTE, publicAppUrl);
    url.searchParams.set('code', inviteCode);

    return url.toString();
}

function companyNameFromRecord(company: CompanyRecord | null) {
    return company?.public_name || company?.dba_name || company?.name || 'Your service company';
}

function normalizeStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function parseCsv(value?: string) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
