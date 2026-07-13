import {
    isEmergencyDispatchRequest,
    isNewLeadStatus,
    normalizeStatus,
    type CompanyDispatchRequest,
} from './companyLeadAlerts';
import { calculateDispatchRisk, type DispatchRiskResult } from './dispatchRisk';

export type DispatchWallSectionKey =
    | 'emergency'
    | 'emergency_leads'
    | 'running_late'
    | 'regular_leads'
    | 'unassigned'
    | 'assigned_ready'
    | 'on_my_way'
    | 'in_progress'
    | 'available'
    | 'absent'
    | 'closed_today';

export type DispatchWallRequest = CompanyDispatchRequest & {
    closeout_outcome?: string | null;
    next_action_at?: string | null;
    closed_at?: string | null;
    cancelled_at?: string | null;
    archived_at?: string | null;
};

export type DispatchWallScheduleSlot = {
    id: string;
    company_id: string;
    service_request_id: string | null;
    technician_company_user_id: string | null;
    start_at: string | null;
    end_at: string | null;
    arrival_window_start: string | null;
    arrival_window_end: string | null;
    status: string | null;
    priority: string | null;
    tech_status_note: string | null;
    visit_outcome: string | null;
    visit_closed_at: string | null;
    updated_at: string | null;
};

export type DispatchWallCompanyUser = {
    id: string;
    company_id: string;
    full_name: string | null;
    email: string | null;
    role: string | null;
    status: string | null;
};

export type DispatchWallTimingEvent = {
    id: string;
    service_request_id: string;
    event_type: string | null;
    message: string | null;
    schedule_slot_id: string | null;
    metadata: Record<string, unknown>;
    created_at: string | null;
};

export type DispatchWallItem = {
    sectionKey: DispatchWallSectionKey;
    request: DispatchWallRequest;
    slot: DispatchWallScheduleSlot | null;
    technician: DispatchWallCompanyUser | null;
    availability: DispatchWallTechnicianAvailability | null;
    timingEvent: DispatchWallTimingEvent | null;
    risk: DispatchRiskResult;
    statusLabel: string;
    sortTime: number;
};

export type DispatchWallTechnicianAvailability = {
    signalLabel: string;
    signalSlot: DispatchWallScheduleSlot | null;
    nextSlot: DispatchWallScheduleSlot | null;
    availableUntil: string | null;
};

export type DispatchWallSections = Record<DispatchWallSectionKey, DispatchWallItem[]>;

type DispatchWallEffectiveState = {
    terminal: boolean;
    requestTerminal: boolean;
    terminalLabel: string | null;
    terminalTime: number;
};

const WALL_SECTION_KEYS: DispatchWallSectionKey[] = [
    'emergency',
    'emergency_leads',
    'running_late',
    'regular_leads',
    'unassigned',
    'assigned_ready',
    'on_my_way',
    'in_progress',
    'available',
    'absent',
    'closed_today',
];

export function buildDispatchWallSections(
    requests: DispatchWallRequest[],
    scheduleSlots: DispatchWallScheduleSlot[],
    companyUsers: DispatchWallCompanyUser[],
    now: Date,
    timingEvents: DispatchWallTimingEvent[] = []
): DispatchWallSections {
    const sections = createEmptySections();
    const slotsByRequestId = groupSlotsByRequestId(scheduleSlots);
    const timingEventsByRequestId = groupTimingEventsByRequestId(timingEvents);
    const usersById = new Map(companyUsers.map((user) => [user.id, user]));

    requests.forEach((request) => {
        const requestSlots = slotsByRequestId.get(request.id) || [];
        const slot = getCurrentWallScheduleSlot(requestSlots, request, now);
        const timingEvent = getLatestTimingEvent(timingEventsByRequestId.get(request.id) || [], slot);
        const risk = calculateWallDispatchRisk(request, slot, scheduleSlots, timingEvent, now);
        const sectionKey = classifyDispatchWallRequest(request, slot, risk, timingEvent, now);

        if (!sectionKey) return;

        sections[sectionKey].push({
            sectionKey,
            request,
            slot,
            technician: slot?.technician_company_user_id
                ? usersById.get(slot.technician_company_user_id) || null
                : null,
            availability: null,
            timingEvent,
            risk,
            statusLabel: getWallStatusLabel(request, slot, risk),
            sortTime: getWallSortTime(sectionKey, request, slot),
        });
    });

    buildAvailableTechnicianItems(companyUsers, scheduleSlots, now).forEach((item) => {
        sections.available.push(item);
    });

    WALL_SECTION_KEYS.forEach((sectionKey) => {
        sections[sectionKey].sort((first, second) => compareWallItems(sectionKey, first, second));
    });

    return sections;
}

