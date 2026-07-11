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
    expires_at: string | null;
    revoked_at: string | null;
    accepted_at: string | null;
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

type ErrorCode =
    | 'method_not_allowed'
    | 'not_authenticated'
    | 'email_provider_not_configured'
    | 'missing_configuration'
    | 'invalid_configuration'
    | 'invalid_invitation'
    | 'invite_not_found'
    | 'invite_not_sendable'
    | 'rest_lookup_failed'
    | 'email_send_failed'
    | 'unexpected_error';

type SendResult = {
    ok: boolean;
    status: number;
    message: string;
    code?: string;
    details?: string;
};

const CUSTOMER_INVITE_ROUTE = '/customer-invite';

export default {
    async fetch(req: Request): Promise<Response> {
        if (req.method === 'OPTIONS') {
            return handleOptions(req);
        }

        if (req.method !== 'POST') {
            return errorJson(req, 405, 'method_not_allowed', 'Method not allowed.');
        }

        try {
            const env = loadFunctionEnv();
            const authToken = getBearerToken(req);

            if (!authToken) {
                return errorJson(req, 401, 'not_authenticated', 'Sign in again before sending this customer invitation.');
            }

            if (!await verifyCaller(env, authToken)) {
                return errorJson(req, 401, 'not_authenticated', 'Sign in again before sending this customer invitation.');
            }

            if (!env.resendApiKey && !env.sendgridApiKey) {
                return errorJson(
                    req,
                    501,
                    'email_provider_not_configured',
                    'Email provider credentials are missing.',
                    'Set RESEND_API_KEY or SENDGRID_API_KEY in Supabase Edge Function secrets.'
                );
            }

            const body = await readJsonBody(req);
            const invitationId = String(body.invitation_id || body.invitationId || '').trim();

            if (!invitationId) {
                return errorJson(req, 400, 'invalid_invitation', 'Customer invitation id is required.');
            }

            const invite = await loadInvite(env, authToken, invitationId);

            if (!invite) {
                return errorJson(
                    req,
                    404,
                    'invite_not_found',
                    'Customer invitation was not found or you do not have permission to send it.',
                    'Confirm this invitation belongs to your active company access.'
                );
            }

            if (!invite.invited_email || !invite.invite_code) {
                return errorJson(req, 400, 'invite_not_sendable', 'Customer invite email or code is missing.');
            }

            if (normalizeStatus(invite.status) !== 'pending') {
                return errorJson(req, 409, 'invite_not_sendable', 'This invitation is no longer active.');
            }

            if (invite.revoked_at || invite.accepted_at) {
                return errorJson(req, 409, 'invite_not_sendable', 'This invitation is no longer active.');
            }

            if (isExpired(invite.expires_at)) {
                return errorJson(req, 410, 'invite_not_sendable', 'This invitation has expired.');
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
                return errorJson(
                    req,
                    sendResult.status,
                    'email_send_failed',
                    sendResult.message,
                    sendResult.details || sendResult.code || ''
                );
            }

            return json(req, { ok: true, message: 'Customer invite email sent.' });
        } catch (error) {
            if (error instanceof RequestError) {
                return errorJson(req, error.status, error.code, error.safeMessage, error.detail);
            }

            const message = error instanceof Error ? error.message : 'Unexpected email invite error.';
            return errorJson(req, 500, 'unexpected_error', 'Unexpected customer invite email error.', message);
        }
    },
};

class RequestError extends Error {
    status: number;
    code: ErrorCode;
    safeMessage: string;
    detail: string;

    constructor(status: number, code: ErrorCode, safeMessage: string, detail = '') {
        super(safeMessage);
        this.status = status;
        this.code = code;
        this.safeMessage = safeMessage;
        this.detail = detail;
    }
}

function errorJson(req: Request, status: number, code: ErrorCode, error: string, details = '') {
    return json(req, {
        ok: false,
        error,
        code,
        details,
        message: error,
    }, status);
}

function handleOptions(req: Request) {
    return new Response('ok', {
        status: 200,
        headers: corsHeaders(req),
    });
}

function json(req: Request, body: Record<string, unknown>, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...corsHeaders(req),
            'Content-Type': 'application/json; charset=utf-8',
        },
    });
}

function corsHeaders(req: Request) {
    const origin = req.headers.get('Origin') ?? '';
    const allowedOrigin = resolveAllowedCorsOrigin(origin) || origin || '*';
    const headers: Record<string, string> = {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    };

    return headers;
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
        supabaseUrl: normalizeUrl(requireEnv('SUPABASE_URL'), 'SUPABASE_URL'),
        publishableKey: requirePublishableKey(),
        publicAppUrl: normalizeUrl(requireEnv('PUBLIC_APP_URL'), 'PUBLIC_APP_URL'),
        fromEmail: requireEnv('INVITE_FROM_EMAIL'),
        resendApiKey: Deno.env.get('RESEND_API_KEY') || '',
        sendgridApiKey: Deno.env.get('SENDGRID_API_KEY') || '',
    };
}

