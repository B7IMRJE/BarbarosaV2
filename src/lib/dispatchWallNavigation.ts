export const DISPATCH_WALL_OPEN_SOURCE_DISPATCH_OFFICE = 'dispatch-office';
export const DISPATCH_WALL_BACK_LABEL = 'Back to Dispatch Office';
export const DISPATCH_WALL_FULLSCREEN_LABEL = 'Full Screen';
export const DISPATCH_WALL_EXIT_FULLSCREEN_LABEL = 'Exit Full Screen';

export type DispatchWallOpenSource = typeof DISPATCH_WALL_OPEN_SOURCE_DISPATCH_OFFICE;

export function buildDispatchWallRoute({
    companyId,
    source,
}: {
    companyId: string;
    source?: string | null;
}) {
    const params = [`companyId=${encodeURIComponent(companyId)}`];
    const normalizedSource = normalizeDispatchWallOpenSource(source);

    if (normalizedSource) {
        params.push(`from=${encodeURIComponent(normalizedSource)}`);
    }

    return `/dispatch-wall?${params.join('&')}`;
}

export function getDispatchWallBackRoute({
    companyId,
    openedFrom,
}: {
    companyId?: string | null;
    openedFrom?: string | null;
}) {
    const normalizedCompanyId = String(companyId || '').trim();
    const normalizedSource = normalizeDispatchWallOpenSource(openedFrom);

    if (normalizedSource === DISPATCH_WALL_OPEN_SOURCE_DISPATCH_OFFICE && normalizedCompanyId) {
        return `/dispatch?companyId=${encodeURIComponent(normalizedCompanyId)}`;
    }

    if (normalizedCompanyId) {
        return `/super-admin/company/${encodeURIComponent(normalizedCompanyId)}`;
    }

    return '/super-admin';
}

export function getDispatchWallFullscreenLabel(isFullscreen: boolean) {
    return isFullscreen ? DISPATCH_WALL_EXIT_FULLSCREEN_LABEL : DISPATCH_WALL_FULLSCREEN_LABEL;
}

export function shouldOpenDispatchWallInCurrentStack() {
    return true;
}

export function shouldReplaceDispatchWallWhenLeaving() {
    return true;
}

export function normalizeDispatchWallOpenSource(source?: string | null): DispatchWallOpenSource | '' {
    return source === DISPATCH_WALL_OPEN_SOURCE_DISPATCH_OFFICE
        ? DISPATCH_WALL_OPEN_SOURCE_DISPATCH_OFFICE
        : '';
}
