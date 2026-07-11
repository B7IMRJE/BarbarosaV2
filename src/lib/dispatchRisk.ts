export type DispatchRiskState = 'ON_TIME' | 'AT_RISK' | 'RUNNING_LATE';

export type DispatchRiskSlot = {
    id: string;
    technician_company_user_id: string;
    service_request_id: string | null;
    start_at: string | null;
    end_at: string | null;
    arrival_window_start: string | null;
    arrival_window_end: string | null;
    status: string | null;
    tech_status_note?: string | null;
};

export type DispatchRiskResult = {
    state: DispatchRiskState;
    label: string;
    reason: string;
    estimatedArrivalAt: string | null;
    estimatedDelayMinutes: number | null;
    suggestedActions: string[];
};

const DEFAULT_DRIVE_MINUTES = 30;
const CLOSE_TO_WINDOW_END_MINUTES = 20;

export function calculateDispatchRisk(slot: DispatchRiskSlot | null, technicianSlots: DispatchRiskSlot[] = [], now = new Date()): DispatchRiskResult {
    if (!slot || !slot.technician_company_user_id) {
        return onTime('No assigned technician or schedule slot yet.');
    }

    const status = normalizeStatus(slot.status);
    const note = normalizeStatus(slot.tech_status_note);
    const arrivalStart = parseDate(slot.arrival_window_start || slot.start_at);
    const arrivalEnd = parseDate(slot.arrival_window_end || slot.arrival_window_start || slot.start_at);

    if (['completed', 'closed', 'done', 'cancelled', 'canceled', 'archived'].includes(status)) {
        return onTime('Appointment is no longer active.');
    }

    if (['arrived', 'in_progress'].includes(status)) {
        return onTime('Technician has already reached or started this appointment.');
    }

    if (status === 'running_late' || note.includes('running late') || note.includes('late')) {
        return runningLate('Technician reported they are running late.', null, null);
    }

    if (arrivalEnd && now.getTime() > arrivalEnd.getTime() && !['arrived', 'in_progress', 'completed'].includes(status)) {
        return runningLate('Arrival window has passed without an arrived or completed status.', now.toISOString(), minutesBetween(arrivalEnd, now));
    }

    const previousActiveJob = findPreviousActiveJob(slot, technicianSlots, now);

    if (previousActiveJob && arrivalEnd) {
        const expectedArrival = estimateArrivalFromPreviousJob(previousActiveJob, now);
        const delayMinutes = minutesBetween(arrivalEnd, expectedArrival);

        if (delayMinutes > 0) {
            return runningLate('Technician is still active on an earlier job and expected arrival is after this window.', expectedArrival.toISOString(), delayMinutes);
        }

        if (arrivalStart && minutesBetween(expectedArrival, arrivalEnd) <= CLOSE_TO_WINDOW_END_MINUTES) {
            return atRisk('Technician is still active on an earlier job and timing is close.', expectedArrival.toISOString(), null);
        }
    }

    if (arrivalStart) {
        const departBy = new Date(arrivalStart.getTime() - DEFAULT_DRIVE_MINUTES * 60_000);

        if (now >= departBy && !['on_my_way', 'arrived', 'in_progress'].includes(status)) {
            return atRisk('Departure time is due and no On My Way status has been received.', null, null);
        }
    }

    if (arrivalEnd && arrivalStart && status !== 'on_my_way') {
        const minutesUntilWindowEnd = minutesBetween(now, arrivalEnd);
        const minutesUntilWindowStart = minutesBetween(now, arrivalStart);

        if (minutesUntilWindowStart <= 60 && minutesUntilWindowEnd <= CLOSE_TO_WINDOW_END_MINUTES + DEFAULT_DRIVE_MINUTES) {
            return atRisk('Arrival window is approaching and no reliable ETA exists.', null, null);
        }
    }

    return onTime('No late risk detected.');
}

function findPreviousActiveJob(slot: DispatchRiskSlot, technicianSlots: DispatchRiskSlot[], now: Date) {
    const currentStart = parseDate(slot.start_at || slot.arrival_window_start);

    if (!currentStart) return null;

    return technicianSlots
        .filter((candidate) => (
            candidate.id !== slot.id &&
            candidate.technician_company_user_id === slot.technician_company_user_id &&
            isWorkingOrActiveStatus(candidate.status) &&
            Boolean(parseDate(candidate.start_at)) &&
            parseDate(candidate.start_at)!.getTime() <= currentStart.getTime() &&
            (parseDate(candidate.end_at)?.getTime() || now.getTime()) >= now.getTime()
        ))
        .sort((first, second) => (parseDate(second.start_at)?.getTime() || 0) - (parseDate(first.start_at)?.getTime() || 0))[0] || null;
}

function estimateArrivalFromPreviousJob(previousJob: DispatchRiskSlot, now: Date) {
    const previousEnd = parseDate(previousJob.end_at);
    const baseDeparture = previousEnd && previousEnd > now ? previousEnd : now;

    return new Date(baseDeparture.getTime() + DEFAULT_DRIVE_MINUTES * 60_000);
}

function onTime(reason: string): DispatchRiskResult {
    return {
        state: 'ON_TIME',
        label: 'On Time',
        reason,
        estimatedArrivalAt: null,
        estimatedDelayMinutes: null,
        suggestedActions: [],
    };
}

function atRisk(reason: string, estimatedArrivalAt: string | null, estimatedDelayMinutes: number | null): DispatchRiskResult {
    return {
        state: 'AT_RISK',
        label: 'At Risk',
        reason,
        estimatedArrivalAt,
        estimatedDelayMinutes,
        suggestedActions: ['Contact technician', 'Request updated completion time', 'Adjust arrival window'],
    };
}

function runningLate(reason: string, estimatedArrivalAt: string | null, estimatedDelayMinutes: number | null): DispatchRiskResult {
    return {
        state: 'RUNNING_LATE',
        label: 'Running Late',
        reason,
        estimatedArrivalAt,
        estimatedDelayMinutes,
        suggestedActions: ['Notify homeowner', 'Update arrival window', 'Reassign technician', 'Mark delay resolved'],
    };
}

function isWorkingOrActiveStatus(status?: string | null) {
    return ['on_my_way', 'arrived', 'in_progress', 'working'].includes(normalizeStatus(status));
}

function parseDate(value?: string | null) {
    if (!value) return null;

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

function minutesBetween(start: Date, end: Date) {
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function normalizeStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
