import { supabase } from './supabase';
import { loadCatalogCardCodeMaps } from './catalogCardCodes';

export type HomeOSStarterDeckReadiness = 'unbuilt' | 'building' | 'ready';

export type HomeOSStarterDeckCard = {
    templateKey: string;
    shortCode: string;
    roomKind: string;
    name: string;
    system: string;
    category: string;
    parentTemplateKey: string | null;
    aliases: string[];
    displayOrder: number;
    readinessStatus: HomeOSStarterDeckReadiness;
    adminNotes: string;
    mappedVariantIds: string[];
    mappedCount: number;
    approvedOptionCount: number;
    readinessIssues: string[];
};

export type HomeOSStarterCardChoice = Pick<
    HomeOSStarterDeckCard,
    'templateKey' | 'shortCode' | 'roomKind' | 'name' | 'system' | 'category' | 'parentTemplateKey' | 'aliases' | 'displayOrder'
>;

export async function loadHomeOSStarterCardChoices() {
    const { data, error } = await supabase.rpc('get_homeos_starter_card_picker');
    if (error) throw error;

    return array(data)
        .map(parseStarterCardChoice)
        .filter((card): card is HomeOSStarterCardChoice => Boolean(card));
}

export async function loadHomeOSStarterCardDeck() {
    const [{ data, error }, codes] = await Promise.all([
        supabase.rpc('get_homeos_starter_card_deck'),
        loadCatalogCardCodeMaps(),
    ]);

    if (error) throw error;

    return array(data)
        .map(parseStarterDeckCard)
        .filter((card): card is HomeOSStarterDeckCard => Boolean(card))
        .map((card) => ({ ...card, shortCode: codes.starterTemplates.get(card.templateKey) || '' }));
}

export async function saveHomeOSStarterCardDeckEntry(input: {
    templateKey: string;
    variantIds: string[];
    readinessStatus: HomeOSStarterDeckReadiness;
    adminNotes: string;
}) {
    const { data, error } = await supabase.rpc('save_homeos_starter_card_deck_entry', {
        p_template_key: input.templateKey,
        p_variant_ids: unique(input.variantIds),
        p_readiness_status: input.readinessStatus,
        p_admin_notes: input.adminNotes.trim() || null,
    });

    if (error) throw error;

    const parsed = parseStarterDeckCard(data);
    if (!parsed) throw new Error('The starter card mapping was saved, but the response was invalid.');
    return parsed;
}

export async function addHomeOSStarterCardVariantMapping(templateKey: string, variantId: string) {
    const { error } = await supabase.rpc('add_homeos_starter_card_variant_mapping', {
        p_template_key: templateKey,
        p_variant_id: variantId,
    });
    if (error) throw error;
}

export async function setHomeOSStarterCardReadiness(
    templateKey: string,
    readinessStatus: HomeOSStarterDeckReadiness,
) {
    const { error } = await supabase.rpc('set_homeos_starter_card_readiness', {
        p_template_key: templateKey,
        p_readiness_status: readinessStatus,
    });
    if (error) throw error;
}

export async function loadCompanyHomeOSStarterCatalogVariantIds(
    companyId: string,
    templateKey: string,
) {
    const { data, error } = await supabase.rpc('get_company_homeos_starter_catalog_variant_ids', {
        p_company_id: companyId,
        p_template_key: templateKey,
    });

    if (error) throw error;

    return unique(array(data).map(text).filter(Boolean));
}

function parseStarterDeckCard(value: unknown): HomeOSStarterDeckCard | null {
    const row = record(value);
    const templateKey = text(row.template_key);
    const roomKind = text(row.room_kind);

    if (!templateKey || !roomKind) return null;

    return {
        templateKey,
        shortCode: '',
        roomKind,
        name: text(row.name) || 'Starter card',
        system: text(row.system),
        category: text(row.category),
        parentTemplateKey: nullableText(row.parent_template_key),
        aliases: array(row.aliases).map(text).filter(Boolean),
        displayOrder: numberValue(row.display_order),
        readinessStatus: readiness(row.readiness_status),
        adminNotes: text(row.admin_notes),
        mappedVariantIds: array(row.mapped_variant_ids).map(text).filter(Boolean),
        mappedCount: numberValue(row.mapped_count),
        approvedOptionCount: numberValue(row.approved_option_count),
        readinessIssues: array(row.readiness_issues).map(text).filter(Boolean),
    };
}

function parseStarterCardChoice(value: unknown): HomeOSStarterCardChoice | null {
    const row = record(value);
    const templateKey = text(row.template_key);
    const roomKind = text(row.room_kind);
    if (!templateKey || !roomKind) return null;

    return {
        templateKey,
        shortCode: text(row.short_code).toUpperCase(),
        roomKind,
        name: text(row.name) || 'Starter card',
        system: text(row.system),
        category: text(row.category),
        parentTemplateKey: nullableText(row.parent_template_key),
        aliases: array(row.aliases).map(text).filter(Boolean),
        displayOrder: numberValue(row.display_order),
    };
}

function readiness(value: unknown): HomeOSStarterDeckReadiness {
    return value === 'ready' ? 'ready' : value === 'building' ? 'building' : 'unbuilt';
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function array(value: unknown) { return Array.isArray(value) ? value : []; }
function text(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''; }
function nullableText(value: unknown) { return text(value) || null; }
function numberValue(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function unique(values: string[]) { return [...new Set(values)]; }
