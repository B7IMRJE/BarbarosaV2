export type CustomerInviteDraft = {
    invitedName: string;
    invitedEmail: string;
    invitedPhone: string;
    note: string;
};

export function buildCustomerInviteRpcPayload(companyId: string, draft: CustomerInviteDraft) {
    return {
        p_company_id: companyId,
        p_invited_email: normalizeOptionalText(draft.invitedEmail),
        p_invited_phone: normalizeOptionalText(draft.invitedPhone),
        p_invited_name: normalizeOptionalText(draft.invitedName),
        p_note: normalizeOptionalText(draft.note),
    };
}

export function customerInviteHasContact(draft: CustomerInviteDraft) {
    return Boolean(
        normalizeOptionalText(draft.invitedName) ||
        normalizeOptionalText(draft.invitedEmail) ||
        normalizeOptionalText(draft.invitedPhone)
    );
}

export function customerInvitePhoneWasPersisted(
    requestedPhone: string | null,
    persistedPhone: string | null | undefined
) {
    if (!requestedPhone) return true;

    return normalizeOptionalText(persistedPhone) === requestedPhone;
}

function normalizeOptionalText(value: string | null | undefined) {
    const normalized = String(value || '').trim();

    return normalized || null;
}