function getPublishableKey() {
    const directKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');

    if (directKey) return directKey;

    const publishableKeysJson = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');

    if (publishableKeysJson) {
        try {
            const parsed = JSON.parse(publishableKeysJson) as Record<string, unknown>;
            const defaultKey = parsed.default;

            if (typeof defaultKey === 'string' && defaultKey) return defaultKey;

            const firstKey = Object.values(parsed).find((value) => typeof value === 'string' && value);

            if (typeof firstKey === 'string') return firstKey;
        } catch {
            throw new RequestError(
                500,
                'invalid_configuration',
                'Supabase publishable key configuration is invalid.',
                'SUPABASE_PUBLISHABLE_KEYS must be JSON, or set SUPABASE_ANON_KEY.'
            );
        }
    }

    return '';
}

function requirePublishableKey() {
    const publishableKey = getPublishableKey();

    if (!publishableKey) {
        throw new RequestError(
            500,
            'missing_configuration',
            'Supabase publishable key is not configured.',
            'Set SUPABASE_PUBLISHABLE_KEYS or SUPABASE_ANON_KEY in Supabase Edge Function secrets.'
        );
    }

    return publishableKey;
}

function requireEnv(name: string) {
    const value = Deno.env.get(name);

    if (!value) {
        throw new RequestError(
            500,
            'missing_configuration',
            'Customer invitation email configuration is missing.',
            `Set ${name} in Supabase Edge Function secrets.`
        );
    }

    return value;
}

function normalizeUrl(value: string, name: string) {
    let url: URL;

    try {
        url = new URL(value);
    } catch {
        throw new RequestError(
            500,
            'invalid_configuration',
            'Customer invitation email configuration is invalid.',
            `${name} must be a valid URL.`
        );
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new RequestError(
            500,
            'invalid_configuration',
            'Customer invitation email configuration is invalid.',
            `${name} must start with http:// or https://.`
        );
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
    url.searchParams.set('select', 'id,company_id,invited_email,invited_name,invite_code,status,expires_at,revoked_at,accepted_at');
    url.searchParams.set('limit', '1');

    const response = await fetch(url, {
        headers: restHeaders(env, authToken),
    });

    if (!response.ok) {
        throw new RequestError(
            response.status,
            'rest_lookup_failed',
            'Customer invite could not be loaded for email delivery.',
            await readSafeErrorDetail(response)
        );
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

async function verifyCaller(env: FunctionEnv, authToken: string) {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
        headers: {
            apikey: env.publishableKey,
            Authorization: `Bearer ${authToken}`,
        },
    });

    if (!response.ok) return false;

    const data = (await response.json().catch(() => null)) as { id?: unknown } | null;

    return typeof data?.id === 'string' && data.id.length > 0;
}

async function sendWithResend(env: FunctionEnv, to: string, subject: string, text: string, html: string): Promise<SendResult> {
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

    if (response.ok) {
        return { ok: true, status: 200, message: 'Customer invite email sent.' };
    }

    const details = await readSafeProviderDetail(response);

    return {
        ok: false,
        status: normalizeProviderStatus(response.status),
        message: providerMessageFromDetail(details) || 'Email provider rejected the customer invitation email.',
        details,
    };
}

async function sendWithSendGrid(env: FunctionEnv, to: string, subject: string, text: string, html: string): Promise<SendResult> {
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

    if (response.ok) {
        return { ok: true, status: 200, message: 'Customer invite email sent.' };
    }

    const details = await readSafeProviderDetail(response);

    return {
        ok: false,
        status: normalizeProviderStatus(response.status),
        message: providerMessageFromDetail(details) || 'Email provider rejected the customer invitation email.',
        details,
    };
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

function isExpired(value?: string | null) {
    if (!value) return false;

    const expiresAt = Date.parse(value);

    return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function parseCsv(value?: string) {
    return String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizeProviderStatus(status: number) {
    return status >= 400 && status < 600 ? status : 502;
}

async function readSafeErrorDetail(response: Response) {
    const text = await safeResponseText(response);

    return text || `HTTP ${response.status}`;
}

async function readSafeProviderDetail(response: Response) {
    const text = await safeResponseText(response);

    if (!text) return `Provider HTTP ${response.status}`;

    try {
        const body = JSON.parse(text) as Record<string, unknown>;
        const name = readString(body.name) || readString(body.code) || readString(body.error);
        const message = readString(body.message) || readString(body.error_description) || text;

        return [name, message].filter(Boolean).join(': ') || `Provider HTTP ${response.status}`;
    } catch {
        return text.slice(0, 300);
    }
}

async function safeResponseText(response: Response) {
    try {
        return (await response.text()).slice(0, 500);
    } catch {
        return '';
    }
}

function providerMessageFromDetail(detail: string) {
    const normalized = normalizeStatus(detail);

    if (normalized.includes('domain') || normalized.includes('verify') || normalized.includes('sender')) {
        return 'Invitation email sender is not verified.';
    }

    if (normalized.includes('api key') || normalized.includes('unauthorized') || normalized.includes('forbidden')) {
        return 'Email provider credentials are invalid or not allowed to send this invite.';
    }

    if (normalized.includes('rate')) {
        return 'Email provider rate limit reached. Try again shortly.';
    }

    return '';
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
