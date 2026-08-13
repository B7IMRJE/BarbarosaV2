export type HomeStoryCount = '1' | '2' | '3' | '4' | '4_plus';

export const HOME_STORY_COUNT_OPTIONS: { value: HomeStoryCount; label: string }[] = [
    { value: '1', label: '1 story' },
    { value: '2', label: '2 stories' },
    { value: '3', label: '3 stories' },
    { value: '4', label: '4 stories' },
    { value: '4_plus', label: '4+ stories' },
];

export function normalizeHomeStoryCount(value: unknown): HomeStoryCount | null {
    const normalized = String(value || '').trim().toLowerCase();

    return HOME_STORY_COUNT_OPTIONS.some((option) => option.value === normalized)
        ? normalized as HomeStoryCount
        : null;
}

export function homeStoryCountLabel(value: unknown) {
    const normalized = normalizeHomeStoryCount(value);

    return HOME_STORY_COUNT_OPTIONS.find((option) => option.value === normalized)?.label || 'Not provided';
}

export function maskGateCode(value?: string | null) {
    const cleanValue = String(value || '').trim();

    return cleanValue ? '•'.repeat(Math.min(Math.max(cleanValue.length, 4), 12)) : '';
}
