import { supabase } from './supabase';
import {
    normalizeEstimateBuilderStep,
    type CompanyEstimateDraftSummary,
} from './estimateBuilderDraft';
import type { PersistableEstimateChoice } from './estimateOptionPersistence';
import type { EstimateSessionSource } from './estimateSessionContract';

export {
    formatEstimateQuoteHistoryStatus,
    formatEstimateQuoteTotalRange,
    isEstimateQuoteSelected,
} from './estimateQuoteHistoryRules';

export type CompanyEstimateQuoteHistorySummary = CompanyEstimateDraftSummary & {
    preparedByName: string;
    optionCount: number;
    lowestTotal: number | null;
    highestTotal: number | null;
    selectedOptionCount: number;
    selectedTotal: number | null;
    presentedAt: string | null;
    acceptedAt: string | null;
};

export type CompanyEstimateQuoteHistory = CompanyEstimateQuoteHistorySummary & {
    selectedSourceChoiceIds: string[];
    acceptedCustomerName: string | null;
    options: PersistableEstimateChoice[];
};

type QuoteHistoryRecord = Record<string, unknown>;

export async function listCompanyEstimateQuoteHistory(companyId: string, propertyId: string) {
    const { data, error } = await supabase.rpc('list_company_estimate_quote_history', {
        p_company_id: companyId,
        p_property_id: propertyId,
    });

    if (error) throw error;

    return ((data || []) as unknown[])
        .map((value) => mapQuoteHistorySummary(readRecord(value)))
        .filter((quote): quote is CompanyEstimateQuoteHistorySummary => Boolean(quote));
}

export async function loadCompanyEstimateQuoteHistory(sessionId: string) {
    const { data, error } = await supabase.rpc('get_company_estimate_quote_history', {
        p_session_id: sessionId,
    });

    if (error) throw error;

    const record = readRecord(data);
    const summary = mapQuoteHistorySummary(record);

    if (!record || !summary) return null;

    return {
        ...summary,
        selectedSourceChoiceIds: readStringArray(record.selected_source_choice_ids),
        acceptedCustomerName: readNullableString(record.accepted_customer_name),
        options: Array.isArray(record.options)
            ? record.options.filter(isPersistedEstimateChoice)
            : [],
    } satisfies CompanyEstimateQuoteHistory;
}

function mapQuoteHistorySummary(record: QuoteHistoryRecord | null): CompanyEstimateQuoteHistorySummary | null {
    const id = readString(record?.id);
    const companyId = readString(record?.company_id);
    const quoteNumber = readString(record?.quote_number).toUpperCase();

    if (!id || !companyId || !quoteNumber) return null;

    return {
        id,
        companyId,
        quoteNumber,
        currentBuilderStep: normalizeEstimateBuilderStep(record?.current_builder_step),
        status: readString(record?.status) || 'draft',
        category: readString(record?.category) || 'faucet_replacement',
        propertyId: readNullableString(record?.property_id),
        serviceRequestId: readNullableString(record?.service_request_id),
        jobId: readNullableString(record?.job_id),
        scheduleSlotId: readNullableString(record?.schedule_slot_id),
        homeItemId: readNullableString(record?.home_item_id),
        source: normalizeSource(record?.source),
        customerName: readString(record?.customer_name) || 'Customer home',
        customerAddress: readNullableString(record?.customer_address),
        requestDisplayCode: readNullableString(record?.request_display_code)?.toUpperCase() || null,
        issueSummary: readNullableString(record?.issue_summary),
        createdAt: readString(record?.created_at),
        updatedAt: readString(record?.updated_at),
        preparedByName: readString(record?.prepared_by_name) || 'Company team member',
        optionCount: readInteger(record?.option_count),
        lowestTotal: readNullableNumber(record?.lowest_total),
        highestTotal: readNullableNumber(record?.highest_total),
        selectedOptionCount: readInteger(record?.selected_option_count),
        selectedTotal: readNullableNumber(record?.selected_total),
        presentedAt: readNullableString(record?.presented_at),
        acceptedAt: readNullableString(record?.accepted_at),
    };
}

function isPersistedEstimateChoice(value: unknown): value is PersistableEstimateChoice {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

    const choice = value as Partial<PersistableEstimateChoice>;

    return typeof choice.id === 'string'
        && typeof choice.title === 'string'
        && !!choice.pricingResult
        && typeof choice.pricingResult.totalAmount === 'number';
}

function normalizeSource(value: unknown): EstimateSessionSource {
    const source = readString(value).toLowerCase();

    return ['techos', 'provider_mode', 'management', 'homeos'].includes(source)
        ? source as EstimateSessionSource
        : 'techos';
}

function readRecord(value: unknown): QuoteHistoryRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as QuoteHistoryRecord
        : null;
}

function readStringArray(value: unknown) {
    return Array.isArray(value)
        ? value.map(readString).filter(Boolean)
        : [];
}

function readInteger(value: unknown) {
    const number = readNullableNumber(value);

    return number === null ? 0 : Math.max(0, Math.trunc(number));
}

function readNullableNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return null;

    const number = typeof value === 'number' ? value : Number(value);

    return Number.isFinite(number) ? number : null;
}

function readNullableString(value: unknown) {
    const text = readString(value);

    return text || null;
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}
