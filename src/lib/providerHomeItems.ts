import type { ProviderModeParams } from './providerMode';
import { supabase } from './supabase';

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
    parentHomeItemId?: string | null;
    placementLabel?: string | null;
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
    p_parent_home_item_id: string | null;
    p_placement_label: string | null;
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
    starter_template_key?: string | null;
    parent_home_item_id?: string | null;
    placement_label?: string | null;
};

export async function createProviderHomeOSStarterItemFromDeck(
    context: ProviderHomeItemsReadContext,
    input: {
        templateKey: string;
        location: string;
        parentArea?: string | null;
        parentHomeItemId?: string | null;
        placementLabel?: string | null;
    },
    strategy: ProviderHomeItemCreateStrategy = 'assigned_rpc',
) {
    const { data, error } = await supabase.rpc(getProviderHomeOSStarterItemCreateRpcName(strategy), {
        ...buildProviderHomeItemsRpcArgs(context),
        p_template_key: cleanRequiredText(input.templateKey),
        p_location: cleanRequiredText(input.location),
        p_parent_area: cleanOptionalText(input.parentArea),
        p_parent_home_item_id: cleanOptionalText(input.parentHomeItemId),
        p_placement_label: cleanOptionalText(input.placementLabel),
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { id?: unknown; item_slug?: unknown; starter_template_key?: unknown } | null;
    const id = cleanRequiredText(String(row?.id || ''));
    if (!id) throw new Error('The HomeOS Deck card was not created.');
    return {
        id,
        itemSlug: cleanRequiredText(String(row?.item_slug || '')),
        templateKey: cleanRequiredText(String(row?.starter_template_key || '')),
    };
}

export type ProviderHomeItemsReadContext = Pick<
    ProviderModeParams,
    'companyId' | 'propertyId' | 'serviceRequestId' | 'scheduleSlotId' | 'jobId'
>;

export type ProviderHomeItemsReadStrategy =
    | 'assigned_rpc'
    | 'sales_company_rpc'
    | 'platform_admin_direct'
    | 'denied';

export type ProviderHomeItemsWriteStrategy =
    | 'assigned_rpc'
    | 'platform_admin_direct'
    | 'denied';

export type ProviderHomeItemCreateStrategy =
    | ProviderHomeItemsWriteStrategy
    | 'sales_assigned_rpc';

export function hasAssignedProviderHomeItemsContext(context: ProviderHomeItemsReadContext) {
    return Boolean(
        cleanOptionalText(context.serviceRequestId) ||
        cleanOptionalText(context.scheduleSlotId) ||
        cleanOptionalText(context.jobId)
    );
}

export function getProviderHomeItemsReadStrategy(
    context: ProviderHomeItemsReadContext,
    membershipRole?: string | null
): ProviderHomeItemsReadStrategy {
    if (normalizeProviderCompanyRole(membershipRole) === 'sales') {
        return hasAssignedProviderHomeItemsContext(context) ? 'sales_company_rpc' : 'denied';
    }

    if (hasAssignedProviderHomeItemsContext(context)) {
        return 'assigned_rpc';
    }

    return cleanRequiredText(membershipRole || '').toLowerCase() === 'provider_platform_admin'
        ? 'platform_admin_direct'
        : 'denied';
}

export function usesProviderHomeItemsRpc(strategy: ProviderHomeItemsReadStrategy) {
    return strategy === 'assigned_rpc' || strategy === 'sales_company_rpc';
}

export function getProviderHomeItemsWriteStrategy(
    context: ProviderHomeItemsReadContext,
    membershipRole?: string | null
): ProviderHomeItemsWriteStrategy {
    const readStrategy = getProviderHomeItemsReadStrategy(context, membershipRole);

    if (readStrategy === 'assigned_rpc') return 'assigned_rpc';
    if (readStrategy === 'platform_admin_direct') return 'platform_admin_direct';

    return 'denied';
}

export function getProviderHomeItemCreateStrategy(
    context: ProviderHomeItemsReadContext,
    membershipRole?: string | null
): ProviderHomeItemCreateStrategy {
    const readStrategy = getProviderHomeItemsReadStrategy(context, membershipRole);

    if (readStrategy === 'sales_company_rpc') return 'sales_assigned_rpc';

    return getProviderHomeItemsWriteStrategy(context, membershipRole);
}

export function getProviderHomeItemCreateRpcName(strategy: ProviderHomeItemCreateStrategy) {
    return strategy === 'sales_assigned_rpc'
        ? 'create_sales_homeos_item'
        : 'create_provider_homeos_item';
}

export function getProviderHomeOSStarterItemCreateRpcName(strategy: ProviderHomeItemCreateStrategy) {
    return strategy === 'sales_assigned_rpc'
        ? 'create_sales_homeos_starter_item_from_deck'
        : 'create_provider_homeos_starter_item_from_deck';
}

export function getProviderHomeItemsRpcName(strategy: ProviderHomeItemsReadStrategy) {
    return strategy === 'sales_company_rpc'
        ? 'get_sales_company_homeos_items'
        : 'get_provider_homeos_items';
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
        p_parent_home_item_id: cleanOptionalText(input.parentHomeItemId),
        p_placement_label: cleanOptionalText(input.placementLabel),
    };
}

function cleanRequiredText(value: string) {
    return String(value || '').trim();
}

function cleanOptionalText(value?: string | null) {
    const text = String(value || '').trim();

    return text || null;
}

function normalizeProviderCompanyRole(role?: string | null) {
    const normalized = cleanRequiredText(role || '').toLowerCase();
    const companyRole = normalized.startsWith('provider_') ? normalized.slice('provider_'.length) : normalized;

    if (['sales tech', 'sales_tech', 'sales-tech', 'sales technician', 'sales representative', 'sales rep'].includes(companyRole)) {
        return 'sales';
    }

    return companyRole;
}
