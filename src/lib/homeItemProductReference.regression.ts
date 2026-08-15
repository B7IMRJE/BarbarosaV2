import { parseHomeItemProductReference } from './homeItemProductReferenceCore';

const reference = parseHomeItemProductReference({
    home_item_id: 'home-item-1',
    product_name: 'Posi-Temp Shower Valve',
    category: 'Shower Valve',
    product_type: 'Pressure-balancing valve',
    manufacturer: 'Fortune Brands',
    brand: 'Moen',
    model: '2510',
    manufacturer_part_number: '2510',
    finish: 'Rough brass',
    specifications: { connection_size: '1/2 in.', cartridge: '1222' },
    compatible_parts: ['Moen 1222 cartridge'],
    manufacturer_warranty: 'Limited lifetime',
    manufacturer_reference: 'https://manufacturer.test/2510',
    assets: [
        { id: 'photo-1', kind: 'photo', title: 'Product image', url: 'https://manufacturer.test/2510.jpg' },
        { id: 'photo-duplicate', kind: 'photo', title: 'Duplicate image', url: 'https://manufacturer.test/2510.jpg' },
        { id: 'manual-1', kind: 'manual', title: 'Installation manual', bucket: 'company-product-catalog', storage_path: 'companies/company-1/catalog/product-1/file-1/manual.pdf', mime_type: 'application/pdf' },
        { id: 'missing-file', kind: 'manual' },
    ],
    internal_product_cost: 40,
    approved_selling_price: 800,
    company_notes: 'Technician only',
    installation_notes: 'Home history only',
});

assert(reference, 'A linked HomeOS product reference should parse.');
assert(reference.brand === 'Moen' && reference.model === '2510', 'Product identity should remain available.');
assert(reference.specifications.cartridge === '1222', 'Compatible cartridge facts should remain available.');
assert(reference.compatibleParts[0] === 'Moen 1222 cartridge', 'Compatible parts should remain available.');
assert(reference.assets.length === 2, 'Duplicate and unusable product assets should be removed.');
assert(reference.assets[0]?.isImage === true, 'Product photos should be identified for the reference gallery.');
assert(!('approvedSellingPrice' in reference), 'Homeowner product references must not parse selling prices.');
assert(!('internalProductCost' in reference), 'Homeowner product references must not parse internal cost.');
assert(!('companyNotes' in reference), 'Homeowner product references must not parse company notes.');
assert(!('installationNotes' in reference), 'Homeowner product references must not parse installation history.');
assert(parseHomeItemProductReference({ product_name: 'No HomeOS item' }) === null, 'Unscoped product data must not create a reference.');

console.log('homeItemProductReference regression checks passed');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
