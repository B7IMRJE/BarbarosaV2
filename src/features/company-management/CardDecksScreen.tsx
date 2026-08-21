import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions, type ViewStyle } from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import CompactCatalogProductTile from '../../components/catalog/compact-catalog-product-tile';
import { AreaContainer, EquipmentContainer } from '../../components/homeos/HomeOSVisualFoundation';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { loadCatalogFactory, type CatalogFactoryRecord } from '../../lib/catalogFactory';
import {
    archiveAdminHomeOSCardSet,
    loadSuperAdminHomeOSCardDecks,
    publishAdminHomeOSCardSet,
    saveAdminHomeOSCardSetDraft,
} from '../../lib/homeosCardDecks';
import {
    addDraftMember,
    cardSetMemberLabel,
    cardSetDraftFromSet,
    deckSourceCards,
    draftPayload,
    HOMEOS_CARD_DECK_TABS,
    moveDraftMember,
    removeDraftMember,
    revisionLabel,
    setDraftMemberParent,
    setDraftTargetArea,
    starterDeckCards,
    type HomeOSAreaCard,
    type HomeOSCardDeckTab,
    type HomeOSCardSet,
    type HomeOSCardSetDraft,
    type HomeOSStarterMasterDeck,
    validateDraft,
} from '../../lib/homeosCardDecksCore';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../lib/homeos-responsive-layout';
import { loadHomeOSStarterCardDeck, type HomeOSStarterDeckCard } from '../../lib/homeosStarterCatalog';
import { loadCurrentUserPlatformAdmin } from '../../lib/roles';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

type DeckData = { areas: HomeOSAreaCard[]; cardSets: HomeOSCardSet[] };
type PackSource = 'areas' | HomeOSStarterMasterDeck | 'products';
const STARTER_MASTER_DECKS: readonly HomeOSStarterMasterDeck[] = ['containers', 'fixtures', 'equipment', 'components'];
const PACK_SOURCE_TABS: readonly { key: PackSource; label: string }[] = [
    { key: 'areas', label: 'Area' },
    { key: 'containers', label: 'Container' },
    { key: 'fixtures', label: 'Fixture' },
    { key: 'equipment', label: 'Equipment' },
    { key: 'components', label: 'Component' },
    { key: 'products', label: 'Product' },
];

