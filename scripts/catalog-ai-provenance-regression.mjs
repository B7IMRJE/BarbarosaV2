import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

const builder = readFileSync(resolve('src/features/company-management/AiCatalogItemBuilder.tsx'), 'utf8');
const adapter = readFileSync(resolve('src/lib/catalogAiBuilderAdapter.ts'), 'utf8');

assert(
    builder.includes('provenanceSourceUrls: Record<string, string[]>'),
    'The UI draft must retain exact source URLs separately from its provenance label.',
);
assert(
    builder.includes('provenanceSourceUrls: { ...current.provenanceSourceUrls, [key]: [] }'),
    'A direct administrator edit must clear only the edited field source URLs.',
);
assert(
    builder.includes('const researchProvenanceSourceUrls = next.provenanceSourceUrls || {}'),
    'Research merging must preserve exact source URL maps.',
);
assert(
    adapter.includes("productUrl: 'product_url'") && adapter.includes("product_url: 'productUrl'"),
    'productUrl and product_url must map symmetrically.',
);
assert(
    adapter.includes('provenanceUrlsForDraft(draft, key)')
        && adapter.includes('uniqueStrings(value.sourceUrls)'),
    'Exact field sources must be used on save and restored on resume.',
);
assert(
    !adapter.includes("kind === 'verified_source' ? sourceUrls : []"),
    'Verified fields must not be widened to every curated source.',
);

console.log('AI Catalog provenance round-trip regression passed.');
