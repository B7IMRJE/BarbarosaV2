import {
    canBulkApproveCatalogRecord,
    normalizeCatalogIdentifier,
    parseCatalogImportText,
    validateCatalogImportRows,
    type CatalogTemplateDefinition,
} from './catalogFactoryCore.ts';

const templates: CatalogTemplateDefinition[] = [{
    id: 'template-1',
    templateKey: 'water_heater',
    categoryName: 'Water Heater',
    description: '',
    universalFields: [],
    specificationFields: [{ key: 'fuel_type', label: 'Fuel type' }],
    requiredFields: ['fuel_type'],
    status: 'approved',
}];

const csv = [
    'category,manufacturer,brand,family_name,model_number,manufacturer_part_number,upc,primary_image_url,specifications.fuel_type',
    'water_heater,A. O. Smith,A. O. Smith,Signature 100,XCR-40,100227527,671657252277,https://example.test/water-heater.jpg,Natural Gas',
    'water_heater,"Bradford, White",Bradford White,Defender,RG240T6N,,123456789012,,Natural Gas',
].join('\n');

const rows = parseCatalogImportText(csv, 'csv');
assert(rows.length === 2, 'CSV imports should return every product row.');
assert(rows[0].upc_gtin === '671657252277', 'UPC should normalize to upc_gtin.');
assert(rows[1].manufacturer === 'Bradford, White', 'Quoted CSV commas should remain in one cell.');
assert(rows[0].specifications?.fuel_type === 'Natural Gas', 'Dotted specification headers should create specification values.');

const preview = validateCatalogImportRows(rows, templates);
assert(preview[0].errors.length === 0, 'Complete rows should pass validation.');
assert(preview[0].warnings.length === 0, 'Complete rows should not produce warnings.');
assert(preview[1].errors.length === 0, 'A missing image should be a warning rather than a validation error.');
assert(preview[1].warnings[0] === 'Primary image source URL is missing.', 'Missing image warning should be explicit.');

const jsonRows = parseCatalogImportText(JSON.stringify({ products: [{
    category: 'water_heater',
    manufacturer: 'Rheem',
    brand: 'Rheem',
    family: 'Performance',
    model: 'XG40T06EC36U1',
    specifications: { fuel_type: 'Natural Gas' },
}] }), 'json');
assert(jsonRows[0].family_name === 'Performance', 'JSON family aliases should normalize.');
assert(jsonRows[0].model_number === 'XG40T06EC36U1', 'JSON model aliases should normalize.');
assert(validateCatalogImportRows(jsonRows, templates)[0].errors.length === 0, 'Valid JSON should pass validation.');

const invalid = validateCatalogImportRows([{ category: 'unknown' }], templates)[0];
assert(invalid.errors.includes('Manufacturer is required.'), 'Missing manufacturer should be rejected.');
assert(invalid.errors.includes('An approved category template is required.'), 'Unknown category should be rejected.');

assert(normalizeCatalogIdentifier(' 01-234 567 ') === '01234567', 'Duplicate identifiers should ignore formatting.');
assert(canBulkApproveCatalogRecord({
    status: 'needs_review',
    validationWarnings: [],
    duplicateWarnings: [],
    missingFields: [],
}) === true, 'Clean drafts should be eligible for bulk approval.');
assert(canBulkApproveCatalogRecord({
    status: 'draft',
    validationWarnings: [],
    duplicateWarnings: ['Possible duplicate'],
    missingFields: [],
}) === false, 'Duplicate warnings should block bulk approval.');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

console.log('catalogFactoryCore regression checks passed');
