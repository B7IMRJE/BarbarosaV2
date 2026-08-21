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
    if (isManagementMode) return 'detail';
    if (String(focusedView || '').trim()) return 'detail';
    if (String(maintenanceGuide || '').trim()) return 'detail';

    // Assigned providers use the same deck-driven card presentation; focused work routes above retain full tools.
    if (isProviderMode) return 'assembly';

    return 'assembly';
}
