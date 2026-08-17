import type { ApprovedMasterCatalogItem, CompanyCatalogOffering } from './catalogFactory';

export type CompanyCatalogMarkupMode = 'amount' | 'percent';

export function normalizeCompanyCatalogMarkupMode(value: unknown): CompanyCatalogMarkupMode {
    return value === 'percent' ? 'percent' : 'amount';
}

export function calculateCompanyCatalogLaborAmount(laborHours: number | null, hourlyLaborRate: number | null) {
    if (laborHours === null || hourlyLaborRate === null) return null;
    if (!Number.isFinite(laborHours) || laborHours < 0 || !Number.isFinite(hourlyLaborRate) || hourlyLaborRate <= 0) return null;
    return roundCurrency(laborHours * hourlyLaborRate);
}

export function calculateCompanyCatalogMarkupAmount(materialCost: number | null, markup: number | null, mode: CompanyCatalogMarkupMode) {
    if (markup === null || !Number.isFinite(markup) || markup < 0) return null;
    if (mode === 'amount') return roundCurrency(markup);
    if (materialCost === null || !Number.isFinite(materialCost) || materialCost < 0) return null;
    return roundCurrency(materialCost * (markup / 100));
}

export function splitCompanyCatalogMasterItems(items: ApprovedMasterCatalogItem[]) {
    return {
        companyOfferings: items.filter((item) => Boolean(item.offering)),
        availableMasterProducts: items.filter((item) => !item.offering),
    };
}

export function calculateCompanyCatalogMinimum(offering: CompanyCatalogOffering, hourlyLaborRate: number | null) {
    const markupAmount = calculateCompanyCatalogMarkupAmount(offering.materialCost, offering.markup, offering.markupMode);
    const laborAmount = calculateCompanyCatalogLaborAmount(offering.laborHours, hourlyLaborRate) ?? offering.laborAmount;
    if (offering.laborHours !== null && laborAmount === null) return null;
    if (offering.materialCost === null && markupAmount === null && laborAmount === null) return null;
    return roundCurrency((offering.materialCost || 0) + (markupAmount || 0) + (laborAmount || 0));
}

function roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
