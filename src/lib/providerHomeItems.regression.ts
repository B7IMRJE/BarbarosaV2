import {
    buildProviderHomeItemCreateRpcArgs,
    buildProviderHomeItemsRpcArgs,
    hasAssignedProviderHomeItemsContext,
} from './providerHomeItems';

runProviderHomeItemsRegressions();

export function runProviderHomeItemsRegressions() {
    assignedProviderContextBuildsScopedRpcArgs();
    providerContextRequiresAssignmentIdentifier();
    providerItemReadKeepsSingleItemSlugScope();
    emptyOptionalIdsBecomeNullRpcArgs();
    providerItemCreateUsesAssignedContextAndCustomerHomeFields();
    providerItemCreateKeepsCustomGasValvePayload();
}

function assignedProviderContextBuildsScopedRpcArgs() {
    const args = buildProviderHomeItemsRpcArgs(createContext());

    assert(args.p_company_id === 'company-1', 'Provider item RPC should preserve company scope.');
    assert(args.p_property_id === 'property-1', 'Provider item RPC should preserve property scope.');
    assert(args.p_service_request_id === 'request-1', 'Provider item RPC should preserve request assignment scope.');
    assert(args.p_schedule_slot_id === 'slot-1', 'Provider item RPC should preserve schedule slot assignment scope.');
    assert(args.p_job_id === 'job-1', 'Provider item RPC should preserve job assignment scope.');
    assert(hasAssignedProviderHomeItemsContext(createContext()), 'Assigned provider context should be recognized.');
}

function providerContextRequiresAssignmentIdentifier() {
    const unassignedContext = {
        companyId: 'company-1',
        propertyId: 'property-1',
        serviceRequestId: '',
        scheduleSlotId: '',
        jobId: '',
    };

    assert(!hasAssignedProviderHomeItemsContext(unassignedContext), 'Provider item reads should require request, slot, or job context.');
}

function providerItemReadKeepsSingleItemSlugScope() {
    const args = buildProviderHomeItemsRpcArgs(createContext(), { itemSlug: ' kitchen-kitchen-faucet ' });

    assert(args.p_item_slug === 'kitchen-kitchen-faucet', 'Provider single-item read should trim and preserve item slug.');
}

function emptyOptionalIdsBecomeNullRpcArgs() {
    const args = buildProviderHomeItemsRpcArgs({
        companyId: 'company-1',
        propertyId: 'property-1',
        serviceRequestId: ' ',
        scheduleSlotId: '',
        jobId: '',
    }, { itemSlug: '' });

    assert(args.p_service_request_id === null, 'Empty service request id should become null for RPC.');
    assert(args.p_schedule_slot_id === null, 'Empty schedule slot id should become null for RPC.');
    assert(args.p_job_id === null, 'Empty job id should become null for RPC.');
    assert(args.p_item_slug === null, 'Empty item slug should become null for RPC.');
}

function providerItemCreateUsesAssignedContextAndCustomerHomeFields() {
    const args = buildProviderHomeItemCreateRpcArgs(createContext(), {
        itemSlug: 'kitchen-gas-gas-valve',
        name: 'Kitchen Stove Gas Valve',
        system: 'Gas',
        category: 'Component',
        location: 'Kitchen',
        parentArea: '',
        status: 'Missing Information',
        installState: 'Unknown',
        about: 'Provider-added item for an assigned service estimate.',
    });

    assert(args.p_company_id === 'company-1', 'Provider create RPC should preserve company scope.');
    assert(args.p_property_id === 'property-1', 'Provider create RPC should preserve property scope.');
    assert(args.p_service_request_id === 'request-1', 'Provider create RPC should preserve assigned request scope.');
    assert(args.p_schedule_slot_id === 'slot-1', 'Provider create RPC should preserve assigned visit scope.');
    assert(args.p_job_id === 'job-1', 'Provider create RPC should preserve assigned job scope.');
    assert(args.p_item_slug === 'kitchen-gas-gas-valve', 'Provider create RPC should keep the item slug.');
    assert(args.p_name === 'Kitchen Stove Gas Valve', 'Provider create RPC should keep the item name.');
    assert(args.p_system === 'Gas', 'Provider create RPC should keep the item system.');
    assert(args.p_category === 'Component', 'Provider create RPC should keep the item category.');
    assert(args.p_location === 'Kitchen', 'Provider create RPC should keep the customer HomeOS location.');
    assert(args.p_parent_area === null, 'Empty parent area should become null for RPC.');
}

function providerItemCreateKeepsCustomGasValvePayload() {
    const args = buildProviderHomeItemCreateRpcArgs(createContext(), {
        itemSlug: '',
        name: 'Gas Valve for Kitchen Stove',
        system: 'Gas',
        category: 'Component',
        location: 'Kitchen',
        parentArea: 'Appliances',
        status: 'Needs Attention',
        installState: 'Missing',
        brand: 'Unknown',
        model: 'Unknown',
        serial: 'Unknown',
    });

    assert(args.p_item_slug === null, 'Provider create RPC should let the server generate a slug when needed.');
    assert(args.p_parent_area === 'Appliances', 'Provider create RPC should preserve nested container context.');
    assert(args.p_status === 'Needs Attention', 'Provider create RPC should preserve selected status.');
    assert(args.p_install_state === 'Missing', 'Provider create RPC should preserve selected condition.');
    assert(args.p_brand === 'Unknown', 'Provider create RPC should keep brand fallback.');
    assert(args.p_model === 'Unknown', 'Provider create RPC should keep model fallback.');
    assert(args.p_serial === 'Unknown', 'Provider create RPC should keep serial fallback.');
}

function createContext() {
    return {
        companyId: 'company-1',
        propertyId: 'property-1',
        serviceRequestId: 'request-1',
        scheduleSlotId: 'slot-1',
        jobId: 'job-1',
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
