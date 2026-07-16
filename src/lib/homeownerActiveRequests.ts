import { requireActivePropertyMembership } from './activeProperty';
import {
    formatServiceRequestReference,
    getServiceRequestDisplayCode,
} from './homeServiceRequests';
import {
    loadHomeownerServiceRequestTimeline,
    type ServiceRequestActivityEvent,
} from './serviceRequestActivity';
import { supabase } from './supabase';

export const HOMEOWNER_ACTIVE_REQUEST_REFRESH_MS = 30_000;
export const ACTIVE_REQUEST_INITIAL_EXPAND_MS = 5_000;
export const ACTIVE_REQUEST_UPDATE_EXPAND_MS = 4_000;

export type HomeownerRequestTone = 'emergency' | 'active' | 'neutral' | 'complete' | 'cancelled';
export type ActiveRequestTrackerAutoExpansionReason = 'initial' | 'status-change';

export type HomeownerActiveServiceRequest = {
    id: string;
    display_sequence: number | null;
    display_code: string | null;
    company_id: string;
    property_id: string;
    request_type: string | null;
    status: string | null;
    priority: string | null;
    issue_summary: string | null;
    provider_name: string | null;
    schedule_slot_id: string | null;
    schedule_status: string | null;
    technician_name: string | null;
    arrival_window_start: string | null;
    arrival_window_end: string | null;
    eta_range: string | null;
    created_at: string | null;
    updated_at: string | null;
    converted_job_id?: string | null;
};

export type HomeownerActiveRequestTracker = {
    request: HomeownerActiveServiceRequest;
    timeline: ServiceRequestActivityEvent[];
    latestEvent: ServiceRequestActivityEvent | null;
    displayCode: string;
    referenceLabel: string;
    requestKindLabel: string;
    statusLabel: string;
    statusKey: string;
    tone: HomeownerRequestTone;
    isEmergency: boolean;
    activeCountLabel: string;
    moreCountLabel: string;
    providerName: string;
    technicianName: string;
    arrivalWindowLabel: string;
    etaLabel: string;
    latestUpdateLabel: string;
    sortTime: number;
    canCancel: boolean;
};

export async function loadActiveHomeownerRequestTrackers(propertyId?: string | null) {
    const resolvedPropertyId = String(propertyId || '').trim() || (await requireActivePropertyMembership()).propertyId;
    const requests = await loadActiveHomeownerServiceRequests(resolvedPropertyId);
    const activeRequests = requests.filter(isActiveHomeownerServiceRequest);
    const timelinesByRequestId = await loadTimelinesByRequestId(activeRequests.map((request) => request.id));

    return buildHomeownerActiveRequestTrackers(activeRequests, timelinesByRequestId);
}

export async function loadActiveHomeownerServiceRequests(propertyId: string): Promise<HomeownerActiveServiceRequest[]> {
    const normalizedPropertyId = propertyId.trim();

    if (!normalizedPropertyId) return [];

    const rpcRequests = await loadActiveRequestsWithRpc(normalizedPropertyId);

    if (rpcRequests) return rpcRequests;

    const { data, error } = await supabase
        .from('service_requests')
        .select('id, display_sequence, display_code, company_id, property_id, request_type, status, priority, issue_summary, created_at, updated_at, converted_job_id')
        .eq('property_id', normalizedPropertyId)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(12);

    if (error) {
        throw new Error(error.message);
    }

    const requests = normalizeActiveServiceRequests(data);
    const activeRequests = requests.filter(isActiveHomeownerServiceRequest);
    const [providerNames, scheduleSummaries] = await Promise.all([
        loadProviderNames(activeRequests),
        loadScheduleSummaries(activeRequests.map((request) => request.id)),
    ]);

    return activeRequests.map((request) => ({
        ...request,
        provider_name: providerNames[request.company_id] || request.provider_name,
        ...scheduleSummaries[request.id],
    }));
}

