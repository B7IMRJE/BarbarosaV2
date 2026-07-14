import type { Href } from 'expo-router';
import {
    getRoleDefaultPermissions,
    isActiveCompanyStatus,
    resolveCompanyPermissions,
    type CompanyPermissionAccess,
} from './companyPermissions';
import { supabase } from './supabase';

export type ProviderModeParams = {
    providerMode: boolean;
    companyId: string;
    propertyId: string;
    returnTo: string;
    serviceRequestId: string;
    scheduleSlotId: string;
    jobId: string;
};

export type ProviderModeAccess = {
    userId: string;
    companyUserId: string;
    companyId: string;
    propertyId: string;
    role: string | null;
    status: string | null;
    permissions: CompanyPermissionAccess['permissions'];
    isPlatformAdmin: boolean;
};

type ProviderModeAccessResult = {
    access: ProviderModeAccess | null;
    error: string | null;
};

type RouteParamValue = string | string[] | undefined;

type ProviderRouteParams = {
    providerMode?: RouteParamValue;
    companyId?: RouteParamValue;
    propertyId?: RouteParamValue;
    returnTo?: RouteParamValue;
    serviceRequestId?: RouteParamValue;
    scheduleSlotId?: RouteParamValue;
    jobId?: RouteParamValue;
};

type PlatformProfile = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

type CompanyUserRow = {
    id?: string | null;
    company_id?: string | null;
    role?: string | null;
    status?: string | null;
    permissions?: unknown;
};

type CompanyClientRow = {
    id?: string | null;
    status?: string | null;
};

export function readProviderModeParams(params: ProviderRouteParams): ProviderModeParams | null {
    const providerModeValue = firstParam(params.providerMode);
    const companyId = firstParam(params.companyId);
    const propertyId = firstParam(params.propertyId);

    if (!isProviderModeValue(providerModeValue) || !companyId || !propertyId) {
        return null;
    }

    return {
        providerMode: true,
        companyId,
        propertyId,
        returnTo: firstParam(params.returnTo),
        serviceRequestId: firstParam(params.serviceRequestId),
        scheduleSlotId: firstParam(params.scheduleSlotId),
        jobId: firstParam(params.jobId),
    };
}

export function hasProviderModeRouteSignal(params: ProviderRouteParams) {
    if (isProviderModeValue(firstParam(params.providerMode))) return true;
    if (firstParam(params.serviceRequestId) || firstParam(params.scheduleSlotId) || firstParam(params.jobId)) return true;
    if (firstParam(params.returnTo).startsWith('/techos')) return true;

    return false;
}

export function providerModeQueryParams(context: ProviderModeParams) {
    return compactRouteParams({
        providerMode: '1',
        companyId: context.companyId,
        propertyId: context.propertyId,
        returnTo: context.returnTo,
        serviceRequestId: context.serviceRequestId,
        scheduleSlotId: context.scheduleSlotId,
        jobId: context.jobId,
    });
}

export function providerModePath(pathname: string, context: ProviderModeParams) {
    const query = new URLSearchParams(providerModeQueryParams(context)).toString();

    return `${pathname}?${query}` as Href;
}

export function providerModeItemPath(itemSlug: string, context: ProviderModeParams) {
    const query = new URLSearchParams(providerModeQueryParams(context)).toString();

    return `/item/${encodeURIComponent(itemSlug)}?${query}` as Href;
}

