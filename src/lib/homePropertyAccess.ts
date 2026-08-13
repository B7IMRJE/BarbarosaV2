import type { ProviderHomeItemsReadContext } from './providerHomeItems';
import { supabase } from './supabase';
import {
    normalizeHomeStoryCount,
    type HomeStoryCount,
} from './homePropertyAccessValues';

export {
    HOME_STORY_COUNT_OPTIONS,
    homeStoryCountLabel,
    maskGateCode,
    normalizeHomeStoryCount,
    type HomeStoryCount,
} from './homePropertyAccessValues';

export type HomeStructureAccessDetails = {
    storyCount: HomeStoryCount | null;
    gateCode: string | null;
    updatedAt: string | null;
};

type HomeStructureAccessRow = {
    homeowner_story_count?: unknown;
    gate_code?: unknown;
    access_updated_at?: unknown;
};

export async function loadMyHomeStructureAccess(propertyId: string) {
    const cleanPropertyId = propertyId.trim();

    if (!cleanPropertyId) return emptyHomeStructureAccessDetails();

    const { data, error } = await supabase.rpc('get_my_home_structure_access', {
        p_property_id: cleanPropertyId,
    });

    if (error) throw new Error(`Could not load the home's story and access details: ${error.message}`);

    return normalizeHomeStructureAccessDetails(firstRow<HomeStructureAccessRow>(data));
}

export async function loadCompanyHomeStructureAccess(context: ProviderHomeItemsReadContext) {
    const { data, error } = await supabase.rpc('get_company_home_structure_access', {
        p_company_id: context.companyId.trim(),
        p_property_id: context.propertyId.trim(),
        p_service_request_id: cleanOptionalText(context.serviceRequestId),
        p_schedule_slot_id: cleanOptionalText(context.scheduleSlotId),
        p_job_id: cleanOptionalText(context.jobId),
    });

    if (error) throw new Error(`Could not load the client's story and access details: ${error.message}`);

    return normalizeHomeStructureAccessDetails(firstRow<HomeStructureAccessRow>(data));
}

export async function updateMyHomeStructureAccess(
    propertyId: string,
    input: { storyCount: HomeStoryCount; gateCode?: string | null }
) {
    const { data, error } = await supabase.rpc('update_my_home_structure_access', {
        p_property_id: propertyId.trim(),
        p_story_count: input.storyCount,
        p_gate_code: cleanOptionalText(input.gateCode),
    });

    if (error) throw new Error(`Could not save the home's story and access details: ${error.message}`);

    return String(firstRow<{ property_id?: unknown }>(data)?.property_id || '').trim();
}

function normalizeHomeStructureAccessDetails(row?: HomeStructureAccessRow | null): HomeStructureAccessDetails {
    return {
        storyCount: normalizeHomeStoryCount(row?.homeowner_story_count),
        gateCode: cleanOptionalText(row?.gate_code),
        updatedAt: cleanOptionalText(row?.access_updated_at),
    };
}

function emptyHomeStructureAccessDetails(): HomeStructureAccessDetails {
    return {
        storyCount: null,
        gateCode: null,
        updatedAt: null,
    };
}

function cleanOptionalText(value: unknown) {
    const text = String(value || '').trim();

    return text || null;
}

function firstRow<T>(data: unknown) {
    if (Array.isArray(data)) return (data[0] || null) as T | null;

    return (data || null) as T | null;
}
