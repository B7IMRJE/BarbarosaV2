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

        let invitation;
        try {
            invitation =
                await findCompanyUserInvitation(supabaseUrl, serviceRoleKey, code) ||
                await findCustomerInvitation(supabaseUrl, serviceRoleKey, code);
        } catch (error) {
            return response(req, {
                ok: false,
                message: error instanceof Error
                    ? error.message
                    : 'The invitation lookup could not be completed.',
            }, 500);
        }
        const locked = await isLockedOut(supabaseUrl, serviceRoleKey, ipHash, codeHash);

        if (locked) {
            await recordAttempt(supabaseUrl, serviceRoleKey, {
                invitationId: invitation?.source === 'company_user' ? invitation.id : null,
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

        const invitationAuth = await createInvitationAuthOtp(
            supabaseUrl,
            serviceRoleKey,
            invitation
        );
        if (!invitationAuth) {
            await recordAttempt(supabaseUrl, serviceRoleKey, {
                invitationId: invitation.source === 'company_user' ? invitation.id : null,
                ipHash,
                codeHash,
                succeeded: false,
                outcome: 'auth_failed',
            });
            return response(req, {
                ok: false,
                message: 'The invitation was found, but its secure login session could not be prepared.',
            }, 500);
        }
        const verificationToken = invitationAuth.tokenHash;
        const verificationTypes = ['email', invitationAuth.type, 'invite', 'magiclink'] as const;

        let lastVerificationMessage = '';
        for (const type of [...new Set(verificationTypes)]) {
            const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
                method: 'POST',
                headers: {
                    apikey: publishableKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token_hash: verificationToken,
                    type,
                }),
            });
            const verifyBody = await verifyResponse.json().catch(() => null) as {
                access_token?: string;
                refresh_token?: string;
                user?: {
                    id?: string;
                    email?: string;
                };
                msg?: string;
                message?: string;
                error_description?: string;
            } | null;
            lastVerificationMessage = String(
                verifyBody?.msg ||
                verifyBody?.message ||
                verifyBody?.error_description ||
                ''
            ).trim();

            if (
                verifyResponse.ok &&
                verifyBody?.access_token &&
                verifyBody.refresh_token
            ) {
                const userId =
                    verifyBody.user?.id ||
                    await loadAuthenticatedUserId(
                        supabaseUrl,
                        publishableKey,
                        verifyBody.access_token
                    );
                if (!userId) {
                    return response(req, {
                        ok: false,
                        message: 'Your secure session opened, but HomeOS could not identify the invited account.',
                    }, 500);
                }
                const profileReady = invitation.source === 'customer'
                    ? await ensureHomeownerProfile(
                        supabaseUrl,
                        serviceRoleKey,
                        userId,
                        verifyBody.user?.email || invitation.email
                    )
                    : true;
                if (!profileReady) {
                    return response(req, {
                        ok: false,
                        message: 'Your secure session opened, but HomeOS could not prepare the homeowner profile.',
                    }, 500);
                }
                const acceptedCompanyUser = invitation.source === 'company_user'
                    ? await acceptCompanyUserInvitation(
                        supabaseUrl,
                        publishableKey,
                        verifyBody.access_token,
                        invitation.id,
                        code
                    )
                    : null;
                if (invitation.source === 'company_user' && !acceptedCompanyUser) {
                    await recordAttempt(supabaseUrl, serviceRoleKey, {
                        invitationId: invitation.id,
                        ipHash,
                        codeHash,
                        succeeded: false,
                        outcome: 'auth_failed',
                    });
                    return response(req, {
                        ok: false,
                        message: 'Your secure session opened, but HomeOS could not activate the company membership. Please retry the same code.',
                    }, 500);
                }
                await Promise.all([
                    markInvitationCodeUsed(supabaseUrl, serviceRoleKey, invitation),
                    recordAttempt(supabaseUrl, serviceRoleKey, {
                        invitationId: invitation.source === 'company_user' ? invitation.id : null,
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
                    next: invitation.source === 'customer'
                        ? `/customer-invite?code=${encodeURIComponent(invitation.connectionCode)}`
                        : `/super-admin/company/${encodeURIComponent(acceptedCompanyUser?.company_id || '')}`,
                });
            }
        }

        await recordAttempt(supabaseUrl, serviceRoleKey, {
            invitationId: invitation.source === 'company_user' ? invitation.id : null,
            ipHash,
            codeHash,
            succeeded: false,
            outcome: 'auth_failed',
        });
        return response(
            req,
            {
                ok: false,
                message: lastVerificationMessage
                    ? `The invitation was found, but login verification failed: ${lastVerificationMessage}`
                    : 'The invitation was found, but login verification failed.',
            },
            400
        );
    },
};

async function loadAuthenticatedUserId(
    supabaseUrl: string,
    publishableKey: string,
    accessToken: string
) {
    const result = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
            apikey: publishableKey,
            Authorization: `Bearer ${accessToken}`,
        },
    });
    const user = await result.json().catch(() => null) as { id?: string } | null;
    return result.ok ? String(user?.id || '').trim() : '';
}

