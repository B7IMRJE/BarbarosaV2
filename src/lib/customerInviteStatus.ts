export type CustomerInviteStatusRecord = {
    status?: string | null;
    expires_at?: string | null;
};

export function isCustomerInvitePending(
    invite?: CustomerInviteStatusRecord | null,
    now = Date.now()
) {
    if (!invite || isExpiredCustomerInvite(invite.expires_at, now)) return false;

    return normalizeCustomerInviteStatus(invite.status) === 'pending';
}

export function isCustomerInviteTerminal(
    invite?: CustomerInviteStatusRecord | null,
    now = Date.now()
) {
    if (!invite) return true;
    if (isExpiredCustomerInvite(invite.expires_at, now)) return true;

    const status = normalizeCustomerInviteStatus(invite.status);

    return status === 'accepted' || status === 'revoked' || status === 'expired';
}

export function isExpiredCustomerInvite(value?: string | null, now = Date.now()) {
    if (!value) return false;

    const timestamp = Date.parse(value);

    return Number.isFinite(timestamp) && timestamp <= now;
}

export function normalizeCustomerInviteStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
