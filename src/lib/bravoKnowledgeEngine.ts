import { waterHeaterKnowledgeObjects } from './knowledgeModules/waterHeaters';
import type { CompanyPriceBookUnit } from './companyPriceBook';

export type BravoKnowledgeStatus = 'draft' | 'testing' | 'approved' | 'deprecated' | 'archived';
export type BravoKnowledgeConfidenceLevel = 1 | 2 | 3 | 4 | 5;

export type BravoKnowledgeEstimateTemplate = {
    title: string;
    scope_summary: string;
    default_line_items: string[];
    customer_notes: string[];
};

export type BravoKnowledgeObject = {
    service_id: string;
    price_key: string;
    version: string;
    status: BravoKnowledgeStatus;
    confidence_level: BravoKnowledgeConfidenceLevel;
    service_name: string;
    system: string;
    area: string;
    equipment: string;
    category: string;
    service_type: string;
    unit: CompanyPriceBookUnit;
    base_price: number | null;
    labor_hours: number | null;
    material_cost: number | null;
    linear_foot_price: number | null;
    minimum_price: number | null;
    maximum_discount_percent: number | null;
    package_discount_percent: number | null;
    customer_description: string;
    internal_description: string;
    whats_included: string[];
    whats_not_included: string[];
    common_add_ons: string[];
    recommended_upgrades: string[];
    required_photos: string[];
    required_measurements: string[];
    required_tests: string[];
    required_documents: string[];
    warranty: string;
    permit_required: boolean;
    code_notes: string[];
    safety_notes: string[];
    recommended_tools: string[];
    related_services: string[];
    estimate_template: BravoKnowledgeEstimateTemplate;
    ai_context: string;
    training_notes: string[];
    reporting_tags: string[];
    active: boolean;
};

export const bravoKnowledgeObjects: BravoKnowledgeObject[] = [
    ...waterHeaterKnowledgeObjects,
];

export function getKnowledgeObjects(): BravoKnowledgeObject[] {
    return [...bravoKnowledgeObjects];
}

export function getKnowledgeObjectByPriceKey(priceKey: string): BravoKnowledgeObject | null {
    const normalizedPriceKey = priceKey.trim();

    return bravoKnowledgeObjects.find((object) => object.price_key === normalizedPriceKey) || null;
}

export function getKnowledgeObjectsBySystem(system: string): BravoKnowledgeObject[] {
    const normalizedSystem = normalizeKnowledgeSearchText(system);

    return bravoKnowledgeObjects.filter((object) => normalizeKnowledgeSearchText(object.system) === normalizedSystem);
}

export function getKnowledgeObjectsByEquipment(equipment: string): BravoKnowledgeObject[] {
    const normalizedEquipment = normalizeKnowledgeSearchText(equipment);

    return bravoKnowledgeObjects.filter((object) => normalizeKnowledgeSearchText(object.equipment) === normalizedEquipment);
}

export function searchKnowledgeObjects(query: string): BravoKnowledgeObject[] {
    const normalizedQuery = normalizeKnowledgeSearchText(query);

    if (!normalizedQuery) return getKnowledgeObjects();

    return bravoKnowledgeObjects.filter((object) =>
        [
            object.service_id,
            object.price_key,
            object.service_name,
            object.system,
            object.area,
            object.equipment,
            object.category,
            object.service_type,
            object.customer_description,
            object.internal_description,
            object.ai_context,
            object.warranty,
            ...object.whats_included,
            ...object.whats_not_included,
            ...object.common_add_ons,
            ...object.recommended_upgrades,
            ...object.required_photos,
            ...object.required_measurements,
            ...object.required_tests,
            ...object.required_documents,
            ...object.code_notes,
            ...object.safety_notes,
            ...object.recommended_tools,
            ...object.related_services,
            ...object.training_notes,
            ...object.reporting_tags,
        ]
            .map(normalizeKnowledgeSearchText)
            .some((value) => value.includes(normalizedQuery))
    );
}

function normalizeKnowledgeSearchText(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
