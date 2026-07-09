declare const Deno: {
    env: {
        get(name: string): string | undefined;
    };
};

type DeliveryInvitation = {
    invitation_id: string;
    company_id: string;
    company_name: string | null;
    email: string;
    invited_role: string;
    full_name: string | null;
    expires_at: string | null;
    last_email_attempted_at: string | null;
    last_email_sent_at: string | null;
    email_send_count: number;
    cooldown_ends_at: string | null;
};

type RpcErrorBody = {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
};

type FunctionEnv = {
    supabaseUrl: string;
    publishableKey: string;
    publicAppUrl: string;
    fromEmail: string;
    resendApiKey: string;
    sendgridApiKey: string;
};

type SendResult = {
    ok: boolean;
    status: number;
    message: string;
};

const COMPANY_INVITE_ROUTE = '/company-invite';
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default {
    async fetch(req: Request): Promise<Response> {
        if (req.method === 'OPTIONS') {
            return handleOptions(req);
        }

        if (req.method !== 'POST') {
            return json(req, { ok: false, code: 'method_not_allowed', message: 'Method not allowed.' }, 405);
        }

        try {
            const env = loadFunctionEnv();
            const authToken = getBearerToken(req);

            if (!authToken) {
                return json(req, { ok: false, code: 'not_authenticated', message: 'Not authenticated.' }, 401);
            }

            if (!env.resendApiKey && !env.sendgridApiKey) {
                return json(
                    req,
                    {
                        ok: false,
                        code: 'email_provider_not_configured',
                        message: 'Email provider is not configured. Set RESEND_API_KEY or SENDGRID_API_KEY.',
                    },
                    501
                );
            }

            if (!env.fromEmail) {
                return json(
                    req,
                    {
                        ok: false,
                        code: 'missing_invite_from_email',
                        message: 'Invite sender email is not configured. Set INVITE_FROM_EMAIL.',
                    },
                    500
                );
            }

            const body = await readJsonBody(req);
            const invitationIdInput = body.invitation_id ?? body.invitationId ?? body.p_invitation_id;
            const invitationId = normalizeInvitationId(invitationIdInput);

            if (!invitationId) {
                const message = invitationIdInput
                    ? 'Invitation id is invalid.'
                    : 'Invitation id is required.';

                return json(req, { ok: false, code: 'invalid_invitation', message }, 400);
            }

            const userVerified = await verifyCaller(env, authToken);

            if (!userVerified) {
                return json(req, { ok: false, code: 'not_authenticated', message: 'Not authenticated.' }, 401);
            }

            const invitation = await prepareInvitationDelivery(env, authToken, invitationId);
            const clientEmail = readStringField(body, 'email');

            if (clientEmail && normalizeEmail(clientEmail) !== normalizeEmail(invitation.email)) {
                return json(req, { ok: false, code: 'email_mismatch', message: 'Invite email does not match this invitation.' }, 400);
            }

            const inviteCode = readStringField(body, 'invite_code') || readStringField(body, 'inviteCode');
            const inviteLink = resolveInviteLink(env, body, inviteCode);

            if (!inviteLink) {
                return json(
                    req,
                    {
                        ok: false,
                        code: 'invite_link_missing',
                        message: 'Company invite link/code is missing. Create a manual invite link before sending email.',
                    },
                    400
                );
            }

            if (isLikelyLocalInviteLink(inviteLink)) {
                return json(
                    req,
                    {
                        ok: false,
                        code: 'invite_link_not_public',
                        message: 'Company invite email link is not public. Set EXPO_PUBLIC_APP_URL in the app and PUBLIC_APP_URL in Supabase Edge Function secrets.',
                    },
                    400
                );
            }

            const inviteName = readStringField(body, 'invite_name') || readStringField(body, 'inviteName') || invitation.full_name;
            const companyName = invitation.company_name || readStringField(body, 'company_name') || readStringField(body, 'companyName') || 'Your company';
            const role = invitation.invited_role || readStringField(body, 'role') || 'team member';
            const { subject, text, html } = buildCompanyInviteEmail({
                companyName,
                inviteName,
                role,
                inviteCode,
                inviteLink,
            });

            const sendResult = env.resendApiKey
                ? await sendWithResend(env, invitation.email, subject, text, html)
                : await sendWithSendGrid(env, invitation.email, subject, text, html);

            if (!sendResult.ok) {
                await recordDelivery(env, authToken, invitationId, 'failed', sendResult.message);
                return json(req, { ok: false, code: 'email_send_failed', message: sendResult.message }, sendResult.status);
            }

            try {
                await recordDelivery(env, authToken, invitationId, 'sent', null);
            } catch {
                return json(
                    req,
                    {
                        ok: true,
                        code: 'sent_tracking_pending',
                        message: 'Invitation email was sent. Delivery tracking could not be updated.',
                    },
                    202
                );
            }

            return json(req, { ok: true, code: 'sent', message: 'Invitation email sent.' });
        } catch (error) {
            if (error instanceof RequestError) {
                return json(
                    req,
                    {
                        ok: false,
                        code: error.code,
                        message: error.safeMessage,
                    },
                    error.status
                );
            }

            const message = error instanceof Error ? error.message : 'Unexpected invitation email error.';
            return json(req, { ok: false, code: 'unexpected_error', message }, 500);
        }
    },
};

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

    for (const configuredOrigin of [
        Deno.env.get('PUBLIC_APP_URL'),
        Deno.env.get('COMPANY_INVITATION_APP_BASE_URL'),
        Deno.env.get('APP_BASE_URL'),
        ...parseCsv(Deno.env.get('COMPANY_INVITATION_CORS_ORIGINS')),
    ]) {
        if (!configuredOrigin) continue;

        try {
            allowedOrigins.add(new URL(configuredOrigin).origin);
        } catch {
            // Invalid app URL is reported during POST env validation.
        }
    }

    return allowedOrigins.has(origin) ? origin : '';
}