export function buildHomeownerActiveRequestTrackers(
    requests: HomeownerActiveServiceRequest[],
    timelinesByRequestId: Record<string, ServiceRequestActivityEvent[]>
): HomeownerActiveRequestTracker[] {
    const activeRequests = requests.filter(isActiveHomeownerServiceRequest);

    return activeRequests
        .map((request) => {
            const timeline = (timelinesByRequestId[request.id] || [])
                .filter((event) => normalizeText(event.audience) === 'homeowner')
                .sort((first, second) => getTimeValue(first.created_at) - getTimeValue(second.created_at));
            const latestEvent = timeline[timeline.length - 1] || null;
            const statusKey = getHomeownerFacingStatusKey(request.status, latestEvent?.event_type);
            const statusLabel = getHomeownerFacingStatusLabel(request.status, latestEvent?.event_type);
            const isEmergency = isEmergencyServiceRequest(request);
            const displayCode = getServiceRequestDisplayCode(request);
            const technicianName = firstText(request.technician_name, readEventMetadataText(latestEvent, 'technician_name'));
            const arrivalWindowLabel = formatArrivalWindow(
                firstText(request.arrival_window_start, readEventMetadataText(latestEvent, 'arrival_window_start')),
                firstText(request.arrival_window_end, readEventMetadataText(latestEvent, 'arrival_window_end'))
            );
            const etaLabel = firstText(request.eta_range, readEventMetadataText(latestEvent, 'eta_range'));

            return {
                request,
                timeline,
                latestEvent,
                displayCode,
                referenceLabel: formatServiceRequestReference(request),
                requestKindLabel: isEmergency ? 'Emergency' : 'Service',
                statusLabel,
                statusKey,
                tone: getHomeownerRequestTone(request.status, latestEvent?.event_type, isEmergency),
                isEmergency,
                activeCountLabel: '',
                moreCountLabel: '',
                providerName: firstText(request.provider_name, 'Provider company on file'),
                technicianName: technicianName || 'Not assigned yet',
                arrivalWindowLabel: arrivalWindowLabel || 'Not scheduled yet',
                etaLabel: etaLabel || '',
                latestUpdateLabel: latestEvent?.message || statusLabel,
                sortTime: getSortTime(request, latestEvent),
                canCancel: canHomeownerCancelRequest(request),
            };
        })
        .sort(compareHomeownerActiveRequestTrackers)
        .map((tracker, _index, allTrackers) => ({
            ...tracker,
            activeCountLabel: allTrackers.length > 1 ? `${allTrackers.length} active` : '',
            moreCountLabel: allTrackers.length > 1 ? `+${allTrackers.length - 1} more` : '',
        }));
}

export function selectFeaturedHomeownerActiveRequest(trackers: HomeownerActiveRequestTracker[]) {
    return [...trackers].sort(compareHomeownerActiveRequestTrackers)[0] || null;
}

export function formatActiveRequestCompactLabel(tracker?: HomeownerActiveRequestTracker | null) {
    if (!tracker) return '';

    return formatActiveRequestIdentifier(tracker);
}

export function formatActiveRequestExpandedTitle(tracker?: HomeownerActiveRequestTracker | null) {
    if (!tracker) return 'Active Request';

    const identifier = formatActiveRequestIdentifier(tracker);

    return `${tracker.requestKindLabel} Request ${identifier}`;
}

export function getActiveRequestEtaStatusText(tracker?: HomeownerActiveRequestTracker | null) {
    if (!tracker) return '';
    if (tracker.etaLabel) return tracker.etaLabel;
    if (tracker.statusKey === 'on_my_way') return 'Technician is on the way.';

    return '';
}

export function getActiveRequestTrackerAutoExpansionReason(
    previousTrackers: HomeownerActiveRequestTracker[],
    nextTrackers: HomeownerActiveRequestTracker[]
): ActiveRequestTrackerAutoExpansionReason | null {
    if (previousTrackers.length === 0 && nextTrackers.length > 0) return 'initial';

    const previousStatusByRequestId = previousTrackers.reduce<Record<string, string>>((accumulator, tracker) => {
        accumulator[tracker.request.id] = tracker.statusKey;
        return accumulator;
    }, {});

    if (nextTrackers.some((tracker) => !previousStatusByRequestId[tracker.request.id])) return 'initial';

    return nextTrackers.some((tracker) => {
        const previousStatus = previousStatusByRequestId[tracker.request.id];

        return previousStatus && previousStatus !== tracker.statusKey;
    }) ? 'status-change' : null;
}