export function classifyDispatchWallRequest(
    request: DispatchWallRequest,
    slot: DispatchWallScheduleSlot | null,
    risk: DispatchRiskResult,
    timingEvent: DispatchWallTimingEvent | null,
    now: Date
): DispatchWallSectionKey | null {
    const slotStatus = normalizeStatus(slot?.status);
    const emergency = isEmergencyDispatchRequest(request);
    const effectiveState = resolveDispatchWallEffectiveState(request, slot);
    const currentDayOperational = isCurrentDayOperationalItem(request, slot, now);
    const runningLateCandidate = isWallRunningLateCandidate(request, slot, risk, slotStatus, now);
    const activeAssignedSlot = Boolean(slot?.technician_company_user_id && slot && isActiveWallScheduleSlot(slot));
    const leadCandidate = isNewLeadStatus(request.status) && !activeAssignedSlot;

    if (effectiveState.terminal) {
        return isEffectiveStateClosedDuringToday(effectiveState, now) ? 'closed_today' : null;
    }

    if (emergency && leadCandidate) {
        return 'emergency_leads';
    }

    if (leadCandidate) {
        return 'regular_leads';
    }

    if (hasCriticalImmediateAssistanceAlert(request, slot, timingEvent) && currentDayOperational) {
        return 'emergency';
    }

    if (!currentDayOperational) {
        return null;
    }

    if (activeAssignedSlot) {
        if (isInProgressStatus(slotStatus) || isFieldWaitingStatus(slotStatus) || isActiveCustomFieldStatus(slot)) {
            return 'in_progress';
        }

        if (isOnMyWayStatus(slotStatus)) {
            return 'on_my_way';
        }

        if (runningLateCandidate) {
            return 'running_late';
        }

        return 'assigned_ready';
    }

    if (emergency) {
        return 'emergency';
    }

    return 'unassigned';
}

export function getCurrentWallScheduleSlot(
    slots: DispatchWallScheduleSlot[],
    request: DispatchWallRequest,
    now: Date
) {
    if (slots.length === 0) return null;

    const activeSlots = slots.filter(isActiveWallScheduleSlot);
    const todayOrFutureActiveSlots = activeSlots.filter((slot) => isTodayOrFutureSlot(slot, now));

    if (todayOrFutureActiveSlots.length > 0) {
        return sortWallSlots(todayOrFutureActiveSlots)[0] || null;
    }

    const latestSlot = [...slots].sort((first, second) => {
        const firstTime = getTimeValue(first.updated_at) || getTimeValue(first.start_at);
        const secondTime = getTimeValue(second.updated_at) || getTimeValue(second.start_at);

        return secondTime - firstTime;
    })[0] || null;

    if (isCompletedWallStatus(request.status)) {
        return latestSlot;
    }

    return activeSlots.length > 0
        ? [...activeSlots].sort((first, second) => {
            const firstTime = getTimeValue(first.updated_at) || getTimeValue(first.start_at);
            const secondTime = getTimeValue(second.updated_at) || getTimeValue(second.start_at);

            return secondTime - firstTime;
        })[0] || null
        : latestSlot;
}

export function isActiveWallScheduleSlot(slot: DispatchWallScheduleSlot) {
    const status = normalizeStatus(slot.status);

    if (slot.visit_outcome || slot.visit_closed_at) return false;

    return ![
        'completed',
        'completed_successfully',
        'closed',
        'cancelled',
        'canceled',
        'archived',
        'void',
        'voided',
        'duplicate_or_void',
        'available',
    ].includes(status);
}

export function isTerminalWallStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return isCompletedWallStatus(normalized) || ['completed_successfully', 'cancelled', 'canceled', 'archived', 'void', 'voided', 'duplicate_or_void'].includes(normalized);
}

export function isCompletedWallStatus(status?: string | null) {
    return ['completed', 'completed_successfully', 'resolved', 'closed', 'done', 'converted_to_job'].includes(normalizeStatus(status));
}

