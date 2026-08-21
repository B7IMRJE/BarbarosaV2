import {
    buildHomeownerActiveRequestChannelName,
    shouldShowHomeownerActiveRequestStatus,
    shouldShowHomeownerFloatingSosButton,
} from './homeownerActiveRequestPresentation';

runHomeownerActiveRequestPresentationRegressions();

export function runHomeownerActiveRequestPresentationRegressions() {
    signedInPropertyLandingUsesOneTrackerSurface();
    concurrentTrackerSubscriptionsStayIsolated();
}

function signedInPropertyLandingUsesOneTrackerSurface() {
    assert(
        !shouldShowHomeownerActiveRequestStatus({ pathname: '/' }),
        'The signed-in property landing must not mount a second global tracker.'
    );
    assert(
        shouldShowHomeownerActiveRequestStatus({ pathname: '/documents' }),
        'The global tracker should remain available away from the property landing.'
    );
    assert(
        shouldShowHomeownerFloatingSosButton({ pathname: '/', staffAccessResolved: true, isStaff: false }),
        'Removing the duplicate root tracker must not hide the homeowner SOS action.'
    );
}

function concurrentTrackerSubscriptionsStayIsolated() {
    const inlineChannel = buildHomeownerActiveRequestChannelName('property-1', ':inline:', 1);
    const floatingChannel = buildHomeownerActiveRequestChannelName('property-1', ':floating:', 1);
    const retryChannel = buildHomeownerActiveRequestChannelName('property-1', ':inline:', 2);

    assert(inlineChannel !== floatingChannel, 'Concurrent tracker instances must never reuse a realtime channel.');
    assert(inlineChannel !== retryChannel, 'A remount or retry must receive a fresh realtime channel.');
    assert(!inlineChannel.includes('::'), 'React instance IDs must be normalized before becoming channel topics.');
}

function assert(condition: boolean, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