export function getActiveRequestTrackerAutoCollapseDelay(reason: ActiveRequestTrackerAutoExpansionReason | 'manual' | null) {
    if (reason === 'initial') return ACTIVE_REQUEST_INITIAL_EXPAND_MS;
    if (reason === 'status-change') return ACTIVE_REQUEST_UPDATE_EXPAND_MS;

    return 0;
}

export function isActiveHomeownerServiceRequest(request: Pick<HomeownerActiveServiceRequest, 'status'>) {
    return !isTerminalHomeownerRequestStatus(request.status);
}

export function isTerminalHomeownerRequestStatus(status?: string | null) {
    const normalized = normalizeText(status);

    return [
        'archived',
        'cancelled',
        'canceled',
        'closed',
        'complete',
        'completed',
        'done',
        'resolved',
        'void',
    ].includes(normalized);
}

export function getHomeownerFacingStatusLabel(requestStatus?: string | null, latestEventType?: string | null) {
    const statusKey = getHomeownerFacingStatusKey(requestStatus, latestEventType);
    const labels: Record<string, string> = {
        acknowledged: 'Company acknowledged your request',
        arrived: 'Technician arrived',
        arriving_soon: 'Technician arriving soon',
        assigned: 'Technician assigned',
        cancelled: 'Request cancelled',
        completed: 'Work completed',
        delayed: 'Technician delayed',
        in_progress: 'Work in progress',
        on_my_way: 'Technician on the way',
        request_received: 'Request received',
        scheduled: 'Appointment scheduled',
        waiting_for_approval: 'Waiting for your approval',
    };

    return labels[statusKey] || 'Request received';
}

function formatActiveRequestIdentifier(tracker: HomeownerActiveRequestTracker) {
    const identifier = tracker.displayCode || tracker.referenceLabel.replace(/^Request\s+/i, '');

    return identifier && identifier !== 'number pending' ? identifier : 'Pending';
}

export function getHomeownerFacingStatusKey(requestStatus?: string | null, latestEventType?: string | null) {
    const eventType = normalizeText(latestEventType);
    const requestStatusText = normalizeText(requestStatus);
    const eventStatusLabels: Record<string, string> = {
        request_acknowledged: 'acknowledged',
        appointment_scheduled: 'scheduled',
        technician_assigned: 'assigned',
        technician_reassigned: 'assigned',
        technician_on_the_way: 'on_my_way',
        technician_arriving_soon: 'arriving_soon',
        technician_arrived: 'arrived',
        technician_delayed: 'delayed',
        appointment_delayed: 'delayed',
        work_in_progress: 'in_progress',
        waiting_for_customer_approval: 'waiting_for_approval',
        work_completed: 'completed',
        work_completed_rating_requested: 'completed',
        request_cancelled: 'cancelled',
        appointment_cancelled: 'cancelled',
    };
    const requestStatusLabels: Record<string, string> = {
        acknowledged: 'acknowledged',
        assigned: 'assigned',
        cancelled: 'cancelled',
        canceled: 'cancelled',
        completed: 'completed',
        complete: 'completed',
        dispatched: 'assigned',
        estimate_needed: 'waiting_for_approval',
        in_progress: 'in_progress',
        new: 'request_received',
        on_my_way: 'on_my_way',
        open: 'request_received',
        reported: 'request_received',
        scheduled: 'scheduled',
    };

    return eventStatusLabels[eventType] || requestStatusLabels[requestStatusText] || 'request_received';
}

export function containsRawUuidLikeText(value?: string | null) {
    return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(String(value || ''));
}

