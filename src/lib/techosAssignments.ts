export type TechOSAssignmentCompanyUser = {
    id?: string | null;
    company_id?: string | null;
};

export type TechOSAssignmentSlotIdentity = {
    company_id?: string | null;
    technician_company_user_id?: string | null;
};

export function normalizeTechOSAssignmentCompanyUserIds(
    companyUserIds: ReadonlyArray<string | null | undefined>
) {
    const seen = new Set<string>();
    const normalizedIds: string[] = [];

    companyUserIds.forEach((companyUserId) => {
        const id = normalizeAssignmentId(companyUserId);

        if (!id || seen.has(id)) return;

        seen.add(id);
        normalizedIds.push(id);
    });

    return normalizedIds;
}

export function resolveTechOSAssignmentCompanyUserIds(input: {
    companyId: string;
    eligibleCompanyUsers: ReadonlyArray<TechOSAssignmentCompanyUser>;
    primaryCompanyUserId?: string | null;
}) {
    const companyId = normalizeAssignmentId(input.companyId);
    const sameCompanyUserIds = input.eligibleCompanyUsers
        .filter((companyUser) => normalizeAssignmentId(companyUser.company_id) === companyId)
        .map((companyUser) => companyUser.id);

    return normalizeTechOSAssignmentCompanyUserIds([
        input.primaryCompanyUserId,
        ...sameCompanyUserIds,
    ]);
}

export function filterTechOSAssignmentSlots<TSlot extends TechOSAssignmentSlotIdentity>(
    slots: ReadonlyArray<TSlot>,
    companyId: string,
    companyUserIds: ReadonlyArray<string>
) {
    const normalizedCompanyId = normalizeAssignmentId(companyId);
    const allowedCompanyUserIds = new Set(normalizeTechOSAssignmentCompanyUserIds(companyUserIds));

    return slots.filter((slot) => (
        normalizeAssignmentId(slot.company_id) === normalizedCompanyId &&
        allowedCompanyUserIds.has(normalizeAssignmentId(slot.technician_company_user_id))
    ));
}

export function isLiveTechOSAssignmentStatus(status?: string | null) {
    return ['on_my_way', 'arrived', 'in_progress', 'estimate_needed'].includes(normalizeAssignmentStatus(status));
}

function normalizeAssignmentId(value?: string | null) {
    return String(value || '').trim();
}

function normalizeAssignmentStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
