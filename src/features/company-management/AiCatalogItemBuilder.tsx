import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Linking, Text, TextInput, TouchableOpacity, View } from 'react-native';
import CompactCatalogProductTile from '../../components/catalog/compact-catalog-product-tile';
import ProductCardImage from '../../components/catalog/product-card-image';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import type { CatalogTemplateDefinition } from '../../lib/catalogFactoryCore';
import { catalogFieldLabel } from '../../lib/catalogFactoryPresentation';
import { decideCatalogAiDraftSave, type CatalogAiDraftSaveDecision } from '../../lib/catalogAiDraftLifecycle';
import { useTheme } from '../../theme/useTheme';

export const AI_CATALOG_PRIMARY_ITEM_TYPES = [
    'Fixture',
    'Equipment',
    'Built-In / Assembly',
    'Basin / Receptacle',
    'Component',
] as const;

export type AiCatalogFieldProvenance = 'admin_entered' | 'verified_source' | 'ai_inferred' | 'unverified';

export type AiCatalogSource = {
    id: string;
    kind: 'product_page' | 'installation_manual' | 'owner_manual' | 'specification_sheet' | 'warranty' | 'other';
    title: string;
    url: string;
};

export type AiCatalogCandidateImage = {
    id: string;
    url: string;
    label: string;
    sourceUrl?: string;
    selected?: boolean;
    primary?: boolean;
    uploaded?: boolean;
};

export type AiCatalogItemDraft = {
    prompt: string;
    manufacturer: string;
    productName: string;
    familyName: string;
    modelNumber: string;
    manufacturerPartNumber: string;
    productUrl: string;
    notes: string;
    primaryItemType: string;
    subtype: string;
    categoryTemplateId: string;
    system: string;
    suggestedAreas: string[];
    parentPlacements: string[];
    tags: string[];
    description: string;
    specifications: Record<string, string>;
    sources: AiCatalogSource[];
    candidateImages: AiCatalogCandidateImage[];
    provenance: Record<string, AiCatalogFieldProvenance>;
    provenanceSourceUrls: Record<string, string[]>;
    warnings: string[];
    criticalWarnings: string[];
};

export type AiCatalogResearchRequest = {
    prompt: string;
    refinement: string;
    known: Pick<AiCatalogItemDraft, 'manufacturer' | 'productName' | 'modelNumber' | 'manufacturerPartNumber' | 'productUrl' | 'notes' | 'primaryItemType' | 'subtype' | 'system'>;
    currentDraft: AiCatalogItemDraft;
};

export type AiCatalogSavedDraftSummary = {
    draftId: string;
    label: string;
    updatedAt: string;
};

export type AiCatalogLoadedDraft = {
    draftId: string;
    draft: AiCatalogItemDraft;
};

export type AiCatalogItemBuilderAdapter = {
    research: (request: AiCatalogResearchRequest) => Promise<Partial<AiCatalogItemDraft>>;
    saveDraft: (draft: AiCatalogItemDraft) => Promise<{ draftId: string }>;
    approveDraft: (draftId: string, draft: AiCatalogItemDraft) => Promise<void>;
    pickImage?: () => Promise<AiCatalogCandidateImage | null>;
    /** Returns platform AI drafts that the current Super Admin is allowed to resume. */
    listDrafts?: () => Promise<AiCatalogSavedDraftSummary[]>;
    /** Maps the persisted payload back into this UI draft shape. */
    loadDraft?: (draftId: string) => Promise<AiCatalogLoadedDraft>;
    /** Clears any adapter-held draft identity before beginning a separate draft. */
    startNewDraft?: () => Promise<void> | void;
};

export type AiCatalogItemBuilderProps = {
    templates: CatalogTemplateDefinition[];
    adapter?: AiCatalogItemBuilderAdapter;
    busy?: boolean;
    onClose: () => void;
    onSaved?: (draftId: string) => void;
    onApproved?: () => void;
};

export type AiCatalogDraftSaveDecision = CatalogAiDraftSaveDecision;
export const decideAiCatalogDraftSave = decideCatalogAiDraftSave;

const blankDraft = (): AiCatalogItemDraft => ({
    prompt: '', manufacturer: '', productName: '', familyName: '', modelNumber: '', manufacturerPartNumber: '', productUrl: '', notes: '',
    primaryItemType: '', subtype: '', categoryTemplateId: '', system: '', suggestedAreas: [], parentPlacements: [], tags: [],
    description: '', specifications: {}, sources: [], candidateImages: [], provenance: {}, provenanceSourceUrls: {}, warnings: [], criticalWarnings: [],
});

function hasDraftContentFor(draft: AiCatalogItemDraft) {
    return Boolean(
        draft.prompt.trim()
        || draft.manufacturer.trim()
        || draft.productName.trim()
        || draft.familyName.trim()
        || draft.modelNumber.trim()
        || draft.manufacturerPartNumber.trim()
        || draft.productUrl.trim()
        || draft.notes.trim(),
    );
}

function normalizeAiCatalogItemDraft(draft: AiCatalogItemDraft): AiCatalogItemDraft {
    const blank = blankDraft();
    return {
        ...blank,
        ...draft,
        suggestedAreas: Array.isArray(draft.suggestedAreas) ? draft.suggestedAreas : [],
        parentPlacements: Array.isArray(draft.parentPlacements) ? draft.parentPlacements : [],
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        specifications: draft.specifications || {},
        sources: Array.isArray(draft.sources) ? draft.sources.slice(0, 4) : [],
        candidateImages: Array.isArray(draft.candidateImages) ? normalizeCandidateImages(draft.candidateImages) : [],
        provenance: draft.provenance || {},
        provenanceSourceUrls: normalizeProvenanceSourceUrls(draft.provenanceSourceUrls),
        warnings: Array.isArray(draft.warnings) ? draft.warnings : [],
        criticalWarnings: Array.isArray(draft.criticalWarnings) ? draft.criticalWarnings : [],
    };
}

function formatSavedDraftTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'recently' : date.toLocaleString();
}

const knownSystems = ['Plumbing', 'Electrical', 'HVAC', 'Gas', 'Appliance'];
const sourceLabels: Record<AiCatalogSource['kind'], string> = {
    product_page: 'Official product page', installation_manual: 'Installation manual', owner_manual: 'Owner manual',
    specification_sheet: 'Specification sheet', warranty: 'Warranty', other: 'Other source',
};

/**
 * UI-only Catalog Factory shell. The secured catalog research/save/approval implementation
 * is supplied through `adapter`; the panel never publishes a catalog product by itself.
 */
