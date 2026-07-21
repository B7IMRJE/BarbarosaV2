export type TechOSAssignmentCompanyUser = {
    id?: string | null;
    company_id?: string | null;
};

export type TechOSAssignmentSlotIdentity = {
    company_id?: string | null;
    technician_company_user_id?: string | null;
};

export type TechOSAssignmentScheduleSlot = TechOSAssignmentSlotIdentity & {
    id?: string | null;
    job_id?: string | null;
    service_request_id?: string | null;
    start_at?: string | null;
    updated_at?: string | null;
    created_at?: string | null;
    status?: string | null;
    visit_outcome?: string | null;
    visit_closed_at?: string | null;
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

export function collapseTechOSAssignmentSlots<TSlot extends TechOSAssignmentScheduleSlot>(
    slots: ReadonlyArray<TSlot>
) {
    const selectedByWorkKey = new Map<string, TSlot>();

    slots.forEach((slot) => {
        const key = getTechOSAssignmentSlotWorkKey(slot);
        const selectedSlot = selectedByWorkKey.get(key);

        if (!selectedSlot || compareTechOSAssignmentSlotPriority(slot, selectedSlot) > 0) {
            selectedByWorkKey.set(key, slot);
        }
    });

    return Array.from(selectedByWorkKey.values());
}

export function isLiveTechOSAssignmentStatus(status?: string | null) {
    return ['on_my_way', 'arrived', 'in_progress', 'estimate_needed'].includes(normalizeAssignmentStatus(status));
}

function getTechOSAssignmentSlotWorkKey(slot: TechOSAssignmentScheduleSlot) {
    const serviceRequestId = normalizeAssignmentId(slot.service_request_id);

    if (serviceRequestId) return `service_request:${serviceRequestId}`;

    const jobId = normalizeAssignmentId(slot.job_id);

    if (jobId) return `job:${jobId}`;

    return `slot:${normalizeAssignmentId(slot.id)}`;
}

function compareTechOSAssignmentSlotPriority(
    first: TechOSAssignmentScheduleSlot,
    second: TechOSAssignmentScheduleSlot
) {
    const firstStatusRank = getTechOSAssignmentStatusRank(first);
    const secondStatusRank = getTechOSAssignmentStatusRank(second);

    if (firstStatusRank !== secondStatusRank) return firstStatusRank - secondStatusRank;

    const firstUpdatedAt = getAssignmentTimeValue(first.updated_at) || getAssignmentTimeValue(first.start_at) || getAssignmentTimeValue(first.created_at);
    const secondUpdatedAt = getAssignmentTimeValue(second.updated_at) || getAssignmentTimeValue(second.start_at) || getAssignmentTimeValue(second.created_at);

    return firstUpdatedAt - secondUpdatedAt;
}

function getTechOSAssignmentStatusRank(slot: TechOSAssignmentScheduleSlot) {
    if (slot.visit_outcome || slot.visit_closed_at) return 0;

    const status = normalizeAssignmentStatus(slot.status);

    if (['completed', 'complete', 'closed', 'done', 'cancelled', 'canceled', 'archived', 'void'].includes(status)) {
        return 0;
    }

    const ranks: Record<string, number> = {
        scheduled: 10,
        assigned: 10,
        ready: 10,
        confirmed: 10,
        dispatched: 20,
        en_route: 20,
        on_my_way: 20,
        arrived: 30,
        onsite: 30,
        on_site: 30,
        in_progress: 40,
        working: 40,
        estimate_needed: 50,
    };

    return ranks[status] ?? 5;
}

function getAssignmentTimeValue(value?: string | null) {
    if (!value) return 0;

    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

function normalizeAssignmentId(value?: string | null) {
    return String(value || '').trim();
}

function normalizeAssignmentStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