export function formatWallStatusLabel(status?: string | null) {
    const normalized = normalizeStatus(status);
    const labels: Record<string, string> = {
        new: 'New',
        open: 'Open',
        reported: 'Reported',
        unassigned: 'Unassigned',
        acknowledged: 'Acknowledged',
        assigned: 'Assigned',
        scheduled: 'Scheduled',
        dispatched: 'Scheduled',
        on_my_way: 'On My Way',
        en_route: 'On My Way',
        arrived: 'Arrived',
        onsite: 'Arrived',
        on_site: 'Arrived',
        working: 'Working',
        in_progress: 'In Progress',
        active: 'In Progress',
        started: 'Working',
        start_work: 'Working',
        estimate_needed: 'Estimate Needed',
        approval_needed: 'Approval Needed',
        assistance_needed: 'Assistance Needed',
        needs_assistance: 'Assistance Needed',
        help_needed: 'Help Needed',
        needs_help: 'Help Needed',
        parts_needed: 'Parts Needed',
        waiting_for_parts: 'Waiting for Parts',
        running_late: 'Running Late',
        available: 'Available',
        custom: 'Custom',
        completed: 'Completed',
        resolved: 'Completed',
        closed: 'Closed',
        cancelled: 'Cancelled',
        canceled: 'Cancelled',
        archived: 'Archived',
    };

    return labels[normalized] || formatLabel(status);
}

export function getWallDisplayCode(request: Pick<DispatchWallRequest, 'display_code' | 'display_sequence'>) {
    const displayCode = String(request.display_code || '').trim().toUpperCase();

    if (displayCode) return displayCode;
    if (request.display_sequence && Number.isFinite(request.display_sequence)) {
        return `A${String(request.display_sequence).padStart(4, '0')}`;
    }

    return 'PENDING';
}

function createEmptySections(): DispatchWallSections {
    return WALL_SECTION_KEYS.reduce((sections, key) => {
        sections[key] = [];
        return sections;
    }, {} as DispatchWallSections);
}

function groupSlotsByRequestId(slots: DispatchWallScheduleSlot[]) {
    return slots.reduce<Map<string, DispatchWallScheduleSlot[]>>((groups, slot) => {
        const requestId = String(slot.service_request_id || '').trim();

        if (!requestId) return groups;

        const list = groups.get(requestId) || [];
        list.push(slot);
        groups.set(requestId, list);

        return groups;
    }, new Map());
}

function groupTimingEventsByRequestId(events: DispatchWallTimingEvent[]) {
    return events.reduce<Map<string, DispatchWallTimingEvent[]>>((groups, event) => {
        const requestId = String(event.service_request_id || '').trim();

        if (!requestId) return groups;

        const list = groups.get(requestId) || [];
        list.push(event);
        groups.set(requestId, list);

        return groups;
    }, new Map());
}

function buildAvailableTechnicianItems(
    companyUsers: DispatchWallCompanyUser[],
    scheduleSlots: DispatchWallScheduleSlot[],
    now: Date
): DispatchWallItem[] {
    const slotsByTechnicianId = groupSlotsByTechnicianId(scheduleSlots);

    return companyUsers
        .filter(isAvailableWallTechnician)
        .map((technician) => {
            const technicianSlots = slotsByTechnicianId.get(technician.id) || [];
            const availability = getTechnicianAvailability(technician, technicianSlots, now);

            return availability
                ? { technician, availability }
                : null;
        })
        .filter((item): item is { technician: DispatchWallCompanyUser; availability: DispatchWallTechnicianAvailability } => Boolean(item))
        .map(({ technician, availability }) => {
            const displaySlot = availability.signalSlot || availability.nextSlot;

            return {
                sectionKey: 'available' as const,
                request: createAvailableTechnicianRequest(technician, availability),
                slot: displaySlot,
                technician,
                availability,
                timingEvent: null,
                risk: createOnTimeWallRisk('Technician has no active assignment blocking dispatch.'),
                statusLabel: 'Available',
                sortTime: getTimeValue(availability.availableUntil) || getTimeValue(displaySlot?.updated_at) || 0,
            };
        })
        .sort((first, second) => {
            const firstName = getTechnicianName(first.technician);
            const secondName = getTechnicianName(second.technician);

            return firstName.localeCompare(secondName);
        });
}

function groupSlotsByTechnicianId(slots: DispatchWallScheduleSlot[]) {
    return slots.reduce<Map<string, DispatchWallScheduleSlot[]>>((groups, slot) => {
        const technicianId = String(slot.technician_company_user_id || '').trim();

        if (!technicianId) return groups;

        const list = groups.get(technicianId) || [];
        list.push(slot);
        groups.set(technicianId, list);

        return groups;
    }, new Map());
}

