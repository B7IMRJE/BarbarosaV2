export type HomeItemPresentation = 'detail' | 'assembly';

export function resolveHomeItemPresentation({
    presentation,
    routeParamsReady,
    isProviderMode,
    isManagementMode,
    focusedView,
    maintenanceGuide,
}: {
    presentation?: string | null;
    routeParamsReady: boolean;
    isProviderMode: boolean;
    isManagementMode: boolean;
    focusedView?: string | null;
    maintenanceGuide?: string | null;
}): HomeItemPresentation {
    if (!routeParamsReady) return 'detail';
    if (String(presentation || '').trim().toLowerCase() !== 'assembly') return 'detail';
    if (isProviderMode || isManagementMode) return 'detail';
    if (String(focusedView || '').trim()) return 'detail';
    if (String(maintenanceGuide || '').trim()) return 'detail';

    return 'assembly';
}