export default function CardDecksScreen() {
    const { width } = useWindowDimensions();
    const { scaleIcon, theme } = useTheme();
    const phone = width < 640;
    const [allowed, setAllowed] = useState<boolean | null>(null);
    const [tab, setTab] = useState<HomeOSCardDeckTab>('areas');
    const [deckData, setDeckData] = useState<DeckData>({ areas: [], cardSets: [] });
    const [starterCards, setStarterCards] = useState<HomeOSStarterDeckCard[]>([]);
    const [products, setProducts] = useState<CatalogFactoryRecord[]>([]);
    const [busy, setBusy] = useState(true);
    const [message, setMessage] = useState('Loading Card Decks…');
    const [draft, setDraft] = useState<HomeOSCardSetDraft | null>(null);
    const [draftDirty, setDraftDirty] = useState(false);
    const [packSource, setPackSource] = useState<PackSource>('containers');
    const [query, setQuery] = useState('');

    useEffect(() => {
        void initialize();
        // Auth guard/load pass intentionally runs once on entry.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function initialize() {
        const isAllowed = await loadCurrentUserPlatformAdmin();
        setAllowed(isAllowed);
        if (!isAllowed) {
            setBusy(false);
            setMessage('Card Decks is restricted to platform administrators.');
            return;
        }
        await refresh();
    }

    async function refresh() {
        setBusy(true);
        try {
            const [cards, starters, catalog] = await Promise.all([
                loadSuperAdminHomeOSCardDecks(), loadHomeOSStarterCardDeck(), loadCatalogFactory({}),
            ]);
            setDeckData(cards);
            setStarterCards(starters);
            setProducts(catalog.records);
            setMessage(`${cards.areas.length} Area Cards · ${starters.length} starter cards · ${cards.cardSets.length} Starter Packs`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    function replaceDraft(cardSet?: HomeOSCardSet) {
        setDraft(cardSetDraftFromSet(cardSet));
        setDraftDirty(false);
        setQuery('');
    }

    function openDraft(cardSet?: HomeOSCardSet) {
        const nextId = cardSet?.id || null;
        if (draftDirty) {
            if ((draft?.id || null) === nextId) return;
            Alert.alert(
                'Discard unsaved changes?',
                'Save this Starter Pack before opening another one, or discard the changes to continue.',
                [
                    { text: 'Keep editing', style: 'cancel' },
                    { text: 'Discard changes', style: 'destructive', onPress: () => replaceDraft(cardSet) },
                ],
            );
            return;
        }
        replaceDraft(cardSet);
    }

    function updateDraft(nextDraft: HomeOSCardSetDraft) {
        setDraft(nextDraft);
        setDraftDirty(true);
    }

    async function saveDraft() {
        if (!draft) return;
        const validation = validateDraft(draft, starterCards);
        if (validation) {
            Alert.alert('Complete this Starter Pack', validation);
            return;
        }
        setBusy(true);
        try {
            const saved = await saveAdminHomeOSCardSetDraft(draftPayload(draft));
            setDraft(cardSetDraftFromSet(saved));
            setDraftDirty(false);
            setMessage(`${saved.name} draft saved.`);
            await refresh();
        } catch (error) {
            Alert.alert('Starter Pack not saved', errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    function confirmPublish() {
        if (draftDirty) {
            Alert.alert('Save changes first', 'Save this draft before publishing so the approved definition matches your latest edits.');
            return;
        }
        if (!draft?.id) {
            Alert.alert('Save the draft first', 'Save this Starter Pack before publishing its approved definition.');
            return;
        }
        if (!draft.hasDraftRevision) {
            Alert.alert('Save a new draft first', 'This Starter Pack is already published. Make any changes, then save them as a new draft before publishing again.');
            return;
        }
        Alert.alert(
            'Publish Starter Pack?',
            'This publishes an approved definition for future or new-property setup. It does not modify any current home.',
            [{ text: 'Cancel', style: 'cancel' }, { text: 'Publish', style: 'default', onPress: () => void publishDraft(draft.id!) }],
        );
    }

    async function publishDraft(cardSetId: string) {
        setBusy(true);
        try {
            const published = await publishAdminHomeOSCardSet(cardSetId);
            setDraft(cardSetDraftFromSet(published));
            setDraftDirty(false);
            setMessage(`${published.name} is published as an approved definition.`);
            await refresh();
        } catch (error) {
            Alert.alert('Starter Pack not published', errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    function confirmArchive(cardSet: HomeOSCardSet) {
        Alert.alert(
            'Archive Starter Pack?',
            `Archive “${cardSet.name}”? Existing homes are not changed.`,
            [{ text: 'Cancel', style: 'cancel' }, { text: 'Archive', style: 'destructive', onPress: () => void archive(cardSet.id) }],
        );
    }

    async function archive(cardSetId: string) {
        setBusy(true);
        try {
            const archived = await archiveAdminHomeOSCardSet(cardSetId);
            if (draft?.id === cardSetId) {
                setDraft(null);
                setDraftDirty(false);
            }
            setMessage(`${archived.name} is archived.`);
            await refresh();
        } catch (error) {
            Alert.alert('Starter Pack not archived', errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    const visibleSourceCards = useMemo(() => {
        if (!draft) return [];
        const cards = deckSourceCards({
            areas: deckData.areas,
            starterCards,
            products: packSource === 'products' ? products.filter((product) => product.status === 'approved') : products,
            tab: packSource,
        });
        const needle = query.trim().toLowerCase();
        return needle ? cards.filter((card) => `${card.label} ${card.detail}`.toLowerCase().includes(needle)) : cards;
    }, [deckData.areas, draft, packSource, products, query, starterCards]);

    if (allowed === false) return <AccessDenied message={message} />;
    const activeStarterDeck = isStarterMasterDeck(tab) ? tab : null;

    return (
        <ScrollView style={[styles.page, { backgroundColor: theme.colors.background }]} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: phone ? 16 : 20, paddingBottom: 56 }}>
            <View style={{ width: '100%', maxWidth: 1160, alignSelf: 'center' }}>
                <AdminNavBar backFallback="/super-admin" />
                <View style={[styles.hero, { backgroundColor: theme.colors.primary, borderRadius: theme.radii.card, padding: scaleIcon(20) }]}>
                    <Text selectable style={[styles.heroTitle, phone && { fontSize: 30 }]}>Card Decks</Text>
                    <Text selectable style={styles.heroSubtitle}>Define reusable HomeOS cards and versioned Starter Packs. Published packs are approved definitions for future or new-property setup—they do not modify existing homes.</Text>
                </View>
                <View accessibilityRole="tablist" style={styles.tabs}>
                    {HOMEOS_CARD_DECK_TABS.map((item) => (
                        <TouchableOpacity key={item.key} accessibilityRole="tab" accessibilityState={{ selected: tab === item.key }} accessibilityLabel={`${item.label} tab`} onPress={() => setTab(item.key)} style={[styles.tab, tab === item.key && styles.tabActive]}>
                            <Text style={[styles.tabText, tab === item.key && styles.tabTextActive]}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <Text selectable accessibilityLiveRegion="polite" style={[styles.status, { color: theme.colors.mutedText }]}>{busy ? 'Updating Card Decks…' : message}</Text>
                {busy && deckData.areas.length === 0 ? <ActivityIndicator size="large" color="#0A7563" style={{ margin: 42 }} /> : null}
                {tab === 'areas' ? <AreaCards areas={deckData.areas} /> : null}
                {activeStarterDeck ? <StarterCards title={HOMEOS_CARD_DECK_TABS.find((item) => item.key === activeStarterDeck)?.label || 'Master Cards'} cards={starterDeckCards(starterCards, activeStarterDeck)} allCards={starterCards} /> : null}
                {tab === 'products' ? <CatalogProducts products={products} /> : null}
                {tab === 'starter-packs' ? <StarterPacks cardSets={deckData.cardSets} draft={draft} draftDirty={draftDirty} busy={busy} areas={deckData.areas} starterCards={starterCards} products={products} unavailableProductCount={products.filter((product) => product.status !== 'approved').length} sourceCards={visibleSourceCards} packSource={packSource} query={query} setQuery={setQuery} setPackSource={setPackSource} onNew={() => openDraft()} onEdit={openDraft} onArchive={confirmArchive} onChangeDraft={updateDraft} onSave={() => void saveDraft()} onPublish={confirmPublish} /> : null}
            </View>
        </ScrollView>
    );
}

function MasterCardGrid({ kind, children }: {
    kind: 'area' | 'equipment';
    children: (cardStyle: ViewStyle) => ReactNode;
}) {
    const { width: viewportWidth } = useWindowDimensions();
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const contentWidth = Math.min(1160, Math.max(0, viewportWidth - (viewportWidth < 640 ? 32 : 40)));
    const minimumItemWidth = kind === 'area'
        ? foundation.grid.areaMinimumWidth
        : foundation.grid.equipmentMinimumWidth;
    const columns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth,
        minimumItemWidth,
        gap: foundation.grid.gap,
    });
    const cardWidth = resolveHomeOSContainerItemWidth({
        contentWidth,
        columns,
        gap: foundation.grid.gap,
        minimumItemWidth,
        maximumItemWidth: scaleIcon(220),
    });
    const cardStyle: ViewStyle = { width: cardWidth, minWidth: cardWidth, maxWidth: cardWidth };

    return <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: foundation.grid.gap }}>{children(cardStyle)}</View>;
}

function AreaCards({ areas }: { areas: HomeOSAreaCard[] }) {
    return <View style={styles.masterSection}>
        <Text selectable style={styles.sectionTitle}>Area Cards</Text>
        <Text selectable style={styles.hint}>These master cards use the same HomeOS Area card face. Starter Packs reference them by their permanent master key.</Text>
        {areas.length === 0
            ? <EmptyState title="No Area Cards yet" body="Area cards will appear here once the platform deck is configured." />
            : <MasterCardGrid kind="area">{(cardStyle) => areas.map((area) => (
                <AreaContainer
                    key={area.areaKey}
                    title={area.name}
                    subtitle={[displayWords(area.scope || 'home'), displayWords(area.publicationStatus || 'draft')].join(' · ')}
                    style={cardStyle}
                />
            ))}</MasterCardGrid>}
    </View>;
}

function StarterCards({ title, cards, allCards }: { title: string; cards: HomeOSStarterDeckCard[]; allCards: HomeOSStarterDeckCard[] }) {
    const cardNames = new Map(allCards.map((card) => [card.templateKey, card.name]));
    return <View style={styles.masterSection}>
        <Text selectable style={styles.sectionTitle}>{title}</Text>
        <Text selectable style={styles.hint}>One canonical master can appear in more than one catalog lens while remaining the same card everywhere in HomeOS.</Text>
        {cards.length === 0
            ? <EmptyState title={`No ${title} yet`} body="Master-card definitions will appear here." />
            : <MasterCardGrid kind="equipment">{(cardStyle) => cards.map((card) => {
                const parentName = card.parentTemplateKey ? cardNames.get(card.parentTemplateKey) : '';
                const detail = [displayWords(card.category), parentName ? `Inside ${parentName}` : displayWords(card.roomKind)].filter(Boolean).join(' · ');
                return (
                    <EquipmentContainer
                        key={card.templateKey}
                        title={card.name}
                        detail={detail}
                        style={cardStyle}
                    />
                );
            })}</MasterCardGrid>}
    </View>;
}

function CatalogProducts({ products }: { products: CatalogFactoryRecord[] }) {
    return <View style={styles.masterSection}>
        <View style={styles.sectionHeader}><View style={{ flex: 1 }}><Text selectable style={styles.sectionTitle}>Catalog Products</Text><Text selectable style={styles.hint}>These are the same product cards used by the HomeOS catalog. Product authoring remains in Catalog Factory.</Text></View><ThemedButton title="Open Catalog Factory" accessibilityLabel="Open Catalog Factory" onPress={() => router.push('/super-admin/catalog-factory' as any)} style={{ minHeight: 44, paddingHorizontal: 14 }} textStyle={{ fontSize: 14 }} /></View>
        {products.length === 0
            ? <EmptyState title="No catalog products available" body="Create and edit products in Catalog Factory." />
            : <View style={styles.productGrid}>{products.map((product) => {
                const productName = catalogProductName(product);
                const openCatalog = () => router.push('/super-admin/catalog-factory' as any);
                return (
                    <CompactCatalogProductTile
                        key={product.id}
                        shortCode={product.shortCode}
                        imageUrl={product.primaryImageUrl}
                        productName={productName}
                        model={product.modelNumber ? `Model ${product.modelNumber}` : ''}
                        identity={[product.brand || product.manufacturer, displayWords(product.category), displayWords(product.status)].filter(Boolean).join(' · ')}
                        onOpen={openCatalog}
                        primaryAction={{ title: 'Manage', accessibilityLabel: `Manage master product ${productName}`, onPress: openCatalog }}
                    />
                );
            })}</View>}
    </View>;
}

type StarterPacksProps = {
    cardSets: HomeOSCardSet[]; draft: HomeOSCardSetDraft | null; draftDirty: boolean; busy: boolean; areas: HomeOSAreaCard[]; starterCards: HomeOSStarterDeckCard[]; products: CatalogFactoryRecord[]; unavailableProductCount: number; sourceCards: ReturnType<typeof deckSourceCards>; packSource: PackSource; query: string;
    setQuery: (value: string) => void; setPackSource: (value: PackSource) => void; onNew: () => void; onEdit: (cardSet: HomeOSCardSet) => void; onArchive: (cardSet: HomeOSCardSet) => void; onChangeDraft: (draft: HomeOSCardSetDraft) => void; onSave: () => void; onPublish: () => void;
};

function StarterPacks(props: StarterPacksProps) {
    const { cardSets, draft, draftDirty, busy, areas, starterCards, products, unavailableProductCount, sourceCards, packSource, query, setQuery, setPackSource, onNew, onEdit, onArchive, onChangeDraft, onSave, onPublish } = props;
    const sortedMembers = draft ? [...draft.members].sort((left, right) => left.displayOrder - right.displayOrder) : [];
    return <View>
        <View style={styles.sectionHeader}><View style={{ flex: 1 }}><Text selectable style={styles.sectionTitle}>Starter Packs</Text><Text selectable style={styles.hint}>A published pack is an approved, versioned definition only. Home-item application is intentionally not part of this screen yet.</Text></View><TouchableOpacity accessibilityRole="button" onPress={onNew} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Create Starter Pack</Text></TouchableOpacity></View>
        <View style={styles.packList}>{cardSets.length === 0 ? <EmptyState title="No Starter Packs yet" body="Create a draft to define an approved future setup." /> : cardSets.map((cardSet) => {
            const archived = cardSet.status === 'archived';
            return <View key={cardSet.id} style={styles.card}><Text selectable style={styles.cardTitle}>{cardSet.name}</Text><Text selectable style={styles.meta}>{revisionLabel(cardSet)} · {archived ? 'Archived — read-only' : cardSet.status || 'active'}</Text><Text selectable style={styles.meta}>{cardSet.description || cardSet.setKey}</Text>{!archived ? <View style={styles.actions}><TouchableOpacity accessibilityRole="button" onPress={() => onEdit(cardSet)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Edit draft</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" onPress={() => onArchive(cardSet)} style={styles.dangerButton}><Text style={styles.dangerButtonText}>Archive</Text></TouchableOpacity></View> : null}</View>;
        })}</View>
        {draft ? <View style={styles.editor}>
            <Text selectable style={styles.editorTitle}>{draft.id ? 'Edit Starter Pack draft' : 'New Starter Pack draft'}</Text>
            <Text selectable style={styles.hint}>Save creates or updates a draft revision. Publish only after review.</Text>
            <Field label="Name"><TextInput accessibilityLabel="Starter Pack name" value={draft.name} onChangeText={(name) => onChangeDraft({ ...draft, name })} placeholder="e.g. Primary bathroom basics" style={styles.input} /></Field>
            <Field label="Stable key"><TextInput accessibilityLabel="Starter Pack stable key" autoCapitalize="none" editable={!draft.id} value={draft.setKey} onChangeText={(setKey) => onChangeDraft({ ...draft, setKey: setKey.toLowerCase() })} placeholder="primary-bathroom-basics" style={[styles.input, draft.id && styles.disabled]} />{draft.id ? <Text selectable style={styles.hint}>This stable key is permanent after creation.</Text> : null}</Field>
            <Field label="Description"><TextInput accessibilityLabel="Starter Pack description" value={draft.description} onChangeText={(description) => onChangeDraft({ ...draft, description })} multiline style={[styles.input, { minHeight: 84, textAlignVertical: 'top' }]} placeholder="What this approved definition contains" /></Field>
            <Text selectable style={styles.fieldLabel}>Target Area card</Text><View accessibilityRole="radiogroup" style={styles.choiceRow}>{areas.map((area) => <TouchableOpacity key={area.areaKey} accessibilityRole="radio" accessibilityState={{ selected: draft.targetAreaCardKey === area.areaKey }} onPress={() => onChangeDraft(setDraftTargetArea(draft, area.areaKey))} style={[styles.choice, draft.targetAreaCardKey === area.areaKey && styles.choiceActive]}><Text style={[styles.choiceText, draft.targetAreaCardKey === area.areaKey && styles.choiceTextActive]}>{area.name}</Text></TouchableOpacity>)}</View>
            <Text selectable style={[styles.fieldLabel, { marginTop: 18 }]}>Cards in this pack</Text>
            {sortedMembers.length === 0 ? <Text selectable style={styles.hint}>No cards selected yet. Add cards from the canonical decks below.</Text> : sortedMembers.map((member, index) => <DraftMember key={member.slotKey} member={member} index={index} members={draft.members} areas={areas} starterCards={starterCards} products={products} onChange={(next) => onChangeDraft(next)} draft={draft} />)}
            <Text selectable style={[styles.fieldLabel, { marginTop: 20 }]}>Add from canonical decks</Text>
            <View accessibilityRole="tablist" style={styles.sourceTabs}>{PACK_SOURCE_TABS.map((source) => <TouchableOpacity key={source.key} accessibilityRole="tab" accessibilityState={{ selected: packSource === source.key }} onPress={() => setPackSource(source.key)} style={[styles.sourceTab, packSource === source.key && styles.sourceTabActive]}><Text style={[styles.sourceText, packSource === source.key && styles.sourceTextActive]}>{source.label}</Text></TouchableOpacity>)}</View>
            <TextInput accessibilityLabel="Search cards to add" value={query} onChangeText={setQuery} placeholder="Search available cards" style={styles.input} />
            {packSource === 'products' && unavailableProductCount > 0 ? <Text selectable style={styles.hint}>{unavailableProductCount} draft or non-approved catalog product{unavailableProductCount === 1 ? ' is' : 's are'} unavailable until approved in Catalog Factory.</Text> : null}
            <View style={styles.sourceList}>{sourceCards.length === 0 ? <Text selectable style={styles.hint}>No matching cards in this deck.</Text> : sourceCards.map((source) => <TouchableOpacity key={`${source.targetKind}:${source.key}`} accessibilityRole="button" accessibilityLabel={`Add ${source.label}`} onPress={() => onChangeDraft(addDraftMember(draft, source))} style={styles.sourceCard}><View style={{ flex: 1 }}><Text selectable style={styles.cardTitle}>{source.label}</Text><Text selectable style={styles.meta}>{source.detail}</Text></View><Text style={styles.addText}>Add</Text></TouchableOpacity>)}</View>
            <View style={[styles.actions, { marginTop: 18 }]}><TouchableOpacity accessibilityRole="button" disabled={busy} onPress={onSave} style={[styles.primaryButton, busy && styles.disabled]}><Text style={styles.primaryButtonText}>Save draft</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityHint={draftDirty || !draft.hasDraftRevision ? 'Save changes as a draft before publishing.' : undefined} disabled={busy || !draft.id || !draft.hasDraftRevision || draftDirty} onPress={onPublish} style={[styles.publishButton, (!draft.id || !draft.hasDraftRevision || busy || draftDirty) && styles.disabled]}><Text style={styles.primaryButtonText}>{draftDirty || !draft.hasDraftRevision ? 'Save changes first to publish' : 'Publish approved definition'}</Text></TouchableOpacity></View>
        </View> : null}
    </View>;
}

function DraftMember({ member, index, members, areas, starterCards, products, draft, onChange }: { member: HomeOSCardSetDraft['members'][number]; index: number; members: HomeOSCardSetDraft['members']; areas: HomeOSAreaCard[]; starterCards: HomeOSStarterDeckCard[]; products: CatalogFactoryRecord[]; draft: HomeOSCardSetDraft; onChange: (draft: HomeOSCardSetDraft) => void }) {
    const lookup = { areas, starterCards, products };
    const card = starterCards.find((candidate) => candidate.templateKey === member.starterTemplateKey);
    const label = cardSetMemberLabel(member, lookup);
    const root = members.find((candidate) => candidate.targetKind === 'area');
    const starterCandidates = members.filter((candidate) => candidate.slotKey !== member.slotKey && candidate.targetKind === 'starter_template');
    const candidates = member.targetKind === 'catalog_product_variant'
        ? starterCandidates
        : card?.parentTemplateKey
            ? starterCandidates.filter((candidate) => candidate.starterTemplateKey === card.parentTemplateKey)
            : starterCandidates;
    if (member.targetKind === 'area') return <ThemedCard style={styles.member}><Text selectable style={styles.cardTitle}>Area root · {label}</Text><Text selectable style={styles.meta}>instantiate · always first in this Starter Pack</Text></ThemedCard>;
    const lockedContainer = card?.presentationRole === 'container';
    const needsStarterParent = member.targetKind === 'catalog_product_variant';
    const canChooseParent = !lockedContainer && (member.targetKind === 'starter_template' || needsStarterParent);
    return <ThemedCard style={styles.member}><Text selectable style={styles.cardTitle}>{index + 1}. {label}</Text><Text selectable style={styles.meta}>{member.targetKind.replace(/_/g, ' ')} · {member.memberBehavior}</Text>{lockedContainer ? <Text selectable style={styles.hint}>Area parent locked: {root ? cardSetMemberLabel(root, lookup) : 'Choose a target Area card'}</Text> : null}{canChooseParent ? <View style={styles.parentChoices}><Text selectable style={styles.hint}>{needsStarterParent ? 'Starter-card parent required' : card?.parentTemplateKey ? `Canonical parent: ${starterCards.find((candidate) => candidate.templateKey === card.parentTemplateKey)?.name || 'required starter card'}` : 'Optional starter-card parent'}</Text>{!needsStarterParent && !card?.parentTemplateKey ? <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: !member.parentSlotKey }} onPress={() => onChange(setDraftMemberParent(draft, member.slotKey, null))} style={[styles.parentChoice, !member.parentSlotKey && styles.choiceActive]}><Text style={styles.parentChoiceText}>None</Text></TouchableOpacity> : null}{candidates.map((candidate) => <TouchableOpacity key={candidate.slotKey} accessibilityRole="radio" accessibilityState={{ selected: member.parentSlotKey === candidate.slotKey }} onPress={() => onChange(setDraftMemberParent(draft, member.slotKey, candidate.slotKey))} style={[styles.parentChoice, member.parentSlotKey === candidate.slotKey && styles.choiceActive]}><Text style={styles.parentChoiceText}>{cardSetMemberLabel(candidate, lookup)}</Text></TouchableOpacity>)}</View> : null}<View style={styles.actions}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Move ${label} up`} disabled={index <= 1} onPress={() => onChange(moveDraftMember(draft, member.slotKey, -1))} style={[styles.smallButton, index <= 1 && styles.disabled]}><Text style={styles.secondaryButtonText}>Move Up</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Move ${label} down`} disabled={index === members.length - 1} onPress={() => onChange(moveDraftMember(draft, member.slotKey, 1))} style={[styles.smallButton, index === members.length - 1 && styles.disabled]}><Text style={styles.secondaryButtonText}>Move Down</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${label}`} onPress={() => onChange(removeDraftMember(draft, member.slotKey))} style={styles.dangerButton}><Text style={styles.dangerButtonText}>Remove</Text></TouchableOpacity></View></ThemedCard>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <View><Text selectable style={styles.fieldLabel}>{label}</Text>{children}</View>; }
function EmptyState({ title, body }: { title: string; body: string }) { return <ThemedCard style={styles.empty}><Text selectable style={styles.cardTitle}>{title}</Text><Text selectable style={styles.hint}>{body}</Text></ThemedCard>; }
function AccessDenied({ message }: { message: string }) { return <ScrollView style={styles.page} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, alignItems: 'center' }}><View style={{ maxWidth: 640, width: '100%' }}><TouchableOpacity accessibilityRole="button" onPress={() => router.replace('/super-admin' as any)} style={styles.primaryButton}><Text style={styles.primaryButtonText}>Super Admin</Text></TouchableOpacity><Text selectable style={styles.title}>Card Decks unavailable</Text><Text selectable style={styles.subtitle}>{message}</Text></View></ScrollView>; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Please try again.'; }
function isStarterMasterDeck(value: HomeOSCardDeckTab): value is HomeOSStarterMasterDeck { return STARTER_MASTER_DECKS.includes(value as HomeOSStarterMasterDeck); }
function displayWords(value: unknown) { return String(value || '').trim().replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase()); }
function catalogProductName(product: CatalogFactoryRecord) { return product.familyName || product.modelNumber || product.category || 'Catalog product'; }

const styles = {
    page: { flex: 1, backgroundColor: '#F3F6FA' }, hero: { backgroundColor: '#071B33', borderRadius: 24, padding: 20, marginTop: 16 }, title: { color: '#071B33', fontSize: 34, fontWeight: '900' as const, marginTop: 18 }, subtitle: { color: '#64748B', fontSize: 15, lineHeight: 22, marginTop: 8 }, heroTitle: { color: '#FFF', fontSize: 34, fontWeight: '900' as const }, heroSubtitle: { color: '#D8E3EF', fontSize: 15, lineHeight: 22, marginTop: 8 }, status: { color: '#486174', fontWeight: '700' as const, marginVertical: 14 }, tabs: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 16 }, tab: { minHeight: 44, justifyContent: 'center' as const, paddingHorizontal: 13, borderRadius: 14, borderWidth: 1, borderColor: '#C8D5E1', backgroundColor: '#FFF' }, tabActive: { backgroundColor: '#0A7563', borderColor: '#0A7563' }, tabText: { color: '#17324D', fontWeight: '900' as const }, tabTextActive: { color: '#FFF' }, grid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12 }, masterSection: { gap: 12 }, productGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, alignItems: 'stretch' as const }, card: { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#DDE5ED', borderRadius: 18, padding: 15, gap: 5, flexGrow: 1, flexBasis: 260, minWidth: 0 }, cardTitle: { color: '#071B33', fontSize: 16, fontWeight: '900' as const }, meta: { color: '#637083', lineHeight: 19 }, hint: { color: '#637083', lineHeight: 20, marginTop: 4 }, sectionTitle: { color: '#071B33', fontSize: 22, fontWeight: '900' as const }, sectionHeader: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 12, justifyContent: 'space-between' as const, alignItems: 'center' as const, marginBottom: 2 }, primaryButton: { backgroundColor: '#071B33', minHeight: 44, justifyContent: 'center' as const, alignItems: 'center' as const, paddingHorizontal: 14, borderRadius: 13 }, primaryButtonText: { color: '#FFF', fontWeight: '900' as const, textAlign: 'center' as const }, secondaryButton: { minHeight: 44, justifyContent: 'center' as const, alignItems: 'center' as const, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: '#AFC0CF', backgroundColor: '#FFF' }, secondaryButtonText: { color: '#17324D', fontWeight: '900' as const }, dangerButton: { minHeight: 44, justifyContent: 'center' as const, alignItems: 'center' as const, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: '#E3B4B8', backgroundColor: '#FFF5F5' }, dangerButtonText: { color: '#A21829', fontWeight: '900' as const }, packList: { gap: 10 }, editor: { backgroundColor: '#EAF5F3', borderRadius: 20, borderWidth: 1, borderColor: '#B8DBD4', padding: 16, marginTop: 18 }, editorTitle: { color: '#071B33', fontSize: 20, fontWeight: '900' as const }, fieldLabel: { color: '#17324D', fontWeight: '900' as const, marginTop: 16, marginBottom: 7 }, input: { minHeight: 44, color: '#071B33', borderWidth: 1, borderColor: '#B8C7D3', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }, choiceRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 }, choice: { minHeight: 44, justifyContent: 'center' as const, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: '#AFC0CF', backgroundColor: '#FFF' }, choiceActive: { backgroundColor: '#0A7563', borderColor: '#0A7563' }, choiceText: { color: '#17324D', fontWeight: '800' as const }, choiceTextActive: { color: '#FFF' }, sourceTabs: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 7, marginBottom: 10 }, sourceTab: { minHeight: 44, justifyContent: 'center' as const, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#AFC0CF', backgroundColor: '#FFF' }, sourceTabActive: { backgroundColor: '#17324D', borderColor: '#17324D' }, sourceText: { color: '#17324D', fontWeight: '900' as const }, sourceTextActive: { color: '#FFF' }, sourceList: { maxHeight: 360, gap: 8, marginTop: 10 }, sourceCard: { flexDirection: 'row' as const, gap: 10, minHeight: 56, alignItems: 'center' as const, padding: 12, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#CFDDE8' }, addText: { color: '#0A7563', fontWeight: '900' as const }, member: { backgroundColor: '#FFF', padding: 13, borderRadius: 14, borderWidth: 1, borderColor: '#C8DDE0', marginTop: 9 }, parentChoices: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 7, alignItems: 'center' as const, marginTop: 8 }, parentChoice: { minHeight: 44, justifyContent: 'center' as const, paddingHorizontal: 9, borderWidth: 1, borderColor: '#B8C7D3', borderRadius: 9, backgroundColor: '#FFF' }, parentChoiceText: { color: '#17324D', fontWeight: '800' as const, fontSize: 12 }, actions: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 12 }, smallButton: { minHeight: 44, justifyContent: 'center' as const, alignItems: 'center' as const, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: '#AFC0CF', backgroundColor: '#FFF' }, publishButton: { backgroundColor: '#0A7563', minHeight: 44, justifyContent: 'center' as const, alignItems: 'center' as const, paddingHorizontal: 14, borderRadius: 13 }, disabled: { opacity: 0.45 }, empty: { backgroundColor: '#FFF', padding: 20, borderWidth: 1, borderColor: '#DDE5ED', borderRadius: 18, width: '100%' as const, gap: 6 },
};
