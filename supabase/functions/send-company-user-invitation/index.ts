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
    redirectTo: string;
};

const INVITATION_ROUTE = '/onboarding/company-invitations';
const UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_BODY_FIELDS = new Set([
    'email',
    'redirectTo',
    'redirect_to',
    'redirectUrl',
    'redirect_url',
    'companyId',
    'company_id',
    'role',
    'userId',
    'user_id',
]);

export default {
    async fetch(req: Request): Promise<Response> {
        if (req.method === 'OPTIONS') {
            return handleOptions(req);
        }

        if (req.method !== 'POST') {
            return json(req, { ok: false, code: 'method_not_allowed' }, 405);
        }

        try {
            const env = loadFunctionEnv();
            const authToken = getBearerToken(req);

            if (!authToken) {
                return json(req, { ok: false, code: 'not_authenticated' }, 401);
            }

            const body = await readJsonBody(req);
            const invalidField = Object.keys(body).find((key) => FORBIDDEN_BODY_FIELDS.has(key));

            if (invalidField) {
                return json(req, { ok: false, code: 'invalid_request' }, 400);
            }

            const invitationId = normalizeInvitationId(body.invitation_id ?? body.invitationId);

            if (!invitationId) {
                return json(req, { ok: false, code: 'invalid_invitation' }, 400);
            }

            const userVerified = await verifyCaller(env, authToken);

            if (!userVerified) {
                return json(req, { ok: false, code: 'not_authenticated' }, 401);
            }

            const invitation = await prepareInvitationDelivery(env, authToken, invitationId);
            const sendResult = await sendSupabaseAuthEmail(env, invitation.email);

            if (!sendResult.ok) {
                await recordDelivery(env, authToken, invitationId, 'failed', sendResult.trackingMessage);

                return json(
                    req,
                    {
                        ok: false,
                        code: sendResult.responseCode,
                        message: sendResult.responseMessage,
                    },
                    sendResult.status
                );
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

            return json(req, {
                ok: true,
                code: 'sent',
                message: 'Invitation email sent.',
            });
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

            return json(req, { ok: false, code: 'unexpected_error' }, 500);
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
    const appBaseUrl = Deno.env.get('COMPANY_INVITATION_APP_BASE_URL') ?? Deno.env.get('APP_BASE_URL');

    if (appBaseUrl) {
        try {
            allowedOrigins.add(new URL(appBaseUrl).origin);
        } catch {
            // Invalid app URL is handled during POST configuration validation.
        }
    }

    for (const configuredOrigin of parseCsv(Deno.env.get('COMPANY_INVITATION_CORS_ORIGINS'))) {
        try {
            allowedOrigins.add(new URL(configuredOrigin).origin);
        } catch {
            // Ignore malformed CORS entries instead of widening access.
        }
    }

    return allowedOrigins.has(origin) ? origin : '';
}

function loadFunctionEnv(): FunctionEnv {
    const supabaseUrl = normalizeUrl(requireEnv('SUPABASE_URL'), 'SUPABASE_URL');
    const publishableKey = getPublishableKey();
    const redirectTo = buildRedirectUrl();

    return {
        supabaseUrl,
        publishableKey,
        redirectTo,
    };
}

function buildRedirectUrl() {
    const rawBaseUrl = Deno.env.get('COMPANY_INVITATION_APP_BASE_URL') ?? Deno.env.get('APP_BASE_URL');

    if (!rawBaseUrl) {
        throw new RequestError(500, 'missing_app_base_url', 'Invitation email delivery is not configured.');
    }

    const baseUrl = parseHttpUrl(rawBaseUrl, 'APP_BASE_URL');
    const redirectUrl = new URL(INVITATION_ROUTE, baseUrl);

    if (!redirectUrl.pathname.endsWith(INVITATION_ROUTE)) {
        throw new RequestError(500, 'invalid_redirect_url', 'Invitation email delivery is not configured.');
    }

    const allowedRedirectOrigins = parseCsv(Deno.env.get('COMPANY_INVITATION_REDIRECT_ORIGINS'));

    if (allowedRedirectOrigins.length > 0) {
        const allowed = allowedRedirectOrigins.some((origin) => {
            try {
                return new URL(origin).origin === redirectUrl.origin;
            } catch {
                return false;
            }
        });

        if (!allowed) {
            throw new RequestError(500, 'redirect_origin_not_allowed', 'Invitation email delivery is not configured.');
        }
    }

    return redirectUrl.toString();
}

function normalizeUrl(value: string, name: string) {
    const url = parseHttpUrl(value, name);

    return url.toString().replace(/\/+$/, '');
}

function parseHttpUrl(value: string, name: string) {
    try {
        const url = new URL(value);

        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw new Error('Invalid protocol');
        }

        url.hash = '';
        url.search = '';
        return url;
    } catch {
        throw new RequestError(500, `invalid_${name.toLowerCase()}`, 'Invitation email delivery is not configured.');
    }
}

function requireEnv(name: string) {
    const value = Deno.env.get(name);

    if (!value) {
        throw new RequestError(500, `missing_${name.toLowerCase()}`, 'Invitation email delivery is not configured.');
    }

    return value;
}

function getPublishableKey() {
    const directKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY');

    if (directKey) {
        return directKey;
    }

    const publishableKeysJson = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');

    if (publishableKeysJson) {
        try {
            const parsed = JSON.parse(publishableKeysJson) as Record<string, unknown>;
            const defaultKey = parsed.default;

            if (typeof defaultKey === 'string' && defaultKey) {
                return defaultKey;
            }

            const firstKey = Object.values(parsed).find((value) => typeof value === 'string' && value);

            if (typeof firstKey === 'string') {
                return firstKey;
            }
        } catch {
            throw new RequestError(500, 'invalid_supabase_publishable_keys', 'Invitation email delivery is not configured.');
        }
    }

    throw new RequestError(500, 'missing_supabase_publishable_key', 'Invitation email delivery is not configured.');
}

function getBearerToken(req: Request) {
    const authorization = req.headers.get('Authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(authorization);

    return match?.[1]?.trim() || null;
}

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
    try {
        const body = await req.json();

        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return {};
        }

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

    if (!response.ok) {
        return false;
    }

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

async function sendSupabaseAuthEmail(env: FunctionEnv, email: string) {
    const otpUrl = new URL(`${env.supabaseUrl}/auth/v1/otp`);
    otpUrl.searchParams.set('redirect_to', env.redirectTo);

    const response = await fetch(otpUrl.toString(), {
        method: 'POST',
        headers: {
            apikey: env.publishableKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Client-Info': 'barbarosa-company-invitations-edge',
        },
        body: JSON.stringify({
            email,
            data: {},
            create_user: true,
            gotrue_meta_security: {},
        }),
    });

    if (response.ok) {
        return { ok: true as const };
    }

    const responseBody = parseJson<RpcErrorBody>(await response.text());
    const message = String(responseBody?.message ?? '').toLowerCase();

    if (response.status === 429 || message.includes('rate limit')) {
        return {
            ok: false as const,
            status: 429,
            responseCode: 'auth_rate_limited',
            responseMessage: 'Please wait before sending another invitation email.',
            trackingMessage: 'Supabase Auth rate limit exceeded',
        };
    }

    if (response.status >= 500) {
        return {
            ok: false as const,
            status: 502,
            responseCode: 'auth_unavailable',
            responseMessage: 'Invitation email could not be sent right now.',
            trackingMessage: 'Supabase Auth email service unavailable',
        };
    }

    return {
        ok: false as const,
        status: 400,
        responseCode: 'auth_delivery_rejected',
        responseMessage: 'Invitation email could not be sent.',
        trackingMessage: 'Supabase Auth email delivery rejected',
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
        return {
            status: 429,
            code: 'cooldown',
            message: 'Please wait before sending another invitation email.',
        };
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
        message: 'Invitation email cannot be sent.',
    };
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
