import { supabase } from './supabase';
import type { EstimateSessionSource } from './estimateSessionContract';

export type EstimateBuilderStep =
    | 'work'
    | 'findings'
    | 'price'
    | 'option_added'
    | 'recommendations'
    | 'review';

export type EstimateBuilderSnapshot = Record<string, unknown>;

export type CompanyEstimateDraftSummary = {
    id: string;
    companyId: string;
    quoteNumber: string;
    currentBuilderStep: EstimateBuilderStep;
    status: string;
    category: string;
    propertyId: string | null;
    serviceRequestId: string | null;
    jobId: string | null;
    scheduleSlotId: string | null;
    homeItemId: string | null;
    source: EstimateSessionSource;
    customerName: string;
    customerAddress: string | null;
    requestDisplayCode: string | null;
    issueSummary: string | null;
    createdAt: string;
    updatedAt: string;
};

export type CompanyEstimateBuilderDraft = CompanyEstimateDraftSummary & {
    builderState: EstimateBuilderSnapshot;
};

type DraftRecord = Record<string, unknown>;

const BUILDER_STEPS: EstimateBuilderStep[] = [
    'work',
    'findings',
    'price',
    'option_added',
    'recommendations',
    'review',
];

export async function listCompanyEstimateDrafts(companyId: string) {
    const { data, error } = await supabase.rpc('list_company_estimate_drafts', {
        p_company_id: companyId,
    });

    if (error) throw error;

    return ((data || []) as unknown[])
        .map((value) => mapDraftSummary(readRecord(value)))
        .filter((draft): draft is CompanyEstimateDraftSummary => Boolean(draft));
}

export async function loadCompanyEstimateBuilderDraft(sessionId: string) {
    const { data, error } = await supabase.rpc('get_company_estimate_builder_draft', {
        p_session_id: sessionId,
    });

    if (error) throw error;

    const record = readRecord(data);
    const summary = mapDraftSummary(record);

    if (!record || !summary) return null;

    return {
        ...summary,
        builderState: readRecord(record.builder_state) || {},
    } satisfies CompanyEstimateBuilderDraft;
}

export async function saveCompanyEstimateBuilderDraft(input: {
    sessionId: string;
    currentBuilderStep: EstimateBuilderStep;
    builderState: EstimateBuilderSnapshot;
}) {
    const { data, error } = await supabase.rpc('save_company_estimate_builder_draft', {
        p_session_id: input.sessionId,
        p_current_builder_step: input.currentBuilderStep,
        p_builder_state: input.builderState,
    });

    if (error) throw error;

    return readRecord(data);
}

export async function archiveCompanyEstimateDraft(sessionId: string) {
    const { data, error } = await supabase.rpc('archive_company_estimate_draft', {
        p_session_id: sessionId,
    });

    if (error) throw error;

    return readRecord(data);
}

export function normalizeEstimateBuilderStep(value: unknown): EstimateBuilderStep {
    const step = readString(value).toLowerCase();

    return BUILDER_STEPS.includes(step as EstimateBuilderStep)
        ? step as EstimateBuilderStep
        : 'work';
}

export function formatEstimateBuilderStep(value: EstimateBuilderStep) {
    const labels: Record<EstimateBuilderStep, string> = {
        work: 'Work selection',
        findings: 'Findings',
        price: 'Price & summary',
        option_added: 'Add another option',
        recommendations: 'Related options',
        review: 'Review & approval',
    };

    return labels[value];
}

export function hasEstimateBuilderSnapshot(value: EstimateBuilderSnapshot) {
    return Object.keys(value).length > 0;
}

export function resolveEstimateDraftResumeRouteMode(
    draft: Pick<CompanyEstimateDraftSummary, 'propertyId' | 'source'>
) {
    const opensInClientProviderMode = Boolean(
        draft.propertyId && ['provider_mode', 'techos'].includes(draft.source)
    );

    return {
        providerMode: opensInClientProviderMode ? '1' : null,
        mode: draft.source === 'techos'
            ? 'techos'
            : draft.source === 'management'
                ? 'management'
                : null,
    } as const;
}

function mapDraftSummary(record: DraftRecord | null): CompanyEstimateDraftSummary | null {
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
    };
}

function normalizeSource(value: unknown): EstimateSessionSource {
    const source = readString(value).toLowerCase();

    return ['techos', 'provider_mode', 'management', 'homeos'].includes(source)
        ? source as EstimateSessionSource
        : 'techos';
}

function readRecord(value: unknown): DraftRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as DraftRecord
        : null;
}

function readNullableString(value: unknown) {
    const text = readString(value);

    return text || null;
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}