function isAvailableWallTechnician(technician: DispatchWallCompanyUser) {
    const role = normalizeStatus(technician.role);
    const status = normalizeStatus(technician.status);

    return isTechnicianCapableRole(role) && isActiveCompanyUserStatus(status) && !isUnavailableTechnicianStatus(status);
}

function getTechnicianAvailability(
    technician: DispatchWallCompanyUser,
    technicianSlots: DispatchWallScheduleSlot[],
    now: Date
): DispatchWallTechnicianAvailability | null {
    if (technicianSlots.some((slot) => isBlockingTechnicianAvailabilitySlot(slot, now))) {
        return null;
    }

    const signal = getPositiveAvailabilitySignal(technician, technicianSlots);

    if (!signal) return null;

    const nextSlot = getNextTechnicianAssignmentSlot(technicianSlots, now);

    return {
        signalLabel: signal.label,
        signalSlot: signal.slot,
        nextSlot,
        availableUntil: nextSlot?.arrival_window_start || nextSlot?.start_at || null,
    };
}

function isTechnicianCapableRole(role: string) {
    return ['technician', 'tech', 'field_technician', 'lead_technician'].includes(role);
}

function isActiveCompanyUserStatus(status: string) {
    return [
        'active',
        'available',
        'ready',
        'standby',
        'present',
        'on_duty',
        'on-duty',
        'clocked_in',
        'clocked-in',
    ].includes(status);
}

function isUnavailableTechnicianStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return [
        'inactive',
        'disabled',
        'suspended',
        'revoked',
        'absent',
        'off_duty',
        'off-duty',
        'off duty',
        'lunch',
        'on_lunch',
        'break',
        'on_break',
        'signed_out',
        'signed-out',
        'clocked_out',
        'clocked-out',
        'offline',
        'unavailable',
    ].includes(normalized);
}

function getPositiveAvailabilitySignal(
    technician: DispatchWallCompanyUser,
    technicianSlots: DispatchWallScheduleSlot[]
) {
    const userStatus = normalizeStatus(technician.status);

    if (isPositiveAvailabilityStatus(userStatus)) {
        return {
            label: formatLabel(userStatus),
            slot: null,
        };
    }

    return [...technicianSlots]
        .sort((first, second) => {
            const firstTime = getTimeValue(first.updated_at) || getTimeValue(first.end_at) || getTimeValue(first.start_at);
            const secondTime = getTimeValue(second.updated_at) || getTimeValue(second.end_at) || getTimeValue(second.start_at);

            return secondTime - firstTime;
        })
        .map((slot) => {
            const status = normalizeStatus(slot.status);
            const note = normalizeStatus(slot.tech_status_note);

            if (isPositiveAvailabilityStatus(status)) {
                return {
                    label: formatLabel(status),
                    slot,
                };
            }

            if (isPositiveAvailabilityNote(note)) {
                return {
                    label: 'Ready',
                    slot,
                };
            }

            return null;
        })
        .find(Boolean) || null;
}

function isPositiveAvailabilityStatus(status: string) {
    return [
        'available',
        'ready',
        'standby',
        'present',
        'on_duty',
        'on-duty',
        'clocked_in',
        'clocked-in',
    ].includes(status);
}

function isPositiveAvailabilityNote(note: string) {
    return (
        note.includes('available') ||
        note.includes('ready') ||
        note.includes('standby') ||
        note.includes('on duty') ||
        note.includes('clocked in')
    );
}

function isBlockingTechnicianAvailabilitySlot(slot: DispatchWallScheduleSlot, now: Date) {
    const status = normalizeStatus(slot.status);

    if (!isActiveWallScheduleSlot(slot)) return false;
    if (isPositiveAvailabilityStatus(status)) return false;
    if (isUnavailableTechnicianStatus(status)) return false;

    const startTime = getTimeValue(slot.start_at || slot.arrival_window_start);
    const endTime = getTimeValue(slot.end_at || slot.arrival_window_end);
    const nowTime = now.getTime();

    if (isTechnicianBusyStatus(status)) {
        return !endTime || endTime >= nowTime;
    }

    if (startTime && startTime <= nowTime) return true;
    if (!startTime && !endTime) return true;

    return false;
}

