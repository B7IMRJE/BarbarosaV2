import type { CatalogFactoryRecord } from './catalogFactory';
import type { HomeOSStarterDeckCard } from './homeosStarterCatalog';

export type HomeOSCardDeckTab = 'areas' | 'containers' | 'components' | 'products' | 'starter-packs';
export type HomeOSCardMemberTargetKind = 'area' | 'starter_template' | 'catalog_product_variant';

export type HomeOSAreaCard = {
    areaKey: string;
    name: string;
    scope: string;
    aliases: string[];
    displayOrder: number;
    publicationStatus: string;
};

export type HomeOSCardSetMember = {
    slotKey: string;
    parentSlotKey: string | null;
    displayOrder: number;
    memberBehavior: string;
    areaCardKey: string | null;
    starterTemplateKey: string | null;
    catalogProductVariantId: string | null;
    targetKind: HomeOSCardMemberTargetKind;
};

export type HomeOSCardSetRevision = {
    id: string;
    revisionNumber: number;
    status: string;
    members: HomeOSCardSetMember[];
};

export type HomeOSCardSet = {
    id: string;
    setKey: string;
    name: string;
    description: string;
    status: string;
    currentPublishedRevisionNumber: number | null;
    draftRevisionNumber: number | null;
    publishedRevisionNumber: number | null;
    revisions: HomeOSCardSetRevision[];
};

export type HomeOSCardSetDraft = {
    id: string | null;
    hasDraftRevision: boolean;
    setKey: string;
    name: string;
    description: string;
    targetAreaCardKey: string;
    members: HomeOSCardSetMember[];
};

export type HomeOSDeckSourceCard = {
    key: string;
    label: string;
    detail: string;
    targetKind: HomeOSCardMemberTargetKind;
    defaultParentTemplateKey: string | null;
    presentationRole: string | null;
};

export const HOMEOS_CARD_DECK_TABS: { key: HomeOSCardDeckTab; label: string }[] = [
    { key: 'areas', label: 'Area Cards' },
    { key: 'containers', label: 'Container Cards' },
    { key: 'components', label: 'Component Cards' },
    { key: 'products', label: 'Catalog Products' },
    { key: 'starter-packs', label: 'Starter Packs' },
];

export function cardSetDraftFromSet(cardSet?: HomeOSCardSet | null): HomeOSCardSetDraft {
    const revision = currentEditableRevision(cardSet);
    return {
        id: cardSet?.id || null,
        hasDraftRevision: Boolean(cardSet && cardSet.revisions.some((candidate) => (
            candidate.status === 'draft'
            || candidate.revisionNumber === cardSet.draftRevisionNumber
        ))),
        setKey: cardSet?.setKey || '',
        name: cardSet?.name || '',
        description: cardSet?.description || '',
        targetAreaCardKey: revision?.members.find((member) => member.targetKind === 'area')?.areaCardKey || '',
        members: normalizeMemberOrder(revision?.members.map((member) => ({ ...member })) || []),
    };
}

export function currentEditableRevision(cardSet?: HomeOSCardSet | null) {
    if (!cardSet) return null;
    return cardSet.revisions.find((revision) => revision.status === 'draft')
        || cardSet.revisions.find((revision) => revision.revisionNumber === cardSet.draftRevisionNumber)
        || cardSet.revisions.find((revision) => revision.revisionNumber === cardSet.publishedRevisionNumber)
        || [...cardSet.revisions].sort((left, right) => right.revisionNumber - left.revisionNumber)[0]
        || null;
}

export function revisionLabel(cardSet: HomeOSCardSet) {
    const draft = cardSet.draftRevisionNumber;
    const published = cardSet.currentPublishedRevisionNumber || cardSet.publishedRevisionNumber;
    if (draft && published) return `Draft v${draft} · Published v${published}`;
    if (draft) return `Draft v${draft}`;
    if (published) return `Published v${published}`;
    return 'No revision yet';
}

export function starterDeckCards(cards: readonly HomeOSStarterDeckCard[], kind: 'containers' | 'components'): HomeOSStarterDeckCard[] {
    return cards
        .filter((card) => card.presentationRole === (kind === 'containers' ? 'container' : 'component'))
        .sort((left, right) => left.roomKind.localeCompare(right.roomKind)
            || left.displayOrder - right.displayOrder || left.name.localeCompare(right.name));
}