export function shouldShowHomeownerActiveRequestStatus(input: {
    pathname?: string | null;
    providerModeActive?: boolean;
}) {
    if (input.providerModeActive) return false;

    const pathname = normalizePath(input.pathname);
    const hiddenPrefixes = [
        '/admin',
        '/auth',
        '/company-invite',
        '/customer-invite',
        '/dispatch',
        '/dispatch-wall',
        '/estimate',
        '/onboarding',
        '/schedule',
        '/super-admin',
        '/techos',
    ];

    return !hiddenPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

async function loadActiveRequestsWithRpc(propertyId: string) {
    const { data, error } = await supabase.rpc('get_homeowner_active_service_requests', {
        p_property_id: propertyId,
    });

    if (!error) {
        return normalizeActiveServiceRequests(data).filter(isActiveHomeownerServiceRequest);
    }

    if (isBackendMissing(error.message)) return null;

    throw new Error(error.message);
}

async function loadTimelinesByRequestId(requestIds: string[]) {
    const uniqueIds = Array.from(new Set(requestIds.map((id) => id.trim()).filter(Boolean)));
    const entries = await Promise.all(uniqueIds.map(async (requestId) => {
        try {
            return {
                requestId,
                events: await loadHomeownerServiceRequestTimeline(requestId),
            };
        } catch {
            return {
                requestId,
                events: [] as ServiceRequestActivityEvent[],
            };
        }
    }));

    return entries.reduce<Record<string, ServiceRequestActivityEvent[]>>((accumulator, entry) => {
        accumulator[entry.requestId] = entry.events;
        return accumulator;
    }, {});
}

async function loadProviderNames(requests: HomeownerActiveServiceRequest[]) {
    const companyIds = Array.from(new Set(requests.map((request) => request.company_id).filter(Boolean)));

    if (companyIds.length === 0) return {};

    const withBrandColumns = await loadCompanyNames(companyIds, 'id, name, public_name, dba_name');

    if (withBrandColumns) return withBrandColumns;

    return await loadCompanyNames(companyIds, 'id, name') || {};
}

async function loadCompanyNames(companyIds: string[], selectColumns: string) {
    const { data, error } = await supabase
        .from('companies')
        .select(selectColumns)
        .in('id', companyIds);

    if (error) return null;

    return (Array.isArray(data) ? data : []).reduce<Record<string, string>>((accumulator, row) => {
        const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};
        const id = readString(record, 'id');
        const name = firstText(
            readString(record, 'public_name'),
            readString(record, 'dba_name'),
            readString(record, 'name')
        );

        if (id && name) accumulator[id] = name;

        return accumulator;
    }, {});
}

async function loadScheduleSummaries(requestIds: string[]) {
    const uniqueIds = Array.from(new Set(requestIds.map((id) => id.trim()).filter(Boolean)));

    if (uniqueIds.length === 0) return {};

    const { data, error } = await supabase
        .from('job_schedule_slots')
        .select('id, service_request_id, technician_company_user_id, arrival_window_start, arrival_window_end, status, updated_at')
        .in('service_request_id', uniqueIds)
        .order('updated_at', { ascending: false });

    if (error) return {};

    const slots = Array.isArray(data) ? data : [];
    const technicianIds = Array.from(new Set(slots.map((slot) => readString(slot as Record<string, unknown>, 'technician_company_user_id')).filter(Boolean)));
    const technicianNames = await loadTechnicianNames(technicianIds);

    return slots.reduce<Record<string, Partial<HomeownerActiveServiceRequest>>>((accumulator, row) => {
        const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};
        const requestId = readString(record, 'service_request_id');

        if (!requestId || accumulator[requestId]) return accumulator;

        const technicianId = readString(record, 'technician_company_user_id');
        accumulator[requestId] = {
            schedule_slot_id: readString(record, 'id') || null,
            schedule_status: readString(record, 'status') || null,
            technician_name: technicianNames[technicianId] || null,
            arrival_window_start: readString(record, 'arrival_window_start') || null,
            arrival_window_end: readString(record, 'arrival_window_end') || null,
        };

        return accumulator;
    }, {});
}

async function loadTechnicianNames(technicianIds: string[]) {
    if (technicianIds.length === 0) return {};

    const { data, error } = await supabase
        .from('company_users')
        .select('id, full_name, email')
        .in('id', technicianIds);

    if (error) return {};

    return (Array.isArray(data) ? data : []).reduce<Record<string, string>>((accumulator, row) => {
        const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};
        const id = readString(record, 'id');
        const name = firstText(readString(record, 'full_name'), readString(record, 'email'));

        if (id && name) accumulator[id] = name;

        return accumulator;
    }, {});
}