export default function AiCatalogItemBuilder({ templates, adapter, busy = false, onClose, onSaved, onApproved }: AiCatalogItemBuilderProps) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [draft, setDraft] = useState<AiCatalogItemDraft>(blankDraft);
    const [refinement, setRefinement] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [imageSourceUrl, setImageSourceUrl] = useState('');
    const [specificationKey, setSpecificationKey] = useState('');
    const [specificationValue, setSpecificationValue] = useState('');
    const [areaText, setAreaText] = useState('');
    const [placementText, setPlacementText] = useState('');
    const [tagText, setTagText] = useState('');
    const [message, setMessage] = useState(adapter ? 'Enter what you know, then research the missing information. Nothing publishes automatically.' : 'The secured Catalog Factory AI adapter is being connected. You can still prepare and preview a draft; research, saving, and approval remain unavailable until it is connected.');
    const [researching, setResearching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [approving, setApproving] = useState(false);
    const [draftId, setDraftId] = useState('');
    const [savedFingerprint, setSavedFingerprint] = useState('');
    const [savedDrafts, setSavedDrafts] = useState<AiCatalogSavedDraftSummary[]>([]);
    const [loadingSavedDrafts, setLoadingSavedDrafts] = useState(false);
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
    const failedAutoSaveFingerprintRef = useRef('');
    const draftRef = useRef(draft);

    const selectedTemplate = templates.find((template) => template.id === draft.categoryTemplateId);
    const productName = draft.productName.trim() || [draft.manufacturer, draft.familyName, draft.modelNumber].filter(Boolean).join(' ') || 'Catalog item draft';
    const primaryImage = draft.candidateImages.find((image) => image.selected && image.primary)?.url || '';
    const relevantFields = useMemo(() => selectedTemplate?.specificationFields || [], [selectedTemplate]);
    const isBusy = busy || researching || saving || approving;
    const identityReady = Boolean(
        draft.categoryTemplateId
        && draft.manufacturer.trim()
        && (draft.productName.trim() || draft.familyName.trim())
        && draft.modelNumber.trim(),
    );
    const modelProvenance = provenanceFor(draft.provenance, 'modelNumber', 'model_number');
    const modelVerifiedOrEntered = modelProvenance === 'admin_entered' || modelProvenance === 'verified_source';
    const approvalIdentityReady = identityReady
        && modelVerifiedOrEntered
        && Boolean(draft.primaryItemType.trim())
        && Boolean(draft.subtype.trim());
    const hasDraftContent = Boolean(
        draft.prompt.trim()
        || draft.manufacturer.trim()
        || draft.productName.trim()
        || draft.familyName.trim()
        || draft.modelNumber.trim()
        || draft.manufacturerPartNumber.trim()
        || draft.productUrl.trim()
        || draft.notes.trim(),
    );
    const isDirty = Boolean(draftId && savedFingerprint !== fingerprintDraft(draft));
    const curatedSourceCount = draft.sources.length;
    const selectedImages = draft.candidateImages.filter((image) => image.selected);
    const hasDeliberatePrimaryImage = selectedImages.some((image) => image.primary);
    const selectedImageSourcesCurated = selectedImages.every((image) => image.uploaded || sourceIsCurated(image.sourceUrl, draft.sources));
    const imageReviewReady = selectedImages.length === 0 || (hasDeliberatePrimaryImage && selectedImageSourcesCurated);
    const selectedImageCount = draft.candidateImages.filter((image) => image.selected).length;
    const selectedPrimaryCount = draft.candidateImages.filter((image) => image.selected && image.primary).length;
    const criticalWarnings = [
        ...visibleCriticalWarnings(draft.criticalWarnings, identityReady, modelVerifiedOrEntered),
        selectedImageCount > 0 && selectedPrimaryCount !== 1
            ? 'Choose exactly one primary image for the selected images.'
            : '',
    ].filter(Boolean);
    const hasCriticalWarnings = criticalWarnings.length > 0;

    const refreshSavedDrafts = useCallback(async () => {
        if (!adapter?.listDrafts) return;
        setLoadingSavedDrafts(true);
        try {
            const next = await adapter.listDrafts();
            setSavedDrafts(next);
        } catch (error) {
            setMessage(readError(error));
        } finally {
            setLoadingSavedDrafts(false);
        }
    }, [adapter]);

    useEffect(() => {
        void refreshSavedDrafts();
    }, [refreshSavedDrafts]);

    const persistDraft = useCallback(async (snapshot: AiCatalogItemDraft, reason: 'manual' | 'auto' | 'research' | 'flush'): Promise<boolean> => {
        if (!adapter || !hasDraftContentFor(snapshot)) return false;
        const snapshotFingerprint = fingerprintDraft(snapshot);
        setSaving(true);
        try {
            const result = await adapter.saveDraft(snapshot);
            setDraftId(result.draftId);
            setSavedFingerprint(snapshotFingerprint);
            failedAutoSaveFingerprintRef.current = '';
            if (reason === 'manual' || reason === 'flush') setMessage('Draft saved. It is not in the live catalog until you explicitly approve it.');
            if (reason === 'research') setMessage('Research is now saved as an editable draft. Review every field, select approved sources and imagery, then approve only when ready.');
            onSaved?.(result.draftId);
            void refreshSavedDrafts();
            return true;
        } catch (error) {
            if (reason === 'auto') failedAutoSaveFingerprintRef.current = snapshotFingerprint;
            setMessage(reason === 'auto' ? `Automatic draft save failed. Make another edit or use Save Draft to retry. ${readError(error)}` : readError(error));
            return false;
        } finally {
            setSaving(false);
        }
    }, [adapter, onSaved, refreshSavedDrafts]);

    const enqueueSave = useCallback((snapshot: AiCatalogItemDraft, reason: 'manual' | 'auto' | 'research' | 'flush') => {
        const next = () => persistDraft(snapshot, reason);
        saveQueueRef.current = saveQueueRef.current.then(next, next);
        return saveQueueRef.current;
    }, [persistDraft]);

    const clearAutoSave = () => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
    };

    const draftFingerprint = fingerprintDraft(draft);
    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);

    useEffect(() => {
        const decision = decideAiCatalogDraftSave({
            hasContent: hasDraftContent,
            currentFingerprint: draftFingerprint,
            savedFingerprint,
            failedAutoSaveFingerprint: failedAutoSaveFingerprintRef.current,
        });
        if (!adapter || researching || approving || busy || !decision.shouldSave) return undefined;
        clearAutoSave();
        autoSaveTimerRef.current = setTimeout(() => {
            autoSaveTimerRef.current = null;
            void enqueueSave(draft, 'auto');
        }, decision.delayMs);
        return clearAutoSave;
    }, [adapter, approving, busy, draft, draftFingerprint, enqueueSave, hasDraftContent, researching, savedFingerprint]);

    useEffect(() => clearAutoSave, []);

    const update = <K extends keyof AiCatalogItemDraft>(key: K, value: AiCatalogItemDraft[K], provenance: AiCatalogFieldProvenance = 'admin_entered') => {
        setDraft((current) => ({
            ...current,
            [key]: value,
            provenance: { ...current.provenance, [key]: provenance },
            provenanceSourceUrls: { ...current.provenanceSourceUrls, [key]: [] },
        }));
    };

    const addListValue = (key: 'suggestedAreas' | 'parentPlacements' | 'tags', value: string, setText: (value: string) => void) => {
        const clean = value.trim();
        if (!clean) return;
        setDraft((current) => current[key].some((item) => item.toLowerCase() === clean.toLowerCase())
            ? current
            : {
                ...current,
                [key]: [...current[key], clean],
                provenance: { ...current.provenance, [key]: 'admin_entered' },
                provenanceSourceUrls: { ...current.provenanceSourceUrls, [key]: [] },
            });
        setText('');
    };

    const removeListValue = (key: 'suggestedAreas' | 'parentPlacements' | 'tags', value: string) => {
        setDraft((current) => ({
            ...current,
            [key]: current[key].filter((item) => item !== value),
            provenance: { ...current.provenance, [key]: 'admin_entered' },
            provenanceSourceUrls: { ...current.provenanceSourceUrls, [key]: [] },
        }));
    };

    const removeSource = (id: string) => setDraft((current) => removeDraftSource(current, id));

    const addImageUrl = () => {
        const url = imageUrl.trim();
        const sourceUrl = imageSourceUrl.trim();
        if (!isHttpUrl(url) || !isHttpUrl(sourceUrl)) {
            setMessage('Enter both a direct http(s) image URL and an official http(s) source-page URL before adding a candidate image.');
            return;
        }
        setDraft((current) => ({
            ...current,
            candidateImages: [...current.candidateImages, {
                id: `url-${Date.now()}`,
                url,
                label: 'Candidate source image',
                sourceUrl,
                selected: false,
                primary: false,
            }],
        }));
        setImageUrl('');
        setImageSourceUrl('');
    };

    const selectPrimaryImage = (id: string) => setDraft((current) => ({
        ...current,
        candidateImages: current.candidateImages.map((image) => ({ ...image, selected: image.id === id ? true : image.selected, primary: image.id === id })),
    }));

    const toggleImageSelected = (id: string) => setDraft((current) => {
        const candidateImages = current.candidateImages.map((image) => image.id === id
            ? { ...image, selected: !image.selected, primary: image.selected ? false : image.primary }
            : image);
        return { ...current, candidateImages };
    });

    const removeImage = (id: string) => setDraft((current) => ({
        ...current,
        candidateImages: current.candidateImages.filter((image) => image.id !== id),
    }));

    const addOwnImage = async () => {
        if (!adapter?.pickImage) return;
        try {
            const image = await adapter.pickImage();
            if (!image) return;
            setDraft((current) => ({
                ...current,
                candidateImages: [...current.candidateImages, {
                    ...image,
                    selected: false,
                    primary: false,
                    uploaded: true,
                }],
            }));
        } catch (error) {
            setMessage(readError(error));
        }
    };

    const runResearch = async () => {
        if (!adapter) return;
        if (!draft.prompt.trim() && !draft.manufacturer.trim() && !draft.productName.trim() && !draft.modelNumber.trim() && !draft.manufacturerPartNumber.trim() && !draft.productUrl.trim()) {
            setMessage('Describe the item or enter any known product detail before researching.');
            return;
        }
        clearAutoSave();
        setResearching(true);
        setMessage(refinement.trim() ? 'Revising the research draft…' : 'Researching authoritative product information…');
        try {
            const result = await adapter.research({
                prompt: draft.prompt,
                refinement,
                known: pickKnownFields(draft),
                currentDraft: draft,
            });
            const researchedDraft = mergeResearchDraft(draftRef.current, result);
            setDraft(researchedDraft);
            setRefinement('');
            clearAutoSave();
            const saved = await enqueueSave(researchedDraft, 'research');
            if (!saved) setMessage('Research is ready locally, but could not be saved yet. Review it, then use Save Draft to retry before leaving.');
        } catch (error) {
            setMessage(readError(error));
        } finally {
            setResearching(false);
        }
    };

    const saveDraft = async () => {
        if (!adapter) return false;
        if (!hasDraftContent) {
            setMessage('Describe the item or enter at least one known product detail before saving a draft.');
            return false;
        }
        clearAutoSave();
        return enqueueSave(draft, 'manual');
    };

    const flushBeforeExit = async () => {
        clearAutoSave();
        if (!hasDraftContent || (!isDirty && Boolean(draftId))) return true;
        const saved = await enqueueSave(draft, 'flush');
        if (!saved) setMessage('This draft could not be saved. Retry Save Draft before leaving so your research is not lost.');
        return saved;
    };

    const hydrateDraft = (loaded: AiCatalogLoadedDraft) => {
        const next = normalizeAiCatalogItemDraft(loaded.draft);
        setDraft(next);
        setDraftId(loaded.draftId);
        setSavedFingerprint(fingerprintDraft(next));
        failedAutoSaveFingerprintRef.current = '';
        setRefinement('');
        setMessage('Saved AI draft resumed. Review, edit, or research again; it remains unpublished until you approve it.');
    };

    const resumeDraft = async (summary: AiCatalogSavedDraftSummary) => {
        if (!adapter?.loadDraft) return;
        const flushed = await flushBeforeExit();
        if (!flushed) return;
        setLoadingSavedDrafts(true);
        try {
            hydrateDraft(await adapter.loadDraft(summary.draftId));
        } catch (error) {
            setMessage(readError(error));
        } finally {
            setLoadingSavedDrafts(false);
        }
    };

    const startNewDraft = async () => {
        if (!adapter?.startNewDraft) return;
        const flushed = await flushBeforeExit();
        if (!flushed) return;
        try {
            await adapter.startNewDraft();
            setDraft(blankDraft());
            setDraftId('');
            setSavedFingerprint('');
            failedAutoSaveFingerprintRef.current = '';
            setRefinement('');
            setMessage('New AI catalog draft. Add what you know, then research when ready.');
        } catch (error) {
            setMessage(readError(error));
        }
    };

    const closeBuilder = async () => {
        const flushed = await flushBeforeExit();
        if (flushed) onClose();
    };

    const approve = async () => {
        if (!adapter || !draftId || isDirty || !imageReviewReady) return;
        setApproving(true);
        try {
            await adapter.approveDraft(draftId, draft);
            setMessage('Approved and added to the existing live catalog. It uses the same production catalog card as every other item.');
            onApproved?.();
        } catch (error) {
            setMessage(readError(error));
        } finally {
            setApproving(false);
        }
    };

    const addSpecification = () => {
        const key = specificationKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        if (!key || !specificationValue.trim()) return;
        setDraft((current) => ({
            ...current,
            specifications: { ...current.specifications, [key]: specificationValue.trim() },
            provenance: { ...current.provenance, [`specifications.${key}`]: 'admin_entered' },
            provenanceSourceUrls: { ...current.provenanceSourceUrls, [`specifications.${key}`]: [] },
        }));
        setSpecificationKey('');
        setSpecificationValue('');
    };

    return (
        <ThemedCard style={{ gap: scaleIcon(16), padding: scaleIcon(16), borderCurve: 'continuous' }}>
            <View style={{ gap: scaleIcon(5) }}>
                <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(24), fontWeight: '900' }}>Create Catalog Item with AI</Text>
                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(20) }}>
                    Create an editable draft from as much or as little information as you know. AI research is an explicit action; it never runs while normal catalog cards load.
                </Text>
            </View>

            <Notice message={message} warning={!adapter} />

            {!!adapter?.listDrafts && <Section title="Saved AI drafts">
                <Text selectable style={{ color: theme.colors.mutedText, lineHeight: scaleFont(19) }}>Saved research stays private to Super Admin review. Resuming never publishes a catalog item.</Text>
                {loadingSavedDrafts && <Text selectable style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading saved drafts…</Text>}
                {!loadingSavedDrafts && !savedDrafts.length && <Text selectable style={{ color: theme.colors.mutedText }}>No saved AI drafts yet.</Text>}
                <View style={{ gap: scaleIcon(7) }}>
                    {savedDrafts.map((summary) => (
                        <View key={summary.draftId} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: scaleIcon(8), borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, borderRadius: scaleIcon(11), borderCurve: 'continuous', padding: scaleIcon(10) }}>
                            <View style={{ flex: 1, minWidth: scaleIcon(160), gap: 2 }}>
                                <Text selectable style={{ color: theme.colors.text, fontWeight: '900' }}>{summary.label || 'Untitled AI catalog draft'}</Text>
                                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12) }}>Saved {formatSavedDraftTime(summary.updatedAt)}</Text>
                            </View>
                            <ThemedButton title="Resume" variant="secondary" disabled={isBusy || !adapter.loadDraft} onPress={() => void resumeDraft(summary)} />
                        </View>
                    ))}
                </View>
                {!!adapter.startNewDraft && <ThemedButton title="Start New AI Draft" variant="secondary" disabled={isBusy} onPress={() => void startNewDraft()} />}
            </Section>}

            <BuilderField label="Describe the item" required value={draft.prompt} onChangeText={(value) => update('prompt', value)} multiline placeholder="Example: Rheem Performance Platinum 50-gallon natural gas water heater" />
            <Row>
                <BuilderField label="Manufacturer" value={draft.manufacturer} onChangeText={(value) => update('manufacturer', value)} />
                <BuilderField label="Product name" value={draft.productName} onChangeText={(value) => update('productName', value)} />
            </Row>
            <Row>
                <BuilderField label="Model number" value={draft.modelNumber} onChangeText={(value) => update('modelNumber', value)} />
                <BuilderField label="Manufacturer part number" value={draft.manufacturerPartNumber} onChangeText={(value) => update('manufacturerPartNumber', value)} />
            </Row>
            <BuilderField label="Official product URL" value={draft.productUrl} onChangeText={(value) => update('productUrl', value)} placeholder="https://manufacturer.example/product" autoCapitalize="none" />
            <BuilderField label="Notes or known specifications" value={draft.notes} onChangeText={(value) => update('notes', value)} multiline />

            <View style={{ gap: scaleIcon(8), padding: scaleIcon(12), borderRadius: scaleIcon(12), borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }}>
                <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(17), fontWeight: '900' }}>AI research and refinement</Text>
                <Text selectable style={{ color: theme.colors.mutedText, lineHeight: scaleFont(19) }}>Research favors manufacturer documentation and retains only a compact, reviewed source set. No technical value should be guessed when it cannot be verified.</Text>
                <BuilderField label="Refine the draft" value={refinement} onChangeText={setRefinement} placeholder="Example: use the tall model, include the warranty, and remove unverified flow-rate claims" multiline />
                <ThemedButton title={researching ? 'Researching…' : refinement.trim() ? 'Research Again' : 'Research Missing Information'} disabled={!adapter || isBusy} onPress={() => void runResearch()} />
            </View>

            <Section title="Classification and placement">
                <ChipRow values={AI_CATALOG_PRIMARY_ITEM_TYPES as unknown as string[]} selected={draft.primaryItemType} onSelect={(value) => update('primaryItemType', value)} />
                <Row>
                    <BuilderField label="Subtype" value={draft.subtype} onChangeText={(value) => update('subtype', value)} placeholder="Example: Tank water heater" />
                    <BuilderField label="System" value={draft.system} onChangeText={(value) => update('system', value)} placeholder="Plumbing" />
                </Row>
                <ChipRow values={knownSystems} selected={draft.system} onSelect={(value) => update('system', value)} />
                <TemplatePicker templates={templates} value={draft.categoryTemplateId} onChange={(id) => update('categoryTemplateId', id)} />
                <TagEditor label="Valid HomeOS areas" value={areaText} setValue={setAreaText} values={draft.suggestedAreas} onAdd={() => addListValue('suggestedAreas', areaText, setAreaText)} onRemove={(value) => removeListValue('suggestedAreas', value)} placeholder="Bathroom, Kitchen, Garage" />
                <TagEditor label="Valid parent / container placements" value={placementText} setValue={setPlacementText} values={draft.parentPlacements} onAdd={() => addListValue('parentPlacements', placementText, setPlacementText)} onRemove={(value) => removeListValue('parentPlacements', value)} placeholder="Bathroom Vanity, Kitchen Sink" />
                <TagEditor label="Flexible tags" value={tagText} setValue={setTagText} values={draft.tags} onAdd={() => addListValue('tags', tagText, setTagText)} onRemove={(value) => removeListValue('tags', value)} placeholder="plumbing, serviceable, water-using" />
            </Section>

            <Section title="Structured item information">
                <BuilderField label="Short description" value={draft.description} onChangeText={(value) => update('description', value)} multiline />
                {relevantFields.map((field) => (
                    <BuilderField key={field.key} label={field.label} value={draft.specifications[field.key] || ''} onChangeText={(value) => setDraft((current) => ({
                        ...current,
                        specifications: { ...current.specifications, [field.key]: value },
                        provenance: { ...current.provenance, [`specifications.${field.key}`]: 'admin_entered' },
                        provenanceSourceUrls: { ...current.provenanceSourceUrls, [`specifications.${field.key}`]: [] },
                    }))} />
                ))}
                {Object.entries(draft.specifications).filter(([key]) => !relevantFields.some((field) => field.key === key)).map(([key, value]) => (
                    <BuilderField key={key} label={catalogFieldLabel(key)} value={value} onChangeText={(nextValue) => setDraft((current) => ({
                        ...current,
                        specifications: { ...current.specifications, [key]: nextValue },
                        provenance: { ...current.provenance, [`specifications.${key}`]: 'admin_entered' },
                        provenanceSourceUrls: { ...current.provenanceSourceUrls, [`specifications.${key}`]: [] },
                    }))} />
                ))}
                <Row>
                    <BuilderField label="Additional field" value={specificationKey} onChangeText={setSpecificationKey} placeholder="connection_size" />
                    <BuilderField label="Value" value={specificationValue} onChangeText={setSpecificationValue} placeholder="3/4 in." />
                </Row>
                <ThemedButton title="Add field" variant="secondary" disabled={!specificationKey.trim() || !specificationValue.trim() || isBusy} onPress={addSpecification} />
                <ProvenanceSummary provenance={draft.provenance} />
            </Section>

            <Section title="Sources">
                <Text selectable style={{ color: theme.colors.mutedText, lineHeight: scaleFont(19) }}>Keep 2–4 concise, non-duplicative authoritative references. Prefer an official product page plus only the technical documents that add unique information.</Text>
                {draft.sources.slice(0, 4).map((source) => (
                    <View key={source.id} style={{ flexDirection: 'row', gap: scaleIcon(8), alignItems: 'center', paddingVertical: scaleIcon(4) }}>
                        <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL(source.url)} style={{ flex: 1, paddingVertical: scaleIcon(5) }}>
                            <Text selectable style={{ color: theme.colors.primary, fontWeight: '900' }}>{sourceLabels[source.kind]} · {source.title || source.url}</Text>
                        </TouchableOpacity>
                        <ThemedButton title="Remove" variant="secondary" disabled={isBusy} onPress={() => removeSource(source.id)} />
                    </View>
                ))}
                {!draft.sources.length && <Text selectable style={{ color: theme.colors.mutedText }}>Research results will appear here for review. No source is published automatically.</Text>}
                {draft.sources.length > 4 && <Text selectable style={{ color: '#8A5400', fontWeight: '800' }}>Only the first four curated sources are retained in this review panel.</Text>}
            </Section>

            <Section title="Candidate images">
                <Text selectable style={{ color: theme.colors.mutedText, lineHeight: scaleFont(19) }}>Images are sourced from approved online references or uploaded by the Super Admin. This builder does not generate images.</Text>
                <Row>
                    <BuilderField label="Direct image URL" value={imageUrl} onChangeText={setImageUrl} placeholder="https://manufacturer.example/image.jpg" autoCapitalize="none" />
                    <BuilderField label="Official source-page URL" value={imageSourceUrl} onChangeText={setImageSourceUrl} placeholder="https://manufacturer.example/product" autoCapitalize="none" />
                </Row>
                <ThemedButton title="Add source image" variant="secondary" disabled={isBusy || !imageUrl.trim() || !imageSourceUrl.trim()} onPress={addImageUrl} />
                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(17) }}>Every included image must have a source page already present in the curated sources above; unselected candidates are not published.</Text>
                {!!adapter?.pickImage && <ThemedButton title="Upload own image" variant="secondary" disabled={isBusy} onPress={() => void addOwnImage()} />}
                {!adapter?.pickImage && <Text selectable style={{ color: theme.colors.mutedText }}>Own-image upload will use the existing private Catalog Factory media bucket when the secured adapter is connected.</Text>}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
                {draft.candidateImages.map((image) => (
                        <ThemedCard key={image.id} style={{ width: scaleIcon(178), padding: scaleIcon(9), gap: scaleIcon(8), borderColor: image.primary ? theme.colors.primary : theme.colors.border, borderWidth: image.primary ? 2 : 1 }}>
                            <ProductCardImage imageUrl={image.url} productName={productName} compact style={{ width: '100%', height: scaleIcon(94), minHeight: scaleIcon(94) }} />
                            <Text selectable numberOfLines={2} style={{ color: theme.colors.text, fontWeight: '900' }}>{image.label}</Text>
                            <ThemedButton title={image.selected ? 'Remove from included images' : 'Include supporting image'} variant="secondary" onPress={() => toggleImageSelected(image.id)} disabled={isBusy} />
                            <ThemedButton title={image.primary ? 'Primary image' : 'Make primary'} variant="secondary" onPress={() => selectPrimaryImage(image.id)} disabled={isBusy || image.primary} />
                            <ThemedButton title="Remove" variant="secondary" onPress={() => removeImage(image.id)} disabled={isBusy} />
                        </ThemedCard>
                    ))}
                </View>
            </Section>

            <Section title="Production card preview">
                <Text selectable style={{ color: theme.colors.mutedText, lineHeight: scaleFont(19) }}>This is the existing production catalog component. Approved AI-created and manually created products render identically.</Text>
                <CompactCatalogProductTile
                    shortCode="DRAFT"
                    imageUrl={primaryImage}
                    productName={productName}
                    model={draft.modelNumber || 'Model not supplied'}
                    identity={[draft.subtype, draft.system].filter(Boolean).join(' · ') || selectedTemplate?.categoryName || 'Catalog item'}
                    onOpen={() => setMessage('This is a production-card preview. The live catalog opens the same card after explicit approval.')}
                    primaryAction={{ title: 'Preview', onPress: () => setMessage('This is a production-card preview. The live catalog opens the same card after explicit approval.') }}
                    style={{ width: '100%', maxWidth: scaleIcon(320), flexGrow: 0, flexBasis: scaleIcon(210) }}
                />
            </Section>

            {!!(draft.warnings.length || criticalWarnings.length) && <Section title="Review warnings"><View style={{ gap: scaleIcon(5) }}>{criticalWarnings.map((warning) => <Text selectable key={`critical-${warning}`} style={{ color: '#8A1020', lineHeight: scaleFont(19), fontWeight: '900' }}>• Required before approval: {warning}</Text>)}{draft.warnings.map((warning) => <Text selectable key={warning} style={{ color: '#8A5400', lineHeight: scaleFont(19) }}>• {warning}</Text>)}</View></Section>}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(9) }}>
                <ThemedButton title={saving ? 'Saving…' : isDirty ? 'Save Updated Draft' : 'Save Draft'} disabled={!adapter || !hasDraftContent || isBusy} onPress={() => void saveDraft()} style={{ flexGrow: 1 }} />
                <ThemedButton title={approving ? 'Approving…' : 'Approve & Add to Catalog'} disabled={!adapter || !draftId || isDirty || !approvalIdentityReady || !imageReviewReady || hasCriticalWarnings || isBusy} onPress={() => void approve()} style={{ flexGrow: 1 }} />
                <ThemedButton title="Cancel" variant="secondary" disabled={isBusy} onPress={() => void closeBuilder()} style={{ flexGrow: 1 }} />
            </View>
            <View style={{ gap: scaleIcon(3) }}>
                <Text selectable style={{ color: saving ? theme.colors.primary : isDirty || (hasDraftContent && !draftId) ? '#8A5400' : theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(17), fontWeight: '800' }}>
                    {saving ? 'Saving draft…' : isDirty ? 'Unsaved changes' : draftId ? 'Saved' : hasDraftContent ? 'Not saved yet' : 'Start with a description or known item detail'}
                </Text>
                {!hasDraftContent && <Text selectable style={{ color: '#8A5400', fontSize: scaleFont(12), lineHeight: scaleFont(17) }}>Enter a description or any known product detail to save an incomplete draft for later research.</Text>}
                {!identityReady && <Text selectable style={{ color: '#8A5400', fontSize: scaleFont(12), lineHeight: scaleFont(17) }}>Approval requires an existing category template, manufacturer, product or family name, and an exact model number.</Text>}
                {identityReady && !modelVerifiedOrEntered && <Text selectable style={{ color: '#8A5400', fontSize: scaleFont(12), lineHeight: scaleFont(17) }}>Approval requires the exact model number to be verified by a source or entered by the Super Admin.</Text>}
                {identityReady && (!draft.primaryItemType.trim() || !draft.subtype.trim()) && <Text selectable style={{ color: '#8A5400', fontSize: scaleFont(12), lineHeight: scaleFont(17) }}>Approval also requires a primary item type and subtype.</Text>}
                {curatedSourceCount < 2 && <Text selectable style={{ color: '#8A5400', fontSize: scaleFont(12), lineHeight: scaleFont(17) }}>Aim for 2–4 curated references where useful. A single authoritative source can still be sufficient after Super Admin review.</Text>}
                {hasCriticalWarnings && <Text selectable style={{ color: '#8A1020', fontSize: scaleFont(12), lineHeight: scaleFont(17) }}>Approval is blocked until the required technical or identity warnings above are resolved.</Text>}
                {selectedImages.length > 0 && !hasDeliberatePrimaryImage && <Text selectable style={{ color: '#8A1020', fontSize: scaleFont(12), lineHeight: scaleFont(17) }}>Choose one included image as the primary image before approval.</Text>}
                {selectedImages.length > 0 && !selectedImageSourcesCurated && <Text selectable style={{ color: '#8A1020', fontSize: scaleFont(12), lineHeight: scaleFont(17) }}>Every included image must link back to a source-page URL already retained in the curated sources before approval.</Text>}
                {!draftId && <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(17) }}>Approval stays unavailable until this exact reviewed draft has been saved. Saving never publishes.</Text>}
                {isDirty && <Text selectable style={{ color: '#8A5400', fontSize: scaleFont(12), lineHeight: scaleFont(17) }}>This draft has changed since it was saved. Save the current version again before approving it.</Text>}
            </View>
        </ThemedCard>
    );
}