export function deckSourceCards(input: {
    areas: readonly HomeOSAreaCard[];
    starterCards: readonly HomeOSStarterDeckCard[];
    products: readonly CatalogFactoryRecord[];
    tab: Exclude<HomeOSCardDeckTab, 'starter-packs'>;
}): HomeOSDeckSourceCard[] {
    if (input.tab === 'areas') return input.areas.map((area) => ({
        key: area.areaKey, label: area.name, detail: [area.scope, area.publicationStatus].filter(Boolean).join(' · '),
        targetKind: 'area' as const, defaultParentTemplateKey: null, presentationRole: null,
    })).sort(sortSourceCards);

    if (input.tab === 'products') return input.products.map((product) => ({
        key: product.id, label: product.familyName || product.modelNumber || product.category || 'Catalog product',
        detail: [product.brand || product.manufacturer, product.shortCode, product.status].filter(Boolean).join(' · '),
        targetKind: 'catalog_product_variant' as const, defaultParentTemplateKey: null, presentationRole: null,
    })).sort(sortSourceCards);

    return starterDeckCards(input.starterCards, input.tab).map((card) => ({
        key: card.templateKey, label: card.name,
        detail: [card.roomKind.replace(/[_-]+/g, ' '), card.system, card.category].filter(Boolean).join(' · '),
        targetKind: 'starter_template' as const, defaultParentTemplateKey: card.parentTemplateKey, presentationRole: card.presentationRole || null,
    })).sort(sortSourceCards);
}

export function addDraftMember(draft: HomeOSCardSetDraft, source: HomeOSDeckSourceCard): HomeOSCardSetDraft {
    if (source.targetKind === 'area') return setDraftTargetArea(draft, source.key);
    const slotKey = newSlotKey();
    const areaRoot = draft.members.find((member) => member.targetKind === 'area')?.slotKey || null;
    const parent = source.targetKind === 'starter_template'
        ? source.presentationRole === 'container'
            ? areaRoot
            : source.defaultParentTemplateKey
                ? draft.members.find((member) => member.starterTemplateKey === source.defaultParentTemplateKey)?.slotKey || null
                : null
        : null;
    const member: HomeOSCardSetMember = {
        slotKey,
        parentSlotKey: parent,
        displayOrder: draft.members.length,
        memberBehavior: source.targetKind === 'catalog_product_variant' ? 'recommendation' : 'instantiate',
        areaCardKey: null,
        starterTemplateKey: source.targetKind === 'starter_template' ? source.key : null,
        catalogProductVariantId: source.targetKind === 'catalog_product_variant' ? source.key : null,
        targetKind: source.targetKind,
    };
    return { ...draft, members: normalizeMemberOrder([...draft.members, member]) };
}

/** The Area card is one immutable root member, always first in the pack. */
export function setDraftTargetArea(draft: HomeOSCardSetDraft, areaCardKey: string): HomeOSCardSetDraft {
    const oldRoots = draft.members.filter((member) => member.targetKind === 'area');
    const oldRootKeys = new Set(oldRoots.map((member) => member.slotKey));
    const root: HomeOSCardSetMember = {
        slotKey: oldRoots[0]?.slotKey || newSlotKey(), parentSlotKey: null, displayOrder: 0, memberBehavior: 'instantiate',
        areaCardKey, starterTemplateKey: null, catalogProductVariantId: null, targetKind: 'area',
    };
    const members = draft.members
        .filter((member) => member.targetKind !== 'area')
        .map((member) => oldRootKeys.has(member.parentSlotKey || '') ? { ...member, parentSlotKey: root.slotKey } : member);
    return { ...draft, targetAreaCardKey: areaCardKey, members: normalizeMemberOrder([root, ...members]) };
}

export function removeDraftMember(draft: HomeOSCardSetDraft, slotKey: string): HomeOSCardSetDraft {
    if (draft.members.some((member) => member.slotKey === slotKey && member.targetKind === 'area')) return draft;
    const members = draft.members
        .filter((member) => member.slotKey !== slotKey)
        .map((member) => member.parentSlotKey === slotKey ? { ...member, parentSlotKey: null } : member);
    return { ...draft, members: normalizeMemberOrder(members) };
}

export function moveDraftMember(draft: HomeOSCardSetDraft, slotKey: string, direction: -1 | 1): HomeOSCardSetDraft {
    const members = [...draft.members].sort((left, right) => left.displayOrder - right.displayOrder);
    if (members.find((member) => member.slotKey === slotKey)?.targetKind === 'area') return draft;
    const from = members.findIndex((member) => member.slotKey === slotKey);
    const to = from + direction;
    if (from < 0 || to <= 0 || to >= members.length) return draft;
    [members[from], members[to]] = [members[to], members[from]];
    return { ...draft, members: normalizeMemberOrder(members) };
}

export function setDraftMemberParent(draft: HomeOSCardSetDraft, slotKey: string, parentSlotKey: string | null): HomeOSCardSetDraft {
    if (parentSlotKey === slotKey || createsParentCycle(draft.members, slotKey, parentSlotKey)) return draft;
    return {
        ...draft,
        members: draft.members.map((member) => member.slotKey === slotKey ? { ...member, parentSlotKey } : member),
    };
}

