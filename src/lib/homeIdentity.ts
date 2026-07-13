import { supabase } from './supabase';
import {
    buildDefaultStarterHomePlan,
    createMissingStarterHomeItems,
} from './starterHomeSetup';

export type PropertyType =
    | 'HOUSE'
    | 'CONDO'
    | 'TOWNHOME'
    | 'APARTMENT'
    | 'MANUFACTURED_HOME'
    | 'OTHER';

export type VerifiedAddress = {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
    countryCode: string;
    formattedAddress: string;
    latitude: number;
    longitude: number;
    googlePlaceId: string;
    validationStatus: 'validated';
};

export type HomeIdentity = {
    propertyId: string;
    name: string;
    propertyType: PropertyType | string;
    ownerDisplayName: string;
    canEdit: boolean;
    address: VerifiedAddress | null;
    addressValidatedAt: string | null;
};

export type HomeIdentityInput = {
    name: string;
    propertyType: PropertyType;
    address: VerifiedAddress;
};

type HomeIdentityRow = {
    property_id?: string | null;
    name?: string | null;
    property_type?: string | null;
    address_line_1?: string | null;
    address_line_2?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
    country_code?: string | null;
    formatted_address?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    google_place_id?: string | null;
    address_validation_status?: string | null;
    address_validated_at?: string | null;
    owner_display_name?: string | null;
    membership_role?: string | null;
};

type PropertyRpcRow = {
    property_id?: string | null;
};

export const PROPERTY_TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
    { value: 'HOUSE', label: 'Single-family home' },
    { value: 'CONDO', label: 'Condo' },
    { value: 'TOWNHOME', label: 'Townhouse' },
    { value: 'APARTMENT', label: 'Apartment' },
    { value: 'MANUFACTURED_HOME', label: 'Manufactured home' },
    { value: 'OTHER', label: 'Other' },
];

export async function loadActiveHomeIdentity() {
    const { data, error } = await supabase.rpc('get_my_active_home_identity');

    if (error) {
        logHomeIdentityRpcError('Load active home identity failed', error);
        throw new Error(`Could not load your home information: ${error.message}`);
    }

    const row = firstRow<HomeIdentityRow>(data);

    return row ? normalizeHomeIdentity(row) : null;
}

export async function loadHomeIdentityForProperty(propertyId: string, options: {
    ownerDisplayName?: string;
    canEdit?: boolean;
} = {}) {
    const cleanPropertyId = propertyId.trim();

    if (!cleanPropertyId) return null;

    const { data, error } = await supabase
        .from('properties')
        .select('id, name, property_type, address_line_1, address_line_2, city, state, postal_code, country_code, formatted_address, latitude, longitude, google_place_id, address_validation_status, address_validated_at')
        .eq('id', cleanPropertyId)
        .maybeSingle();

    if (error) {
        throw new Error(`Could not load home information: ${error.message}`);
    }

    if (!data) return null;

    return normalizeHomeIdentity({
        ...(data as Record<string, unknown>),
        property_id: cleanPropertyId,
        owner_display_name: options.ownerDisplayName || 'Customer',
        membership_role: options.canEdit ? 'OWNER' : 'PROVIDER',
    } as HomeIdentityRow);
}

export async function createFirstHomeIdentity(input: HomeIdentityInput) {
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    const { data, error } = await supabase.rpc('create_homeowner_first_property', buildHomeIdentityRpcPayload(input));

    if (error) {
        logHomeIdentityRpcError('Create first home identity failed', error);
        throw new Error(`We could not create your home right now: ${error.message}`);
    }

    const row = firstRow<PropertyRpcRow>(data);
    const propertyId = String(row?.property_id || '').trim();

    if (!propertyId) {
        throw new Error('We could not confirm your home was created. Please try again.');
    }

    if (!userError && user?.id) {
        await createMissingStarterHomeItems(
            {
                userId: user.id,
                propertyId,
            },
            buildDefaultStarterHomePlan(input.propertyType)
        );
    }

    return propertyId;
}

