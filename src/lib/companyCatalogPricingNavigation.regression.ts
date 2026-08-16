import { companyCatalogPricingRoute } from './companyCatalogPricingNavigation';

const route = companyCatalogPricingRoute('company / west', 'flo-variant');

assert(
    route.pathname === '/super-admin/company/company%20%2F%20west/catalog',
    'Company catalog pricing navigation should safely encode the company route.',
);
assert(
    route.params.productVariantId === 'flo-variant',
    'Company catalog pricing navigation should target the selected master product offering.',
);

let rejectedMissingContext = false;
try {
    companyCatalogPricingRoute('company', '');
} catch {
    rejectedMissingContext = true;
}
assert(rejectedMissingContext, 'Company catalog pricing navigation should reject an incomplete product target.');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

console.log('Company catalog pricing navigation regression checks passed.');
