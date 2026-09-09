import {
    SecureRouteGuardTimeoutError,
    isPublicPhoneCapturePath,
    isSalesEstimatePresentationRouteAllowed,
    secureRouteRenderKey,
    withSecureRouteGuardTimeout,
} from './secureRouteGuard';

void runSecureRouteGuardRegressions();

export async function runSecureRouteGuardRegressions() {
    phoneCaptureUsesLinkAccessWithoutOpeningPrivateRoutes();
    assignedJobContextChangesThePrivacyCurtainKey();
    assignedSalesCanOpenOnlyTheTechOSPresentationHandoff();
    await fastPermissionChecksContinue();
    await hangingPermissionChecksBecomeRetryableErrors();
}

function phoneCaptureUsesLinkAccessWithoutOpeningPrivateRoutes() {
    assert(isPublicPhoneCapturePath('/request-service-phone'), 'The QR capture screen must open without signing in.');
    assert(isPublicPhoneCapturePath('/request-service-phone/'), 'A trailing slash must not trigger a login redirect.');
    for (const path of ['/', '/request-service', '/request-service-phone/admin', '/request-service-phone-other', '/job-messages', '/techos']) {
        assert(!isPublicPhoneCapturePath(path), `${path} must retain account-based access checks.`);
    }
}

function assignedJobContextChangesThePrivacyCurtainKey() {
    const base = {
        providerMode: '1',
        companyId: 'company-1',
        propertyId: 'property-1',
        serviceRequestId: 'request-1',
        scheduleSlotId: 'slot-1',
        jobId: 'job-1',
        itemSlug: 'whole-home-repipe',
    };
    const firstKey = secureRouteRenderKey('/estimate/workspace', base);
    const nextVisitKey = secureRouteRenderKey('/estimate/workspace', {
        ...base,
        scheduleSlotId: 'slot-2',
    });

    assert(firstKey !== nextVisitKey, 'A different assigned visit must trigger a new secure route check.');
    assert(firstKey.includes('whole-home-repipe'), 'The selected HomeOS item must remain part of the secure route identity.');
}

function assignedSalesCanOpenOnlyTheTechOSPresentationHandoff() {
    const presentationParams = {
        presentation: '1',
        source: 'techos',
        returnTo: '/techos?companyId=company-1&slotId=slot-1',
        companyId: 'company-1',
        propertyId: 'property-1',
        estimateSessionId: 'estimate-session-1',
        scheduleSlotId: 'slot-1',
    };

    assert(
        isSalesEstimatePresentationRouteAllowed('/job-workflow', presentationParams, ['company-1']),
        'Assigned Sales Tech must be able to open the homeowner presentation for an approved estimate.',
    );
    assert(
        !isSalesEstimatePresentationRouteAllowed('/job-workflow', { ...presentationParams, presentation: '' }, ['company-1']),
        'Sales Tech must not open the general job workflow without presentation mode.',
    );
    assert(
        !isSalesEstimatePresentationRouteAllowed('/job-workflow', { ...presentationParams, scheduleSlotId: '' }, ['company-1']),
        'Sales Tech presentation access must retain an assigned request, visit, or job.',
    );
    assert(
        isSalesEstimatePresentationRouteAllowed('/job-workflow', {
            ...presentationParams,
            scheduleSlotId: '',
            providerMode: '1',
        }, ['company-1']),
        'A saved draft opened through an authorized client HomeOS may be presented even when its old visit id is unavailable.',
    );
    assert(
        !isSalesEstimatePresentationRouteAllowed('/job-workflow', presentationParams, ['company-2']),
        'Sales Tech must not present an estimate for another company.',
    );
}

async function fastPermissionChecksContinue() {
    const result = await withSecureRouteGuardTimeout(Promise.resolve('allowed'), 50);

    assert(result === 'allowed', 'A completed permission check should continue normally.');
}

async function hangingPermissionChecksBecomeRetryableErrors() {
    let error: unknown = null;

    try {
        await withSecureRouteGuardTimeout(new Promise<never>(() => undefined), 5);
    } catch (caught) {
        error = caught;
    }

    assert(error instanceof SecureRouteGuardTimeoutError, 'A hanging permission check must end with a retryable timeout error.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