export async function validateProviderModeAccess(
    companyId: string,
    propertyId: string
): Promise<ProviderModeAccessResult> {
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        return { access: null, error: 'Sign in to open this client HomeOS.' };
    }

    const clientAccess = await loadActiveClientRelationship(companyId, propertyId);

    if (clientAccess.error) {
        return { access: null, error: clientAccess.error };
    }

    if (!clientAccess.active) {
        return { access: null, error: 'This home is not an active client for this company.' };
    }

    const isPlatformAdmin = await loadPlatformAdmin(user.id);

    if (isPlatformAdmin) {
        return {
            access: {
                userId: user.id,
                companyUserId: '',
                companyId,
                propertyId,
                role: 'platform_admin',
                status: 'active',
                permissions: getRoleDefaultPermissions('owner'),
                isPlatformAdmin: true,
            },
            error: null,
        };
    }

    const companyUser = await loadActiveCompanyUser(user.id, companyId);

    if (companyUser.error) {
        return { access: null, error: companyUser.error };
    }

    if (!companyUser.row) {
        return { access: null, error: 'You do not have active company access for this client HomeOS.' };
    }

    const permissions = resolveCompanyPermissions({
        role: companyUser.row.role,
        status: companyUser.row.status,
        permissions: companyUser.row.permissions as Partial<CompanyPermissionAccess['permissions']> | null,
    });

    return {
        access: {
            userId: user.id,
            companyUserId: String(companyUser.row.id || ''),
            companyId,
            propertyId,
            role: companyUser.row.role || null,
            status: companyUser.row.status || null,
            permissions,
            isPlatformAdmin: false,
        },
        error: null,
    };
}

async function loadActiveClientRelationship(companyId: string, propertyId: string) {
    const { data, error } = await supabase
        .from('company_property_clients')
        .select('id, status')
        .eq('company_id', companyId)
        .eq('property_id', propertyId)
        .maybeSingle();

    if (error) {
        return { active: false, error: `Could not confirm client relationship: ${error.message}` };
    }

    const row = (data || null) as CompanyClientRow | null;

    if (!row) {
        return { active: false, error: null };
    }

    const status = String(row.status || '').trim().toLowerCase();
    const inactiveStatuses = ['archived', 'cancelled', 'canceled', 'declined', 'inactive', 'revoked'];

    return {
        active: !inactiveStatuses.includes(status),
        error: null,
    };
}

async function loadActiveCompanyUser(userId: string, companyId: string) {
    const { data, error } = await supabase
        .from('company_users')
        .select('id, company_id, role, status, permissions')
        .eq('auth_user_id', userId)
        .eq('company_id', companyId)
        .order('created_at', { ascending: true })
        .limit(5);

    if (error) {
        const fallback = await supabase
            .from('company_users')
            .select('id, company_id, role, status')
            .eq('auth_user_id', userId)
            .eq('company_id', companyId)
            .order('created_at', { ascending: true })
            .limit(5);

        if (fallback.error) {
            return { row: null, error: `Could not confirm company access: ${fallback.error.message}` };
        }

        return {
            row: ((fallback.data || []) as CompanyUserRow[]).find((row) => isActiveCompanyStatus(row.status)) || null,
            error: null,
        };
    }

    return {
        row: ((data || []) as CompanyUserRow[]).find((row) => isActiveCompanyStatus(row.status)) || null,
        error: null,
    };
}

async function loadPlatformAdmin(userId: string) {
    const primaryQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

    if (!primaryQuery.error) {
        return isPlatformAdminProfile((primaryQuery.data || [])[0] as PlatformProfile | undefined);
    }

    const fallbackQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

    return isPlatformAdminProfile((fallbackQuery.data || [])[0] as PlatformProfile | undefined);
}

function isPlatformAdminProfile(profile?: PlatformProfile | null) {
    return (
        String(profile?.role || '').trim().toUpperCase() === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

function firstParam(value?: RouteParamValue) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

function compactRouteParams(values: Record<string, string | null | undefined>) {
    return Object.entries(values).reduce<Record<string, string>>((accumulator, [key, value]) => {
        const text = String(value || '').trim();

        if (text) accumulator[key] = text;

        return accumulator;
    }, {});
}

function isProviderModeValue(value: string) {
    const normalizedValue = value.trim().toLowerCase();

    return normalizedValue === '1' || normalizedValue === 'true' || normalizedValue === 'yes';
}