function loadFunctionEnv(): FunctionEnv {
    return {
        supabaseUrl: normalizeUrl(requireEnv('SUPABASE_URL', 'SUPABASE_URL')),
        publishableKey: getPublishableKey(),
        publicAppUrl: normalizeOptionalUrl(
            Deno.env.get('PUBLIC_APP_URL') ||
            Deno.env.get('COMPANY_INVITATION_APP_BASE_URL') ||
            Deno.env.get('APP_BASE_URL')
        ),
        fromEmail: Deno.env.get('INVITE_FROM_EMAIL') || '',
        resendApiKey: Deno.env.get('RESEND_API_KEY') || '',
        sendgridApiKey: Deno.env.get('SENDGRID_API_KEY') || '',
    };
}

function requireEnv(name: string, secretName: string) {
    const value = Deno.env.get(name);

    if (!value) {
        throw new RequestError(
            500,
            `missing_${name.toLowerCase()}`,
            `Email provider is not configured. Set ${secretName} in Supabase Edge Function secrets.`
        );
    }

    return value;
}

function normalizeUrl(value: string) {
    const url = new URL(value);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
        throw new Error('Invalid URL protocol.');
    }

    return url.toString().replace(/\/+$/, '');
}

function normalizeOptionalUrl(value?: string) {
    if (!value) return '';

    return normalizeUrl(value);
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
                'invalid_supabase_publishable_keys',
                'Email provider is not configured. Set SUPABASE_PUBLISHABLE_KEYS or SUPABASE_ANON_KEY in Supabase Edge Function secrets.'
            );
        }
    }

    throw new RequestError(
        500,
        'missing_supabase_publishable_key',
        'Email provider is not configured. Set SUPABASE_PUBLISHABLE_KEYS or SUPABASE_ANON_KEY in Supabase Edge Function secrets.'
    );
}

function getBearerToken(req: Request) {
    const authorization = req.headers.get('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);

    return match?.[1]?.trim() || null;
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
    try {
        const body = await req.json();

        if (!body || typeof body !== 'object' || Array.isArray(body)) return {};

        return body as Record<string, unknown>;
    } catch {
        throw new RequestError(400, 'invalid_json', 'Invalid request.');
    }
}

function normalizeInvitationId(value: unknown) {
    if (typeof value !== 'string') return null;

    const normalized = value.trim();

    return UUID_PATTERN.test(normalized) ? normalized : null;
}

async function verifyCaller(env: FunctionEnv, authToken: string) {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
            apikey: env.publishableKey,
            Authorization: `Bearer ${authToken}`,
        },
    });

    if (!response.ok) return false;

    const data = (await response.json().catch(() => null)) as { id?: unknown } | null;

    return typeof data?.id === 'string' && data.id.length > 0;
}

async function prepareInvitationDelivery(env: FunctionEnv, authToken: string, invitationId: string) {
    const rows = await invokeRpc<DeliveryInvitation[]>(
        env,
        authToken,
        'prepare_company_user_invitation_email_delivery',
        {
            p_invitation_id: invitationId,
        }
    );
    const invitation = Array.isArray(rows) ? rows[0] : null;

    if (!invitation?.email) {
        throw new RequestError(404, 'invitation_not_found', 'Invitation email cannot be sent.');
    }

    return invitation;
}

async function recordDelivery(
    env: FunctionEnv,
    authToken: string,
    invitationId: string,
    status: 'sent' | 'failed',
    errorMessage: string | null
) {
    await invokeRpc<unknown>(env, authToken, 'record_company_user_invitation_email_delivery', {
        p_invitation_id: invitationId,
        p_delivery_status: status,
        p_delivery_error: errorMessage,
    });
}

