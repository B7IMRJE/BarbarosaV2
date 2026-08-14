export const CATALOG_STATUSES = ['draft', 'needs_review', 'approved', 'rejected', 'archived'] as const;

export type CatalogStatus = (typeof CATALOG_STATUSES)[number];

export type CatalogTemplateDefinition = {
    id: string;
    templateKey: string;
    categoryName: string;
    description: string;
    universalFields: CatalogTemplateField[];
    specificationFields: CatalogTemplateField[];
    requiredFields: string[];
    status: CatalogStatus;
};

export type CatalogTemplateField = {
    key: string;
    label: string;
    type?: string;
};

export type CatalogImportRow = Record<string, unknown> & {
    category?: string;
    manufacturer?: string;
    brand?: string;
    family_name?: string;
    model_number?: string;
    manufacturer_part_number?: string;
    upc_gtin?: string;
    specifications?: Record<string, unknown>;
};

export type CatalogImportPreviewRow = {
    rowNumber: number;
    row: CatalogImportRow;
    errors: string[];
    warnings: string[];
    duplicateMatches: CatalogDuplicateMatch[];
};

export type CatalogDuplicateMatch = {
    id: string;
    matchReason: string;
    label: string;
    status: CatalogStatus;
};

const UNIVERSAL_REQUIRED_FIELDS = ['category', 'manufacturer', 'brand', 'family_name', 'model_number'] as const;

export function parseCatalogImportText(text: string, format: 'json' | 'csv'): CatalogImportRow[] {
    if (!text.trim()) throw new Error('The selected import file is empty.');
    if (format === 'json') {
        const parsed = JSON.parse(text) as unknown;
        const rows = Array.isArray(parsed)
            ? parsed
            : isRecord(parsed) && Array.isArray(parsed.products)
                ? parsed.products
                : isRecord(parsed) && Array.isArray(parsed.rows)
                    ? parsed.rows
                    : null;
        if (!rows) throw new Error('JSON must be an array or contain a products or rows array.');
        return rows.map((row, index) => {
            if (!isRecord(row)) throw new Error(`JSON row ${index + 1} must be an object.`);
            return normalizeImportRow(row);
        });
    }
    const matrix = parseCsv(text);
    if (matrix.length < 2) throw new Error('CSV must include a header and at least one product row.');
    const headers = matrix[0].map((header) => normalizeHeader(header));
    return matrix.slice(1)
        .filter((cells) => cells.some((value) => value.trim()))
        .map((cells) => normalizeImportRow(headers.reduce<Record<string, unknown>>((row, header, index) => {
            if (!header) return row;
            row[header] = parseCsvCell(cells[index] || '');
            return row;
        }, {})));
}

export function validateCatalogImportRows(
    rows: CatalogImportRow[],
    templates: CatalogTemplateDefinition[]
): CatalogImportPreviewRow[] {
    return rows.map((row, index) => {
        const errors: string[] = [];
        const warnings: string[] = [];
        UNIVERSAL_REQUIRED_FIELDS.forEach((field) => {
            if (!cleanText(row[field])) errors.push(`${fieldLabel(field)} is required.`);
        });
        const category = cleanText(row.category).toLowerCase();
        const template = templates.find((candidate) =>
            candidate.status === 'approved'
            && (candidate.templateKey.toLowerCase() === category || candidate.categoryName.toLowerCase() === category)
        );
        if (category && !template) errors.push('An approved category template is required.');
        const specifications = isRecord(row.specifications) ? row.specifications : {};
        if (row.specifications != null && !isRecord(row.specifications)) errors.push('Specifications must be a JSON object.');
        template?.requiredFields.forEach((field) => {
            if (!cleanText(row[field]) && !cleanText(specifications[field])) {
                errors.push(`Missing required field: ${field}.`);
            }
        });
        if (!cleanText(row.upc_gtin) && !cleanText(row.manufacturer_part_number)) {
            warnings.push('UPC/GTIN and manufacturer part number are both missing.');
        }
        if (!cleanText(row.primary_image_url)) warnings.push('Primary image source URL is missing.');
        return { rowNumber: index + 1, row, errors, warnings, duplicateMatches: [] };
    });
}

export function canBulkApproveCatalogRecord(record: {
    status: CatalogStatus;
    validationWarnings: string[];
    duplicateWarnings: string[];
    missingFields: string[];
}) {
    return (
        (record.status === 'draft' || record.status === 'needs_review')
        && record.validationWarnings.length === 0
        && record.duplicateWarnings.length === 0
        && record.missingFields.length === 0
    );
}

export function normalizeCatalogIdentifier(value: unknown) {
    const normalized = cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalized || null;
}

function normalizeImportRow(input: Record<string, unknown>): CatalogImportRow {
    const row: CatalogImportRow = {};
    const specifications: Record<string, unknown> = isRecord(input.specifications) ? { ...input.specifications } : {};
    Object.entries(input).forEach(([rawKey, rawValue]) => {
        const key = normalizeHeader(rawKey);
        if (!key) return;
        if (key.startsWith('specifications.')) {
            specifications[key.slice('specifications.'.length)] = rawValue;
            return;
        }
        row[key] = rawValue;
    });
    row.category = aliasText(row.category, row.product_category);
    row.family_name = aliasText(row.family_name, row.family, row.product_family);
    row.model_number = aliasText(row.model_number, row.model);
    row.manufacturer_part_number = aliasText(row.manufacturer_part_number, row.mpn, row.part_number);
    row.upc_gtin = aliasText(row.upc_gtin, row.upc, row.gtin);
    row.specifications = specifications;
    return row;
}

function parseCsv(text: string) {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const next = text[index + 1];
        if (character === '"') {
            if (quoted && next === '"') {
                cell += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === ',' && !quoted) {
            row.push(cell);
            cell = '';
        } else if ((character === '\n' || character === '\r') && !quoted) {
            if (character === '\r' && next === '\n') index += 1;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += character;
        }
    }
    if (quoted) throw new Error('CSV contains an unterminated quoted value.');
    if (cell.length || row.length) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}

function parseCsvCell(value: string): unknown {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try { return JSON.parse(trimmed) as unknown; } catch { return trimmed; }
    }
    return trimmed;
}

function normalizeHeader(value: string) {
    return value.trim().toLowerCase().replace(/[\s/-]+/g, '_').replace(/[^a-z0-9_.]/g, '');
}

function aliasText(...values: unknown[]) {
    return values.map(cleanText).find(Boolean) || '';
}

function cleanText(value: unknown) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function fieldLabel(field: string) {
    return field.replaceAll('_', ' ').replace(/^./, (value) => value.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, any> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
