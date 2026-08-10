export const INVITATION_LOGIN_INVALID_MESSAGE =
    'This invitation code is invalid or expired.';
export const INVITATION_LOGIN_USED_MESSAGE =
    'This one-time invitation code has already been used. Sign in with your password, or ask your company administrator to generate a new login code from your team member record.';
export const INVITATION_LOGIN_EXPIRED_MESSAGE =
    'This invitation code has expired. Ask your company administrator to generate a new login code.';
export const INVITATION_LOGIN_REVOKED_MESSAGE =
    'This invitation is no longer active. Ask your company administrator for a new invitation.';
export const INVITATION_LOGIN_SERVICE_MESSAGE =
    'Invitation login is temporarily unavailable. Check your connection and try again.';
export const INVITATION_LOGIN_AUTH_MESSAGE =
    'The invitation was found, but secure sign-in could not be completed. Ask your company administrator to generate a new login code.';

export type InvitationLoginErrorCode =
    | 'already_used'
    | 'expired'
    | 'revoked'
    | 'inactive'
    | 'invalid'
    | 'auth_failed'
    | string;

export function safeInvitationLoginErrorMessage(code?: string | null, legacyMessage?: string | null) {
    const normalizedCode = String(code || '').trim().toLowerCase();
    const normalizedMessage = String(legacyMessage || '').trim().toLowerCase();

    if (normalizedCode === 'already_used') return INVITATION_LOGIN_USED_MESSAGE;
    if (normalizedCode === 'expired') return INVITATION_LOGIN_EXPIRED_MESSAGE;
    if (normalizedCode === 'revoked' || normalizedCode === 'inactive') return INVITATION_LOGIN_REVOKED_MESSAGE;
    if (normalizedCode === 'auth_failed') return INVITATION_LOGIN_AUTH_MESSAGE;
    if (normalizedCode === 'invalid') return INVITATION_LOGIN_INVALID_MESSAGE;
    if (normalizedMessage === 'this invitation code is invalid or expired.') {
        return INVITATION_LOGIN_INVALID_MESSAGE;
    }

    return INVITATION_LOGIN_SERVICE_MESSAGE;
}
