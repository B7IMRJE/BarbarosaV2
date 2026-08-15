export type HomeItemProductReferenceAssetKind =
    | 'photo'
    | 'manual'
    | 'warranty'
    | 'specification'
    | 'manufacturer_link'
    | 'document';

export type HomeItemProductReferenceAsset = {
    id: string;
    kind: HomeItemProductReferenceAssetKind;
    title: string;
    url: string;
    bucket: string;
    storagePath: string;
    mimeType: string;
    isImage: boolean;
};

export type HomeItemProductReference = {
    homeItemId: string;
    productName: string;
    category: string;
    productType: string;
    manufacturer: string;
    brand: string;
    model: string;
    manufacturerPartNumber: string;
    finish: string;
    color: string;
    size: string;
    capacity: string;
    description: string;
    specifications: Record<string, string>;
    compatibleParts: string[];
    manufacturerWarranty: string;
    manufacturerReference: string;
    assets: HomeItemProductReferenceAsset[];
};

export function parseHomeItemProductReference(value: unknown): HomeItemProductReference | null {
    const row = record(value);
    const homeItemId = text(row.home_item_id);
    if (!homeItemId) return null;

    const specifications = textRecord(row.specifications);
    const assets = array(row.assets)
        .map(parseAsset)
        .filter((asset): asset is HomeItemProductReferenceAsset => Boolean(asset));

    return {
        homeItemId,
        productName: text(row.product_name),
        category: text(row.category),
        productType: text(row.product_type) || text(row.category),
        manufacturer: text(row.manufacturer),
        brand: text(row.brand),
        model: text(row.model),
        manufacturerPartNumber: text(row.manufacturer_part_number),
        finish: text(row.finish),
        color: text(row.color),
        size: text(row.size),
        capacity: text(row.capacity),
        description: text(row.description),
        specifications,
        compatibleParts: textArray(row.compatible_parts),
        manufacturerWarranty: text(row.manufacturer_warranty),
        manufacturerReference: text(row.manufacturer_reference),
        assets: dedupeAssets(assets),
    };
}

function parseAsset(value: unknown): HomeItemProductReferenceAsset | null {
    const row = record(value);
    const id = text(row.id);
    const url = text(row.url);
    const bucket = text(row.bucket);
    const storagePath = text(row.storage_path);
    if (!id || (!url && (!bucket || !storagePath))) return null;

    const rawKind = text(row.kind);
    const kind: HomeItemProductReferenceAssetKind = [
        'photo',
        'manual',
        'warranty',
        'specification',
        'manufacturer_link',
    ].includes(rawKind)
        ? rawKind as HomeItemProductReferenceAssetKind
        : 'document';
    const mimeType = text(row.mime_type);

    return {
        id,
        kind,
        title: text(row.title) || assetKindLabel(kind),
        url,
        bucket,
        storagePath,
        mimeType,
        isImage: kind === 'photo' || mimeType.startsWith('image/'),
    };
}

function dedupeAssets(assets: HomeItemProductReferenceAsset[]) {
    const seen = new Set<string>();

    return assets.filter((asset) => {
        const key = asset.url || `${asset.bucket}/${asset.storagePath}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function assetKindLabel(kind: HomeItemProductReferenceAssetKind) {
    return ({
        photo: 'Product image',
        manual: 'Manufacturer manual',
        warranty: 'Warranty document',
        specification: 'Specification sheet',
        manufacturer_link: 'Manufacturer page',
        document: 'Product document',
    } as const)[kind];
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function array(value: unknown) { return Array.isArray(value) ? value : []; }
function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }
function textArray(value: unknown) { return array(value).map(text).filter(Boolean); }
function textRecord(value: unknown) {
    return Object.entries(record(value)).reduce<Record<string, string>>((result, [key, entry]) => {
        const cleanKey = key.trim();
        const cleanValue = typeof entry === 'string'
            ? entry.trim()
            : entry === null || entry === undefined
                ? ''
                : JSON.stringify(entry);
        if (cleanKey && cleanValue) result[cleanKey] = cleanValue;
        return result;
    }, {});
}
