import {
    resolveCompanyCatalogCardImageUrl,
    validateCompanyCatalogDraft,
    type CompanyCatalogDraftValidationInput,
} from './companyProductCatalogCore';

const draft: CompanyCatalogDraftValidationInput = {
    category: '',
    brand: '',
    model: '',
    status: 'draft',
    approvedSellingPrice: null,
    minimumSellingPrice: null,
    maximumSellingPrice: null,
};
assert(validateCompanyCatalogDraft(draft) === 'Choose a product category.', 'Blank catalog category must be rejected.');
draft.category = 'Shower Valve';
draft.brand = 'Moen';
draft.model = 'M-Core 3-Series';
draft.status = 'approved';
draft.minimumSellingPrice = 700;
draft.maximumSellingPrice = 500;
assert(validateCompanyCatalogDraft(draft) === 'Minimum selling price cannot exceed the maximum.', 'Invalid minimum and maximum price order must be rejected.');
draft.maximumSellingPrice = 900;
assert(validateCompanyCatalogDraft(draft) === '', 'A complete approved catalog card should validate.');

assert(
    resolveCompanyCatalogCardImageUrl('https://storage.example/actual-product.jpg', 'https://manufacturer.example/product.jpg') === 'https://storage.example/actual-product.jpg',
    'A directly uploaded product photo must take priority on the front card.'
);
assert(
    resolveCompanyCatalogCardImageUrl('', 'https://manufacturer.example/product.jpg') === 'https://manufacturer.example/product.jpg',
    'The verified master-product image should be used when no direct upload exists.'
);
assert(
    resolveCompanyCatalogCardImageUrl('  ', '  ') === null,
    'Products without a usable photo should keep the neutral fallback.'
);

console.log('companyProductCatalog regression checks passed');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