function isTechnicianBusyStatus(status: string) {
    return [
        'on_my_way',
        'en_route',
        'arrived',
        'onsite',
        'on_site',
        'working',
        'in_progress',
        'in-progress',
        'active',
        'started',
        'start_work',
        'running_late',
        'custom',
    ].includes(status);
}

function getNextTechnicianAssignmentSlot(slots: DispatchWallScheduleSlot[], now: Date) {
    const nowTime = now.getTime();

    return [...slots].filter((slot) => {
        const status = normalizeStatus(slot.status);
        const startTime = getTimeValue(slot.arrival_window_start || slot.start_at);

        return (
            isActiveWallScheduleSlot(slot) &&
            !isPositiveAvailabilityStatus(status) &&
            !isUnavailableTechnicianStatus(status) &&
            Boolean(startTime) &&
            startTime > nowTime
        );
    }).sort((first, second) => {
        const firstTime = getTimeValue(first.arrival_window_start || first.start_at);
        const secondTime = getTimeValue(second.arrival_window_start || second.start_at);

        return firstTime - secondTime;
    })[0] || null;
}

function createAvailableTechnicianRequest(
    technician: DispatchWallCompanyUser,
    availability: DispatchWallTechnicianAvailability
): DispatchWallRequest {
    const nowIso = new Date().toISOString();
    const availableUntil = availability.availableUntil;

    return {
        id: `available-${technician.id}`,
        display_sequence: null,
        display_code: 'TECH',
        company_id: technician.company_id,
        property_id: `technician-${technician.id}`,
        company_property_client_id: null,
        request_type: 'technician_status',
        status: 'available',
        priority: null,
        issue_summary: availableUntil ? 'Available until next appointment' : availability.signalLabel,
        customer_display_name: getTechnicianName(technician),
        property_display_name: 'Available technician',
        property_address: technician.full_name ? null : technician.email,
        property_city: null,
        property_state: null,
        property_postal_code: null,
        created_at: availability.signalSlot?.updated_at || availability.signalSlot?.visit_closed_at || nowIso,
        acknowledged_at: null,
        converted_job_id: null,
        converted_at: null,
        closed_at: null,
        cancelled_at: null,
        archived_at: null,
    };
}

function createOnTimeWallRisk(reason: string): DispatchRiskResult {
    return {
        state: 'ON_TIME',
        label: 'Available',
        reason,
        latestDepartureAt: null,
        estimatedArrivalAt: null,
        estimatedDelayMinutes: null,
        needsReassignment: false,
        suggestedActions: [],
    };
}

function getLatestTimingEvent(events: DispatchWallTimingEvent[], slot: DispatchWallScheduleSlot | null) {
    return events
        .filter((event) => {
            if (normalizeStatus(event.event_type) !== 'technician_timing_response') return false;
            if (slot?.id && event.schedule_slot_id && event.schedule_slot_id !== slot.id) return false;

            return true;
        })
        .sort((first, second) => getTimeValue(second.created_at) - getTimeValue(first.created_at))[0] || null;
}

function calculateWallDispatchRisk(
    request: DispatchWallRequest,
    slot: DispatchWallScheduleSlot | null,
    scheduleSlots: DispatchWallScheduleSlot[],
    timingEvent: DispatchWallTimingEvent | null,
    now: Date
) {
    return calculateDispatchRisk(
        slot
            ? {
                ...slot,
                request_status: getWallRiskRequestStatus(request, slot),
                tech_status_note: mergeTimingText(slot.tech_status_note, timingEvent),
            }
            : null,
        scheduleSlots.map((candidate) => ({
            ...candidate,
            request_status: candidate.service_request_id === request.id ? getWallRiskRequestStatus(request, slot) : null,
        })),
        now
    );
}

function mergeTimingText(statusNote: string | null, timingEvent: DispatchWallTimingEvent | null) {
    const parts = [statusNote || ''];

    if (timingEvent) {
        const response = readMetadataString(timingEvent.metadata, 'response');
        const remainingMinutes = readMetadataNumber(timingEvent.metadata, 'estimated_remaining_minutes');

        parts.push(response || timingEvent.message || '');
        if (remainingMinutes !== null) {
            parts.push(`Need ${remainingMinutes} more minutes`);
        }
    }

    return parts.filter((part) => part.trim()).join(' · ') || null;
}

function getWallRiskRequestStatus(request: DispatchWallRequest, slot: DispatchWallScheduleSlot | null) {
    if (slot?.status) return slot.status;

    return request.status;
}