function pickKnownFields(draft: AiCatalogItemDraft): AiCatalogResearchRequest['known'] {
    return {
        manufacturer: draft.manufacturer, productName: draft.productName, modelNumber: draft.modelNumber,
        manufacturerPartNumber: draft.manufacturerPartNumber, productUrl: draft.productUrl, notes: draft.notes,
        primaryItemType: draft.primaryItemType, subtype: draft.subtype, system: draft.system,
    };
}

function mergeResearchDraft(current: AiCatalogItemDraft, next: Partial<AiCatalogItemDraft>): AiCatalogItemDraft {
    const researchProvenance = next.provenance || {};
    const researchProvenanceSourceUrls = next.provenanceSourceUrls || {};
    const mergeValue = <K extends 'manufacturer' | 'productName' | 'familyName' | 'modelNumber' | 'manufacturerPartNumber' | 'productUrl' | 'primaryItemType' | 'subtype' | 'categoryTemplateId' | 'system' | 'description'>(key: K) => {
        const existing = current[key];
        const nextValue = next[key];
        const currentOrigin = provenanceFor(current.provenance, key, snakeCase(key));
        const nextOrigin = provenanceFor(researchProvenance, key, snakeCase(key));
        const currentSourceUrls = provenanceUrlsFor(current.provenanceSourceUrls, key, snakeCase(key));
        const nextSourceUrls = provenanceUrlsFor(researchProvenanceSourceUrls, key, snakeCase(key));
        if (existing && currentOrigin === 'admin_entered') return { value: existing, provenance: currentOrigin, sourceUrls: [] };
        if (nextValue) return { value: nextValue as AiCatalogItemDraft[K], provenance: nextOrigin || currentOrigin, sourceUrls: nextSourceUrls };
        return { value: existing, provenance: currentOrigin, sourceUrls: currentSourceUrls };
    };
    const mergeSpecification = (key: string) => {
        const existing = current.specifications[key];
        const nextValue = next.specifications?.[key];
        const currentOrigin = provenanceFor(current.provenance, `specifications.${key}`);
        const nextOrigin = provenanceFor(researchProvenance, `specifications.${key}`);
        const provenanceKey = `specifications.${key}`;
        const currentSourceUrls = provenanceUrlsFor(current.provenanceSourceUrls, provenanceKey);
        const nextSourceUrls = provenanceUrlsFor(researchProvenanceSourceUrls, provenanceKey);
        if (existing && currentOrigin === 'admin_entered') return { value: existing, provenance: currentOrigin, sourceUrls: [] };
        if (nextValue) return { value: nextValue, provenance: nextOrigin || currentOrigin, sourceUrls: nextSourceUrls };
        return { value: existing, provenance: currentOrigin, sourceUrls: currentSourceUrls };
    };
    const scalarKeys = ['manufacturer', 'productName', 'familyName', 'modelNumber', 'manufacturerPartNumber', 'productUrl', 'primaryItemType', 'subtype', 'categoryTemplateId', 'system', 'description'] as const;
    const scalars = Object.fromEntries(scalarKeys.map((key) => [key, mergeValue(key)])) as Record<(typeof scalarKeys)[number], { value: string; provenance?: AiCatalogFieldProvenance; sourceUrls: string[] }>;
    const specificationEntries = Object.fromEntries(unique([...Object.keys(current.specifications), ...Object.keys(next.specifications || {})]).map((key) => [key, mergeSpecification(key)]));
    const provenance = { ...current.provenance, ...researchProvenance };
    const provenanceSourceUrls = { ...current.provenanceSourceUrls, ...researchProvenanceSourceUrls };
    scalarKeys.forEach((key) => {
        const origin = scalars[key].provenance;
        if (origin) provenance[key] = origin;
        provenanceSourceUrls[key] = scalars[key].sourceUrls;
    });
    Object.entries(specificationEntries).forEach(([key, entry]) => {
        if (entry.provenance) provenance[`specifications.${key}`] = entry.provenance;
        provenanceSourceUrls[`specifications.${key}`] = entry.sourceUrls;
    });
    const sources = [...current.sources, ...(next.sources || [])].filter((source, index, items) => source.url && items.findIndex((candidate) => candidate.url === source.url) === index).slice(0, 4);
    const candidateImages = normalizeCandidateImages([
        ...current.candidateImages,
        ...(next.candidateImages || []).map((image) => ({ ...image, selected: false, primary: false })),
    ].filter((image, index, items) => image.url && items.findIndex((candidate) => candidate.url === image.url) === index));
    return {
        ...current,
        manufacturer: scalars.manufacturer.value, productName: scalars.productName.value, familyName: scalars.familyName.value,
        modelNumber: scalars.modelNumber.value, manufacturerPartNumber: scalars.manufacturerPartNumber.value, productUrl: scalars.productUrl.value,
        primaryItemType: scalars.primaryItemType.value, subtype: scalars.subtype.value, categoryTemplateId: scalars.categoryTemplateId.value,
        system: scalars.system.value, description: scalars.description.value,
        suggestedAreas: unique([...current.suggestedAreas, ...(next.suggestedAreas || [])]),
        parentPlacements: unique([...current.parentPlacements, ...(next.parentPlacements || [])]),
        tags: unique([...current.tags, ...(next.tags || [])]),
        specifications: Object.fromEntries(Object.entries(specificationEntries).filter(([, entry]) => entry.value).map(([key, entry]) => [key, entry.value])), sources, candidateImages,
        provenance, provenanceSourceUrls, warnings: unique([...(current.warnings || []), ...(next.warnings || [])]),
        criticalWarnings: unique([...(current.criticalWarnings || []), ...(next.criticalWarnings || [])]),
    };
}

