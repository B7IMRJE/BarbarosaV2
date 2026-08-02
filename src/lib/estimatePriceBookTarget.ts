import { plumbingPriceBookCatalogItems } from './plumbingPriceBookCatalog';

type DraftItemName = { name: string };

const ACTION_WORDS = ['replacement', 'repair', 'installation'] as const;
const STOP_WORDS = new Set(['service', 'water', 'plumbing', 'component', 'the', 'a', 'an']);

function normalize(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(value: string) {
    return normalize(value).split(' ').filter((token) => token && !STOP_WORDS.has(token));
}

export function findEstimatePriceBookCatalogItem(
    draftItems: DraftItemName[],
    templateLabel: string
) {
    const queryTexts = [templateLabel, ...draftItems.map((item) => item.name)]
        .map(normalize)
        .filter(Boolean);
    const templateTokens = tokens(templateLabel);
    const requiredActions = ACTION_WORDS.filter((action) => templateTokens.includes(action));
    const queryTokens = new Set(queryTexts.flatMap(tokens));

    const ranked = plumbingPriceBookCatalogItems.flatMap((item) => {
        const normalizedName = normalize(item.name);
        const itemTokens = tokens(item.name);

        if (requiredActions.some((action) => !itemTokens.includes(action))) return [];
        if (
            requiredActions.length > 0 &&
            ACTION_WORDS.some(
                (action) => !requiredActions.includes(action) && itemTokens.includes(action)
            )
        ) return [];

        const sharedTokens = itemTokens.filter((token) => queryTokens.has(token));
        if (sharedTokens.length === 0) return [];

        let score = requiredActions.length * 40 + sharedTokens.length * 10 - itemTokens.length;
        for (const query of queryTexts) {
            if (normalizedName === query) score += 100;
            else if (normalizedName.includes(query)) score += 50;
            else if (query.includes(normalizedName)) score += 40;
        }

        return [{ item, score }];
    });

    ranked.sort((left, right) =>
        right.score - left.score || left.item.price_key.localeCompare(right.item.price_key)
    );
    return ranked[0]?.item ?? null;
}
