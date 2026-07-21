import type { ProviderModeParams } from './providerMode';

export type ProviderHomeItemsRpcArgs = {
    p_company_id: string;
    p_property_id: string;
    p_service_request_id: string | null;
    p_schedule_slot_id: string | null;
    p_job_id: string | null;
    p_item_slug?: string | null;
};

export type ProviderHomeItemCreateInput = {
    itemSlug?: string | null;
    name: string;
    system: string;
    category: string;
    location: string;
    parentArea?: string | null;
    status?: string | null;
    installState?: string | null;
    about?: string | null;
    brand?: string | null;
    model?: string | null;
    serial?: string | null;
};

export type ProviderHomeItemCreateRpcArgs = ProviderHomeItemsRpcArgs & {
    p_item_slug: string | null;
    p_name: string;
    p_system: string;
    p_category: string;
    p_location: string;
    p_parent_area: string | null;
    p_status: string | null;
    p_install_state: string | null;
    p_about: string | null;
    p_brand: string | null;
    p_model: string | null;
    p_serial: string | null;
};

export type ProviderHomeItemRpcRow = {
    id: string;
    item_slug: string;
    name: string;
    system: string;
    category: string;
    parent_area: string | null;
    status: string | null;
    location: string | null;
    about: string | null;
    brand: string | null;
    model: string | null;
    serial: string | null;
    install_date: string | null;
    created_at: string | null;
    install_state: string | null;
    photo_url: string | null;
    archived: boolean | null;
    property_id: string;
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

export function buildProviderHomeItemCreateRpcArgs(
    context: ProviderHomeItemsReadContext,
    input: ProviderHomeItemCreateInput
): ProviderHomeItemCreateRpcArgs {
    return {
        ...buildProviderHomeItemsRpcArgs(context, { itemSlug: input.itemSlug }),
        p_item_slug: cleanOptionalText(input.itemSlug),
        p_name: cleanRequiredText(input.name),
        p_system: cleanRequiredText(input.system),
        p_category: cleanRequiredText(input.category),
        p_location: cleanRequiredText(input.location),
        p_parent_area: cleanOptionalText(input.parentArea),
        p_status: cleanOptionalText(input.status),
        p_install_state: cleanOptionalText(input.installState),
        p_about: cleanOptionalText(input.about),
        p_brand: cleanOptionalText(input.brand),
        p_model: cleanOptionalText(input.model),
        p_serial: cleanOptionalText(input.serial),
    };
}

function cleanRequiredText(value: string) {
    return String(value || '').trim();
}

function cleanOptionalText(value?: string | null) {
    const text = String(value || '').trim();

    return text || null;
}
