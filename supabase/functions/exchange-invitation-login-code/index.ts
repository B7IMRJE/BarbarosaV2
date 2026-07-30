declare const Deno: {
    env: {
        get(name: string): string | undefined;
    };
};

const CODE_PATTERN = /^\d{6}$/;

export default {
    async fetch(req: Request): Promise<Response> {
        if (req.method === 'OPTIONS') {
            return response(req, {}, 204);
        }

        if (req.method !== 'POST') {
            return response(req, { ok: false, message: 'Method not allowed.' }, 405);
        }

        const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
        const publishableKey =
            Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
            Deno.env.get('SUPABASE_ANON_KEY') ||
            '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
            return response(req, { ok: false, message: 'Invitation login is not configured.' }, 500);
        }

        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const code = String(body.code || '').replace(/\D/g, '');

        if (!CODE_PATTERN.test(code)) {
            return response(req, { ok: false, message: 'Enter the six-digit invitation code.' }, 400);
        }

        const invitation = await findInvitation(supabaseUrl, serviceRoleKey, code);

        if (!invitation) {
            return response(req, { ok: false, message: 'This invitation code is invalid or expired.' }, 400);
        }

        for (const type of ['invite', 'magiclink'] as const) {
            const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
                method: 'POST',
                headers: {
                    apikey: publishableKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: invitation.email,
                    token: code,
                    type,
                }),
            });
            const verifyBody = await verifyResponse.json().catch(() => null) as {
                access_token?: string;
                refresh_token?: string;
            } | null;

            if (
                verifyResponse.ok &&
                verifyBody?.access_token &&
                verifyBody.refresh_token
            ) {
                return response(req, {
                    ok: true,
                    access_token: verifyBody.access_token,
                    refresh_token: verifyBody.refresh_token,
                    next: `/company-invite?code=${encodeURIComponent(code)}`,
                });
            }
        }

        return response(
            req,
            {
                ok: false,
                message: 'This invitation code has expired or was already used. Ask for a new invitation.',
            },
            400
        );
    },
};

async function findInvitation(supabaseUrl: string, serviceRoleKey: string, code: string) {
    const url = new URL('/rest/v1/company_user_invitations', supabaseUrl);
    url.searchParams.set('manual_invite_code', `eq.${code}`);
    url.searchParams.set('status', 'eq.pending');
    url.searchParams.set('revoked_at', 'is.null');
    url.searchParams.set('accepted_at', 'is.null');
    url.searchParams.set('select', 'id,email,manual_invite_expires_at,expires_at');
    url.searchParams.set('limit', '1');

    const lookupResponse = await fetch(url, {
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
        },
    });
    const rows = await lookupResponse.json().catch(() => []) as Array<{
        email?: string;
        manual_invite_expires_at?: string | null;
        expires_at?: string | null;
    }>;
    const invitation = rows[0];

    if (!lookupResponse.ok || !invitation?.email) return null;

    const expiresAt = invitation.manual_invite_expires_at || invitation.expires_at;

    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return null;

    return { email: invitation.email };
}

function response(req: Request, body: Record<string, unknown>, status = 200) {
    const origin = req.headers.get('Origin') || '*';

    return new Response(status === 204 ? null : JSON.stringify(body), {
        status,
        headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Content-Type': 'application/json; charset=utf-8',
            Vary: 'Origin',
        },
    });
}
