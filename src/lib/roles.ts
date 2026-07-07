import { supabase } from './supabase';

const STAFF_ROLES = ['TECH', 'TECHNICIAN', 'OFFICE', 'DISPATCH', 'DISPATCHER', 'SUPERVISOR', 'MANAGER', 'SUPER_ADMIN', 'ADMIN'];

export function normalizeRole(role?: string | null) {
    const normalizedRole = String(role || '').trim().toUpperCase();

    return normalizedRole || 'HOMEOWNER';
}

export function isStaffRole(role?: string | null) {
    return STAFF_ROLES.includes(normalizeRole(role));
}

export async function loadCurrentUserRole() {
    try {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            return 'HOMEOWNER';
        }

        const { data, error } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

        if (error) {
            return 'HOMEOWNER';
        }

        return normalizeRole(data?.role);
    } catch {
        return 'HOMEOWNER';
    }
}