function unique(values: string[]) { return values.map((value) => value.trim()).filter(Boolean).filter((value, index, items) => items.findIndex((candidate) => candidate.toLowerCase() === value.toLowerCase()) === index); }
function isHttpUrl(value: string) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch { return false; }
}
function sourceIsCurated(sourceUrl: string | undefined, sources: AiCatalogSource[]) {
    if (!sourceUrl) return false;
    const normalizedSourceUrl = canonicalUrl(sourceUrl);
    return sources.some((source) => canonicalUrl(source.url) === normalizedSourceUrl);
}
function canonicalUrl(value: string) {
    try {
        const url = new URL(value.trim());
        url.hash = '';
        url.hostname = url.hostname.toLowerCase();
        url.pathname = url.pathname.replace(/\/+$/, '') || '/';
        return url.toString().toLowerCase();
    } catch { return value.trim().toLowerCase(); }
}
function provenanceFor(provenance: Record<string, AiCatalogFieldProvenance>, ...keys: string[]) {
    return keys.map((key) => provenance[key]).find((value): value is AiCatalogFieldProvenance => Boolean(value));
}
function provenanceUrlsFor(provenanceSourceUrls: Record<string, string[]>, ...keys: string[]) {
    const urls = keys.flatMap((key) => provenanceSourceUrls[key] || []);
    return uniqueUrls(urls);
}
function normalizeProvenanceSourceUrls(value: unknown): Record<string, string[]> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, urls]) => [
        key,
        Array.isArray(urls) ? uniqueUrls(urls.filter((url): url is string => typeof url === 'string')) : [],
    ]));
}
function removeDraftSource(draft: AiCatalogItemDraft, sourceId: string): AiCatalogItemDraft {
    const removedUrl = draft.sources.find((source) => source.id === sourceId)?.url || '';
    if (!removedUrl) return { ...draft, sources: draft.sources.filter((source) => source.id !== sourceId) };
    const nextSourceUrls = Object.fromEntries(Object.entries(draft.provenanceSourceUrls).map(([key, urls]) => [
        key,
        urls.filter((url) => canonicalUrl(url) !== canonicalUrl(removedUrl)),
    ]));
    const provenance = { ...draft.provenance };
    Object.entries(nextSourceUrls).forEach(([key, urls]) => {
        if (provenance[key] === 'verified_source' && urls.length === 0) provenance[key] = 'unverified';
    });
    return {
        ...draft,
        sources: draft.sources.filter((source) => source.id !== sourceId),
        provenance,
        provenanceSourceUrls: nextSourceUrls,
    };
}
function uniqueUrls(values: string[]) {
    return values.map((value) => value.trim()).filter(Boolean).filter((value, index, items) => (
        items.findIndex((candidate) => canonicalUrl(candidate) === canonicalUrl(value)) === index
    ));
}
function snakeCase(value: string) { return value.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`).replace(/^_/, ''); }
function fingerprintDraft(draft: AiCatalogItemDraft) { return stableStringify(draft); }
function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
function visibleCriticalWarnings(warnings: string[], identityReady: boolean, modelVerifiedOrEntered: boolean) {
    return warnings.filter((warning) => {
        const normalized = warning.toLowerCase();
        const identityWarning = /missing|required|identity|category|manufacturer|product name|family name/.test(normalized)
            && !/primary item type|item type|subtype|type\b/.test(normalized);
        const modelWarning = /model/.test(normalized) && /missing|exact|verify|unverified|required/.test(normalized);
        if (identityWarning && identityReady) return false;
        if (modelWarning && modelVerifiedOrEntered) return false;
        return true;
    });
}
function normalizeCandidateImages(images: AiCatalogCandidateImage[]) {
    return images.map((image) => ({ ...image, primary: image.selected === true && image.primary === true }));
}
function readError(error: unknown) { return error instanceof Error ? error.message : 'The catalog action could not be completed.'; }

function Section({ title, children }: { title: string; children: ReactNode }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return <View style={{ gap: scaleIcon(10), paddingTop: scaleIcon(4) }}><Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(19), fontWeight: '900' }}>{title}</Text>{children}</View>;
}

function Row({ children }: { children: ReactNode }) { return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>; }

function BuilderField({ label, value, onChangeText, placeholder, multiline = false, required = false, autoCapitalize = 'sentences' }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean; required?: boolean; autoCapitalize?: 'sentences' | 'none' }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return <View style={{ gap: scaleIcon(6), flexGrow: 1, flexBasis: scaleIcon(220), minWidth: scaleIcon(160) }}><Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900' }}>{label}{required ? ' *' : ''}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.colors.mutedText} multiline={multiline} autoCapitalize={autoCapitalize} textAlignVertical={multiline ? 'top' : 'center'} style={{ color: theme.colors.text, minHeight: scaleIcon(multiline ? 104 : 48), borderWidth: 1, borderColor: theme.colors.border, borderRadius: scaleIcon(11), borderCurve: 'continuous', paddingHorizontal: scaleIcon(11), paddingVertical: scaleIcon(10), backgroundColor: theme.colors.surface }} /></View>;
}

function Notice({ message, warning }: { message: string; warning?: boolean }) {
    const { scaleIcon, theme } = useTheme();
    return <View accessibilityRole="alert" style={{ borderWidth: 1, borderColor: warning ? '#D8A100' : theme.colors.primary, backgroundColor: warning ? '#FFF8E8' : theme.colors.surfaceAlt, borderRadius: scaleIcon(12), borderCurve: 'continuous', padding: scaleIcon(11) }}><Text selectable style={{ color: warning ? '#6A4A00' : theme.colors.text, lineHeight: 20, fontWeight: '700' }}>{message}</Text></View>;
}

function ChipRow({ values, selected, onSelect }: { values: string[]; selected: string; onSelect: (value: string) => void }) {
    const { scaleIcon, theme } = useTheme();
    return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(7) }}>{values.map((value) => <TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{ selected: selected === value }} onPress={() => onSelect(value)} style={{ minHeight: scaleIcon(40), justifyContent: 'center', borderWidth: 1, borderColor: selected === value ? theme.colors.primary : theme.colors.border, backgroundColor: selected === value ? theme.colors.surfaceAlt : theme.colors.surface, borderRadius: 999, paddingHorizontal: scaleIcon(12) }}><Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>{value}</Text></TouchableOpacity>)}</View>;
}

function TemplatePicker({ templates, value, onChange }: { templates: CatalogTemplateDefinition[]; value: string; onChange: (value: string) => void }) {
    const { scaleIcon, theme } = useTheme();
    const approved = templates.filter((template) => template.status === 'approved');
    return <View style={{ gap: scaleIcon(7) }}><Text selectable style={{ color: theme.colors.text, fontWeight: '900' }}>Existing catalog category template</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(7) }}>{approved.map((template) => <TouchableOpacity key={template.id} accessibilityRole="button" accessibilityState={{ selected: value === template.id }} onPress={() => onChange(template.id)} style={{ minHeight: scaleIcon(40), justifyContent: 'center', borderWidth: 1, borderColor: value === template.id ? theme.colors.primary : theme.colors.border, backgroundColor: value === template.id ? theme.colors.surfaceAlt : theme.colors.surface, borderRadius: scaleIcon(10), paddingHorizontal: scaleIcon(11) }}><Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>{template.categoryName}</Text></TouchableOpacity>)}</View></View>;
}

function TagEditor({ label, value, setValue, values, onAdd, onRemove, placeholder }: { label: string; value: string; setValue: (value: string) => void; values: string[]; onAdd: () => void; onRemove: (value: string) => void; placeholder: string }) {
    const { scaleIcon, theme } = useTheme();
    return <View style={{ gap: scaleIcon(7) }}><Text selectable style={{ color: theme.colors.text, fontWeight: '900' }}>{label}</Text><Row><BuilderField label={`Add ${label.toLowerCase()}`} value={value} onChangeText={setValue} placeholder={placeholder} /><View style={{ flex: 1, justifyContent: 'flex-end' }}><ThemedButton title="Add" variant="secondary" disabled={!value.trim()} onPress={onAdd} /></View></Row><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(7) }}>{values.map((item) => <TouchableOpacity key={item} accessibilityRole="button" accessibilityLabel={`Remove ${item}`} onPress={() => onRemove(item)} style={{ minHeight: scaleIcon(37), justifyContent: 'center', backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 999, paddingHorizontal: scaleIcon(11) }}><Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>{item} ×</Text></TouchableOpacity>)}</View></View>;
}

function ProvenanceSummary({ provenance }: { provenance: Record<string, AiCatalogFieldProvenance> }) {
    const { scaleIcon, theme } = useTheme();
    const values = Object.values(provenance);
    if (!values.length) return null;
    const counts = values.reduce<Record<AiCatalogFieldProvenance, number>>((result, value) => ({ ...result, [value]: (result[value] || 0) + 1 }), { admin_entered: 0, verified_source: 0, ai_inferred: 0, unverified: 0 });
    return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(7) }}>{Object.entries(counts).filter(([, count]) => count > 0).map(([origin, count]) => <View key={origin} style={{ borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, borderRadius: 999, paddingHorizontal: scaleIcon(9), paddingVertical: scaleIcon(5) }}><Text selectable style={{ color: theme.colors.text, fontSize: 12, fontWeight: '800' }}>{origin.replace('_', ' ')} · {count}</Text></View>)}</View>;
}
