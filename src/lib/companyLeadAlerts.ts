import { supabase } from './supabase';

export const NEW_LEAD_STATUSES = ['new', 'open', 'reported', 'unassigned'] as const;
export const LEAD_ALERT_REFRESH_MS = 30_000;

export type CompanyDispatchRequest = {
    id: string;
    company_id: string;
    property_id: string;
    company_property_client_id: string | null;
    request_type: string | null;
    status: string | null;
    priority: string | null;
    issue_summary: string | null;
    customer_display_name: string | null;
    property_display_name: string | null;
    property_address: string | null;
    property_city: string | null;
    property_state: string | null;
    property_postal_code: string | null;
    created_at: string | null;
    acknowledged_at: string | null;
    converted_job_id: string | null;
    converted_at: string | null;
};

export type CompanyLeadCounts = {
    newLeads: number;
    emergencyLeads: number;
    totalRequests: number;
    countedStatuses: string[];
    updatedAt: string;
};

export type CompanyActivityBoard = {
    newUnassigned: CompanyDispatchRequest[];
    assignedScheduled: CompanyDispatchRequest[];
    inProgress: CompanyDispatchRequest[];
    completed: CompanyDispatchRequest[];
};

export async function getCompanyDispatchRequests(companyId: string): Promise<CompanyDispatchRequest[]> {
    const normalizedCompanyId = companyId.trim();

    if (!normalizedCompanyId) {
        throw new Error('Company id is required to load dispatch requests.');
    }

    const { data, error } = await supabase.rpc('get_company_dispatch_requests', {
        p_company_id: normalizedCompanyId,
    });

    if (error) {
        throw new Error(error.message);
    }

    const rows: unknown[] = Array.isArray(data) ? data : [];

    return rows
        .map(parseCompanyDispatchRequest)
        .filter((request): request is CompanyDispatchRequest => Boolean(request));
}

export async function getCompanyLeadCounts(companyId: string): Promise<CompanyLeadCounts> {
    const requests = await getCompanyDispatchRequests(companyId);

    return calculateCompanyLeadCounts(requests);
}

export async function getCompanyActivityBoard(companyId: string): Promise<CompanyActivityBoard> {
    const requests = await getCompanyDispatchRequests(companyId);

    return getCompanyActivityBoardFromRequests(requests);
}

export function calculateCompanyLeadCounts(requests: CompanyDispatchRequest[]): CompanyLeadCounts {
    const newLeadRequests = requests.filter((request) => isNewLeadStatus(request.status));

    return {
        newLeads: newLeadRequests.length,
        emergencyLeads: newLeadRequests.filter(isEmergencyDispatchRequest).length,
        totalRequests: requests.length,
        countedStatuses: [...NEW_LEAD_STATUSES],
        updatedAt: new Date().toISOString(),
    };
}

export function getCompanyActivityBoardFromRequests(
    requests: CompanyDispatchRequest[]
): CompanyActivityBoard {
    return {
        newUnassigned: requests.filter((request) => isNewLeadStatus(request.status)),
        assignedScheduled: requests.filter((request) => isAssignedOrScheduledStatus(request.status)),
        inProgress: requests.filter((request) => isInProgressStatus(request.status)),
        completed: requests.filter((request) => isCompletedStatus(request.status)),
    };
}

export function isNewLeadStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return NEW_LEAD_STATUSES.includes(normalized as (typeof NEW_LEAD_STATUSES)[number]);
}

export function isEmergencyDispatchRequest(request: CompanyDispatchRequest) {
    const requestType = normalizeStatus(request.request_type);
    const priority = normalizeStatus(request.priority);
    const summary = normalizeStatus(request.issue_summary);

    return requestType === 'emergency' || priority === 'emergency' || summary.includes('emergency');
}

export function isAssignedOrScheduledStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return ['acknowledged', 'assigned', 'scheduled', 'dispatched'].includes(normalized);
}

export function isInProgressStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return ['in_progress', 'in-progress', 'active', 'en_route', 'arrived', 'onsite', 'on_site'].includes(normalized);
}

export function isCompletedStatus(status?: string | null) {
    const normalized = normalizeStatus(status);

    return ['converted_to_job', 'completed', 'resolved', 'closed', 'done'].includes(normalized);
}

export function normalizeStatus(status?: string | null) {
    return String(status || '').trim().toLowerCase();
}

function parseCompanyDispatchRequest(row: unknown): CompanyDispatchRequest | null {
    if (!row || typeof row !== 'object') return null;

    const record = row as Record<string, unknown>;
    const id = readString(record.id);
    const companyId = readString(record.company_id);
    const propertyId = readString(record.property_id);

    if (!id || !companyId || !propertyId) return null;

    return {
        id,
        company_id: companyId,
        property_id: propertyId,
        company_property_client_id: readOptionalString(record.company_property_client_id),
        request_type: readOptionalString(record.request_type),
        status: readOptionalString(record.status),
        priority: readOptionalString(record.priority),
        issue_summary: readOptionalString(record.issue_summary),
        customer_display_name: readOptionalString(record.customer_display_name),
        property_display_name: readOptionalString(record.property_display_name),
        property_address: readOptionalString(record.property_address),
        property_city: readOptionalString(record.property_city),
        property_state: readOptionalString(record.property_state),
        property_postal_code: readOptionalString(record.property_postal_code),
        created_at: readOptionalString(record.created_at),
        acknowledged_at: readOptionalString(record.acknowledged_at),
        converted_job_id: readOptionalString(record.converted_job_id),
        converted_at: readOptionalString(record.converted_at),
    };
}

function readString(value: unknown) {
    return String(value || '').trim();
}

function readOptionalString(value: unknown) {
    const text = readString(value);

    return text || null;
}
