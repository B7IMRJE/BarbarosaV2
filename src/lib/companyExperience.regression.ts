import {
    COMPANY_COMBINED_EXPERIENCE_MAX,
    formatCombinedExperience,
    getValidCombinedExperienceYears,
    normalizeCombinedExperienceInput,
} from './companyExperience';

runCompanyExperienceRegressions();

export function runCompanyExperienceRegressions() {
    assert(formatCombinedExperience(90) === '90+ combined years', 'A stored combined value must be labeled as combined experience.');
    assert(formatCombinedExperience(null) === null, 'Missing experience must remain hidden.');
    assert(formatCombinedExperience(0) === null, 'Zero experience must remain hidden.');
    assert(formatCombinedExperience(-5) === null, 'Negative experience must remain hidden.');
    assert(formatCombinedExperience(Number.NaN) === null, 'NaN experience must remain hidden.');
    assert(formatCombinedExperience(COMPANY_COMBINED_EXPERIENCE_MAX + 1) === null, 'Out-of-range experience must remain hidden.');
    assert(getValidCombinedExperienceYears('14') === 14, 'A valid saved integer must remain available.');
    assert(normalizeCombinedExperienceInput('9x0 years') === '90', 'The company profile form must strip invalid characters.');
}

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`Company experience regression failed: ${message}`);
    }
}
