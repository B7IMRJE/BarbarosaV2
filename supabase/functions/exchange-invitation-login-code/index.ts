declare const Deno: {
    env: {
        get(name: string): string | undefined;
    };
};

const CODE_PATTERN = /^\d{6}$/;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_CODE = 5;
const MAX_FAILURES_PER_IP = 10;

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
        const ipHash = await sha256(readClientAddress(req));
        const codeHash = await sha256(code || 'missing');

        if (!CODE_PATTERN.test(code)) {
            await recordAttempt(supabaseUrl, serviceRoleKey, {
                invitationId: null,
                ipHash,
                codeHash,
                succeeded: false,
                outcome: 'invalid',
            });
            return response(req, { ok: false, message: 'Enter the six-digit invitation code.' }, 400);
        }

        const invitation = await findInvitation(supabaseUrl, serviceRoleKey, code);
        const locked = await isLockedOut(supabaseUrl, serviceRoleKey, ipHash, codeHash);

        if (locked) {
            await recordAttempt(supabaseUrl, serviceRoleKey, {
                invitationId: invitation?.id || null,
                ipHash,
                codeHash,
                succeeded: false,
                outcome: 'locked',
            });
            return response(req, { ok: false, message: 'Invitation login is temporarily unavailable. Please try again later.' }, 429);
        }

        if (!invitation) {
            await recordAttempt(supabaseUrl, serviceRoleKey, {
                invitationId: null,
                ipHash,
                codeHash,
                succeeded: false,
                outcome: 'invalid',
            });
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
                await Promise.all([
                    markInvitationCodeUsed(supabaseUrl, serviceRoleKey, invitation.id),
                    recordAttempt(supabaseUrl, serviceRoleKey, {
                        invitationId: invitation.id,
                        ipHash,
                        codeHash,
                        succeeded: true,
                        outcome: 'verified',
                    }),
                ]);
                return response(req, {
                    ok: true,
                    access_token: verifyBody.access_token,
                    refresh_token: verifyBody.refresh_token,
                    next: `/company-invite?code=${encodeURIComponent(code)}`,
                });
            }
        }

        await recordAttempt(supabaseUrl, serviceRoleKey, {
            invitationId: invitation.id,
            ipHash,
            codeHash,
            succeeded: false,
            outcome: 'auth_failed',
        });
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
    url.searchParams.set('login_code_used_at', 'is.null');
    url.searchParams.set('select', 'id,email,manual_invite_expires_at,expires_at');
    url.searchParams.set('limit', '1');

    const lookupResponse = await fetch(url, {
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
        },
    });
    const rows = await lookupResponse.json().catch(() => []) as Array<{
        id?: string;
        email?: string;
        manual_invite_expires_at?: string | null;
        expires_at?: string | null;
    }>;
    const invitation = rows[0];

    if (!lookupResponse.ok || !invitation?.id || !invitation.email) return null;

    const expiresAt = invitation.manual_invite_expires_at || invitation.expires_at;

    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return null;

    return { id: invitation.id, email: invitation.email };
}

async function isLockedOut(
    supabaseUrl: string,
    serviceRoleKey: string,
    ipHash: string,
    codeHash: string
) {
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();
    const [ipFailures, codeFailures] = await Promise.all([
        countFailures(supabaseUrl, serviceRoleKey, 'ip_hash', ipHash, since),
        countFailures(supabaseUrl, serviceRoleKey, 'code_hash', codeHash, since),
    ]);

    return ipFailures >= MAX_FAILURES_PER_IP || codeFailures >= MAX_FAILURES_PER_CODE;
}

async function countFailures(
    supabaseUrl: string,
    serviceRoleKey: string,
    field: 'ip_hash' | 'code_hash',
    value: string,
    since: string
) {
    const url = new URL('/rest/v1/invitation_login_attempts', supabaseUrl);
    url.searchParams.set(field, `eq.${value}`);
    url.searchParams.set('succeeded', 'eq.false');
    url.searchParams.set('created_at', `gte.${since}`);
    url.searchParams.set('select', 'id');

    const result = await fetch(url, {
        method: 'HEAD',
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            Prefer: 'count=exact',
        },
    });
    const contentRange = result.headers.get('content-range') || '';
    const count = Number.parseInt(contentRange.split('/')[1] || '0', 10);

    return Number.isFinite(count) ? count : 0;
}

async function recordAttempt(
    supabaseUrl: string,
    serviceRoleKey: string,
    attempt: {
        invitationId: string | null;
        ipHash: string;
        codeHash: string;
        succeeded: boolean;
        outcome: 'invalid' | 'expired' | 'locked' | 'verified' | 'auth_failed';
    }
) {
    await fetch(`${supabaseUrl}/rest/v1/invitation_login_attempts`, {
        method: 'POST',
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
        },
        body: JSON.stringify({
            invitation_id: attempt.invitationId,
            ip_hash: attempt.ipHash,
            code_hash: attempt.codeHash,
            succeeded: attempt.succeeded,
            outcome: attempt.outcome,
        }),
    });
}

async function markInvitationCodeUsed(
    supabaseUrl: string,
    serviceRoleKey: string,
    invitationId: string
) {
    await fetch(
        `${supabaseUrl}/rest/v1/company_user_invitations?id=eq.${encodeURIComponent(invitationId)}`,
        {
            method: 'PATCH',
            headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
            },
            body: JSON.stringify({ login_code_used_at: new Date().toISOString() }),
        }
    );
}

function readClientAddress(req: Request) {
    return (
        req.headers.get('cf-connecting-ip') ||
        req.headers.get('x-real-ip') ||
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        'unknown'
    );
}

async function sha256(value: string) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);

    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
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
