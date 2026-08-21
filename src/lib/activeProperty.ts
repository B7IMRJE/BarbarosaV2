import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { validateProviderModeAccess } from './providerMode';
import { resolveSelectedActivePropertyId } from './activePropertySelection';

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
    id?: string | null;
    property_id?: string | null;
    role?: string | null;
    status?: string | null;
    created_at?: string | null;
};

export type HomeownerPropertyMembership = ActivePropertyMembership & {
    membershipId: string;
    createdAt: string | null;
};

const ACTIVE_PROPERTY_STORAGE_PREFIX = 'barbarosa:homeos:active-property';

export class ActivePropertyResolutionError extends Error {
    code: ActivePropertyResolutionErrorCode;

    constructor(code: ActivePropertyResolutionErrorCode, message: string) {
        super(message);
        this.code = code;
    }
}

export async function requireActivePropertyMembership(options: {
    propertyIdOverride?: string | null;
    companyId?: string | null;
} = {}): Promise<ActivePropertyMembership> {
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        throw new ActivePropertyResolutionError('not_authenticated', 'You must be logged in.');
    }

    const propertyIdOverride = String(options.propertyIdOverride || '').trim();
    const companyId = String(options.companyId || '').trim();

    if (propertyIdOverride && companyId) {
        const providerAccess = await validateProviderModeAccess(companyId, propertyIdOverride);

        if (!providerAccess.access) {
            throw new ActivePropertyResolutionError(
                'lookup_failed',
                providerAccess.error || 'You do not have provider access for this client HomeOS.'
            );
        }

        return {
            userId: user.id,
            propertyId: propertyIdOverride,
            membershipRole: providerAccess.access.isPlatformAdmin
                ? 'provider_platform_admin'
                : `provider_${providerAccess.access.role || 'company_user'}`,
            membershipStatus: 'active',
        };
    }

    const memberships = await loadActivePropertyMembershipsForUser(user.id);

    if (memberships.length === 0) {
        throw new ActivePropertyResolutionError('no_active_property', 'Finish creating your first home to continue.');
    }

    const storedPropertyId = await readStoredActivePropertyId(user.id);
    const selectedPropertyId = resolveSelectedActivePropertyId(memberships, storedPropertyId);
    const selectedMembership = memberships.find((membership) => membership.propertyId === selectedPropertyId)
        || memberships[0];

    if (storedPropertyId !== selectedMembership.propertyId) {
        await storeActivePropertyId(user.id, selectedMembership.propertyId);
    }

    return {
        userId: user.id,
        propertyId: selectedMembership.propertyId,
        membershipRole: selectedMembership.membershipRole,
        membershipStatus: selectedMembership.membershipStatus,
    };
}

export async function listActivePropertyMemberships(): Promise<{
    userId: string;
    memberships: HomeownerPropertyMembership[];
    selectedPropertyId: string | null;
}> {
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        throw new ActivePropertyResolutionError('not_authenticated', 'You must be logged in.');
    }

    const memberships = await loadActivePropertyMembershipsForUser(user.id);
    const storedPropertyId = await readStoredActivePropertyId(user.id);
    const selectedPropertyId = memberships.length
        ? resolveSelectedActivePropertyId(memberships, storedPropertyId)
        : null;

    if (selectedPropertyId && storedPropertyId !== selectedPropertyId) {
        await storeActivePropertyId(user.id, selectedPropertyId);
    }

    return { userId: user.id, memberships, selectedPropertyId };
}

export async function selectActiveProperty(propertyId: string) {
    const cleanPropertyId = propertyId.trim();

    if (!cleanPropertyId) {
        throw new ActivePropertyResolutionError('lookup_failed', 'Choose a property to continue.');
    }

    const { userId, memberships } = await listActivePropertyMemberships();
    const membership = memberships.find((candidate) => candidate.propertyId === cleanPropertyId);

    if (!membership) {
        throw new ActivePropertyResolutionError('lookup_failed', 'You do not have access to that property.');
    }

    await storeActivePropertyId(userId, membership.propertyId);

    return membership;
}

async function loadActivePropertyMembershipsForUser(userId: string) {
    const { data, error } = await supabase
        .from('property_memberships')
        .select('id, property_id, role, status, created_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(100);

    if (error) {
        throw new ActivePropertyResolutionError('lookup_failed', 'Could not load your properties.');
    }

    return ((data || []) as PropertyMembershipRow[])
        .map((row): HomeownerPropertyMembership | null => {
            const propertyId = String(row.property_id || '').trim();

            if (!propertyId) return null;

            return {
                userId,
                propertyId,
                membershipId: String(row.id || '').trim(),
                membershipRole: String(row.role || '').trim(),
                membershipStatus: String(row.status || '').trim(),
                createdAt: row.created_at || null,
            };
        })
        .filter((membership): membership is HomeownerPropertyMembership => Boolean(membership));
}

function activePropertyStorageKey(userId: string) {
    return `${ACTIVE_PROPERTY_STORAGE_PREFIX}:${userId}`;
}

async function readStoredActivePropertyId(userId: string) {
    try {
        return await AsyncStorage.getItem(activePropertyStorageKey(userId));
    } catch {
        return null;
    }
}

async function storeActivePropertyId(userId: string, propertyId: string) {
    try {
        await AsyncStorage.setItem(activePropertyStorageKey(userId), propertyId);
    } catch {
        // Selection still works for this render if device storage is unavailable.
    }
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