export function draftPayload(draft: HomeOSCardSetDraft) {
    return {
        ...(draft.id ? { id: draft.id } : {}),
        set_key: draft.setKey.trim(),
        name: draft.name.trim(),
        description: draft.description.trim(),
        members: normalizeMemberOrder(draft.members).map((member) => ({
            slot_key: member.slotKey,
            parent_slot_key: member.parentSlotKey,
            display_order: member.displayOrder,
            member_behavior: member.memberBehavior || (member.targetKind === 'catalog_product_variant' ? 'recommendation' : 'instantiate'),
            target: member.targetKind === 'area'
                ? { kind: 'area', key: member.areaCardKey }
                : member.targetKind === 'starter_template'
                    ? { kind: 'starter_template', key: member.starterTemplateKey }
                    : { kind: 'catalog_product_variant', id: member.catalogProductVariantId },
        })),
    };
}

export function validateDraft(draft: HomeOSCardSetDraft, starterCards: readonly HomeOSStarterDeckCard[] = []) {
    if (!draft.name.trim()) return 'Give this Starter Pack a name.';
    if (!draft.setKey.trim()) return 'Give this Starter Pack a stable key.';
    if (!/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(draft.setKey.trim())) return 'Use lowercase words or numbers separated by single hyphens or underscores for the pack key.';
    if (!draft.targetAreaCardKey) return 'Choose the target Area card for this Starter Pack.';
    const roots = draft.members.filter((member) => member.targetKind === 'area');
    if (roots.length !== 1 || roots[0]?.areaCardKey !== draft.targetAreaCardKey) return 'The selected target Area must be the one Starter Pack root.';
    if (draft.members.length <= 1) return 'Add at least one card to this Starter Pack.';
    if (draft.members.some((member) => {
        if (member.targetKind !== 'catalog_product_variant') return false;
        return !member.parentSlotKey || draft.members.find((candidate) => candidate.slotKey === member.parentSlotKey)?.targetKind !== 'starter_template';
    })) return 'Choose a starter-card parent for every catalog product recommendation.';
    const root = roots[0];
    const membersBySlot = new Map(draft.members.map((member) => [member.slotKey, member]));
    const starterByTemplate = new Map(starterCards.map((card) => [card.templateKey, card]));
    for (const member of draft.members) {
        if (member.targetKind !== 'starter_template') continue;
        const card = starterByTemplate.get(member.starterTemplateKey || '');
        if (card?.presentationRole === 'container' && member.parentSlotKey !== root.slotKey) {
            return `${card.name} is a Container Card and must remain attached to the target Area.`;
        }
        if (card?.presentationRole === 'component' && card.parentTemplateKey) {
            const parent = member.parentSlotKey ? membersBySlot.get(member.parentSlotKey) : null;
            if (parent?.starterTemplateKey !== card.parentTemplateKey) {
                return `${card.name} must be attached to its canonical parent: ${card.parentTemplateKey}.`;
            }
        }
        if (card?.presentationRole === 'component' && !card.parentTemplateKey && member.parentSlotKey) {
            const parent = membersBySlot.get(member.parentSlotKey);
            if (parent?.targetKind !== 'starter_template') return `${card.name} can only attach to another starter card.`;
        }
    }
    return '';
}

export function cardSetMemberLabel(
    member: HomeOSCardSetMember,
    input: { areas: readonly HomeOSAreaCard[]; starterCards: readonly HomeOSStarterDeckCard[]; products: readonly CatalogFactoryRecord[] },
) {
    if (member.targetKind === 'area') return input.areas.find((area) => area.areaKey === member.areaCardKey)?.name || member.areaCardKey || 'Area card';
    if (member.targetKind === 'starter_template') return input.starterCards.find((card) => card.templateKey === member.starterTemplateKey)?.name || member.starterTemplateKey || 'Starter card';
    const product = input.products.find((candidate) => candidate.id === member.catalogProductVariantId);
    return product?.familyName || product?.modelNumber || product?.category || member.catalogProductVariantId || 'Catalog product';
}

function normalizeMemberOrder(members: readonly HomeOSCardSetMember[]) {
    const roots = members.filter((member) => member.targetKind === 'area');
    const root = roots[0];
    const others = members.filter((member) => member.targetKind !== 'area').sort((left, right) => left.displayOrder - right.displayOrder);
    return [...(root ? [{ ...root, parentSlotKey: null }] : []), ...others].map((member, index) => ({ ...member, displayOrder: index }));
}

function newSlotKey() {
    const randomUuid = globalThis.crypto?.randomUUID?.();
    if (randomUuid) return randomUuid;
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const value = Math.floor(Math.random() * 16);
        return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16);
    });
}


function createsParentCycle(members: readonly HomeOSCardSetMember[], slotKey: string, parentSlotKey: string | null) {
    const parents = new Map(members.map((member) => [member.slotKey, member.parentSlotKey]));
    let cursor = parentSlotKey;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
        if (cursor === slotKey) return true;
        seen.add(cursor);
        cursor = parents.get(cursor) || null;
    }
    return false;
}

function sortSourceCards(left: HomeOSDeckSourceCard, right: HomeOSDeckSourceCard) {
    return left.label.localeCompare(right.label) || left.key.localeCompare(right.key);
}
