import { supabase } from './supabase';
import {
    buildEstimateSessionRpcParams,
    normalizeEstimateSessionSource,
    type EstimateOptionSessionInput,
    type EstimateSessionSource,
} from './estimateSessionContract';

export {
    buildDraftEstimateOptionsRequest,
    buildEstimateSessionRpcParams,
    isDraftableEstimateSessionStatus,
    isValidEstimateSessionId,
    normalizeEstimateSessionSource,
    type EstimateOptionSessionInput,
    type EstimateSessionSource,
} from './estimateSessionContract';

export type EstimateOptionSession = {
    id: string;
    companyId: string;
    propertyId: string | null;
    serviceRequestId: string | null;
    jobId: string | null;
    scheduleSlotId: string | null;
    homeItemId: string | null;
    category: string;
    status: string;
    source: EstimateSessionSource;
    createdByCompanyUserId: string | null;
    technicianApprovedAt: string | null;
    presentedAt: string | null;
};

export type EstimateOptionSessionResult = {
    session: EstimateOptionSession | null;
    error: string | null;
};

type EstimateOptionSessionRow = {
    id?: string | null;
    company_id?: string | null;
    property_id?: string | null;
    service_request_id?: string | null;
    job_id?: string | null;
    schedule_slot_id?: string | null;
    home_item_id?: string | null;
    category?: string | null;
    status?: string | null;
    source?: string | null;
    created_by_company_user_id?: string | null;
    technician_approved_at?: string | null;
    presented_at?: string | null;
};

export async function resolveEstimateOptionSession(
    input: EstimateOptionSessionInput
): Promise<EstimateOptionSessionResult> {
    const params = buildEstimateSessionRpcParams(input);

    if (!params.p_company_id) {
        return { session: null, error: 'Company is required before AI drafting.' };
    }

    if (!params.p_property_id) {
        return { session: null, error: 'Property context is required before AI drafting.' };
    }

    try {
        const { data, error } = await supabase.rpc('upsert_estimate_option_session_for_draft', params);

        if (error) {
            return { session: null, error: error.message };
        }

        const row = readFirstSessionRow(data);
        const session = mapEstimateSessionRow(row);

        return {
            session,
            error: session ? null : 'Estimate session was not returned by HomeOS services.',
        };
    } catch (error) {
        return {
            session: null,
            error: error instanceof Error ? error.message : 'Estimate session could not be resolved.',
        };
    }
}

function mapEstimateSessionRow(row: EstimateOptionSessionRow | null): EstimateOptionSession | null {
    const id = readString(row?.id);
    const companyId = readString(row?.company_id);

    if (!id || !companyId) return null;

    return {
        id,
        companyId,
        propertyId: readNullableString(row?.property_id),
        serviceRequestId: readNullableString(row?.service_request_id),
        jobId: readNullableString(row?.job_id),
        scheduleSlotId: readNullableString(row?.schedule_slot_id),
        homeItemId: readNullableString(row?.home_item_id),
        category: readString(row?.category) || 'faucet_replacement',
        status: readString(row?.status) || 'draft',
        source: normalizeEstimateSessionSource(row?.source),
        createdByCompanyUserId: readNullableString(row?.created_by_company_user_id),
        technicianApprovedAt: readNullableString(row?.technician_approved_at),
        presentedAt: readNullableString(row?.presented_at),
    };
}

function readFirstSessionRow(data: unknown): EstimateOptionSessionRow | null {
    if (Array.isArray(data)) {
        return readRecord(data[0]);
    }

    return readRecord(data);
}

function readRecord(value: unknown): EstimateOptionSessionRow | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as EstimateOptionSessionRow
        : null;
}

function readNullableString(value: unknown) {
    const text = readString(value);

    return text || null;
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}
