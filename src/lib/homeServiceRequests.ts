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
