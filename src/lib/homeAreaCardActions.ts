import {
    buildAreaRow,
    buildStarterRows,
    homeItemDuplicateKey,
    type AreaTemplate,
    type ExistingAreaItem,
    type HomeItemInsert,
} from './areaTemplates';
import { isHomeOSTradeEnabled, tradeKeyForHomeOSSystem } from './homeosTradeCapabilitiesCore';

export type HomeAreaCardActionPlan = {
    areaExists: boolean;
    rowsToInsert: HomeItemInsert[];
    alreadyPresent: number;
    canonicalStarterCount: number;
};

export type HomeAreaDuplicatePlan = HomeAreaCardActionPlan & {
    targetAlreadyExists: boolean;
};

export function canonicalAreaTemplateForTrades(
    template: AreaTemplate,
    enabledTradeKeys: readonly string[],
): AreaTemplate {
    const starterItems = Object.fromEntries(
        Object.entries(template.starterItems)
            .map(([group, items]) => [
                group,
                items.filter((item) => {
                    const tradeKey = tradeKeyForHomeOSSystem(item.system);

                    return Boolean(item.templateKey)
                        && isHomeOSTradeEnabled(enabledTradeKeys, tradeKey);
                }),
            ])
            .filter(([, items]) => (items as unknown[]).length > 0),
    );

    return {
        ...template,
        starterItems,
    };
}

export function planAddMissingAreaCards(input: {
    userId: string;
    propertyId: string;
    areaName: string;
    system: string;
    parentArea?: string;
    template: AreaTemplate;
    existingRows: ExistingAreaItem[];
}): HomeAreaCardActionPlan {
    const parentArea = clean(input.parentArea);
    const areaRow = buildAreaRow(
        input.userId,
        input.propertyId,
        input.areaName,
        input.system,
        parentArea,
    );
    const existingKeys = new Set(input.existingRows.map(homeItemDuplicateKey));
    const areaExists = existingKeys.has(homeItemDuplicateKey(areaRow));
    const canonicalRows = genericStructureRows(buildStarterRows(
        input.userId,
        input.propertyId,
        input.areaName,
        input.template,
        parentArea,
    ));
    const rowsToInsert = canonicalRows.filter((row) => !existingKeys.has(homeItemDuplicateKey(row)));

    return {
        areaExists,
        rowsToInsert,
        alreadyPresent: canonicalRows.length - rowsToInsert.length,
        canonicalStarterCount: canonicalRows.length,
    };
}

export function planDuplicateAreaStructure(input: {
    userId: string;
    propertyId: string;
    sourceAreaName: string;
    targetAreaName: string;
    system: string;
    sourceParentArea?: string;
    targetParentArea?: string;
    template: AreaTemplate;
    existingRows: ExistingAreaItem[];
}): HomeAreaDuplicatePlan {
    const sourceAreaName = clean(input.sourceAreaName);
    const targetAreaName = clean(input.targetAreaName);
    const sourceParentArea = clean(input.sourceParentArea);
    const targetParentArea = clean(input.targetParentArea);
    const existingKeys = new Set(input.existingRows.map(homeItemDuplicateKey));
    const sourceArea = buildAreaRow(
        input.userId,
        input.propertyId,
        sourceAreaName,
        input.system,
        sourceParentArea,
    );
    const targetArea = buildAreaRow(
        input.userId,
        input.propertyId,
        targetAreaName,
        input.system,
        targetParentArea,
    );
    const areaExists = existingKeys.has(homeItemDuplicateKey(sourceArea));
    const targetAlreadyExists = existingKeys.has(homeItemDuplicateKey(targetArea));
    const starterRows = genericStructureRows(buildStarterRows(
        input.userId,
        input.propertyId,
        targetAreaName,
        input.template,
        targetParentArea,
    ));

    return {
        areaExists,
        targetAlreadyExists,
        rowsToInsert: targetAlreadyExists ? [] : [...starterRows, targetArea],
        alreadyPresent: 0,
        canonicalStarterCount: starterRows.length,
    };
}

export function suggestDuplicateAreaName(sourceAreaName: string, existingAreaNames: readonly string[]) {
    const source = clean(sourceAreaName) || 'New Area';
    const used = new Set(existingAreaNames.map(normalize));
    const numberedRoom = source.match(/^(.*?)(?:\s+(\d+))$/);

    if (numberedRoom) {
        const base = clean(numberedRoom[1]);
        let number = Number(numberedRoom[2]) + 1;

        while (used.has(normalize(`${base} ${number}`))) number += 1;

        return `${base} ${number}`;
    }

    const baseCopyName = `${source} Copy`;
    if (!used.has(normalize(baseCopyName))) return baseCopyName;

    let number = 2;
    while (used.has(normalize(`${baseCopyName} ${number}`))) number += 1;
    return `${baseCopyName} ${number}`;
}

export function homeAreaCardActionPreviewNames(plan: HomeAreaCardActionPlan) {
    return plan.rowsToInsert
        .filter((row) => row.category !== 'Area')
        .map((row) => row.name);
}

function genericStructureRows(rows: HomeItemInsert[]) {
    return rows.map((row): HomeItemInsert => ({
        ...row,
        status: 'Missing Information',
        install_state: 'Unknown',
        archived: false,
    }));
}

function clean(value?: string | null) {
    return String(value || '').trim();
}

function normalize(value?: string | null) {
    return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
