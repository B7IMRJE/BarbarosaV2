import {
    addDraftMember,
    cardSetDraftFromSet,
    deckSourceCards,
    draftPayload,
    HOMEOS_CARD_DECK_TABS,
    moveDraftMember,
    removeDraftMember,
    revisionLabel,
    setDraftTargetArea,
    setDraftMemberParent,
    starterDeckCards,
    validateDraft,
    type HomeOSDeckSourceCard,
} from './homeosCardDecksCore';
import type { HomeOSStarterDeckCard } from './homeosStarterCatalog';

const containers: HomeOSStarterDeckCard[] = [{ templateKey: 'bathroom:toilet', name: 'Toilet', roomKind: 'bathroom', system: 'Plumbing', category: 'Fixture', parentTemplateKey: null, presentationRole: 'container', placementTags: [], aliases: [], displayOrder: 1, readinessStatus: 'ready', shortCode: '', mappedVariantIds: [], mappedCount: 0, approvedOptionCount: 0, readinessIssues: [], adminNotes: '' }];
const components: HomeOSStarterDeckCard[] = [{ ...containers[0], templateKey: 'bathroom:toilet_supply', name: 'Toilet Supply Line', category: 'Component', parentTemplateKey: 'bathroom:toilet', presentationRole: 'component', displayOrder: 2 }];
const componentFixtures: HomeOSStarterDeckCard[] = [{ ...containers[0], templateKey: 'bathroom:toilet_fill_valve', name: 'Toilet Fill Valve', parentTemplateKey: 'bathroom:toilet', presentationRole: 'component', displayOrder: 3 }];
const equipment: HomeOSStarterDeckCard[] = [{ ...containers[0], templateKey: 'garage:water_heater', name: 'Water Heater', roomKind: 'garage', category: 'Equipment', presentationRole: 'container', displayOrder: 4 }];
assert(starterDeckCards([...containers, ...components], 'containers').map((card) => card.name).join(',') === 'Toilet', 'Container deck must exclude cards that declare a parent.');
assert(starterDeckCards([...containers, ...components], 'components').map((card) => card.name).join(',') === 'Toilet Supply Line', 'Component deck must retain cards with a declared parent.');
assert(starterDeckCards([...containers, ...componentFixtures], 'fixtures').map((card) => card.name).join(',') === 'Toilet,Toilet Fill Valve', 'Fixture deck is a category lens over both container and nested fixture masters.');
assert(starterDeckCards([...containers, ...equipment], 'equipment').map((card) => card.name).join(',') === 'Water Heater', 'Equipment deck must expose equipment-category masters.');
assert(HOMEOS_CARD_DECK_TABS.map((tab) => tab.key).join(',') === 'areas,containers,fixtures,equipment,components,products,starter-packs', 'Master Card Deck navigation must expose every approved master-card lens.');

