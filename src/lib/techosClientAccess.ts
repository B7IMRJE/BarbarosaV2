export {
    TECHOS_DASHBOARD_VISUAL_VARIANTS,
    TECHOS_JOB_DETAIL_VISUAL_VARIANTS,
    resolveTechOSDashboardVariant,
    resolveTechOSJobDetailVariant,
    type TechOSDashboardVisualKey,
    type TechOSJobDetailVisualKey,
    type TechOSVisualVariant,
} from './techosAppearance';

export type TechOSClientJobContext = {
    companyId: string;
    propertyId?: string | null;
    serviceRequestId?: string | null;
    scheduleSlotId?: string | null;
    jobId?: string | null;
};

export function hasTechOSClientHomeContext(context: TechOSClientJobContext) {
    return Boolean(context.companyId.trim() && String(context.propertyId || '').trim());
}

export function buildTechOSCurrentJobRoute(context: TechOSClientJobContext) {
    const params = new URLSearchParams();

    if (context.companyId.trim()) params.set('companyId', context.companyId.trim());
    if (String(context.scheduleSlotId || '').trim()) params.set('slotId', String(context.scheduleSlotId || '').trim());

    const query = params.toString();

    return `/techos${query ? `?${query}` : ''}`;
}

export function buildTechOSProviderHomeRoute(context: TechOSClientJobContext) {
    const returnTo = buildTechOSCurrentJobRoute(context);

    return {
        pathname: '/',
        params: compactRouteParams({
            providerMode: '1',
            companyId: context.companyId,
            propertyId: context.propertyId,
            returnTo,
            serviceRequestId: context.serviceRequestId,
            scheduleSlotId: context.scheduleSlotId,
            jobId: context.jobId,
        }),
    };
}

export function buildTechOSEstimateRoute(context: TechOSClientJobContext) {
    const returnTo = buildTechOSCurrentJobRoute(context);

    return {
        pathname: '/estimate',
        params: compactRouteParams({
            providerMode: context.propertyId ? '1' : '',
            companyId: context.companyId,
            propertyId: context.propertyId,
            returnTo,
            serviceRequestId: context.serviceRequestId,
            scheduleSlotId: context.scheduleSlotId,
            jobId: context.jobId,
            mode: 'techos',
        }),
    };
}

export function getTechOSEstimateActionLabel(draftItemCount: number) {
    return draftItemCount > 0 ? 'Continue Estimate / Quote' : 'Create Estimate / Quote';
}

export function getProviderReturnActionLabel(returnTo?: string | null) {
    return String(returnTo || '').startsWith('/techos')
        ? 'Back to Current Job'
        : 'Customer Detail';
}

function compactRouteParams(values: Record<string, string | null | undefined>) {
    return Object.entries(values).reduce<Record<string, string>>((accumulator, [key, value]) => {
        const text = String(value || '').trim();

        if (text) accumulator[key] = text;

        return accumulator;
    }, {});
}
