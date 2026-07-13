import {
    buildProviderHomeItemsRpcArgs,
    hasAssignedProviderHomeItemsContext,
} from './providerHomeItems';

runProviderHomeItemsRegressions();

export function runProviderHomeItemsRegressions() {
    assignedProviderContextBuildsScopedRpcArgs();
    providerContextRequiresAssignmentIdentifier();
    providerItemReadKeepsSingleItemSlugScope();
    emptyOptionalIdsBecomeNullRpcArgs();
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
