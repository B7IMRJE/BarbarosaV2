export type CompanyPayBasis = 'hourly' | 'salaried';

export function normalizeCompanyPayBasis(value?: string | null): CompanyPayBasis {
    return String(value || '').trim().toLowerCase() === 'salaried' ? 'salaried' : 'hourly';
}

export function isCompanyClockRequired(payBasis?: string | null) {
    return normalizeCompanyPayBasis(payBasis) === 'hourly';
}

export function getCompanyPayBasisLabel(payBasis?: string | null) {
    return normalizeCompanyPayBasis(payBasis) === 'salaried' ? 'Salaried' : 'Hourly';
}
