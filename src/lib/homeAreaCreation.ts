import {
    buildAreaRow,
    buildStarterRows,
    existingDuplicateKeys,
    homeItemDuplicateKey,
    type AreaTemplate,
    type ExistingAreaItem,
    type HomeItemInsert,
} from './areaTemplates';
import { resolveHomeItemAreaHierarchyProjection } from './homeItemHierarchyProjection';

export type HomeAreaCreationStage = 'access' | 'existing_items' | 'create';

export type HomeAreaCreationWriteSummary = {
    created: number;
    skipped: number;
};

export type ActivePropertyMemberForHomeArea = {
    user_id?: string | null;
    role?: string | null;
    created_at?: string | null;
    id?: string | null;
};

export class HomeAreaCreationTimeoutError extends Error {
    stage: HomeAreaCreationStage;

    constructor(stage: HomeAreaCreationStage) {
        super(stage === 'access'
            ? 'Company and home access confirmation took too long.'
            : stage === 'existing_items'
                ? 'Checking the existing HomeOS areas took too long.'
                : 'Creating the HomeOS area took too long.'
        );
        this.stage = stage;
    }
}

export async function withHomeAreaCreationTimeout<T>(
    operation: PromiseLike<T>,
    stage: HomeAreaCreationStage,
    timeoutMs = 15_000
): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
        return await Promise.race([
            Promise.resolve(operation),
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new HomeAreaCreationTimeoutError(stage)), timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

export function getHomeAreaCreationErrorMessage(error: unknown) {
    if (error instanceof HomeAreaCreationTimeoutError) {
        return `${error.message} Check your connection, then try again. Existing records will be reused safely.`;
    }

    const message = String((error as { message?: unknown } | null)?.message || '').trim();

    if (isHomeAreaDuplicateWriteError(error)) {
        return 'Those HomeOS records already exist in this area. Try again to reuse the area and fill only anything still missing.';
    }

    return message || 'The HomeOS area could not be created. Check your connection and try again.';
}

export function orderHomeAreaCreationRows(rows: HomeItemInsert[]) {
    const componentSlugs = new Set(
        resolveHomeItemAreaHierarchyProjection(rows)
            .flatMap((entry) => entry.components)
            .map((row) => String(row.item_slug || '').trim())
            .filter(Boolean)
    );

    return [...rows].sort((left, right) => {
        const leftRank = homeAreaCreationRowRank(left, componentSlugs);
        const rightRank = homeAreaCreationRowRank(right, componentSlugs);

        return leftRank - rightRank;
    });
}

function homeAreaCreationRowRank(row: HomeItemInsert, componentSlugs: ReadonlySet<string>) {
    if (row.category === 'Area') return 2;
    return componentSlugs.has(String(row.item_slug || '').trim()) ? 1 : 0;
}

export function isHomeAreaDuplicateWriteError(error: unknown) {
    const candidate = error as { code?: unknown; message?: unknown } | null;
    const code = String(candidate?.code || '').trim();
    const message = String(candidate?.message || '').toLowerCase();

    return code === '23505'
        || message.includes('home_items_property_placement_identity_key')
        || message.includes('home_items_property_placement_slug_key')
        || message.includes('home_items_property_id_item_slug_key')
        || message.includes('already exists in this location')
        || message.includes('open the existing card instead of creating a duplicate');
}

export function formatHomeAreaCreationSummary(summary: HomeAreaCreationWriteSummary) {
    const createdLabel = `${summary.created} new item${summary.created === 1 ? '' : 's'}`;

    if (summary.skipped === 0) return `Created ${createdLabel}.`;

    const skippedLabel = `${summary.skipped} existing item${summary.skipped === 1 ? '' : 's'} safely skipped`;

    return summary.created > 0
        ? `Created ${createdLabel}; ${skippedLabel}.`
        : `No duplicates were created; ${skippedLabel}.`;
}

export function pickHomeAreaRecordOwnerUserId(rows: ActivePropertyMemberForHomeArea[]) {
    return [...rows]
        .filter((row) => String(row.user_id || '').trim())
        .sort((left, right) => {
            const roleDifference = homeAreaOwnerRoleRank(left.role) - homeAreaOwnerRoleRank(right.role);

            if (roleDifference !== 0) return roleDifference;

            const createdDifference = String(left.created_at || '').localeCompare(String(right.created_at || ''));

            return createdDifference || String(left.id || '').localeCompare(String(right.id || ''));
        })[0]?.user_id?.trim() || '';
}

export function planHomeAreaCreation(input: {
    userId: string;
    propertyId: string;
    areaName: string;
    system: string;
    parentArea?: string;
    template: AreaTemplate;
    includeStarterItems: boolean;
    existingRows: ExistingAreaItem[];
}) {
    const parentArea = String(input.parentArea || '').trim();
    const areaRow = buildAreaRow(input.userId, input.propertyId, input.areaName, input.system, parentArea);
    const existingKeys = existingDuplicateKeys(input.existingRows);
    const areaKey = homeItemDuplicateKey(areaRow);
    const duplicateAreaExists = existingKeys.has(areaKey);
    const rowsToInsert: HomeItemInsert[] = [];

    if (!duplicateAreaExists) {
        rowsToInsert.push(areaRow);
        existingKeys.add(areaKey);
    }

    if (input.includeStarterItems && input.template.id !== 'custom-area') {
        for (const row of buildStarterRows(
            input.userId,
            input.propertyId,
            input.areaName,
            input.template,
            parentArea
        )) {
            const key = homeItemDuplicateKey(row);

            if (!existingKeys.has(key)) {
                rowsToInsert.push(row);
                existingKeys.add(key);
            }
        }
    }

    return {
        duplicateAreaExists,
        rowsToInsert,
    };
}

function homeAreaOwnerRoleRank(role?: string | null) {
    switch (String(role || '').trim().toLowerCase()) {
        case 'owner': return 0;
        case 'homeowner': return 1;
        case 'primary': return 2;
        default: return 3;
    }
}
