import { resolveHomeItemPresentation } from './homeItemPresentation';

runHomeItemPresentationRegressions();

export function runHomeItemPresentationRegressions() {
    explicitHomeownerAssemblyPresentationIsRequired();
    deckOpenedProviderItemsUseModernCardPresentation();
    protectedFocusedWorkflowsKeepFullDetail();
    webHydrationNeverFlashesAssemblyPresentation();
}

function explicitHomeownerAssemblyPresentationIsRequired() {
    assert(resolveHomeItemPresentation(baseContext()) === 'assembly', 'The explicit homeowner assembly route should use the assembly presentation.');
    assert(resolveHomeItemPresentation({ ...baseContext(), presentation: '' }) === 'detail', 'A bare item route should keep the existing full detail page.');
    assert(resolveHomeItemPresentation({ ...baseContext(), presentation: 'unknown' }) === 'detail', 'Unknown presentation values should keep the existing full detail page.');
}

function deckOpenedProviderItemsUseModernCardPresentation() {
    assert(resolveHomeItemPresentation({ ...baseContext(), isProviderMode: true }) === 'assembly', 'A provider item opened from the modern deck should keep the modern card presentation.');
}

function protectedFocusedWorkflowsKeepFullDetail() {
    assert(resolveHomeItemPresentation({ ...baseContext(), isManagementMode: true }) === 'detail', 'Management mode must keep its authorized full item workflow.');
    assert(resolveHomeItemPresentation({ ...baseContext(), isProviderMode: true, focusedView: 'management' }) === 'detail', 'Focused provider item management must take precedence over modern card presentation.');
    assert(resolveHomeItemPresentation({ ...baseContext(), isProviderMode: true, maintenanceGuide: 'spotlight' }) === 'detail', 'The provider maintenance guide must keep the full workflow.');
}

function webHydrationNeverFlashesAssemblyPresentation() {
    assert(resolveHomeItemPresentation({ ...baseContext(), routeParamsReady: false }) === 'detail', 'The presentation resolver should remain on its safe default until client route hydration finishes.');
}

function baseContext() {
    return {
        presentation: 'assembly',
        routeParamsReady: true,
        isProviderMode: false,
        isManagementMode: false,
        focusedView: '',
        maintenanceGuide: '',
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