let draft = setDraftTargetArea({ ...cardSetDraftFromSet(), setKey: 'bath-one', name: 'Bathroom one' }, 'bathroom');
assert(draft.hasDraftRevision === false, 'A new unsaved pack must not be publishable.');
const containerSource = deckSourceCards({ areas: [], starterCards: containers, products: [], tab: 'containers' })[0];
const componentSource = deckSourceCards({ areas: [], starterCards: components, products: [], tab: 'components' })[0];
const productSource: HomeOSDeckSourceCard = { key: '00000000-0000-4000-8000-000000000001', label: 'Bidet seat', detail: 'Catalog product', targetKind: 'catalog_product_variant', defaultParentTemplateKey: null, presentationRole: null };
draft = addDraftMember(draft, containerSource);
draft = addDraftMember(draft, componentSource);
assert(draft.members[1].parentSlotKey === draft.members[0].slotKey, 'A container should attach to the immutable Area root.');
assert(draft.members[2].parentSlotKey === draft.members[1].slotKey, 'A component should attach to its selected parent container when that container is present.');
assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.members[0].slotKey), 'Starter Pack slot keys must be RFC UUIDs.');
const containerSlot = draft.members[1].slotKey;
const componentSlot = draft.members[2].slotKey;
draft = moveDraftMember(draft, componentSlot, -1);
assert(draft.members.map((member) => member.displayOrder).join(',') === '0,1,2', 'Move actions must normalize persisted display order while retaining the Area root first.');
assert(setDraftMemberParent(draft, containerSlot, componentSlot) === draft, 'A parent cycle must be rejected.');
assert(removeDraftMember(draft, draft.members[0].slotKey) === draft, 'The Area root must not be removable.');
draft = addDraftMember(draft, productSource);
const productSlot = draft.members.find((member) => member.catalogProductVariantId === productSource.key)?.slotKey || '';
assert(draft.members.find((member) => member.slotKey === productSlot)?.memberBehavior === 'recommendation', 'Catalog products must use recommendation behavior.');
assert(validateDraft(draft, [...containers, ...components]).includes('starter-card parent'), 'A catalog product must not save without a starter-card parent.');
draft = setDraftMemberParent(draft, productSlot, containerSlot);
const payload = draftPayload(draft);
assert((payload.members[0].target as { kind: string }).kind === 'area' && payload.members[0].member_behavior === 'instantiate', 'Payload must persist its Area root first as an instantiate member.');
assert(!validateDraft(draft, [...containers, ...components]), 'A valid pack draft should pass validation.');
const detachedContainer = setDraftMemberParent(draft, containerSlot, null);
assert(validateDraft(detachedContainer, [...containers, ...components]).includes('Container Card'), 'A container must remain attached to the Area root.');
const detachedComponent = setDraftMemberParent(draft, componentSlot, draft.members[0].slotKey);
assert(validateDraft(detachedComponent, [...containers, ...components]).includes('canonical parent'), 'A component must retain its canonical starter parent.');
const promoted = removeDraftMember(draft, containerSlot);
assert(promoted.members.find((member) => member.slotKey === componentSlot)?.parentSlotKey === null, 'Removing a parent must safely promote its children.');
assert(validateDraft({ ...draft, targetAreaCardKey: '' }).includes('Area'), 'Target Area selection must be required.');
assert(!validateDraft({ ...draft, setKey: 'primary-bath_2' }, [...containers, ...components]), 'SQL-compatible pack keys with single separators must be accepted.');
assert(validateDraft({ ...draft, setKey: 'primary-' }, [...containers, ...components]).includes('single hyphens'), 'A trailing key separator must be rejected before save.');
assert(validateDraft({ ...draft, setKey: 'primary__bath' }, [...containers, ...components]).includes('single hyphens'), 'Consecutive key separators must be rejected before save.');
const publishedOnlySet = { id: 'set', setKey: 'set', name: 'Set', description: '', status: 'active', currentPublishedRevisionNumber: 2, draftRevisionNumber: null, publishedRevisionNumber: 2, revisions: [{ id: 'published', revisionNumber: 2, status: 'published', members: [] }] };
assert(cardSetDraftFromSet(publishedOnlySet).hasDraftRevision === false, 'A published snapshot must not re-enable Publish when no draft revision exists.');
assert(cardSetDraftFromSet({ ...publishedOnlySet, draftRevisionNumber: 3, revisions: [...publishedOnlySet.revisions, { id: 'draft', revisionNumber: 3, status: 'draft', members: [] }] }).hasDraftRevision === true, 'A saved draft revision must enable publication review.');
assert(revisionLabel({ id: 'set', setKey: 'set', name: 'Set', description: '', status: 'active', currentPublishedRevisionNumber: 2, draftRevisionNumber: 3, publishedRevisionNumber: 2, revisions: [] }) === 'Draft v3 · Published v2', 'Revision labels must show both draft and published versions.');
console.log('HomeOS card deck regressions passed.');
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
