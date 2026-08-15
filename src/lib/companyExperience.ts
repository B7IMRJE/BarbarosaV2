export const COMPANY_COMBINED_EXPERIENCE_MAX = 999;

export function getValidCombinedExperienceYears(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : Number(String(value ?? '').trim());

    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > COMPANY_COMBINED_EXPERIENCE_MAX) {
        return null;
    }

    return parsed;
}

export function formatCombinedExperience(value: unknown): string | null {
    const years = getValidCombinedExperienceYears(value);

    return years === null ? null : `${years}+ combined years`;
}

export function normalizeCombinedExperienceInput(value: string) {
    return value.replace(/\D/g, '').slice(0, String(COMPANY_COMBINED_EXPERIENCE_MAX).length);
}
