export type JobReturnHandoffMaterial = {
    name: string;
};

export type JobReturnHandoffReadinessInput = {
    workSummary: string;
    remainingWork: string;
    scheduledFor: string;
    materials: JobReturnHandoffMaterial[];
    noMaterialsNeeded: boolean;
    mediaCount: number;
};

export function parseJobReturnHandoffMaterials(value: string): JobReturnHandoffMaterial[] {
    const seen = new Set<string>();
    const materials: JobReturnHandoffMaterial[] = [];

    value
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
        .filter(Boolean)
        .forEach((name) => {
            const key = name.toLowerCase();

            if (seen.has(key)) return;

            seen.add(key);
            materials.push({ name });
        });

    return materials;
}

export function isJobReturnHandoffReady(input: JobReturnHandoffReadinessInput) {
    return Boolean(
        input.workSummary.trim() &&
        input.remainingWork.trim() &&
        input.scheduledFor.trim() &&
        (input.noMaterialsNeeded || input.materials.length > 0) &&
        input.mediaCount > 0
    );
}
