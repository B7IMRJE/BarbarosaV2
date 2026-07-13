import type { ProviderModeParams } from './providerMode';

export type ProviderHomeItemsRpcArgs = {
    p_company_id: string;
    p_property_id: string;
    p_service_request_id: string | null;
    p_schedule_slot_id: string | null;
    p_job_id: string | null;
    p_item_slug?: string | null;
};

export type ProviderHomeItemsReadContext = Pick<
    ProviderModeParams,
    'companyId' | 'propertyId' | 'serviceRequestId' | 'scheduleSlotId' | 'jobId'
>;

export function hasAssignedProviderHomeItemsContext(context: ProviderHomeItemsReadContext) {
    return Boolean(
        cleanOptionalText(context.serviceRequestId) ||
        cleanOptionalText(context.scheduleSlotId) ||
        cleanOptionalText(context.jobId)
    );
}

export function buildProviderHomeItemsRpcArgs(
    context: ProviderHomeItemsReadContext,
    options: { itemSlug?: string | null } = {}
): ProviderHomeItemsRpcArgs {
    const args: ProviderHomeItemsRpcArgs = {
        p_company_id: cleanRequiredText(context.companyId),
        p_property_id: cleanRequiredText(context.propertyId),
        p_service_request_id: cleanOptionalText(context.serviceRequestId),
        p_schedule_slot_id: cleanOptionalText(context.scheduleSlotId),
        p_job_id: cleanOptionalText(context.jobId),
    };

    if ('itemSlug' in options) {
        args.p_item_slug = cleanOptionalText(options.itemSlug);
    }

    return args;
}

function cleanRequiredText(value: string) {
    return String(value || '').trim();
}

function cleanOptionalText(value?: string | null) {
    const text = String(value || '').trim();

    return text || null;
}
