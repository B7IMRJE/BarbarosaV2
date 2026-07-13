export type TechOSDashboardVisualKey =
    | 'jobs'
    | 'schedule'
    | 'history'
    | 'estimates'
    | 'sales'
    | 'messages'
    | 'time-clock'
    | 'van-inventory';

export type TechOSJobDetailVisualKey =
    | 'customer'
    | 'request'
    | 'status'
    | 'workflow'
    | 'note'
    | 'estimate'
    | 'finish';

export type TechOSVisualVariant = {
    accentColor: string;
    backgroundColor: string;
    borderColor: string;
};

export type TechOSClientJobContext = {
    companyId: string;
    propertyId?: string | null;
    serviceRequestId?: string | null;
    scheduleSlotId?: string | null;
    jobId?: string | null;
};

export const TECHOS_DASHBOARD_VISUAL_VARIANTS: Record<TechOSDashboardVisualKey, TechOSVisualVariant> = {
    jobs: {
        accentColor: '#2563EB',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        borderColor: 'rgba(37, 99, 235, 0.30)',
    },
    schedule: {
        accentColor: '#7C3AED',
        backgroundColor: 'rgba(124, 58, 237, 0.08)',
        borderColor: 'rgba(124, 58, 237, 0.30)',
    },
    history: {
        accentColor: '#64748B',
        backgroundColor: 'rgba(100, 116, 139, 0.09)',
        borderColor: 'rgba(100, 116, 139, 0.32)',
    },
    estimates: {
        accentColor: '#B7791F',
        backgroundColor: 'rgba(183, 121, 31, 0.10)',
        borderColor: 'rgba(183, 121, 31, 0.34)',
    },
    sales: {
        accentColor: '#15803D',
        backgroundColor: 'rgba(21, 128, 61, 0.08)',
        borderColor: 'rgba(21, 128, 61, 0.30)',
    },
    messages: {
        accentColor: '#0F766E',
        backgroundColor: 'rgba(15, 118, 110, 0.08)',
        borderColor: 'rgba(15, 118, 110, 0.30)',
    },
    'time-clock': {
        accentColor: '#C2410C',
        backgroundColor: 'rgba(194, 65, 12, 0.08)',
        borderColor: 'rgba(194, 65, 12, 0.30)',
    },
    'van-inventory': {
        accentColor: '#4F46E5',
        backgroundColor: 'rgba(79, 70, 229, 0.08)',
        borderColor: 'rgba(79, 70, 229, 0.30)',
    },
};

export const TECHOS_JOB_DETAIL_VISUAL_VARIANTS: Record<TechOSJobDetailVisualKey, TechOSVisualVariant> = {
    customer: {
        accentColor: '#2563EB',
        backgroundColor: 'rgba(37, 99, 235, 0.07)',
        borderColor: 'rgba(37, 99, 235, 0.28)',
    },
    request: {
        accentColor: '#B7791F',
        backgroundColor: 'rgba(183, 121, 31, 0.09)',
        borderColor: 'rgba(183, 121, 31, 0.30)',
    },
    status: {
        accentColor: '#7C3AED',
        backgroundColor: 'rgba(124, 58, 237, 0.07)',
        borderColor: 'rgba(124, 58, 237, 0.28)',
    },
    workflow: {
        accentColor: '#0F766E',
        backgroundColor: 'rgba(15, 118, 110, 0.07)',
        borderColor: 'rgba(15, 118, 110, 0.28)',
    },
    note: {
        accentColor: '#64748B',
        backgroundColor: 'rgba(100, 116, 139, 0.08)',
        borderColor: 'rgba(100, 116, 139, 0.30)',
    },
    estimate: {
        accentColor: '#B7791F',
        backgroundColor: 'rgba(183, 121, 31, 0.10)',
        borderColor: 'rgba(183, 121, 31, 0.34)',
    },
    finish: {
        accentColor: '#B91C1C',
        backgroundColor: 'rgba(185, 28, 28, 0.07)',
        borderColor: 'rgba(185, 28, 28, 0.28)',
    },
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

export function resolveTechOSDashboardVariant(key: TechOSDashboardVisualKey) {
    return TECHOS_DASHBOARD_VISUAL_VARIANTS[key];
}

export function resolveTechOSJobDetailVariant(key: TechOSJobDetailVisualKey) {
    return TECHOS_JOB_DETAIL_VISUAL_VARIANTS[key];
}

function compactRouteParams(values: Record<string, string | null | undefined>) {
    return Object.entries(values).reduce<Record<string, string>>((accumulator, [key, value]) => {
        const text = String(value || '').trim();

        if (text) accumulator[key] = text;

        return accumulator;
    }, {});
}
