import { supabase } from './supabase';
export * from './companyCatalogPricingCore';

export type CompanyCatalogPricingSettings = {
    companyId: string;
    hourlyLaborRate: number | null;
    updatedAt: string | null;
};

export async function loadCompanyCatalogPricingSettings(companyId: string) {
    const { data, error } = await supabase.rpc('get_company_catalog_pricing_settings', {
        p_company_id: companyId,
    });
    if (error) throw error;
    return parseCompanyCatalogPricingSettings(data, companyId);
}

export async function saveCompanyCatalogPricingSettings(companyId: string, hourlyLaborRate: number) {
    if (!Number.isFinite(hourlyLaborRate) || hourlyLaborRate <= 0) {
        throw new Error('Hourly labor rate must be greater than zero.');
    }
    const { data, error } = await supabase.rpc('save_company_catalog_pricing_settings', {
        p_company_id: companyId,
        p_hourly_labor_rate: hourlyLaborRate,
    });
    if (error) throw error;
    return parseCompanyCatalogPricingSettings(data, companyId);
}

function parseCompanyCatalogPricingSettings(value: unknown, companyId: string): CompanyCatalogPricingSettings {
    const row = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    return {
        companyId: text(row.company_id) || companyId,
        hourlyLaborRate: nullableNumber(row.hourly_labor_rate),
        updatedAt: text(row.updated_at) || null,
    };
}

function text(value: unknown) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function nullableNumber(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