function isTodayOrFutureSlot(slot: DispatchWallScheduleSlot, now: Date) {
    const dayStart = startOfLocalDay(now).getTime();
    const endTime = getTimeValue(slot.end_at);
    const startTime = getTimeValue(slot.start_at);

    if (endTime) return endTime >= dayStart;
    if (startTime) return startTime >= dayStart;

    return true;
}

function isCurrentDayOperationalItem(
    request: DispatchWallRequest,
    slot: DispatchWallScheduleSlot | null,
    now: Date
) {
    if (!slot) {
        const requestTime = getTimeValue(request.acknowledged_at) || getTimeValue(request.created_at);

        return !requestTime || requestTime <= endOfLocalDay(now).getTime();
    }

    const slotStart = getTimeValue(slot.start_at);
    const slotEnd = getTimeValue(slot.end_at);
    const todayEnd = endOfLocalDay(now).getTime();

    if (slotStart) return slotStart <= todayEnd;
    if (slotEnd) return slotEnd <= todayEnd;

    return true;
}

export function resolveDispatchWallEffectiveState(
    request: DispatchWallRequest,
    slot: DispatchWallScheduleSlot | null
): DispatchWallEffectiveState {
    const requestTerminalLabel = getTerminalRequestLabel(request);
    const slotTerminalLabel = getTerminalSlotLabel(slot);
    const requestTerminal = Boolean(requestTerminalLabel);

    if (requestTerminal) {
        return {
            terminal: true,
            requestTerminal: true,
            terminalLabel: requestTerminalLabel,
            terminalTime: (
                getTimeValue(request.closed_at) ||
                getTimeValue(request.cancelled_at) ||
                getTimeValue(request.archived_at) ||
                getTimeValue(slot?.visit_closed_at) ||
                getTimeValue(slot?.updated_at) ||
                getTimeValue(request.created_at)
            ),
        };
    }

    return {
        terminal: Boolean(slotTerminalLabel),
        requestTerminal: false,
        terminalLabel: slotTerminalLabel,
        terminalTime: (
            getTimeValue(slot?.visit_closed_at) ||
            getTimeValue(slot?.updated_at) ||
            getTimeValue(request.closed_at) ||
            getTimeValue(request.cancelled_at) ||
            getTimeValue(request.archived_at) ||
            getTimeValue(request.created_at)
        ),
    };
}

function isEffectiveStateClosedDuringToday(effectiveState: DispatchWallEffectiveState, now: Date) {
    if (!effectiveState.terminalTime) return false;

    return effectiveState.terminalTime >= startOfLocalDay(now).getTime() && effectiveState.terminalTime <= endOfLocalDay(now).getTime();
}

function getTerminalRequestLabel(request: DispatchWallRequest) {
    const requestStatus = normalizeStatus(request.status);
    const closeoutOutcome = normalizeStatus(request.closeout_outcome);

    if (isTerminalWallStatus(requestStatus)) return getTerminalStatusLabel(requestStatus);
    if (isTerminalCloseoutOutcome(closeoutOutcome)) return getTerminalStatusLabel(closeoutOutcome);
    if (request.cancelled_at) return 'Cancelled';
    if (request.archived_at) return 'Archived';
    if (request.closed_at) return closeoutOutcome ? getTerminalStatusLabel(closeoutOutcome) : 'Completed';

    return null;
}

function getTerminalSlotLabel(slot: DispatchWallScheduleSlot | null) {
    const slotStatus = normalizeStatus(slot?.status);
    const visitOutcome = normalizeStatus(slot?.visit_outcome);

    if (isTerminalWallStatus(slotStatus)) return getTerminalStatusLabel(slotStatus);
    if (isTerminalCloseoutOutcome(visitOutcome)) return getTerminalStatusLabel(visitOutcome);
    if (slot?.visit_closed_at) return visitOutcome ? getTerminalStatusLabel(visitOutcome) : 'Completed';

    return null;
}

function isTerminalCloseoutOutcome(outcome: string) {
    return [
        'completed_successfully',
        'cancelled',
        'canceled',
        'archived',
        'void',
        'voided',
        'duplicate_or_void',
    ].includes(outcome);
}

function getTerminalStatusLabel(status: string) {
    if (['cancelled', 'canceled'].includes(status)) return 'Cancelled';
    if (status === 'archived') return 'Archived';
    if (['void', 'voided', 'duplicate_or_void'].includes(status)) return 'Voided';

    return 'Completed';
}