async function invokeRpc<T>(
    env: FunctionEnv,
    authToken: string,
    functionName: string,
    payload: Record<string, unknown>
): Promise<T> {
    const response = await fetch(`${env.supabaseUrl}/rest/v1/rpc/${functionName}`, {
        method: 'POST',
        headers: {
            apikey: env.publishableKey,
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Client-Info': 'barbarosa-company-invitations-edge',
        },
        body: JSON.stringify(payload),
    });
    const text = await response.text();
    const body = parseJson<RpcErrorBody | T>(text);

    if (!response.ok) {
        const rpcBody = body && typeof body === 'object' ? (body as RpcErrorBody) : {};
        const safe = mapRpcError(response.status, rpcBody.message ?? '');

        throw new RequestError(safe.status, safe.code, safe.message);
    }

    return body as T;
}

function resolveInviteLink(env: FunctionEnv, body: Record<string, unknown>, inviteCode: string | null) {
    const explicitLink = readStringField(body, 'invite_link') || readStringField(body, 'inviteLink');

    if (explicitLink && isHttpUrl(explicitLink)) {
        return explicitLink;
    }

    const appBaseUrl = env.publicAppUrl || readRequestAppBaseUrl(body);

    if (!inviteCode || !appBaseUrl) return null;

    const url = new URL(COMPANY_INVITE_ROUTE, appBaseUrl);
    url.searchParams.set('code', inviteCode);

    return url.toString();
}

function readRequestAppBaseUrl(body: Record<string, unknown>) {
    const value =
        readStringField(body, 'app_base_url') ||
        readStringField(body, 'appBaseUrl') ||
        readStringField(body, 'public_app_url') ||
        readStringField(body, 'publicAppUrl');

    if (!value) return '';

    try {
        return normalizeOptionalUrl(value);
    } catch {
        return '';
    }
}

function isHttpUrl(value: string) {
    try {
        const url = new URL(value);

        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function isLikelyLocalInviteLink(value: string) {
    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();

        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
    } catch {
        return true;
    }
}

function buildCompanyInviteEmail({
    companyName,
    inviteName,
    role,
    inviteCode,
    inviteLink,
}: {
    companyName: string;
    inviteName: string | null;
    role: string;
    inviteCode: string | null;
    inviteLink: string;
}) {
    const subject = `${companyName} invited you to join their ManagementOS team`;
    const text = [
        `Hi${inviteName ? ` ${inviteName}` : ''},`,
        '',
        `${companyName} invited you to join their ManagementOS team as ${formatRole(role)}.`,
        '',
        `Open this secure invite link: ${inviteLink}`,
        inviteCode ? `Invite code: ${inviteCode}` : '',
        '',
        'Sign in or create a ManagementOS work account with this email address, then accept the company invitation.',
        'Email confirmation only verifies your work account. Your company invite will continue automatically after confirmation.',
        'This invitation does not expose private HomeOS homeowner data.',
    ].filter((line) => line !== '').join('\n');
    const html = text
        .split('\n')
        .map((line) => (line ? `<p>${escapeHtml(line)}</p>` : '<br />'))
        .join('');

    return { subject, text, html };
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

    return response.ok
        ? { ok: true, status: 200, message: 'Invitation email sent.' }
        : {
            ok: false,
            status: response.status,
            message: `Email sending failed through Resend. Check RESEND_API_KEY and INVITE_FROM_EMAIL. Status ${response.status}.`,
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

    return response.ok
        ? { ok: true, status: 200, message: 'Invitation email sent.' }
        : {
            ok: false,
            status: response.status,
            message: `Email sending failed through SendGrid. Check SENDGRID_API_KEY and INVITE_FROM_EMAIL. Status ${response.status}.`,
        };
}

function mapRpcError(status: number, message: string) {
    const normalized = message.toLowerCase();

    if (normalized.includes('not authenticated')) {
        return { status: 401, code: 'not_authenticated', message: 'Authentication required.' };
    }

    if (normalized.includes('not authorized')) {
        return { status: 403, code: 'not_authorized', message: 'You are not allowed to send this invitation.' };
    }

    if (normalized.includes('wait before sending')) {
        return { status: 429, code: 'cooldown', message: 'Please wait before sending another invitation email.' };
    }

    if (
        normalized.includes('accepted') ||
        normalized.includes('revoked') ||
        normalized.includes('expired') ||
        normalized.includes('pending')
    ) {
        return { status: 409, code: 'invitation_not_sendable', message: 'This invitation cannot be emailed.' };
    }

    if (normalized.includes('not found')) {
        return { status: 404, code: 'invitation_not_found', message: 'Invitation not found.' };
    }

    return {
        status: status >= 400 && status < 600 ? status : 400,
        code: 'delivery_not_ready',
        message: message || 'Invitation email cannot be sent.',
    };
}

function readStringField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeEmail(value: string | null) {
    return String(value || '').trim().toLowerCase();
}

function formatRole(value: string) {
    return String(value || 'team member')
        .trim()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function parseJson<T>(value: string): T | null {
    if (!value) return null;

    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function parseCsv(value: string | undefined) {
    return String(value ?? '')
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

class RequestError extends Error {
    status: number;
    code: string;
    safeMessage: string;

    constructor(status: number, code: string, safeMessage: string) {
        super(code);
        this.status = status;
        this.code = code;
        this.safeMessage = safeMessage;
    }
}