function normalizeActiveServiceRequests(data: unknown): HomeownerActiveServiceRequest[] {
    return (Array.isArray(data) ? data : data ? [data] : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? row as Record<string, unknown> : {};

            return {
                id: readString(record, 'id') || readString(record, 'service_request_id'),
                display_sequence: readOptionalNumber(record.display_sequence),
                display_code: readOptionalString(record.display_code)?.toUpperCase() || null,
                company_id: readString(record, 'company_id'),
                property_id: readString(record, 'property_id'),
                request_type: readOptionalString(record.request_type),
                status: readOptionalString(record.status),
                priority: readOptionalString(record.priority),
                issue_summary: readOptionalString(record.issue_summary),
                provider_name: readOptionalString(record.provider_name),
                schedule_slot_id: readOptionalString(record.schedule_slot_id),
                schedule_status: readOptionalString(record.schedule_status),
                technician_name: readOptionalString(record.technician_name),
                arrival_window_start: readOptionalString(record.arrival_window_start),
                arrival_window_end: readOptionalString(record.arrival_window_end),
                eta_range: readOptionalString(record.eta_range),
                created_at: readOptionalString(record.created_at),
                updated_at: readOptionalString(record.updated_at),
                converted_job_id: readOptionalString(record.converted_job_id),
            };
        })
        .filter((request) => request.id && request.company_id && request.property_id);
}

function compareHomeownerActiveRequestTrackers(first: HomeownerActiveRequestTracker, second: HomeownerActiveRequestTracker) {
    const priorityDifference = getTrackerPriority(second) - getTrackerPriority(first);

    if (priorityDifference !== 0) return priorityDifference;

    return second.sortTime - first.sortTime;
}

function getTrackerPriority(tracker: HomeownerActiveRequestTracker) {
    if (tracker.isEmergency) return 100;

    const priorityByStatus: Record<string, number> = {
        waiting_for_approval: 90,
        on_my_way: 80,
        arriving_soon: 80,
        delayed: 75,
        in_progress: 70,
        assigned: 60,
        scheduled: 50,
        acknowledged: 40,
        request_received: 30,
    };

    return priorityByStatus[tracker.statusKey] || 10;
}

function getHomeownerRequestTone(status: string | null | undefined, eventType: string | null | undefined, isEmergency: boolean): HomeownerRequestTone {
    const statusKey = getHomeownerFacingStatusKey(status, eventType);

    if (statusKey === 'cancelled') return 'cancelled';
    if (statusKey === 'completed') return 'complete';
    if (isEmergency) return 'emergency';
    if (statusKey === 'request_received' || statusKey === 'acknowledged') return 'active';

    return 'neutral';
}

function isEmergencyServiceRequest(request: Pick<HomeownerActiveServiceRequest, 'request_type' | 'priority' | 'issue_summary'>) {
    const requestType = normalizeText(request.request_type);
    const priority = normalizeText(request.priority);
    const summary = normalizeText(request.issue_summary);

    return requestType === 'emergency' || priority === 'emergency' || summary.includes('emergency');
}

function canHomeownerCancelRequest(_request: HomeownerActiveServiceRequest) {
    return false;
}

function getSortTime(request: HomeownerActiveServiceRequest, latestEvent: ServiceRequestActivityEvent | null) {
    return (
        getTimeValue(latestEvent?.created_at) ||
        getTimeValue(request.updated_at) ||
        getTimeValue(request.created_at)
    );
}

function formatArrivalWindow(start?: string | null, end?: string | null) {
    if (!start || !end) return '';

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return '';

    return `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${endDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function readEventMetadataText(event: ServiceRequestActivityEvent | null | undefined, key: string) {
    const value = event?.metadata?.[key];

    return typeof value === 'string' ? value.trim() : '';
}

function isBackendMissing(message?: string | null) {
    const normalized = normalizeText(message);

    return (
        normalized.includes('schema cache') ||
        normalized.includes('could not find the function') ||
        normalized.includes('get_homeowner_active_service_requests') ||
        normalized.includes('does not exist')
    );
}

function getTimeValue(value?: string | null) {
    if (!value) return 0;

    const time = new Date(value).getTime();

    return Number.isNaN(time) ? 0 : time;
}

function firstText(...values: Array<string | null | undefined>) {
    for (const value of values) {
        const text = String(value || '').trim();

        if (text) return text;
    }

    return '';
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizePath(value?: string | null) {
    const text = String(value || '/').split('?')[0] || '/';
    const withoutTrailingSlash = text.replace(/\/+$/, '');

    return withoutTrailingSlash || '/';
}

function readString(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(value: unknown) {
    const text = typeof value === 'string' ? value.trim() : '';

    return text || null;
}

function readOptionalNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}