function isWallRunningLateCandidate(
    request: DispatchWallRequest,
    slot: DispatchWallScheduleSlot | null,
    risk: DispatchRiskResult,
    slotStatus: string,
    now: Date
) {
    return Boolean(
        slot?.technician_company_user_id &&
        isActiveWallScheduleSlot(slot) &&
        isCurrentDayOperationalItem(request, slot, now) &&
        !isOnMyWayStatus(slotStatus) &&
        !isInProgressStatus(slotStatus) &&
        risk.state === 'RUNNING_LATE'
    );
}

function hasCriticalImmediateAssistanceAlert(
    request: DispatchWallRequest,
    slot: DispatchWallScheduleSlot | null,
    timingEvent: DispatchWallTimingEvent | null
) {
    const requestStatus = normalizeStatus(request.status);
    const slotStatus = normalizeStatus(slot?.status);
    const eventType = normalizeStatus(timingEvent?.event_type);
    const text = [
        request.issue_summary,
        slot?.tech_status_note,
        timingEvent?.message,
        timingEvent ? readMetadataString(timingEvent.metadata, 'response') : '',
        timingEvent ? readMetadataString(timingEvent.metadata, 'reason') : '',
        timingEvent ? readMetadataString(timingEvent.metadata, 'status') : '',
    ].join(' ').toLowerCase();

    if (
        [
            'critical_assistance',
            'critical_help',
            'emergency_assistance',
            'emergency_escalation',
            'immediate_assistance',
            'safety_alert',
            'safety_assistance',
        ].includes(slotStatus) ||
        [
            'critical_assistance',
            'critical_help',
            'emergency_assistance',
            'emergency_escalation',
            'immediate_assistance',
            'safety_alert',
            'safety_assistance',
        ].includes(requestStatus) ||
        [
            'critical_assistance',
            'critical_help',
            'emergency_assistance',
            'emergency_escalation',
            'safety_alert',
        ].includes(eventType)
    ) {
        return true;
    }

    if (hasExplicitCriticalAssistanceText(text)) return true;

    return (isAssistanceStatus(slotStatus) || isAssistanceStatus(requestStatus)) && hasImmediateSafetyQualifier(text);
}

function isAssistanceStatus(status: string) {
    return [
        'assistance_needed',
        'needs_assistance',
        'help_needed',
        'needs_help',
        'approval_needed',
        'estimate_needed',
        'blocked',
        'on_hold',
        'paused',
    ].includes(status);
}

function hasExplicitCriticalAssistanceText(text: string) {
    return (
        text.includes('critical assistance') ||
        text.includes('critical help') ||
        text.includes('immediate assistance') ||
        text.includes('immediate help') ||
        text.includes('urgent assistance') ||
        text.includes('urgent help') ||
        text.includes('emergency escalation') ||
        text.includes('active gas danger') ||
        text.includes('gas danger') ||
        text.includes('safety threat') ||
        text.includes('safety issue') ||
        text.includes('urgent office response')
    );
}

function hasImmediateSafetyQualifier(text: string) {
    return (
        text.includes('critical') ||
        text.includes('immediate') ||
        text.includes('urgent') ||
        text.includes('safety') ||
        text.includes('danger') ||
        text.includes('gas')
    );
}

function isOnMyWayStatus(status: string) {
    return ['on_my_way', 'en_route', 'dispatched'].includes(status);
}

function isInProgressStatus(status: string) {
    return ['arrived', 'onsite', 'on_site', 'working', 'in_progress', 'in-progress', 'active', 'started', 'start_work'].includes(status);
}

function isFieldWaitingStatus(status: string) {
    return [
        'estimate_needed',
        'approval_needed',
        'needs_approval',
        'waiting',
        'waiting_on_customer',
        'waiting_on_parts',
        'parts_needed',
        'need_parts',
        'assistance_needed',
        'needs_assistance',
        'help_needed',
        'needs_help',
        'blocked',
        'on_hold',
        'paused',
    ].includes(status);
}

