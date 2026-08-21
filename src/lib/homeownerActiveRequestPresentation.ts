export function shouldShowHomeownerActiveRequestStatus(input: {
    pathname?: string | null;
    providerModeActive?: boolean;
}) {
    if (!shouldShowHomeownerGlobalOverlay(input)) return false;

    // The property landing owns the single inline tracker. Mounting the global
    // tracker there as well creates duplicate realtime subscriptions.
    return normalizePath(input.pathname) !== '/';
}

export function shouldShowHomeownerFloatingSosButton(input: {
    pathname?: string | null;
    providerModeActive?: boolean;
    staffAccessResolved?: boolean;
    isStaff?: boolean;
}) {
    if (!input.staffAccessResolved || input.isStaff) return false;

    return shouldShowHomeownerGlobalOverlay({
        pathname: input.pathname,
        providerModeActive: input.providerModeActive,
    });
}

export function buildHomeownerActiveRequestChannelName(
    propertyId: string,
    instanceId: string,
    runId: number
) {
    const safePropertyId = normalizeRealtimeChannelPart(propertyId) || 'property';
    const safeInstanceId = normalizeRealtimeChannelPart(instanceId) || 'tracker';
    const safeRunId = Number.isFinite(runId) && runId > 0 ? Math.floor(runId) : 1;

    return `homeowner-active-requests:${safePropertyId}:${safeInstanceId}:${safeRunId}`;
}

function shouldShowHomeownerGlobalOverlay(input: {
    pathname?: string | null;
    providerModeActive?: boolean;
}) {
    if (input.providerModeActive) return false;

    const pathname = normalizePath(input.pathname);
    const hiddenPrefixes = [
        '/admin',
        '/auth',
        '/company-invite',
        '/customer-invite',
        '/dispatch',
        '/dispatch-wall',
        '/estimate',
        '/onboarding',
        '/schedule',
        '/super-admin',
        '/techos',
    ];

    return !hiddenPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function normalizePath(value?: string | null) {
    const text = String(value || '/').split('?')[0] || '/';
    const withoutTrailingSlash = text.replace(/\/+$/, '');

    return withoutTrailingSlash || '/';
}

function normalizeRealtimeChannelPart(value?: string | null) {
    return String(value || '').trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '');
}
