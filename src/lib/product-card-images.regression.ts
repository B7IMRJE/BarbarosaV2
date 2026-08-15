import { mapApprovedProductRecord } from './company-approved-products-core';
import { resolveCompanyCatalogCardImageUrl } from './companyProductCatalogCore';
import { resolveProductImageState } from './estimateOptions';

const mapped = mapApprovedProductRecord({
    id: 'product-a',
    company_id: 'company-a',
    category: 'tank water heater',
    brand: 'Approved Brand',
    model: 'Model 50',
    tier: 'Premium',
    approved_selling_price: '3450.00',
    main_media: {
        id: 'media-a',
        company_id: 'company-a',
        product_id: 'product-a',
        bucket: 'company-product-catalog',
        storage_path: 'companies/company-a/catalog/product-a/media-a/product.jpg',
        alt_text: 'Approved product photo',
        active: true,
    },
    master_primary_image_url: 'https://manufacturer.example/product-a.jpg',
    approved: true,
    active: true,
});

assert(mapped, 'A complete approved product record should map.');
assert(mapped.mainMedia?.storagePath.endsWith('/product.jpg'), 'Uploaded product media should reach the estimate product.');
assert(mapped.masterPrimaryImageUrl === 'https://manufacturer.example/product-a.jpg', 'The master image should remain available as a fallback.');
assert(resolveProductImageState(mapped) === 'available', 'A mapped uploaded image should be available to the card.');
assert(
    resolveCompanyCatalogCardImageUrl('https://storage.example/actual.jpg', mapped.masterPrimaryImageUrl) === 'https://storage.example/actual.jpg',
    'The uploaded actual-product photo should take priority.'
);
assert(
    resolveCompanyCatalogCardImageUrl(null, mapped.masterPrimaryImageUrl) === mapped.masterPrimaryImageUrl,
    'The master-product image should be used when no upload exists.'
);

console.log('product card image regression checks passed');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
