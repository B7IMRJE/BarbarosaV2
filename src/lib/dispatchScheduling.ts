export type DispatchScheduleConflictSlot = {
    company_id: string;
    service_request_id?: string | null;
    technician_company_user_id: string;
    start_at?: string | null;
    end_at?: string | null;
    status?: string | null;
};

const INACTIVE_SCHEDULE_STATUSES = new Set([
    'cancelled',
    'canceled',
    'completed',
    'complete',
    'closed',
    'done',
    'archived',
    'void',
    'waiting_for_parts',
    'needs_follow_up',
    'return_visit_required',
    'on_hold',
    'customer_no_show',
    'missed_no_show',
    'unable_to_complete',
]);

export function findConflictingScheduleSlot<TSlot extends DispatchScheduleConflictSlot>(
    slots: TSlot[],
    companyId: string,
    serviceRequestId: string,
    technicianCompanyUserId: string,
    newStart: Date,
    newEnd: Date
) {
    return slots.find((slot) => (
        slot.company_id === companyId &&
        slot.service_request_id !== serviceRequestId &&
        slot.technician_company_user_id === technicianCompanyUserId &&
        !INACTIVE_SCHEDULE_STATUSES.has(normalizeStatus(slot.status)) &&
        hasScheduleSlotOverlap(slot, newStart, newEnd)
    )) || null;
}

function hasScheduleSlotOverlap(slot: DispatchScheduleConflictSlot, newStart: Date, newEnd: Date) {
    if (!slot.start_at || !slot.end_at) return false;

    const existingStart = new Date(slot.start_at);
    const existingEnd = new Date(slot.end_at);

    if (Number.isNaN(existingStart.getTime()) || Number.isNaN(existingEnd.getTime())) return false;

    return newStart < existingEnd && newEnd > existingStart;
}

function normalizeStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}
