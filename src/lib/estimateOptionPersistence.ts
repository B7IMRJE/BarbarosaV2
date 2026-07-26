import { supabase } from './supabase';
import type { EstimateChoice, EstimatePricingResult } from './estimateOptions';

export type PersistableEstimateChoice = EstimateChoice & {
    basePricingResult?: EstimatePricingResult;
    priceAdjustmentPercentage?: number;
};

export type PersistedEstimateOptionSet = {
    sessionId: string;
    status: string;
    technicianApprovedAt: string | null;
    selectedSourceChoiceId: string | null;
    options: PersistableEstimateChoice[];
};

export async function saveEstimateOptionSet(input: {
    sessionId: string;
    options: PersistableEstimateChoice[];
    selectedSourceChoiceId?: string | null;
    technicianApproved: boolean;
}) {
    const { data, error } = await supabase.rpc('save_company_estimate_option_set', {
        p_session_id: input.sessionId,
        p_options: input.options,
        p_selected_source_choice_id: input.selectedSourceChoiceId || null,
        p_technician_approved: input.technicianApproved,
    });

    if (error) throw error;

    return data;
}

export async function loadEstimateOptionSet(sessionId: string): Promise<PersistedEstimateOptionSet | null> {
    const { data, error } = await supabase.rpc('get_company_estimate_option_set', {
        p_session_id: sessionId,
    });

    if (error) throw error;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

    const record = data as Record<string, unknown>;

    return {
        sessionId: readText(record.session_id),
        status: readText(record.status),
        technicianApprovedAt: readNullableText(record.technician_approved_at),
        selectedSourceChoiceId: readNullableText(record.selected_source_choice_id),
        options: Array.isArray(record.options)
            ? record.options.filter(isEstimateChoiceSnapshot)
            : [],
    };
}

function isEstimateChoiceSnapshot(value: unknown): value is PersistableEstimateChoice {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

    const record = value as Partial<EstimateChoice>;

    return typeof record.id === 'string'
        && typeof record.title === 'string'
        && !!record.pricingResult
        && typeof record.pricingResult.totalAmount === 'number';
}

function readNullableText(value: unknown) {
    const text = readText(value);

    return text || null;
}

function readText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}
