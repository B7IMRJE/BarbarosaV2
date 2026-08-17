import {
    inferEstimateCategoryForDraftItem,
    resolveInitialEstimateCategorySelection,
    type EstimateDraftItemLike,
} from './estimateOptions';

runEstimateDeepLinkRegressions();

export function runEstimateDeepLinkRegressions() {
    const repipeItem: EstimateDraftItemLike = {
        id: 'repipe-item-id',
        property_id: 'property-1',
        customer_home_name: 'Assigned Customer',
        name: 'Whole Home Repipe',
        item_slug: 'whole-home-repipe',
        system: 'Water Service',
        category: 'Whole Home',
        location: 'Whole Home',
        parent_area: 'Water Service',
        status: 'Needs Estimate',
        install_state: 'Existing',
        company_id: 'company-1',
        company_user_id: 'sales-user-1',
        source: 'provider_mode',
        created_at: '2026-08-17T00:00:00.000Z',
    };
    const inferredCategory = inferEstimateCategoryForDraftItem(
        [repipeItem],
        repipeItem.item_slug,
        null
    );
    const directSelection = resolveInitialEstimateCategorySelection(
        [repipeItem],
        repipeItem.item_slug,
        inferredCategory,
        null
    );
    const genericSelection = resolveInitialEstimateCategorySelection(
        [repipeItem],
        '',
        inferredCategory,
        null
    );

    assert(inferredCategory === 'whole_home_repipe', 'The Whole Home Repipe card must infer the Repipe estimate category.');
    assert(directSelection.workType === 'replacement', 'Opening Estimate from the Repipe card must enter replacement work.');
    assert(directSelection.categoryChosen, 'Opening Estimate from a selected Repipe card must skip the generic work picker.');
    assert(!genericSelection.categoryChosen, 'A generic estimate entry must still require an explicit category choice.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
