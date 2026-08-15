import {
    formatCompanyName,
    getCompanyDisplayName,
    getCompanyIdentityPresentation,
    normalizeCompanyName,
} from './companyDisplayName';

runCompanyDisplayNameRegressions();

export function runCompanyDisplayNameRegressions() {
    prefersPublicBrandWithoutLosingLegalIdentity();
    formatsDisplayNamesWithoutMutatingSourceData();
    omitsDuplicateLegalNames();
    preservesExistingMixedCaseBrands();
}

function prefersPublicBrandWithoutLosingLegalIdentity() {
    const company = {
        dba_name: 'Repipe1',
        public_name: 'ultimate builders inc',
        name: 'Repipe 1',
    };
    const identity = getCompanyIdentityPresentation(company);

    assert(identity.publicName === 'Repipe1', 'The DBA must be the primary public company name.');
    assert(identity.legalName === 'Ultimate Builders Inc.', 'The legal company name must remain available separately.');
    assert(getCompanyDisplayName(company) === identity.publicName, 'Every operational company name must use the canonical identity helper.');
}

function formatsDisplayNamesWithoutMutatingSourceData() {
    const source = 'ultimate builders inc';

    assert(formatCompanyName(source) === 'Ultimate Builders Inc.', 'Lowercase legal names must be title cased for display.');
    assert(source === 'ultimate builders inc', 'Display formatting must never mutate the stored company name.');
}

function omitsDuplicateLegalNames() {
    const identity = getCompanyIdentityPresentation({ dba_name: 'Bravo Plumbing', name: 'bravo plumbing' });

    assert(identity.legalName === null, 'Equivalent public and legal names must not be displayed twice.');
    assert(normalizeCompanyName('Bravo Plumbing, Inc.') === 'bravo plumbing inc', 'Company comparisons must ignore punctuation and case.');
}

function preservesExistingMixedCaseBrands() {
    assert(formatCompanyName('HomeOS Plumbing LLC') === 'HomeOS Plumbing LLC', 'Mixed-case product and company brands must remain intact.');
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Company display name regression failed: ${message}`);
    }
}