function isActiveCustomFieldStatus(slot: DispatchWallScheduleSlot | null) {
    if (normalizeStatus(slot?.status) !== 'custom') return false;

    const customText = normalizeStatus(slot?.tech_status_note);
    if (!customText || isTerminalWallStatus(customText) || isTerminalCloseoutOutcome(customText)) return false;

    return (
        [
            'diagnosing',
            'diagnosis',
            'testing',
            'cleaning_up',
            'cleaning up',
            'active_assistance',
            'active assistance',
            'waiting_for_approval',
            'waiting for approval',
            'customer approval',
            'approval_needed',
            'approval needed',
            'working',
            'work in progress',
            'in_progress',
            'in progress',
        ].includes(customText) ||
        customText.includes('diagnos') ||
        customText.includes('testing') ||
        customText.includes('cleaning up') ||
        customText.includes('approval') ||
        customText.includes('active assistance')
    );
}

function getWallStatusLabel(request: DispatchWallRequest, slot: DispatchWallScheduleSlot | null, risk: DispatchRiskResult) {
    const effectiveState = resolveDispatchWallEffectiveState(request, slot);

    if (effectiveState.terminalLabel) return effectiveState.terminalLabel;
    if (risk.state === 'AT_RISK') return 'At Risk';
    if (risk.state === 'RUNNING_LATE') return risk.needsReassignment ? 'Needs Reassignment' : 'Running Late';
    if (isTerminalWallStatus(slot?.status)) return formatWallStatusLabel(slot?.status);

    return formatWallStatusLabel(slot?.status || request.status);
}

function getWallSortTime(
    sectionKey: DispatchWallSectionKey,
    request: DispatchWallRequest,
    slot: DispatchWallScheduleSlot | null
) {
    if (sectionKey === 'closed_today') {
        return (
            getTimeValue(request.closed_at) ||
            getTimeValue(request.cancelled_at) ||
            getTimeValue(request.archived_at) ||
            getTimeValue(slot?.visit_closed_at) ||
            getTimeValue(slot?.updated_at) ||
            getTimeValue(request.created_at)
        );
    }

    return (
        getTimeValue(slot?.arrival_window_start) ||
        getTimeValue(slot?.start_at) ||
        getTimeValue(request.acknowledged_at) ||
        getTimeValue(request.created_at)
    );
}

function compareWallItems(sectionKey: DispatchWallSectionKey, first: DispatchWallItem, second: DispatchWallItem) {
    if (sectionKey === 'closed_today') {
        return second.sortTime - first.sortTime;
    }

    if (sectionKey === 'running_late') {
        if (first.risk.needsReassignment !== second.risk.needsReassignment) {
            return first.risk.needsReassignment ? -1 : 1;
        }

        const firstDelay = first.risk.estimatedDelayMinutes ?? 0;
        const secondDelay = second.risk.estimatedDelayMinutes ?? 0;

        if (firstDelay !== secondDelay) return secondDelay - firstDelay;
    }

    if (sectionKey === 'emergency') {
        const firstCritical = isCriticalText(first.request.issue_summary) || isCriticalText(first.slot?.tech_status_note);
        const secondCritical = isCriticalText(second.request.issue_summary) || isCriticalText(second.slot?.tech_status_note);

        if (firstCritical !== secondCritical) return firstCritical ? -1 : 1;
    }

    if (sectionKey === 'absent' || sectionKey === 'available') {
        return getTechnicianName(first.technician).localeCompare(getTechnicianName(second.technician));
    }

    return first.sortTime - second.sortTime;
}

function sortWallSlots(slots: DispatchWallScheduleSlot[]) {
    return [...slots].sort((first, second) => {
        const firstTime = getTimeValue(first.start_at) || getTimeValue(first.updated_at);
        const secondTime = getTimeValue(second.start_at) || getTimeValue(second.updated_at);

        return firstTime - secondTime;
    });
}

function isCriticalText(value?: string | null) {
    const text = normalizeStatus(value);

    return text.includes('critical') || text.includes('emergency') || text.includes('flood') || text.includes('gas');
}

function getTechnicianName(technician: DispatchWallCompanyUser | null) {
    return technician?.full_name || technician?.email || '';
}

function getTimeValue(value?: string | null) {
    if (!value) return 0;

    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

function readMetadataString(metadata: Record<string, unknown>, key: string) {
    const value = metadata[key];

    return typeof value === 'string' ? value.trim() : '';
}

function readMetadataNumber(metadata: Record<string, unknown>, key: string) {
    const value = metadata[key];

    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function startOfLocalDay(now: Date) {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    return date;
}

function endOfLocalDay(now: Date) {
    const date = new Date(now);
    date.setHours(23, 59, 59, 999);
    return date;
}

function formatLabel(value?: string | null) {
    const normalized = String(value || '').trim();

    if (!normalized) return 'Unknown';

    return normalized
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