export async function updateHomeIdentity(propertyId: string, input: HomeIdentityInput) {
    const { data, error } = await supabase.rpc('update_home_identity', {
        p_property_id: propertyId,
        ...buildHomeIdentityRpcPayload(input),
    });

    if (error) {
        logHomeIdentityRpcError('Update home identity failed', error);
        throw new Error(`We could not update your home right now: ${error.message}`);
    }

    const row = firstRow<PropertyRpcRow>(data);
    const updatedPropertyId = String(row?.property_id || '').trim();

    if (!updatedPropertyId) {
        throw new Error('We could not confirm your home was updated. Please try again.');
    }

    return updatedPropertyId;
}

export function propertyTypeLabel(value?: string | null) {
    const option = PROPERTY_TYPE_OPTIONS.find((candidate) => candidate.value === value);

    return option?.label || 'Other';
}

export function formatHomeAddress(address?: VerifiedAddress | null) {
    if (!address) return '';

    return [
        address.addressLine1,
        address.addressLine2,
        [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
        address.countryCode,
    ]
        .map((part) => part.trim())
        .filter(Boolean)
        .join('\n');
}

export function formatSingleLineAddress(address?: VerifiedAddress | null) {
    return formatHomeAddress(address).replace(/\n/g, ', ');
}

function buildHomeIdentityRpcPayload({ name, propertyType, address }: HomeIdentityInput) {
    return {
        p_name: name.trim(),
        p_address_line_1: address.addressLine1.trim(),
        p_address_line_2: address.addressLine2.trim() || null,
        p_city: address.city.trim(),
        p_state: address.state.trim(),
        p_postal_code: address.postalCode.trim(),
        p_country_code: address.countryCode.trim(),
        p_formatted_address: address.formattedAddress.trim() || formatSingleLineAddress(address),
        p_latitude: address.latitude,
        p_longitude: address.longitude,
        p_google_place_id: address.googlePlaceId,
        p_property_type: propertyType,
    };
}

function normalizeHomeIdentity(row: HomeIdentityRow): HomeIdentity {
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    const hasAddress =
        !!row.address_line_1 &&
        !!row.city &&
        !!row.state &&
        !!row.postal_code &&
        !!row.country_code &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        !!row.google_place_id &&
        row.address_validation_status === 'validated';

    return {
        propertyId: String(row.property_id || ''),
        name: String(row.name || 'Home'),
        propertyType: String(row.property_type || 'OTHER'),
        ownerDisplayName: String(row.owner_display_name || 'Homeowner'),
        canEdit: String(row.membership_role || '').trim().toUpperCase() === 'OWNER',
        addressValidatedAt: row.address_validated_at || null,
        address: hasAddress
            ? {
                addressLine1: String(row.address_line_1 || ''),
                addressLine2: String(row.address_line_2 || ''),
                city: String(row.city || ''),
                state: String(row.state || ''),
                postalCode: String(row.postal_code || ''),
                countryCode: String(row.country_code || ''),
                formattedAddress: String(row.formatted_address || ''),
                latitude,
                longitude,
                googlePlaceId: String(row.google_place_id || ''),
                validationStatus: 'validated',
            }
            : null,
    };
}

function firstRow<T>(data: unknown) {
    if (Array.isArray(data)) {
        return (data[0] || null) as T | null;
    }

    return (data || null) as T | null;
}

function logHomeIdentityRpcError(context: string, error: {
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
}) {
    console.error(context, {
        message: typeof error.message === 'string' ? error.message : 'Unknown error',
        code: typeof error.code === 'string' || typeof error.code === 'number' ? error.code : null,
        details: typeof error.details === 'string' ? error.details : null,
        hint: typeof error.hint === 'string' ? error.hint : null,
    });
}
