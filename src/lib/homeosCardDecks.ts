import { supabase } from './supabase';
import type {
    HomeOSAreaCard,
    HomeOSCardMemberTargetKind,
    HomeOSCardSet,
    HomeOSCardSetMember,
    HomeOSCardSetRevision,
} from './homeosCardDecksCore';

export async function loadSuperAdminHomeOSCardDecks() {
    const { data, error } = await supabase.rpc('get_super_admin_homeos_card_decks');
    if (error) throw error;
    const payload = record(data);
    return {
        areas: array(payload.areas).map(parseArea).filter((area): area is HomeOSAreaCard => Boolean(area)),
        cardSets: array(payload.card_sets).map(parseCardSet).filter((cardSet): cardSet is HomeOSCardSet => Boolean(cardSet)),
    };
}

export async function saveAdminHomeOSCardSetDraft(payload: Record<string, unknown>) {
    const { data, error } = await supabase.rpc('save_admin_homeos_card_set_draft', { p_payload: payload });
    if (error) throw error;
    const cardSet = parseCardSet(data);
    if (!cardSet) throw new Error('The Starter Pack saved, but its response could not be read.');
    return cardSet;
}

export async function publishAdminHomeOSCardSet(cardSetId: string) {
    const { data, error } = await supabase.rpc('publish_admin_homeos_card_set', { p_card_set_id: cardSetId });
    if (error) throw error;
    const cardSet = parseCardSet(data);
    if (!cardSet) throw new Error('The Starter Pack was published, but its response could not be read.');
    return cardSet;
}

export async function archiveAdminHomeOSCardSet(cardSetId: string) {
    const { data, error } = await supabase.rpc('archive_admin_homeos_card_set', { p_card_set_id: cardSetId });
    if (error) throw error;
    const cardSet = parseCardSet(data);
    if (!cardSet) throw new Error('The Starter Pack was archived, but its response could not be read.');
    return cardSet;
}

function parseArea(value: unknown): HomeOSAreaCard | null {
    const row = record(value);
    const areaKey = text(row.area_key);
    if (!areaKey) return null;
    return {
        areaKey, name: text(row.name) || areaKey, scope: text(row.scope), aliases: array(row.aliases).map(text).filter(Boolean),
        displayOrder: numberValue(row.display_order), publicationStatus: text(row.publication_status),
    };
}

function parseCardSet(value: unknown): HomeOSCardSet | null {
    const row = record(value);
    const id = text(row.id);
    if (!id) return null;
    return {
        id, setKey: text(row.set_key), name: text(row.name) || 'Untitled Starter Pack', description: text(row.description), status: text(row.status),
        currentPublishedRevisionNumber: nullableNumber(row.current_published_revision_number),
        draftRevisionNumber: nullableNumber(row.draft_revision_number), publishedRevisionNumber: nullableNumber(row.published_revision_number),
        revisions: array(row.revisions).map(parseRevision).filter((revision): revision is HomeOSCardSetRevision => Boolean(revision)),
    };
}

function parseRevision(value: unknown): HomeOSCardSetRevision | null {
    const row = record(value);
    const revisionNumber = numberValue(row.revision_number);
    if (!revisionNumber) return null;
    return { id: text(row.id), revisionNumber, status: text(row.status), members: array(row.members).map(parseMember).filter((member): member is HomeOSCardSetMember => Boolean(member)) };
}

function parseMember(value: unknown): HomeOSCardSetMember | null {
    const row = record(value);
    const targetKind = targetKindValue(row.target_kind);
    const slotKey = text(row.slot_key);
    if (!slotKey || !targetKind) return null;
    return {
        slotKey, parentSlotKey: text(row.parent_slot_key) || null, displayOrder: numberValue(row.display_order), memberBehavior: text(row.member_behavior) || (targetKind === 'catalog_product_variant' ? 'recommendation' : 'instantiate'),
        areaCardKey: text(row.area_card_key) || null, starterTemplateKey: text(row.starter_template_key) || null,
        catalogProductVariantId: text(row.catalog_product_variant_id) || null, targetKind,
    };
}

function targetKindValue(value: unknown): HomeOSCardMemberTargetKind | null {
    return value === 'area' || value === 'starter_template' || value === 'catalog_product_variant' ? value : null;
}
function record(value: unknown) { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown) { return Array.isArray(value) ? value : []; }
function text(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''; }
function numberValue(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function nullableNumber(value: unknown) { const number = Number(value); return Number.isFinite(number) && number > 0 ? number : null; }
