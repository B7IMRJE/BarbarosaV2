export function nextHomeItemInstanceName(name: string, existingNames: readonly (string | null | undefined)[]) {
    const normalizedExisting = new Set(existingNames.map(normalizeInstanceName).filter(Boolean));
    const cleanedName = cleanText(name) || 'Item';
    const baseName = cleanedName.replace(/\s+(?:#\s*)?\d+$/i, '').trim() || cleanedName;

    for (let instance = 2; instance < 10_000; instance += 1) {
        const candidate = `${baseName} ${instance}`;
        if (!normalizedExisting.has(normalizeInstanceName(candidate))) return candidate;
    }

    return `${baseName} ${Date.now()}`;
}

function normalizeInstanceName(value: unknown) {
    return cleanText(value).toLowerCase().replace(/\s+/g, ' ');
}

function cleanText(value: unknown) {
    return String(value || '').trim();
}
