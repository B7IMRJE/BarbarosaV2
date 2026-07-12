export type DispatchRiskState = 'ON_TIME' | 'AT_RISK' | 'RUNNING_LATE';

export type DispatchRiskSlot = {
    id: string;
    technician_company_user_id: string | null;
    service_request_id: string | null;
    start_at: string | null;
    end_at: string | null;
    arrival_window_start: string | null;
    arrival_window_end: string | null;
    status: string | null;
    tech_status_note?: string | null;
    request_status?: string | null;
};

export type DispatchRiskResult = {
    state: DispatchRiskState;
    label: string;
    reason: string;
    latestDepartureAt: string | null;
    estimatedArrivalAt: string | null;
    estimatedDelayMinutes: number | null;
    needsReassignment: boolean;
    suggestedActions: string[];
};

export const DEFAULT_DRIVE_MINUTES = 30;
export const DEFAULT_REASSIGNMENT_DELAY_MINUTES = 30;
const CLOSE_TO_WINDOW_END_MINUTES = 20;

export function calculateDispatchRisk(slot: DispatchRiskSlot | null, technicianSlots: DispatchRiskSlot[] = [], now = new Date()): DispatchRiskResult {
    if (!slot || !slot.technician_company_user_id) {
        return onTime('No assigned technician or schedule slot yet.');
    }

    const status = normalizeStatus(slot.status);
    const requestStatus = normalizeStatus(slot.request_status);
    const note = normalizeStatus(slot.tech_status_note);
    const arrivalStart = parseDate(slot.arrival_window_start || slot.start_at);
    const arrivalWindowEnd = parseDate(slot.arrival_window_end);
    const latestDeparture = arrivalStart
        ? new Date(arrivalStart.getTime() - DEFAULT_DRIVE_MINUTES * 60_000)
        : null;

    if (isInactiveForRisk(status) || isInactiveForRisk(requestStatus)) {
        return onTime('Appointment is no longer active.');
    }

    if (['arrived', 'in_progress', 'working'].includes(status)) {
        return onTime('Technician has already reached or started this appointment.');
    }

    if (isCannotMakeItText(note)) {
        const delayMinutes = getCurrentDelayMinutes(arrivalStart, now) ?? DEFAULT_REASSIGNMENT_DELAY_MINUTES + 1;
        return runningLate(
            'Technician reported they cannot make this appointment.',
            arrivalStart ? new Date(arrivalStart.getTime() + delayMinutes * 60_000).toISOString() : null,
            delayMinutes,
            true,
            latestDeparture?.toISOString() || null
        );
    }

    if (status === 'running_late' || isRunningLateText(note)) {
        const reportedDelay = getReportedDelayMinutes(note);
        const delayMinutes = reportedDelay ?? getCurrentDelayMinutes(arrivalStart, now);
        const expectedArrival = arrivalStart && delayMinutes !== null
            ? new Date(arrivalStart.getTime() + delayMinutes * 60_000)
            : null;

        return runningLate(
            'Technician reported they are running late.',
            expectedArrival?.toISOString() || null,
            delayMinutes,
            shouldRecommendReassignment(expectedArrival, arrivalStart, arrivalWindowEnd, delayMinutes),
            latestDeparture?.toISOString() || null
        );
    }

    if (arrivalStart && now.getTime() >= arrivalStart.getTime() && !['on_my_way', 'arrived', 'in_progress', 'working', 'completed'].includes(status)) {
        const delayMinutes = minutesBetween(arrivalStart, now);

        return runningLate(
            'Appointment start has arrived and no On My Way or Arrived status has been received.',
            now.toISOString(),
            delayMinutes,
            shouldRecommendReassignment(now, arrivalStart, arrivalWindowEnd, delayMinutes),
            latestDeparture?.toISOString() || null
        );
    }

    const previousActiveJob = findPreviousActiveJob(slot, technicianSlots, now);

    if (previousActiveJob && arrivalStart) {
        const expectedArrival = estimateArrivalFromPreviousJob(previousActiveJob, now);
        const delayMinutes = minutesBetween(arrivalStart, expectedArrival);

        if (delayMinutes > 0) {
            return runningLate(
                'Technician is still active on an earlier job and expected arrival is after the planned arrival time.',
                expectedArrival.toISOString(),
                delayMinutes,
                shouldRecommendReassignment(expectedArrival, arrivalStart, arrivalWindowEnd, delayMinutes),
                latestDeparture?.toISOString() || null
            );
        }

        if (arrivalWindowEnd && minutesBetween(expectedArrival, arrivalWindowEnd) <= CLOSE_TO_WINDOW_END_MINUTES) {
            return atRisk(
                'Technician is still active on an earlier job and timing is close.',
                expectedArrival.toISOString(),
                null,
                latestDeparture?.toISOString() || null
            );
        }
    }

    if (latestDeparture) {
        if (now >= latestDeparture && !['on_my_way', 'arrived', 'in_progress', 'working'].includes(status)) {
            return atRisk(
                'Departure time is due and no On My Way status has been received.',
                null,
                null,
                latestDeparture.toISOString()
            );
        }
    }

    if (arrivalWindowEnd && arrivalStart && status !== 'on_my_way') {
        const minutesUntilWindowEnd = minutesBetween(now, arrivalWindowEnd);
        const minutesUntilWindowStart = minutesBetween(now, arrivalStart);

        if (minutesUntilWindowStart <= 60 && minutesUntilWindowEnd <= CLOSE_TO_WINDOW_END_MINUTES + DEFAULT_DRIVE_MINUTES) {
            return atRisk(
                'Arrival window is approaching and no reliable ETA exists.',
                null,
                null,
                latestDeparture?.toISOString() || null
            );
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
        latestDepartureAt: null,
        estimatedArrivalAt: null,
        estimatedDelayMinutes: null,
        needsReassignment: false,
        suggestedActions: [],
    };
}

function atRisk(
    reason: string,
    estimatedArrivalAt: string | null,
    estimatedDelayMinutes: number | null,
    latestDepartureAt: string | null
): DispatchRiskResult {
    return {
        state: 'AT_RISK',
        label: 'At Risk',
        reason,
        latestDepartureAt,
        estimatedArrivalAt,
        estimatedDelayMinutes,
        needsReassignment: false,
        suggestedActions: ['Contact technician', 'Request updated completion time', 'Adjust arrival window'],
    };
}

function runningLate(
    reason: string,
    estimatedArrivalAt: string | null,
    estimatedDelayMinutes: number | null,
    needsReassignment: boolean,
    latestDepartureAt: string | null
): DispatchRiskResult {
    return {
        state: 'RUNNING_LATE',
        label: needsReassignment ? 'Needs Reassignment' : 'Running Late',
        reason,
        latestDepartureAt,
        estimatedArrivalAt,
        estimatedDelayMinutes,
        needsReassignment,
        suggestedActions: needsReassignment
            ? ['Reassign technician', 'Notify homeowner', 'Update arrival window']
            : ['Notify homeowner', 'Update arrival window', 'Reassign technician', 'Mark delay resolved'],
    };
}

function isWorkingOrActiveStatus(status?: string | null) {
    return ['on_my_way', 'arrived', 'in_progress', 'working'].includes(normalizeStatus(status));
}

function isInactiveForRisk(status?: string | null) {
    return [
        'completed',
        'complete',
        'closed',
        'done',
        'cancelled',
        'canceled',
        'archived',
        'void',
        'duplicate_or_void',
        'needs_follow_up',
        'return_visit_required',
        'waiting_for_parts',
        'parts_needed',
        'waiting_on_parts',
        'on_hold',
        'paused',
        'paused_on_hold',
        'customer_no_show',
        'missed_no_show',
        'no_show',
        'unable_to_complete',
    ].includes(normalizeStatus(status));
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

function isRunningLateText(value: string) {
    return (
        value.includes('running late') ||
        value.includes('late') ||
        value.includes('need 30 more minutes') ||
        value.includes('need 60 more minutes')
    );
}

function isCannotMakeItText(value: string) {
    return value.includes('cannot make') || value.includes("can't make") || value.includes('can not make');
}

function getReportedDelayMinutes(value: string) {
    if (value.includes('need 60 more minutes')) return 60;
    if (value.includes('need 30 more minutes')) return 30;

    const explicitMatch = value.match(/(?:late|delay|delayed|need)\D+(\d{1,3})\s*(?:min|minute)/);

    return explicitMatch ? Number(explicitMatch[1]) : null;
}

function getCurrentDelayMinutes(arrivalStart: Date | null, now: Date) {
    return arrivalStart && now > arrivalStart ? minutesBetween(arrivalStart, now) : null;
}

function shouldRecommendReassignment(
    expectedArrival: Date | null,
    arrivalStart: Date | null,
    arrivalWindowEnd: Date | null,
    delayMinutes: number | null
) {
    if (expectedArrival && arrivalWindowEnd && expectedArrival > arrivalWindowEnd) return true;
    if (!arrivalWindowEnd && arrivalStart && delayMinutes !== null && delayMinutes > DEFAULT_REASSIGNMENT_DELAY_MINUTES) return true;

    return false;
}
