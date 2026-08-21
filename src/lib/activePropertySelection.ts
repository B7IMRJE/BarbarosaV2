export function resolveSelectedActivePropertyId(
    memberships: readonly { propertyId: string }[],
    storedPropertyId?: string | null
) {
    const cleanStoredPropertyId = String(storedPropertyId || '').trim();

    if (cleanStoredPropertyId && memberships.some((membership) => membership.propertyId === cleanStoredPropertyId)) {
        return cleanStoredPropertyId;
    }

    return memberships[0]?.propertyId || '';
}
