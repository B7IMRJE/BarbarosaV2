export const SECURE_ROUTE_GUARD_TIMEOUT_MS = 12_000;

export type SecureRouteGuardParams = {
    providerMode?: string | string[];
    companyId?: string | string[];
    propertyId?: string | string[];
    serviceRequestId?: string | string[];
    scheduleSlotId?: string | string[];
    jobId?: string | string[];
    itemSlug?: string | string[];
    estimateSessionId?: string | string[];
    presentation?: string | string[];
    source?: string | string[];
    returnTo?: string | string[];
};

export class SecureRouteGuardTimeoutError extends Error {
    constructor() {
        super('Account and assigned-job access could not be confirmed in time. Check your connection and retry.');
        this.name = 'SecureRouteGuardTimeoutError';
    }
}

export function secureRouteRenderKey(pathname: string, routeParams: SecureRouteGuardParams) {
    return [
        normalizePath(pathname),
        firstRouteParam(routeParams.providerMode),
        firstRouteParam(routeParams.companyId),
        firstRouteParam(routeParams.propertyId),
        firstRouteParam(routeParams.serviceRequestId),
        firstRouteParam(routeParams.scheduleSlotId),
        firstRouteParam(routeParams.jobId),
        firstRouteParam(routeParams.itemSlug),
        firstRouteParam(routeParams.estimateSessionId),
        firstRouteParam(routeParams.presentation),
        firstRouteParam(routeParams.source),
        firstRouteParam(routeParams.returnTo),
    ].join('|');
}

export function isSalesEstimatePresentationRouteAllowed(
    pathname: string,
    routeParams: SecureRouteGuardParams,
    allowedCompanyIds: readonly string[] = [],
) {
    const currentPath = normalizePath(pathname);

    if (currentPath !== '/job-workflow' && !currentPath.startsWith('/job-workflow/')) return false;
    if (firstRouteParam(routeParams.presentation) !== '1') return false;
    if (firstRouteParam(routeParams.source).trim().toLowerCase() !== 'techos') return false;

    const companyId = firstRouteParam(routeParams.companyId).trim();
    const propertyId = firstRouteParam(routeParams.propertyId).trim();
    const estimateSessionId = firstRouteParam(routeParams.estimateSessionId).trim();
    const returnTo = firstRouteParam(routeParams.returnTo).trim();
    const hasAssignedWorkContext = Boolean(
        firstRouteParam(routeParams.serviceRequestId).trim()
        || firstRouteParam(routeParams.scheduleSlotId).trim()
        || firstRouteParam(routeParams.jobId).trim()
    );
    const hasAuthorizedClientHomeContext = firstRouteParam(routeParams.providerMode) === '1';

    if (!companyId || !propertyId || !estimateSessionId) return false;
    if (!hasAssignedWorkContext && !hasAuthorizedClientHomeContext) return false;
    if (!allowedCompanyIds.includes(companyId)) return false;

    return returnTo === '/techos' || returnTo.startsWith('/techos?');
}

export async function withSecureRouteGuardTimeout<T>(
    operation: Promise<T>,
    timeoutMs = SECURE_ROUTE_GUARD_TIMEOUT_MS
): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    try {
        return await Promise.race([
            operation,
            new Promise<T>((_resolve, reject) => {
                timeout = setTimeout(() => reject(new SecureRouteGuardTimeoutError()), timeoutMs);
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

function normalizePath(pathname: string) {
    const withoutTrailingSlash = pathname.replace(/\/+$/, '');

    return withoutTrailingSlash || '/';
}

function firstRouteParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}
