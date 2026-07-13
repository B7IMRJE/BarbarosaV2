import {
    addItemToEstimateDraft,
    clearEstimateDraft,
    loadEstimateDraft,
    loadEstimateDraftContext,
    saveEstimateDraftContext,
    type EstimateDraftItem,
    type EstimateDraftScope,
} from './estimateDraft';

void runEstimateDraftRegressions();

export async function runEstimateDraftRegressions() {
    await addSameItemTwiceDoesNotDuplicateDraftEntry();
    await estimateDraftContextPreservesProviderJobIds();
}

async function addSameItemTwiceDoesNotDuplicateDraftEntry() {
    const scope = createScope();

    await clearEstimateDraft(scope);
    await addItemToEstimateDraft(createDraftItem(), scope);
    await addItemToEstimateDraft(createDraftItem(), scope);

    const draft = await loadEstimateDraft(scope);

    assert(draft.length === 1, 'Adding the same provider item twice should not duplicate the estimate draft entry.');
    assert(draft[0]?.id === 'item-kitchen-faucet', 'Estimate draft should preserve the selected item id.');
    assert(draft[0]?.property_id === 'property-1', 'Estimate draft should remain scoped to the selected provider property.');
}

async function estimateDraftContextPreservesProviderJobIds() {
    const scope = createScope();

    await clearEstimateDraft(scope);
    await saveEstimateDraftContext({
        company_id: 'company-1',
        property_id: 'property-1',
        customer_home_name: 'Client HomeOS PROPERTY',
        service_request_id: 'request-1',
        job_id: 'job-1',
        schedule_slot_id: 'slot-1',
        technician_company_user_id: 'company-user-1',
        technician_name: 'Tech User',
        issue_summary: 'Kitchen faucet leak',
        source: 'provider_mode',
        updated_at: '2026-07-12T12:00:00.000Z',
    }, scope);

    const context = await loadEstimateDraftContext(scope);

    assert(context?.company_id === 'company-1', 'Estimate draft context should preserve company id.');
    assert(context?.property_id === 'property-1', 'Estimate draft context should preserve property id.');
    assert(context?.service_request_id === 'request-1', 'Estimate draft context should preserve service request id.');
    assert(context?.job_id === 'job-1', 'Estimate draft context should preserve job id.');
    assert(context?.schedule_slot_id === 'slot-1', 'Estimate draft context should preserve schedule slot id.');
    assert(context?.source === 'provider_mode', 'Estimate draft context should preserve provider mode source.');
}

function createScope(): EstimateDraftScope {
    return {
        userId: 'tech-user-1',
        companyId: 'company-1',
        propertyId: 'property-1',
    };
}

function createDraftItem(): EstimateDraftItem {
    return {
        id: 'item-kitchen-faucet',
        property_id: 'property-1',
        customer_home_name: 'Client HomeOS PROPERTY',
        name: 'Kitchen Faucet',
        item_slug: 'kitchen-kitchen-faucet',
        system: 'Plumbing',
        category: 'Fixture',
        location: 'Kitchen',
        parent_area: '',
        status: 'Missing Information',
        install_state: 'Unknown',
        company_id: 'company-1',
        company_user_id: 'company-user-1',
        source: 'provider_mode',
        created_at: '2026-07-12T12:00:00.000Z',
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
