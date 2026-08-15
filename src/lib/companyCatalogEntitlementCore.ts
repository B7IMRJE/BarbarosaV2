export const COMPANY_CATALOG_PACKAGE_TIERS = ['curated_10', 'curated_20', 'full'] as const;

export type CompanyCatalogPackageTier = (typeof COMPANY_CATALOG_PACKAGE_TIERS)[number];

export type CompanyCatalogEntitlement = {
    companyId: string;
    active: boolean;
    packageTier: CompanyCatalogPackageTier;
    selectionMode: 'package' | 'custom' | 'full';
    selectedVariantIds: string[];
    selectedCount: number;
    assignedCount: number;
    availableCount: number;
    updatedAt: string | null;
};

export type CompanyCatalogEntitlementDraft = Pick<
    CompanyCatalogEntitlement,
    'active' | 'packageTier' | 'selectedVariantIds'
>;

export function parseCompanyCatalogEntitlement(value: unknown): CompanyCatalogEntitlement | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const row = value as Record<string, unknown>;
    const companyId = text(row.company_id);
    if (!companyId) return null;

    const packageTier = readPackageTier(row.package_tier);
    const rawSelectionMode = text(row.selection_mode);
    const selectionMode = packageTier === 'full'
        ? rawSelectionMode === 'custom' ? 'custom' : 'full'
        : rawSelectionMode === 'custom' ? 'custom' : 'package';
    const selectedVariantIds = uniqueTextArray(row.selected_variant_ids);

    return {
        companyId,
        active: row.active === true,
        packageTier,
        selectionMode,
        selectedVariantIds,
        selectedCount: nonnegativeInteger(row.selected_count, selectedVariantIds.length),
        assignedCount: nonnegativeInteger(row.assigned_count, 0),
        availableCount: nonnegativeInteger(row.available_count, 0),
        updatedAt: nullableText(row.updated_at),
    };
}

export function companyCatalogPackageLimit(packageTier: CompanyCatalogPackageTier) {
    if (packageTier === 'curated_10') return 10;
    if (packageTier === 'curated_20') return 20;
    return null;
}

export function companyCatalogPackageLabel(packageTier: CompanyCatalogPackageTier) {
    if (packageTier === 'curated_10') return 'Curated 10';
    if (packageTier === 'curated_20') return 'Curated 20';
    return 'Full Master Catalog';
}

export function validateCompanyCatalogEntitlementDraft(draft: CompanyCatalogEntitlementDraft) {
    const selectedVariantIds = uniqueTextArray(draft.selectedVariantIds);
    const limit = companyCatalogPackageLimit(draft.packageTier);

    if (limit !== null && selectedVariantIds.length > limit) {
        return `${companyCatalogPackageLabel(draft.packageTier)} allows up to ${limit} master cards.`;
    }
    if (draft.active && limit !== null && selectedVariantIds.length === 0) {
        return `Choose at least one master card before activating ${companyCatalogPackageLabel(draft.packageTier)}.`;
    }

    return '';
}

export function toggleCompanyCatalogSelection(
    selectedVariantIds: string[],
    variantId: string,
    packageTier: CompanyCatalogPackageTier,
) {
    const selected = uniqueTextArray(selectedVariantIds);
    const normalizedVariantId = variantId.trim();
    if (!normalizedVariantId || packageTier === 'full') return selected;

    if (selected.includes(normalizedVariantId)) {
        return selected.filter((id) => id !== normalizedVariantId);
    }

    const limit = companyCatalogPackageLimit(packageTier);
    return limit !== null && selected.length >= limit
        ? selected
        : [...selected, normalizedVariantId];
}

function readPackageTier(value: unknown): CompanyCatalogPackageTier {
    const tier = text(value);
    return tier === 'curated_10' || tier === 'curated_20' ? tier : 'full';
}

function uniqueTextArray(value: unknown) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.map(text).filter(Boolean)));
}

function nonnegativeInteger(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function nullableText(value: unknown) {
    return text(value) || null;
}

function text(value: unknown) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}
