import {
    COMPANY_CREDENTIAL_MAX_LENGTH,
    formatCompanyCredential,
    normalizeCompanyCredential,
} from './companyCredential';

assert(formatCompanyCredential(null) === 'License / credential: Missing', 'Blank credentials must be visibly marked missing.');
assert(formatCompanyCredential('72072') === 'License / credential: 72072', 'License numbers must remain visible.');
assert(normalizeCompanyCredential('  Journeyman   Plumber ') === 'Journeyman Plumber', 'Credential whitespace must normalize before saving.');
assert(formatCompanyCredential('  Journeyman   Plumber ') === 'License / credential: Journeyman Plumber', 'Custom credentials must be supported and normalized.');
assert(COMPANY_CREDENTIAL_MAX_LENGTH === 120, 'Credential length limit must remain stable.');

console.log('companyCredential regression checks passed');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
