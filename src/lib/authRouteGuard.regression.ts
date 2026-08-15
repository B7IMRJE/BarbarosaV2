import { resolveAuthUserVerification } from './authRouteGuard';

runAuthRouteGuardRegressions();

export function runAuthRouteGuardRegressions() {
    freshBrowserSessionStaysSignedOut();
    staleBrowserSessionCannotAuthorizeOnboarding();
    verifiedUserCanContinueToAccountRouting();
    authServiceFailuresRemainRetryable();
}

function freshBrowserSessionStaysSignedOut() {
    const result = resolveAuthUserVerification(null, {
        name: 'AuthSessionMissingError',
        message: 'Auth session missing!',
        status: 400,
    });

    assert(
        result.status === 'unauthenticated',
        'A browser without a verified session must be sent to authentication before onboarding.'
    );
}

function staleBrowserSessionCannotAuthorizeOnboarding() {
    const result = resolveAuthUserVerification(null, {
        code: 'bad_jwt',
        message: 'Invalid JWT',
        status: 401,
    });

    assert(
        result.status === 'unauthenticated',
        'Stale or invalid browser auth state must not authorize the Create First Home route.'
    );
}

function verifiedUserCanContinueToAccountRouting() {
    const result = resolveAuthUserVerification({ id: 'user-1' }, null);

    assert(result.status === 'authenticated', 'A backend-verified user should continue to account routing.');
    assert(result.status !== 'authenticated' || result.userId === 'user-1', 'The verified user id must drive onboarding resolution.');
}

function authServiceFailuresRemainRetryable() {
    const result = resolveAuthUserVerification(null, {
        message: 'Failed to fetch',
        status: 0,
    });

    assert(
        result.status === 'service-unavailable',
        'A network failure must show the retryable service state instead of pretending the user signed out.'
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
