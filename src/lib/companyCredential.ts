export const COMPANY_CREDENTIAL_MAX_LENGTH = 120;

export function normalizeCompanyCredential(value?: string | null) {
    return String(value || '').trim().replace(/\s+/g, ' ');
}

export function formatCompanyCredential(value?: string | null) {
    const credential = normalizeCompanyCredential(value);

    return credential
        ? `License / credential: ${credential}`
        : 'License / credential: Missing';
}
