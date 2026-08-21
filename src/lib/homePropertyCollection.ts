import { listActivePropertyMemberships } from './activeProperty';
import {
    formatPropertyCollectionTitle,
    formatPropertySummaryAddress,
} from './homePropertyCollectionPresentation';
import { supabase } from './supabase';

export {
    formatPropertyCollectionTitle,
    formatPropertySummaryAddress,
} from './homePropertyCollectionPresentation';

type PropertySummaryRow = {
    id?: string | null;
    name?: string | null;
    property_type?: string | null;
    address?: string | null;
    address_line_1?: string | null;
    address_line_2?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    postal_code?: string | null;
    country_code?: string | null;
    formatted_address?: string | null;
};

export type HomePropertySummary = {
    propertyId: string;
    name: string;
    address: string;
    propertyType: string;
    membershipRole: string;
    isSelected: boolean;
};

export type HomePropertyCollection = {
    title: string;
    properties: HomePropertySummary[];
    selectedPropertyId: string | null;
};

export async function loadHomePropertyCollection(): Promise<HomePropertyCollection> {
    const { userId, memberships, selectedPropertyId } = await listActivePropertyMemberships();
    const propertyIds = memberships.map((membership) => membership.propertyId);

    const [profileResult, propertyResult] = await Promise.all([
        supabase
            .from('profiles')
            .select('full_name')
            .eq('id', userId)
            .maybeSingle(),
        propertyIds.length
            ? supabase
                .from('properties')
                .select('id, name, property_type, address, address_line_1, address_line_2, city, state, zip, postal_code, country_code, formatted_address')
                .in('id', propertyIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    if (propertyResult.error) {
        throw new Error(`Could not load your properties: ${propertyResult.error.message}`);
    }

    const propertyById = new Map(
        ((propertyResult.data || []) as PropertySummaryRow[])
            .map((row) => [String(row.id || '').trim(), row] as const)
            .filter(([propertyId]) => Boolean(propertyId))
    );
    const properties = memberships
        .map((membership): HomePropertySummary | null => {
            const row = propertyById.get(membership.propertyId);

            if (!row) return null;

            return {
                propertyId: membership.propertyId,
                name: String(row.name || '').trim() || 'Home',
                address: formatPropertySummaryAddress(row),
                propertyType: String(row.property_type || '').trim() || 'OTHER',
                membershipRole: membership.membershipRole,
                isSelected: membership.propertyId === selectedPropertyId,
            };
        })
        .filter((property): property is HomePropertySummary => Boolean(property));

    return {
        title: formatPropertyCollectionTitle(profileResult.data?.full_name),
        properties,
        selectedPropertyId,
    };
}
