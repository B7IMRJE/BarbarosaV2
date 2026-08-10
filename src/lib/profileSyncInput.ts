export function cleanOptionalProfileText(value: string | null | undefined) {
    const cleanValue = String(value || '').trim();
    return cleanValue || null;
}
