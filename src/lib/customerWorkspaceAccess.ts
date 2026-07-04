import { loadCurrentCompanyPermissionAccess } from './companyPermissions';
import { supabase } from './supabase';

type PlatformProfile = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

export type CustomerWorkspaceAccessResult = {
    allowed: boolean;
    userId: string | null;
    error: string | null;
};

export async function verifyCustomerWorkspaceAccess(companyId: string): Promise<CustomerWorkspaceAccessResult> {
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        return {
            allowed: false,
            userId: null,
            error: 'Sign in to open this customer workspace.',
        };
    }

    if (await isPlatformAdmin(user.id)) {
        return {
            allowed: true,
            userId: user.id,
            error: null,
        };
    }

    const permissionLookup = await loadCurrentCompanyPermissionAccess('can_view_customers', {
        companyId,
    });

    return {
        allowed: Boolean(permissionLookup.access),
        userId: user.id,
        error: permissionLookup.error || 'You do not have customer access for this company.',
    };
}

async function isPlatformAdmin(userId: string) {
    const primaryQuery = await supabase
        .from('profiles')
        .select('role, is_platform_admin')
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
