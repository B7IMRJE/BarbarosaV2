import { supabase } from './supabase';

export type CreatedServiceRequestReceipt = {
    id: string;
    companyId: string;
    propertyId: string;
    requestType: string;
    status: string;
    priority: string;
    createdAt: string | null;
};

export type CreateHomeownerServiceRequestInput = {
    propertyId: string;
    companyId: string;
    requestType: 'regular' | 'emergency';
    issueSummary: string;
    priority: 'low' | 'normal' | 'high' | 'emergency';
};

export type CompanyDispatchServiceRequest = {
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

export async function createHomeownerServiceRequest(
    input: CreateHomeownerServiceRequestInput
): Promise<CreatedServiceRequestReceipt> {
    const { data, error } = await supabase.rpc('create_homeowner_service_request', {
        p_property_id: input.propertyId,
        p_company_id: input.companyId,
        p_request_type: input.requestType,
        p_issue_summary: input.issueSummary,
        p_priority: input.priority,
    });

    if (error) {
        throw new Error(error.message);
    }

    const confirmedRequest = parseCreatedServiceRequest(data);

    if (!confirmedRequest) {
        throw new Error('Supabase did not return a service_request_id.');
    }

    return confirmedRequest;
}

export async function loadCompanyDispatchRequestsForProperty(input: {
    companyId: string;
    propertyId: string;
}): Promise<CompanyDispatchServiceRequest[]> {
    const companyId = input.companyId.trim();
    const propertyId = input.propertyId.trim();

    if (!companyId || !propertyId) return [];

    const { data, error } = await supabase.rpc('get_company_dispatch_requests', {
        p_company_id: companyId,
    });

    if (error) {
        throw new Error(error.message);
    }

    const rows: unknown[] = Array.isArray(data) ? data : [];

    return rows
        .map(parseCompanyDispatchServiceRequest)
        .filter((request): request is CompanyDispatchServiceRequest => Boolean(request))
        .filter((request) => request.property_id === propertyId);
}

export async function linkHomeEmergencyToServiceRequest(input: {
    emergencyId: string;
    propertyId: string;
    serviceRequest: CreatedServiceRequestReceipt;
}): Promise<{ linked: boolean; detail: string }> {
    const rpcLinked = await linkHomeEmergencyWithRpc(input.emergencyId, input.serviceRequest.id);

    if (rpcLinked.linked) return rpcLinked;

    const { error } = await supabase
        .from('home_emergencies')
        .update({
            service_request_id: input.serviceRequest.id,
            service_request_company_id: input.serviceRequest.companyId,
            service_request_sent_at: input.serviceRequest.createdAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', input.emergencyId)
        .eq('property_id', input.propertyId);

    if (error) {
        return {
            linked: false,
            detail: rpcLinked.detail ? `${rpcLinked.detail}; direct update failed: ${error.message}` : error.message,
        };
    }

    return {
        linked: true,
        detail: 'Linked through direct update.',
    };
}

function parseCompanyDispatchServiceRequest(row: unknown): CompanyDispatchServiceRequest | null {
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

async function linkHomeEmergencyWithRpc(emergencyId: string, serviceRequestId: string) {
    const { error } = await supabase.rpc('link_home_emergency_service_request', {
        p_home_emergency_id: emergencyId,
        p_service_request_id: serviceRequestId,
    });

    if (!error) {
        return {
            linked: true,
            detail: 'Linked through RPC.',
        };
    }

    return {
        linked: false,
        detail: error.message,
    };
}

function parseCreatedServiceRequest(data: unknown): CreatedServiceRequestReceipt | null {
    const row = Array.isArray(data) ? data[0] : data;

    if (!row || typeof row !== 'object') return null;

    const record = row as Record<string, unknown>;
    const id = readString(record.service_request_id);
    const companyId = readString(record.company_id);
    const propertyId = readString(record.property_id);

    if (!id || !companyId || !propertyId) return null;

    return {
        id,
        companyId,
        propertyId,
        requestType: readString(record.request_type),
        status: readString(record.status),
        priority: readString(record.priority),
        createdAt: typeof record.created_at === 'string' ? record.created_at : null,
    };
}

function readString(value: unknown) {
    return String(value || '').trim();
}

function readOptionalString(value: unknown) {
    const text = readString(value);

    return text || null;
}
