import type {
    EstimateApprovedProduct,
    EstimateProductTier,
} from './estimateOptions';
import { supabase } from './supabase';

export async function loadCompanyApprovedProducts(companyId: string): Promise<EstimateApprovedProduct[]> {
    const { data, error } = await supabase.rpc('get_company_approved_products', {
        p_company_id: companyId,
    });

    if (error) throw error;

    return Array.isArray(data)
        ? data.map(mapApprovedProductRecord).filter((product): product is EstimateApprovedProduct => Boolean(product))
        : [];
}

export function mapApprovedProductRecord(value: unknown): EstimateApprovedProduct | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const record = value as Record<string, unknown>;
    const id = readText(record.id);
    const companyId = readText(record.company_id);
    const category = readText(record.category);
    const brand = readText(record.brand);
    const model = readText(record.model);

    if (!id || !companyId || !category || !brand || !model) return null;

    return {
        id,
        companyId,
        category,
        brand,
        model,
        tier: readProductTier(record.tier),
        internalProductCost: null,
        approvedSellingPrice: readNullableNumber(record.approved_selling_price),
        priceBookEntryId: readNullableText(record.price_book_item_id),
        minimumSellingPrice: readNullableNumber(record.minimum_selling_price),
        maximumSellingPrice: readNullableNumber(record.maximum_selling_price),
        mainMedia: null,
        additionalMedia: [],
        specifications: readTextRecord(record.product_specifications),
        compatibleApplications: readTextArray(record.compatible_applications),
        requiredAccessoryIds: readTextArray(record.required_accessory_ids),
        installationRequirements: readTextArray(record.installation_requirements),
        warranty: readNullableText(record.warranty),
        extendedWarrantyEligible: record.extended_warranty_eligible === true,
        availabilityNote: readNullableText(record.availability_note),
        manufacturerReference: readNullableText(record.manufacturer_reference),
        companyNotes: null,
        approved: record.approved === true,
        active: record.active === true,
    };
}

function readProductTier(value: unknown): EstimateProductTier {
    const tier = readText(value);

    return tier === 'Essential' || tier === 'Premium' ? tier : 'Professional';
}

function readTextRecord(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.entries(value).reduce<Record<string, string>>((result, [key, entry]) => {
        const text = readText(entry);

        if (text) result[key] = text;

        return result;
    }, {});
}

function readTextArray(value: unknown) {
    return Array.isArray(value) ? value.map(readText).filter(Boolean) : [];
}

function readNullableNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return null;

    const number = Number(value);

    return Number.isFinite(number) ? number : null;
}

function readNullableText(value: unknown) {
    const valueText = readText(value);

    return valueText || null;
}

function readText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}
