import { supabase } from './supabase';

export type ActivePropertyMembership = {
    userId: string;
    propertyId: string;
    membershipRole: string;
    membershipStatus: string;
};

export type ActivePropertyResolutionErrorCode =
    | 'not_authenticated'
    | 'no_active_property'
    | 'ambiguous_active_property'
    | 'lookup_failed';

type PropertyMembershipRow = {
    property_id?: string | null;
    role?: string | null;
    status?: string | null;
};

export class ActivePropertyResolutionError extends Error {
    code: ActivePropertyResolutionErrorCode;

    constructor(code: ActivePropertyResolutionErrorCode, message: string) {
        super(message);
        this.code = code;
    }
}

export async function requireActivePropertyMembership(): Promise<ActivePropertyMembership> {
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        throw new ActivePropertyResolutionError('not_authenticated', 'You must be logged in.');
    }

    const { data, error } = await supabase
        .from('property_memberships')
        .select('property_id, role, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(2);

    if (error) {
        throw new ActivePropertyResolutionError('lookup_failed', 'Could not confirm your active home.');
    }

    const rows = (data || []) as PropertyMembershipRow[];

    if (rows.length === 0) {
        throw new ActivePropertyResolutionError('no_active_property', 'Finish creating your first home to continue.');
    }

    if (rows.length > 1) {
        throw new ActivePropertyResolutionError(
            'ambiguous_active_property',
            'More than one active home is assigned to this account. Michael needs to review this before continuing.'
        );
    }

    const row = rows[0];
    const propertyId = String(row.property_id || '').trim();

    if (!propertyId) {
        throw new ActivePropertyResolutionError('lookup_failed', 'Could not confirm your active home.');
    }

    return {
        userId: user.id,
        propertyId,
        membershipRole: String(row.role || '').trim(),
        membershipStatus: String(row.status || '').trim(),
    };
}

export function isActivePropertyResolutionError(error: unknown): error is ActivePropertyResolutionError {
    return error instanceof ActivePropertyResolutionError;
}

export function activePropertyErrorMessage(error: unknown) {
    if (isActivePropertyResolutionError(error)) {
        return error.message;
    }

    return 'Could not confirm your active home.';
}
