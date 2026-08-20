import { resolveHomeItemPresentation } from './homeItemPresentation';

runHomeItemPresentationRegressions();

export function runHomeItemPresentationRegressions() {
    explicitHomeownerAssemblyPresentationIsRequired();
    protectedWorkflowsAlwaysKeepFullDetail();
    webHydrationNeverFlashesAssemblyPresentation();
}

function explicitHomeownerAssemblyPresentationIsRequired() {
    assert(resolveHomeItemPresentation(baseContext()) === 'assembly', 'The explicit homeowner assembly route should use the assembly presentation.');
    assert(resolveHomeItemPresentation({ ...baseContext(), presentation: '' }) === 'detail', 'A bare item route should keep the existing full detail page.');
    assert(resolveHomeItemPresentation({ ...baseContext(), presentation: 'unknown' }) === 'detail', 'Unknown presentation values should keep the existing full detail page.');
}

function protectedWorkflowsAlwaysKeepFullDetail() {
    assert(resolveHomeItemPresentation({ ...baseContext(), isProviderMode: true }) === 'detail', 'Provider mode must keep its authorized full item workflow.');
    assert(resolveHomeItemPresentation({ ...baseContext(), isManagementMode: true }) === 'detail', 'Management mode must keep its authorized full item workflow.');
    assert(resolveHomeItemPresentation({ ...baseContext(), focusedView: 'management' }) === 'detail', 'Focused item management must take precedence over assembly presentation.');
    assert(resolveHomeItemPresentation({ ...baseContext(), maintenanceGuide: 'spotlight' }) === 'detail', 'The maintenance guide must keep the current full item workflow.');
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
