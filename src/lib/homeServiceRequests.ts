import {
    getCompanyDispatchRequests,
    type CompanyDispatchRequest,
} from './companyLeadAlerts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const LOCAL_SERVICE_REQUEST_UPDATE_KEY = 'homeos_local_service_request_updates_v1';

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

export type CompanyDispatchServiceRequest = CompanyDispatchRequest;

export type ServiceRequestUpdateResult = {
    status: 'sent' | 'local';
    message: string;
};

type LocalServiceRequestUpdate = {
    id: string;
    service_request_id: string;
    company_id: string | null;
    property_id: string | null;
    source: 'homeowner_request_update';
    message: string;
    status: 'new';
    created_at: string;
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

    const requests = await getCompanyDispatchRequests(companyId);

    return requests.filter((request) => request.property_id === propertyId);
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

export async function requestHomeownerServiceRequestUpdate(
    serviceRequestId: string
): Promise<ServiceRequestUpdateResult> {
    const requestId = serviceRequestId.trim();

    if (!requestId) {
        throw new Error('Service request id is required.');
    }

    const { error } = await supabase.rpc('request_service_request_update', {
        p_service_request_id: requestId,
    });

    if (!error) {
        return {
            status: 'sent',
            message: 'Update request sent.',
        };
    }

    if (!isServiceRequestMessagingBackendMissing(error.message)) {
        throw new Error(error.message);
    }

    await saveLocalServiceRequestUpdate(requestId);

    return {
        status: 'local',
        message: 'Update request saved locally, but company messaging is not connected yet.',
    };
}

async function saveLocalServiceRequestUpdate(serviceRequestId: string) {
    const requestContext = await loadServiceRequestContext(serviceRequestId);
    const nextUpdate: LocalServiceRequestUpdate = {
        id: createLocalId(),
        service_request_id: serviceRequestId,
        company_id: requestContext.company_id,
        property_id: requestContext.property_id,
        source: 'homeowner_request_update',
        message: 'Homeowner requested an update.',
        status: 'new',
        created_at: new Date().toISOString(),
    };
    const existing = await loadLocalServiceRequestUpdates();

    await AsyncStorage.setItem(
        LOCAL_SERVICE_REQUEST_UPDATE_KEY,
        JSON.stringify([nextUpdate, ...existing].slice(0, 50))
    );
}

async function loadServiceRequestContext(serviceRequestId: string) {
    const { data } = await supabase
        .from('service_requests')
        .select('company_id, property_id')
        .eq('id', serviceRequestId)
        .maybeSingle();
    const record = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};

    return {
        company_id: readOptionalString(record.company_id),
        property_id: readOptionalString(record.property_id),
    };
}

async function loadLocalServiceRequestUpdates(): Promise<LocalServiceRequestUpdate[]> {
    try {
        const raw = await AsyncStorage.getItem(LOCAL_SERVICE_REQUEST_UPDATE_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];

        return Array.isArray(parsed)
            ? parsed.filter(isLocalServiceRequestUpdate)
            : [];
    } catch {
        return [];
    }
}

function isLocalServiceRequestUpdate(value: unknown): value is LocalServiceRequestUpdate {
    if (!value || typeof value !== 'object') return false;

    const record = value as Record<string, unknown>;

    return (
        typeof record.id === 'string' &&
        typeof record.service_request_id === 'string' &&
        record.source === 'homeowner_request_update' &&
        record.status === 'new' &&
        typeof record.created_at === 'string'
    );
}

function isServiceRequestMessagingBackendMissing(message: string) {
    const normalized = message.toLowerCase();

    return (
        normalized.includes('schema cache') ||
        normalized.includes('service_request_events') ||
        normalized.includes('request_service_request_update') ||
        normalized.includes('could not find the function') ||
        normalized.includes('does not exist')
    );
}

function createLocalId() {
    const cryptoLike = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;

    return cryptoLike?.randomUUID?.() || `local-update-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
