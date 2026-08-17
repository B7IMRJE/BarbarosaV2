import {
    SecureRouteGuardTimeoutError,
    secureRouteRenderKey,
    withSecureRouteGuardTimeout,
} from './secureRouteGuard';

void runSecureRouteGuardRegressions();

export async function runSecureRouteGuardRegressions() {
    assignedJobContextChangesThePrivacyCurtainKey();
    await fastPermissionChecksContinue();
    await hangingPermissionChecksBecomeRetryableErrors();
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
