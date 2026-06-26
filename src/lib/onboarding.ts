import { isStaffRole, normalizeRole } from './roles';
import { supabase } from './supabase';

export const HOME_ROUTE = '/' as const;
export const SUPER_ADMIN_ROUTE = '/super-admin' as const;
export const FIRST_HOME_ONBOARDING_ROUTE = '/onboarding/create-home' as const;
export const TECHOS_ROUTE = '/techos' as const;

const TECHOS_COMPANY_ROLES = ['technician', 'manager', 'admin', 'owner'];

export type LoggedInUserRoute =
    | typeof HOME_ROUTE
    | typeof SUPER_ADMIN_ROUTE
    | typeof FIRST_HOME_ONBOARDING_ROUTE
    | typeof TECHOS_ROUTE;

export type LoggedInUserRouteReason =
    | 'super-admin'
    | 'company-staff'
    | 'staff'
    | 'homeowner-active-membership'
    | 'homeowner-needs-first-home'
    | 'profile-missing'
    | 'profile-query-error'
    | 'membership-query-error'
    | 'unexpected-error';

export type LoggedInUserRouteDecision = {
    route: LoggedInUserRoute;
    reason: LoggedInUserRouteReason;
    message?: string;
};

type ProfileRouteFields = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

export function isSuperAdminProfile(profile?: ProfileRouteFields | null) {
    return (
        normalizeRole(profile?.role) === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

export async function resolveLoggedInUserRoute(userId: string): Promise<LoggedInUserRouteDecision> {
    try {
        const profileQuery = await loadRouteProfile(userId);

        if (profileQuery.error) {
            return {
                route: HOME_ROUTE,
                reason: 'profile-query-error',
                message: 'Login succeeded, but HomeOS could not confirm your account profile. Opening HomeOS.',
            };
        }

        const profile = profileQuery.data;

        if (!profile) {
            return {
                route: HOME_ROUTE,
                reason: 'profile-missing',
                message: 'Login succeeded, but HomeOS could not find your account profile. Opening HomeOS.',
            };
        }

        if (isSuperAdminProfile(profile)) {
            return {
                route: SUPER_ADMIN_ROUTE,
                reason: 'super-admin',
            };
        }

        const role = normalizeRole(profile.role);
        const companyAccessQuery = await supabase
            .from('company_users')
            .select('id')
            .eq('auth_user_id', userId)
            .eq('status', 'active')
            .in('role', TECHOS_COMPANY_ROLES)
            .limit(1);

        if (!companyAccessQuery.error && (companyAccessQuery.data || []).length > 0) {
            return {
                route: TECHOS_ROUTE,
                reason: 'company-staff',
            };
        }

        if (isStaffRole(role) || role !== 'HOMEOWNER') {
            return {
                route: HOME_ROUTE,
                reason: 'staff',
            };
        }

        const membershipQuery = await supabase
            .from('property_memberships')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(1);

        if (membershipQuery.error) {
            return {
                route: HOME_ROUTE,
                reason: 'membership-query-error',
                message: 'Login succeeded, but HomeOS could not confirm your home setup. Opening HomeOS.',
            };
        }

        if ((membershipQuery.data || []).length > 0) {
            return {
                route: HOME_ROUTE,
                reason: 'homeowner-active-membership',
            };
        }

        return {
            route: FIRST_HOME_ONBOARDING_ROUTE,
            reason: 'homeowner-needs-first-home',
        };
    } catch {
        return {
            route: HOME_ROUTE,
            reason: 'unexpected-error',
            message: 'Login succeeded, but HomeOS could not resolve your startup route. Opening HomeOS.',
        };
    }
}

async function loadRouteProfile(userId: string) {
    const primaryQuery = await supabase
        .from('profiles')
        .select('role, is_platform_admin')
        .eq('id', userId)
        .maybeSingle();

    if (!primaryQuery.error) {
        return primaryQuery;
    }

    const fallbackQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

    return {
        data: fallbackQuery.data ? { ...fallbackQuery.data, is_platform_admin: null } : null,
        error: fallbackQuery.error,
    };
}
