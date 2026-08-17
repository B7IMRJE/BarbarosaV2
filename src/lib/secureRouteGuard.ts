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
    ].join('|');
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