async function ensureHomeownerProfile(
    supabaseUrl: string,
    serviceRoleKey: string,
    userId: string,
    email: string
) {
    const result = await fetch(`${supabaseUrl}/rest/v1/profiles?on_conflict=id`, {
        method: 'POST',
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
            id: userId,
            email: email.trim().toLowerCase(),
            role: 'HOMEOWNER',
        }),
    });
    return result.ok;
}

async function acceptCompanyUserInvitation(
    supabaseUrl: string,
    publishableKey: string,
    accessToken: string,
    invitationId: string,
    code: string
) {
    const result = await fetch(`${supabaseUrl}/rest/v1/rpc/accept_company_user_invitation_by_code`, {
        method: 'POST',
        headers: {
            apikey: publishableKey,
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            p_invitation_id: invitationId,
            p_invite_code: code,
        }),
    });
    const responseData = await result.json().catch(() => null) as
        | { company_id?: string | null }
        | { company_id?: string | null }[]
        | null;
    const data = Array.isArray(responseData) ? responseData[0] : responseData;

    if (!result.ok || !data?.company_id) return null;

    return { company_id: String(data.company_id) };
}

async function findCompanyUserInvitation(supabaseUrl: string, serviceRoleKey: string, code: string) {
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
    const rows = await lookupResponse.json().catch(() => []) as {
        id?: string;
        email?: string;
        manual_invite_expires_at?: string | null;
        expires_at?: string | null;
    }[];
    const invitation = rows[0];

    if (!lookupResponse.ok || !invitation?.id || !invitation.email) return null;

    const expiresAt = invitation.manual_invite_expires_at || invitation.expires_at;

    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return null;

    return {
        id: invitation.id,
        email: invitation.email,
        source: 'company_user' as const,
        connectionCode: '',
    };
}

async function createInvitationAuthOtp(
    supabaseUrl: string,
    serviceRoleKey: string,
    invitation: {
        id: string;
        email: string;
        source: 'company_user' | 'customer';
    }
) {
    const isCustomer = invitation.source === 'customer';
    const payload = {
        type: 'invite',
        email: invitation.email,
        data: isCustomer
            ? {
                role: 'HOMEOWNER',
                invited_customer: true,
            }
            : {
                role: 'WORK',
                company_invitation_id: invitation.id,
            },
        redirect_to: 'https://barbarosa-v2.vercel.app/auth/confirm',
    };
    let result = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!result.ok && result.status === 422) {
        result = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ...payload, type: 'magiclink' }),
        });
    }

    const data = await result.json().catch(() => null) as {
        action_link?: string;
        hashed_token?: string;
        verification_type?: 'email' | 'invite' | 'magiclink';
        properties?: {
            action_link?: string;
            hashed_token?: string;
            verification_type?: 'email' | 'invite' | 'magiclink';
        };
    } | null;
    const actionLink = String(
        data?.action_link ||
        data?.properties?.action_link ||
        ''
    ).trim();
    const actionUrl = actionLink ? new URL(actionLink) : null;
    const tokenHash = String(
        data?.hashed_token ||
        data?.properties?.hashed_token ||
        actionUrl?.searchParams.get('token') ||
        ''
    ).trim();
    const verificationType = String(
        data?.verification_type ||
        data?.properties?.verification_type ||
        actionUrl?.searchParams.get('type') ||
        'email'
    ) as 'email' | 'invite' | 'magiclink';

    if (!result.ok || !tokenHash) return null;

    return {
        tokenHash,
        type: verificationType,
    };
}

async function findCustomerInvitation(supabaseUrl: string, serviceRoleKey: string, code: string) {
    const url = new URL('/rest/v1/company_customer_invitations', supabaseUrl);
    url.searchParams.set('login_code', `eq.${code}`);
    url.searchParams.set('status', 'in.(pending,accepted)');
    url.searchParams.set('revoked_at', 'is.null');
    url.searchParams.set('login_code_used_at', 'is.null');
    url.searchParams.set('select', 'id,invited_email,invite_code,login_code_expires_at,expires_at');
    url.searchParams.set('limit', '1');
    const lookupResponse = await fetch(url, {
        headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
        },
    });
    const rows = await lookupResponse.json().catch(() => []) as {
        id?: string;
        invited_email?: string;
        invite_code?: string;
        login_code_expires_at?: string | null;
        expires_at?: string | null;
    }[];
    if (!lookupResponse.ok) {
        throw new Error('The customer invitation resolver is unavailable.');
    }
    const invitation = rows[0];

    if (
        !invitation?.id ||
        !invitation.invited_email ||
        !invitation.invite_code
    ) {
        return null;
    }

    return {
        id: invitation.id,
        email: invitation.invited_email,
        source: 'customer' as const,
        connectionCode: invitation.invite_code,
    };
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
    invitation: {
        id: string;
        source: 'company_user' | 'customer';
    }
) {
    const table = invitation.source === 'customer'
        ? 'company_customer_invitations'
        : 'company_user_invitations';
    await fetch(
        `${supabaseUrl}/rest/v1/${table}?id=eq.${encodeURIComponent(invitation.id)}`,
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
