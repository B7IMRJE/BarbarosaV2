export type CompanyIdentity = {
    display_name?: string | null;
    dba_name?: string | null;
    legal_name?: string | null;
    public_name?: string | null;
    name?: string | null;
};

export type CompanyIdentityPresentation = {
    publicName: string;
    legalName: string | null;
};

const COMPANY_SUFFIXES: Record<string, string> = {
    co: 'Co.',
    'co.': 'Co.',
    corp: 'Corp.',
    'corp.': 'Corp.',
    dba: 'DBA',
    inc: 'Inc.',
    'inc.': 'Inc.',
    llc: 'LLC',
    llp: 'LLP',
    lp: 'LP',
    pc: 'PC',
    pllc: 'PLLC',
};

/**
 * Operational screens use the customer-facing name. Administration screens can
 * use the presentation helper to show the distinct legal name underneath it.
 */
export function getCompanyDisplayName(
    company: CompanyIdentity | null | undefined,
    fallback = 'Company',
) {
    return getCompanyIdentityPresentation(company, fallback).publicName;
}

export function getCompanyIdentityPresentation(
    company: CompanyIdentity | null | undefined,
    fallback = 'Company',
): CompanyIdentityPresentation {
    const explicitPublicValue = firstCompanyName(company?.display_name, company?.dba_name);
    const publicValue = firstCompanyName(
        explicitPublicValue,
        company?.public_name,
        company?.name,
        company?.legal_name,
    );
    const publicName = formatCompanyName(publicValue, fallback);
    const distinctLegacyLegalName = explicitPublicValue && company?.public_name &&
        normalizeCompanyName(company.public_name) !== normalizeCompanyName(explicitPublicValue)
        ? company.public_name
        : null;
    const legalValue = firstCompanyName(company?.legal_name, distinctLegacyLegalName, company?.name);
    const formattedLegalName = legalValue ? formatCompanyName(legalValue) : '';
    const legalName = formattedLegalName && normalizeCompanyName(formattedLegalName) !== normalizeCompanyName(publicName)
        ? formattedLegalName
        : null;

    return { publicName, legalName };
}

export function formatCompanyName(value?: string | null, fallback = '') {
    const normalized = String(value || '').trim().replace(/\s+/g, ' ');

    if (!normalized) return fallback;

    return normalized
        .split(' ')
        .map((word) => formatCompanyNameWord(word))
        .join(' ');
}

export function normalizeCompanyName(value?: string | null) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function firstCompanyName(...values: (string | null | undefined)[]) {
    return values.map((value) => String(value || '').trim()).find(Boolean) || '';
}

function formatCompanyNameWord(value: string) {
    const suffix = COMPANY_SUFFIXES[value.toLowerCase()];
    if (suffix) return suffix;
    if (/[A-Z]/.test(value.slice(1)) || /^[A-Z0-9&]{2,6}$/.test(value)) return value;

    return value
        .split(/([-'])/)
        .map((part) => {
            if (part === '-' || part === "'") return part;
            if (!part) return part;
            return part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase();
        })
        .join('');
}
