export type ProviderCategoryOption = {
    key: string;
    label: string;
};

export type ProviderCompanyClassification = {
    id: string;
    service_categories: string[] | null;
};

const providerCategoryDefinitions: (ProviderCategoryOption & { explicitLabels: string[] })[] = [
    {
        key: 'plumbing',
        label: 'Plumbing',
        explicitLabels: [
            'plumbing',
            'repipe',
            'water heaters',
            'leak detection',
            'slab leak',
            'drain cleaning',
            'sewer',
            'gas',
            'water treatment',
        ],
    },
    { key: 'hvac', label: 'HVAC', explicitLabels: ['hvac'] },
    { key: 'electrical', label: 'Electrical', explicitLabels: ['electrical'] },
    { key: 'roofing', label: 'Roofing', explicitLabels: ['roofing'] },
    { key: 'restoration', label: 'Restoration', explicitLabels: ['restoration'] },
    { key: 'remodeling', label: 'Remodeling', explicitLabels: ['remodeling'] },
    { key: 'handyman', label: 'Handyman', explicitLabels: ['handyman'] },
    {
        key: 'property-management',
        label: 'Property Management',
        explicitLabels: ['property management'],
    },
];

const providerCategoryByExplicitLabel = new Map(
    providerCategoryDefinitions.flatMap((definition) =>
        definition.explicitLabels.map((label) => [label, definition] as const)
    )
);

const providerCategoryByKey = new Map(
    providerCategoryDefinitions.map((definition) => [definition.key, definition] as const)
);

export function normalizeExplicitProviderCategory(value: string | null | undefined) {
    const normalizedValue = normalizeCategoryText(value);

    if (!normalizedValue) return null;

    return providerCategoryByExplicitLabel.get(normalizedValue)?.key ||
        providerCategoryByKey.get(normalizedValue.replace(/\s+/g, '-'))?.key ||
        null;
}

export function getExplicitProviderCategoryOptions(serviceCategories: string[] | null | undefined) {
    const optionsByKey = new Map<string, ProviderCategoryOption>();

    (serviceCategories || []).forEach((category) => {
        const key = normalizeExplicitProviderCategory(category);
        const definition = key ? providerCategoryByKey.get(key) : null;

        if (!key || !definition) return;

        optionsByKey.set(key, { key, label: definition.label });
    });

    return Array.from(optionsByKey.values());
}

export function getExplicitProviderCategoryKeys(serviceCategories: string[] | null | undefined) {
    return getExplicitProviderCategoryOptions(serviceCategories).map((category) => category.key);
}

export function formatProviderCategoryLabel(categoryKey: string) {
    return providerCategoryByKey.get(categoryKey)?.label || '';
}

export function filterAvailableProviderCompanies<T extends ProviderCompanyClassification>(
    companies: T[],
    occupiedCategoryKeys: string[],
    currentProviderCompanyIds: string[] = []
) {
    const occupiedKeys = new Set(
        occupiedCategoryKeys
            .map((categoryKey) => normalizeExplicitProviderCategory(categoryKey))
            .filter((categoryKey): categoryKey is string => !!categoryKey)
    );
    const currentCompanyIds = new Set(currentProviderCompanyIds);
    let hiddenByOccupiedCategoryCount = 0;
    let hiddenUnclassifiedCount = 0;

    const visibleCompanies = companies.flatMap<T>((company) => {
        if (currentCompanyIds.has(company.id)) return [];

        const explicitCategories = getExplicitProviderCategoryOptions(company.service_categories);

        if (explicitCategories.length === 0) {
            hiddenUnclassifiedCount += 1;
            return [];
        }

        const visibleCategories = explicitCategories.filter((category) => !occupiedKeys.has(category.key));

        if (visibleCategories.length === 0) {
            hiddenByOccupiedCategoryCount += 1;
            return [];
        }

        return [{
            ...company,
            service_categories: visibleCategories.map((category) => category.label),
        }];
    });

    return {
        companies: visibleCompanies,
        hiddenByOccupiedCategoryCount,
        hiddenUnclassifiedCount,
    };
}

export function hasExplicitProviderClassification(company: ProviderCompanyClassification | null | undefined) {
    return !!company && getExplicitProviderCategoryKeys(company.service_categories).length > 0;
}

function normalizeCategoryText(value: string | null | undefined) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
