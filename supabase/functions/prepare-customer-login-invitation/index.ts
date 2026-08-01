declare const Deno: {
    env: {
        get(name: string): string | undefined;
    };
};

type CustomerInvite = {
    id: string;
    invited_email: string | null;
    invited_name: string | null;
    invite_code: string | null;
    status: string | null;
    expires_at: string | null;
    revoked_at: string | null;
    accepted_at: string | null;
};

export default {
    async fetch(req: Request): Promise<Response> {
        if (req.method === 'OPTIONS') return response(req, {}, 204);
        if (req.method !== 'POST') return response(req, { ok: false, message: 'Method not allowed.' }, 405);

        const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
        const publishableKey =
            Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
            Deno.env.get('SUPABASE_ANON_KEY') ||
            '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
        const authToken = getBearerToken(req);

        if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
            return response(req, { ok: false, message: 'Customer login invitations are not configured.' }, 500);
        }
        if (!authToken || !await verifyCaller(supabaseUrl, publishableKey, authToken)) {
            return response(req, { ok: false, message: 'Sign in again before creating a customer login invitation.' }, 401);
        }

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const invitationId = String(body.invitation_id || body.invitationId || '').trim();
        const invite = await loadAuthorizedInvite(supabaseUrl, publishableKey, authToken, invitationId);

        if (!invite) return response(req, { ok: false, message: 'Customer invitation was not found.' }, 404);
        if (!invite.invited_email) return response(req, { ok: false, message: 'Add an email address before creating a login code.' }, 400);
        if (invite.revoked_at || !['pending', 'accepted'].includes(String(invite.status || '').toLowerCase())) {
            return response(req, { ok: false, message: 'This customer invitation is no longer active.' }, 409);
        }

        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        let loginCode = '';
        let saved = false;

        for (let attempt = 0; attempt < 5 && !saved; attempt += 1) {
            loginCode = generateSecureLoginCode();
            const patchResponse = await fetch(
                `${supabaseUrl}/rest/v1/company_customer_invitations?id=eq.${encodeURIComponent(invite.id)}`,
                {
                    method: 'PATCH',
                    headers: {
                        apikey: serviceRoleKey,
                        Authorization: `Bearer ${serviceRoleKey}`,
                        'Content-Type': 'application/json',
                        Prefer: 'return=minimal',
                    },
                    body: JSON.stringify({
                        invite_code: invite.invite_code || generateSecureConnectionToken(),
                        login_code: loginCode,
                        login_code_created_at: new Date().toISOString(),
                        login_code_expires_at: expiresAt,
                        login_code_used_at: null,
                    }),
                }
            );

            if (patchResponse.ok) {
                saved = true;
            } else if (patchResponse.status !== 409) {
                return response(req, { ok: false, message: 'The customer login code could not be saved.' }, 500);
            }
        }

        if (!saved) {
            return response(req, { ok: false, message: 'A unique customer login code could not be created. Try again.' }, 500);
        }

        return response(req, {
            ok: true,
            login_code: loginCode,
            expires_at: expiresAt,
            message: 'Six-digit customer login code created.',
        });
    },
};

async function loadAuthorizedInvite(
    supabaseUrl: string,
    publishableKey: string,
    authToken: string,
    invitationId: string
) {
    if (!invitationId) return null;
    const url = new URL('/rest/v1/company_customer_invitations', supabaseUrl);
    url.searchParams.set('id', `eq.${invitationId}`);
    url.searchParams.set('select', 'id,invited_email,invited_name,invite_code,status,expires_at,revoked_at,accepted_at');
    url.searchParams.set('limit', '1');
    const result = await fetch(url, {
        headers: { apikey: publishableKey, Authorization: `Bearer ${authToken}` },
    });
    if (!result.ok) return null;
    const rows = await result.json().catch(() => []) as CustomerInvite[];
    return rows[0] || null;
}

function generateSecureLoginCode() {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    return String(100000 + (random[0] % 900000));
}

function generateSecureConnectionToken() {
    const random = new Uint8Array(20);
    crypto.getRandomValues(random);
    return Array.from(random, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyCaller(supabaseUrl: string, publishableKey: string, authToken: string) {
    const result = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: { apikey: publishableKey, Authorization: `Bearer ${authToken}` },
    });
    return result.ok;
}

function getBearerToken(req: Request) {
    return /^Bearer\s+(.+)$/i.exec(req.headers.get('Authorization') || '')?.[1] || '';
}

function response(req: Request, body: Record<string, unknown>, status = 200) {
    return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: {
            'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Content-Type': 'application/json; charset=utf-8',
            Vary: 'Origin',
        },
    });
}
