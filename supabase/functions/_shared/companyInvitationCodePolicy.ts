export type CompanyInvitationCodeState =
    | 'eligible'
    | 'used'
    | 'expired'
    | 'revoked'
    | 'inactive';

export type CompanyInvitationCodeRecord = {
    status?: string | null;
    revoked_at?: string | null;
    accepted_at?: string | null;
    accepted_by_user_id?: string | null;
    login_code_used_at?: string | null;
    manual_invite_expires_at?: string | null;
    expires_at?: string | null;
};

export const INVITATION_CODE_USED_MESSAGE =
    'This one-time invitation code has already been used. Sign in with your password, or ask your company administrator to generate a new login code from your team member record.';
export const INVITATION_CODE_EXPIRED_MESSAGE =
    'This invitation code has expired. Ask your company administrator to generate a new login code.';
export const INVITATION_CODE_REVOKED_MESSAGE =
    'This invitation is no longer active. Ask your company administrator for a new invitation.';
export const INVITATION_CODE_INACTIVE_MESSAGE =
    'This invitation code is no longer active. Ask your company administrator for a new invitation.';

export function classifyCompanyInvitationCode(
    invitation: CompanyInvitationCodeRecord,
    nowMs = Date.now()
): CompanyInvitationCodeState {
    const status = normalizeStatus(invitation.status);

    if (
        status === 'accepted' ||
        invitation.accepted_at ||
        invitation.accepted_by_user_id ||
        invitation.login_code_used_at
    ) {
        return 'used';
    }

    if (status === 'revoked' || invitation.revoked_at) return 'revoked';
    if (status === 'expired' || isExpired(invitation.manual_invite_expires_at, nowMs) || isExpired(invitation.expires_at, nowMs)) {
        return 'expired';
    }
    if (status !== 'pending') return 'inactive';

    return 'eligible';
}

export function invitationCodeStateMessage(state: Exclude<CompanyInvitationCodeState, 'eligible'>) {
    if (state === 'used') return INVITATION_CODE_USED_MESSAGE;
    if (state === 'expired') return INVITATION_CODE_EXPIRED_MESSAGE;
    if (state === 'revoked') return INVITATION_CODE_REVOKED_MESSAGE;
    return INVITATION_CODE_INACTIVE_MESSAGE;
}

function normalizeStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function isExpired(value: string | null | undefined, nowMs: number) {
    if (!value) return false;

    const expiresAtMs = new Date(value).getTime();
    return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}
