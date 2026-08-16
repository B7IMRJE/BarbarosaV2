import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    Linking,
    Modal,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import CompactCatalogProductTile from '../../components/catalog/compact-catalog-product-tile';
import ProductCardImage from '../../components/catalog/product-card-image';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    bulkApproveCatalogDrafts,
    importCatalogDrafts,
    loadCatalogFactory,
    reviewCatalogDraft,
    saveCatalogFactoryProduct,
    saveCatalogTemplate,
    searchCatalogDuplicates,
    updateCatalogFactoryMedia,
    uploadCatalogFactoryDocument,
    uploadCatalogFactoryPhoto,
    type CatalogFactoryAsset,
    type CatalogFactoryAssetType,
    type CatalogFactoryFilters,
    type CatalogFactoryRecord,
    type CatalogImportSummary,
    type CatalogSourceDraft,
} from '../../lib/catalogFactory';
import {
    CATALOG_FINISH_OPTIONS,
    catalogFinishOption,
    catalogFactoryEditorPayload,
    catalogFactoryEditorSpecifications,
    createCatalogFactoryEditorDraft,
    type CatalogFactoryEditorDraft,
} from '../../lib/catalogFactoryEditorCore';
import {
    CATALOG_STATUSES,
    canBulkApproveCatalogRecord,
    parseCatalogImportText,
    validateCatalogImportRows,
    type CatalogImportPreviewRow,
    type CatalogImportRow,
    type CatalogStatus,
    type CatalogTemplateDefinition,
} from '../../lib/catalogFactoryCore';
import {
    catalogFieldLabel,
    catalogSpecificationDisplays,
} from '../../lib/catalogFactoryPresentation';
import {
    catalogBrandSuggestions,
    catalogCategorySuggestions,
    catalogFamilySuggestions,
    catalogQuickStartGroupsForDeck,
    catalogQuickStartIsReady,
    type CatalogQuickStartSuggestion,
    type CatalogSuggestionOption,
} from '../../lib/catalogFactorySuggestions';
import { researchCatalogProduct } from '../../lib/catalogProductResearch';
import {
    mapCatalogResearchSpecifications,
    type CatalogProductResearch,
    type CatalogResearchSourceType,
} from '../../lib/catalogProductResearchCore';
import {
    catalogFactoryDeckFilterOptions,
    catalogFactoryDeckGroupLabel,
    catalogFactoryStarterOptionsLabel,
    filterAndSortCatalogFactoryDeckCards,
    filterUnmappedCatalogFactoryRecords,
} from '../../lib/catalogFactoryDeckCore';
import { loadCurrentUserPlatformAdmin } from '../../lib/roles';
import { useTheme } from '../../theme/useTheme';
import CompactHomeOSCard from '../homeos-items/compact-homeos-card';
import {
    loadHomeOSStarterCardDeck,
    saveHomeOSStarterCardDeckEntry,
    setHomeOSStarterCardReadiness,
    type HomeOSStarterDeckCard,
    type HomeOSStarterDeckReadiness,
} from '../../lib/homeosStarterCatalog';

type FactoryMode = 'overview' | 'template' | 'seed' | 'import' | 'review' | 'prices' | 'history';

const emptyTemplate = {
    templateKey: '', categoryName: '', description: '', universalFields: 'manufacturer, brand, family_name, model_number, manufacturer_part_number, upc_gtin',
    specificationFields: '', requiredFields: '', status: 'draft' as CatalogStatus,
};

const emptySeed = {
    category: '', manufacturer: '', brand: '', family_name: '', model_number: '', manufacturer_part_number: '', upc_gtin: '',
    color: '', finish: '', size: '', capacity: '', description: '', specifications: '{}', confidence: '0.8', primary_image_url: '',
    sources: '[]', retail_listings: '[]',
};

export default function CatalogFactoryScreen() {
    const { width } = useWindowDimensions();
    const phone = width < 720;
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [allowed, setAllowed] = useState<boolean | null>(null);
    const [mode, setMode] = useState<FactoryMode>('overview');
    const [templates, setTemplates] = useState<CatalogTemplateDefinition[]>([]);
    const [records, setRecords] = useState<CatalogFactoryRecord[]>([]);
    const [deckRecords, setDeckRecords] = useState<CatalogFactoryRecord[]>([]);
    const [starterCards, setStarterCards] = useState<HomeOSStarterDeckCard[]>([]);
    const [imports, setImports] = useState<Record<string, unknown>[]>([]);
    const [filters, setFilters] = useState<CatalogFactoryFilters>({});
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('Loading Catalog Factory...');
    const [selected, setSelected] = useState<string[]>([]);
    const [templateDraft, setTemplateDraft] = useState(emptyTemplate);
    const [seedDraft, setSeedDraft] = useState(emptySeed);
    const [importRows, setImportRows] = useState<CatalogImportRow[]>([]);
    const [importPreview, setImportPreview] = useState<CatalogImportPreviewRow[]>([]);
    const [importFileName, setImportFileName] = useState('');
    const [importFormat, setImportFormat] = useState<'json' | 'csv'>('json');
    const [importOriginal, setImportOriginal] = useState('');
    const [importSummary, setImportSummary] = useState<CatalogImportSummary | null>(null);
    const [editing, setEditing] = useState<CatalogFactoryRecord | null>(null);
    const [detailRecord, setDetailRecord] = useState<CatalogFactoryRecord | null>(null);
    const [editDraft, setEditDraft] = useState<CatalogFactoryEditorDraft | null>(null);
    const [editJson, setEditJson] = useState('{}');
    const [showAdvancedJson, setShowAdvancedJson] = useState(false);
    const [advancedJsonDirty, setAdvancedJsonDirty] = useState(false);
    const [mergeTargetId, setMergeTargetId] = useState('');
    const [seedResearch, setSeedResearch] = useState<CatalogProductResearch | null>(null);
    const [researchingSeed, setResearchingSeed] = useState(false);
    const [seedSaveError, setSeedSaveError] = useState('');
    const [editingStarterCard, setEditingStarterCard] = useState<HomeOSStarterDeckCard | null>(null);
    const [starterVariantIds, setStarterVariantIds] = useState<string[]>([]);
    const [starterReadiness, setStarterReadiness] = useState<HomeOSStarterDeckReadiness>('unbuilt');
    const [starterNotes, setStarterNotes] = useState('');

    useEffect(() => {
        void initialize();
        // One authenticated guard/load pass on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function initialize() {
        const isAllowed = await loadCurrentUserPlatformAdmin();
        setAllowed(isAllowed);
        if (!isAllowed) {
            setMessage('Catalog Factory is restricted to platform administrators.');
            return;
        }
        await refresh();
    }

    async function refresh(nextFilters = filters) {
        setBusy(true);
        setMessage('Refreshing Catalog Factory...');
        try {
            const hasActiveFilters = Object.values(nextFilters).some((value) => Boolean(value));
            const [result, unfilteredResult, nextStarterCards] = await Promise.all([
                loadCatalogFactory(nextFilters),
                hasActiveFilters ? loadCatalogFactory({}) : Promise.resolve(null),
                loadHomeOSStarterCardDeck(),
            ]);
            setTemplates(result.templates);
            setRecords(result.records);
            setDeckRecords(unfilteredResult?.records || result.records);
            setImports(result.imports);
            setStarterCards(nextStarterCards);
            setSelected((current) => current.filter((id) => result.records.some((record) => record.id === id)));
            setMessage(`${result.records.length} master variant${result.records.length === 1 ? '' : 's'} in this view.`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    function beginStarterCardMapping(card: HomeOSStarterDeckCard) {
        setEditingStarterCard(card);
        setStarterVariantIds(card.mappedVariantIds);
        setStarterReadiness(card.readinessStatus);
        setStarterNotes(card.adminNotes);
    }

    async function saveStarterCardMapping() {
        if (!editingStarterCard) return;
        setBusy(true);
        setMessage(`Saving ${editingStarterCard.name} product options...`);
        try {
            await saveHomeOSStarterCardDeckEntry({
                templateKey: editingStarterCard.templateKey,
                variantIds: starterVariantIds,
                readinessStatus: starterReadiness,
                adminNotes: starterNotes,
            });
            setEditingStarterCard(null);
            setMessage(`${editingStarterCard.name} now has ${starterVariantIds.length} mapped product option${starterVariantIds.length === 1 ? '' : 's'}.`);
            await refresh();
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function changeStarterCardReadiness(card: HomeOSStarterDeckCard, readinessStatus: HomeOSStarterDeckReadiness) {
        setBusy(true);
        setMessage(`${readinessStatus === 'ready' ? 'Completing' : 'Reopening'} ${card.shortCode || card.name}...`);
        try {
            await setHomeOSStarterCardReadiness(card.templateKey, readinessStatus);
            setStarterCards((current) => current.map((candidate) => candidate.templateKey === card.templateKey
                ? { ...candidate, readinessStatus }
                : candidate));
            setMessage(readinessStatus === 'ready'
                ? `${card.shortCode || card.name} marked complete and sent behind unfinished starter cards. Product mappings and card data were not changed.`
                : `${card.shortCode || card.name} moved back into the in-progress work queue. Product mappings and card data were not changed.`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function createTemplate() {
        if (!templateDraft.templateKey.trim() || !templateDraft.categoryName.trim()) {
            setMessage('Template key and category name are required.');
            return;
        }
        setBusy(true);
        try {
            await saveCatalogTemplate(null, {
                templateKey: templateDraft.templateKey,
                categoryName: templateDraft.categoryName,
                description: templateDraft.description,
                universalFields: fieldList(templateDraft.universalFields),
                specificationFields: fieldList(templateDraft.specificationFields),
                requiredFields: csvList(templateDraft.requiredFields),
                status: templateDraft.status,
            });
            setTemplateDraft(emptyTemplate);
            setMode('overview');
            setMessage('Category template saved. Approve it before using it for imports.');
            await refresh();
        } catch (error) { setMessage(errorMessage(error)); }
        finally { setBusy(false); }
    }

    async function addAuthoringCategory(categoryName: string) {
        const cleanName = categoryName.trim();
        if (!cleanName) throw new Error('Enter a category name first.');
        const existing = templates.find((template) => template.categoryName.toLowerCase() === cleanName.toLowerCase());
        if (existing) return existing;

        setBusy(true);
        setMessage(`Adding ${cleanName} to the authoring categories...`);
        try {
            const created = await saveCatalogTemplate(null, {
                templateKey: uniqueCatalogTemplateKey(cleanName, templates),
                categoryName: cleanName,
                description: 'Catalog Factory authoring category added explicitly from the searchable product editor.',
                universalFields: fieldList(emptyTemplate.universalFields),
                specificationFields: [],
                requiredFields: [],
                status: 'approved',
            });
            if (!created) throw new Error('The category was saved, but its response was invalid.');
            setTemplates((current) => [...current.filter((template) => template.id !== created.id), created]);
            setMessage(`${created.categoryName} is ready for authoring. No product, company offering, or price was published.`);
            return created;
        } finally {
            setBusy(false);
        }
    }

    async function createSeedRecord() {
        setSeedSaveError('');
        let specifications: Record<string, unknown>;
        let sources: unknown[];
        let retailListings: unknown[];
        try {
            specifications = parseObject(seedDraft.specifications, 'Specifications');
            sources = parseArray(seedDraft.sources, 'Sources');
            retailListings = parseArray(seedDraft.retail_listings, 'Retail listings');
        } catch (error) {
            const nextMessage = errorMessage(error);
            setSeedSaveError(nextMessage);
            setMessage(nextMessage);
            return;
        }
        const row: CatalogImportRow = {
            ...seedDraft,
            specifications,
            sources,
            retail_listings: retailListings,
            confidence: seedDraft.confidence || null,
        };
        const preview = validateCatalogImportRows([row], templates)[0];
        if (preview.errors.length) {
            const nextMessage = preview.errors.join(' ');
            setSeedSaveError(nextMessage);
            setMessage(nextMessage);
            return;
        }
        setBusy(true);
        try {
            const summary = await importCatalogDrafts({ rows: [row], fileName: 'manual-seed-record.json', format: 'json', originalData: JSON.stringify([row], null, 2) });
            setImportSummary(summary);
            if (summary.created < 1) {
                const nextMessage = summary.duplicate > 0
                    ? 'This product was not created because an existing catalog record has the same UPC/GTIN or manufacturer part number.'
                    : 'The database rejected this draft. Review the fields above and try again; no product was created.';
                setSeedSaveError(nextMessage);
                setMessage(nextMessage);
                return;
            }
            setSeedDraft(emptySeed);
            setSeedResearch(null);
            setSeedSaveError('');
            setMode('review');
            setMessage(`Seed draft created. ${summary.warning} warning${summary.warning === 1 ? '' : 's'} require review.`);
            await refresh({ status: 'draft' });
        } catch (error) {
            const nextMessage = errorMessage(error);
            setSeedSaveError(nextMessage);
            setMessage(nextMessage);
        }
        finally { setBusy(false); }
    }

    async function researchSeedProduct() {
        if (researchingSeed) return;
        setResearchingSeed(true);
        setSeedResearch(null);
        setMessage('Searching manufacturer product pages, manuals, specifications, and warranty information...');
        try {
            const result = await researchCatalogProduct({
                category: seedDraft.category,
                brand: seedDraft.brand || seedDraft.manufacturer,
                model: seedDraft.model_number,
                manufacturerPartNumber: seedDraft.manufacturer_part_number,
                notes: seedDraft.description,
            });
            setSeedResearch(result);
            setMessage(result.exactModelMatch
                ? 'Exact manufacturer product found. Review the sources, then use the research in the seed draft.'
                : 'Research completed without an exact model match. Review warnings before using any result.');
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setResearchingSeed(false);
        }
    }

    function useResearchInSeed() {
        if (!seedResearch) return;
        const confidence = seedResearch.confidence === 'high' ? '0.95' : seedResearch.confidence === 'medium' ? '0.75' : '0.5';
        const template = templates.find((candidate) =>
            candidate.status === 'approved'
            && (candidate.templateKey.toLowerCase() === seedDraft.category.trim().toLowerCase()
                || candidate.categoryName.toLowerCase() === seedDraft.category.trim().toLowerCase())
        );
        const specifications = mapCatalogResearchSpecifications(seedResearch, template);
        const verifiedAt = new Date().toISOString();
        setSeedDraft((current) => ({
            ...current,
            manufacturer: seedResearch.manufacturer || seedResearch.brand || current.manufacturer,
            brand: seedResearch.brand || current.brand,
            family_name: seedResearch.familyName || seedResearch.productName || current.family_name,
            model_number: seedResearch.modelNumber || current.model_number,
            manufacturer_part_number: seedResearch.manufacturerPartNumber || current.manufacturer_part_number,
            description: seedResearch.description || current.description,
            specifications: JSON.stringify(specifications, null, 2),
            sources: JSON.stringify(seedResearch.sources.map((source) => ({
                type: catalogSourceType(source.sourceType),
                url: source.url,
                title: source.title,
                verified_at: verifiedAt,
                confidence,
            })), null, 2),
            confidence,
        }));
        setSeedSaveError('');
        setMessage('Sourced manufacturer details applied to the master seed. Review every field, then create the draft seed.');
    }

    async function pickImportFile() {
        const result = await DocumentPicker.getDocumentAsync({
            type: ['application/json', 'text/json', 'text/csv', 'application/csv', 'text/plain'],
            multiple: false,
            copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        const format = asset.name.toLowerCase().endsWith('.csv') || asset.mimeType?.includes('csv') ? 'csv' : 'json';
        setBusy(true);
        setMessage('Reading and validating the import file...');
        try {
            const response = await fetch(asset.uri);
            if (!response.ok) throw new Error(`Could not read the selected file (${response.status}).`);
            const original = await response.text();
            const rows = parseCatalogImportText(original, format);
            const preview = validateCatalogImportRows(rows, templates);
            const duplicateResults = await Promise.all(preview.map(async (item) => {
                if (item.errors.length) return item;
                try {
                    const duplicateMatches = await searchCatalogDuplicates(item.row);
                    return { ...item, duplicateMatches };
                } catch {
                    return { ...item, warnings: [...item.warnings, 'Duplicate search could not be completed.'] };
                }
            }));
            setImportRows(rows);
            setImportPreview(duplicateResults);
            setImportFileName(asset.name);
            setImportFormat(format);
            setImportOriginal(original);
            setImportSummary(null);
            const invalid = duplicateResults.filter((row) => row.errors.length).length;
            const duplicates = duplicateResults.filter((row) => row.duplicateMatches.length).length;
            setMessage(`${rows.length} rows checked: ${invalid} invalid and ${duplicates} possible duplicate${duplicates === 1 ? '' : 's'}. Invalid and exact duplicate rows will not create records.`);
        } catch (error) {
            setImportRows([]);
            setImportPreview([]);
            setMessage(errorMessage(error));
        } finally { setBusy(false); }
    }

    async function commitImport() {
        if (!importRows.length || !importOriginal) {
            setMessage('Choose and validate a JSON or CSV file first.');
            return;
        }
        setBusy(true);
        setMessage('Creating draft records and preserving the original import...');
        try {
            const summary = await importCatalogDrafts({ rows: importRows, fileName: importFileName, format: importFormat, originalData: importOriginal });
            setImportSummary(summary);
            setMessage(`Import complete: ${summary.created} created, ${summary.duplicate} duplicate, ${summary.warning} warning, ${summary.failed} failed.`);
            await refresh();
        } catch (error) { setMessage(errorMessage(error)); }
        finally { setBusy(false); }
    }

    async function act(record: CatalogFactoryRecord, action: 'approve' | 'reject' | 'archive' | 'needs_review') {
        setBusy(true);
        try {
            await reviewCatalogDraft(record.id, action);
            setMessage(`${record.brand} ${record.modelNumber} ${action === 'approve' ? 'approved and published' : action.replace('_', ' ')}.`);
            await refresh();
        } catch (error) { setMessage(errorMessage(error)); }
        finally { setBusy(false); }
    }

    async function saveEdit() {
        if (!editing || !editDraft) return;
        if (!editDraft.templateId || !editDraft.manufacturer.trim() || !editDraft.brand.trim() || !editDraft.familyName.trim() || !editDraft.modelNumber.trim()) {
            setMessage('Category, manufacturer, brand, family, and model are required.');
            return;
        }
        let advanced: Record<string, unknown> = {};
        if (advancedJsonDirty) {
            try { advanced = parseObject(editJson, 'Advanced product data'); }
            catch (error) { setMessage(errorMessage(error)); return; }
        }
        let payload: Record<string, unknown>;
        try {
            payload = catalogFactoryEditorPayload(editDraft, {
                confidence: advancedJsonDirty ? nullableNumber(advanced.confidence) : editing.confidence,
                validationWarnings: advancedJsonDirty ? textArray(advanced.validation_warnings) : editing.validationWarnings,
                duplicateWarnings: advancedJsonDirty ? textArray(advanced.duplicate_warnings) : editing.duplicateWarnings,
                missingFields: advancedJsonDirty ? textArray(advanced.missing_fields) : editing.missingFields,
                specifications: advancedJsonDirty ? parseRecordValue(advanced.specifications, 'Advanced specifications') : undefined,
                sources: advancedJsonDirty ? parseAdvancedSources(advanced.sources) : undefined,
            });
        } catch (error) {
            setMessage(errorMessage(error));
            return;
        }
        setBusy(true);
        try {
            await saveCatalogFactoryProduct(editing.id, payload);
            setEditing(null);
            setEditDraft(null);
            setShowAdvancedJson(false);
            setAdvancedJsonDirty(false);
            setMessage('Master product changes saved.');
            await refresh();
        } catch (error) { setMessage(errorMessage(error)); }
        finally { setBusy(false); }
    }

    async function mergeRecord() {
        if (!editing || !mergeTargetId) {
            setMessage('Choose a merge target.');
            return;
        }
        setBusy(true);
        try {
            await reviewCatalogDraft(editing.id, 'merge', {}, mergeTargetId);
            setEditing(null);
            setMergeTargetId('');
            setMessage('Duplicate draft merged into the selected master record.');
            await refresh();
        } catch (error) { setMessage(errorMessage(error)); }
        finally { setBusy(false); }
    }

    async function bulkApprove() {
        const selectedRecords = records.filter((record) => selected.includes(record.id));
        const blocked = selectedRecords.filter((record) => !canBulkApproveCatalogRecord(record));
        if (!selectedRecords.length) { setMessage('Select at least one draft.'); return; }
        if (blocked.length) { setMessage('Bulk approval is blocked while any selected draft has unresolved duplicate or validation warnings.'); return; }
        setBusy(true);
        try {
            await bulkApproveCatalogDrafts(selected);
            setSelected([]);
            setMessage(`${selectedRecords.length} draft${selectedRecords.length === 1 ? '' : 's'} approved and published.`);
            await refresh();
        } catch (error) { setMessage(errorMessage(error)); }
        finally { setBusy(false); }
    }

    function beginEdit(record: CatalogFactoryRecord) {
        const nextDraft = createCatalogFactoryEditorDraft(record);
        setDetailRecord(null);
        setEditingStarterCard(null);
        setEditing(record);
        setEditDraft(nextDraft);
        setMergeTargetId('');
        setShowAdvancedJson(false);
        setAdvancedJsonDirty(false);
        setEditJson(JSON.stringify({
            specifications: catalogFactoryEditorSpecifications(nextDraft),
            sources: nextDraft.sources.map((source) => ({ type: source.sourceType, url: source.sourceUrl, title: source.title || null })),
            confidence: record.confidence,
            validation_warnings: record.validationWarnings,
            duplicate_warnings: record.duplicateWarnings,
            missing_fields: record.missingFields,
        }, null, 2));
    }

    async function pickMasterPhoto() {
        if (!editing) return;
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            setMessage('Photo library permission is required to upload a master product photo.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            allowsMultipleSelection: true,
            selectionLimit: 0,
            quality: 0.9,
        });
        if (result.canceled || !result.assets.length) return;
        setBusy(true);
        setMessage(`Uploading ${result.assets.length} master product photo${result.assets.length === 1 ? '' : 's'}...`);
        try {
            for (const [index, selectedAsset] of result.assets.entries()) {
                const asset = await uploadCatalogFactoryPhoto({
                    variantId: editing.id,
                    asset: selectedAsset,
                    isPrimary: index === 0,
                    homeownerVisible: true,
                });
                replaceEditingAsset(asset);
            }
            setMessage(`${result.assets.length} product photo${result.assets.length === 1 ? '' : 's'} uploaded. The first selected photo is now primary and each photo is visible in HomeOS until changed below.`);
        } catch (error) { setMessage(errorMessage(error)); }
        finally { setBusy(false); }
    }

    async function pickMasterDocument(assetType: Exclude<CatalogFactoryAssetType, 'image'>) {
        if (!editing) return;
        const result = await DocumentPicker.getDocumentAsync({
            type: ['application/pdf', 'image/*'],
            multiple: false,
            copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets[0]) return;
        setBusy(true);
        setMessage('Uploading the master product reference...');
        try {
            const asset = await uploadCatalogFactoryDocument({ variantId: editing.id, assetType, asset: result.assets[0] });
            replaceEditingAsset(asset);
            setMessage('Master product reference uploaded.');
        } catch (error) { setMessage(errorMessage(error)); }
        finally { setBusy(false); }
    }

    async function changeMasterMedia(asset: CatalogFactoryAsset, patch: { isPrimary?: boolean; homeownerVisible?: boolean; active?: boolean }) {
        if (!editing) return;
        setBusy(true);
        try {
            const updated = await updateCatalogFactoryMedia({ variantId: editing.id, assetId: asset.id, ...patch });
            replaceEditingAsset(updated);
            setMessage('Master media settings saved.');
        } catch (error) { setMessage(errorMessage(error)); }
        finally { setBusy(false); }
    }

    function replaceEditingAsset(asset: CatalogFactoryAsset) {
        const apply = (record: CatalogFactoryRecord) => {
            const assets = record.assets.some((item) => item.id === asset.id)
                ? record.assets.map((item) => item.id === asset.id
                    ? asset
                    : asset.isPrimary && asset.assetType === 'image' && item.assetType === 'image' ? { ...item, isPrimary: false } : item)
                : [asset, ...record.assets.map((item) => asset.isPrimary && asset.assetType === 'image' && item.assetType === 'image' ? { ...item, isPrimary: false } : item)];
            const primary = assets.find((item) => item.active && item.assetType === 'image' && item.isPrimary)
                || assets.find((item) => item.active && item.assetType === 'image');
            return { ...record, assets, primaryImageUrl: primary?.displayUrl || '' };
        };
        setEditing((current) => current && current.id === asset.productVariantId ? apply(current) : current);
        setRecords((current) => current.map((record) => record.id === asset.productVariantId ? apply(record) : record));
        setDeckRecords((current) => current.map((record) => record.id === asset.productVariantId ? apply(record) : record));
    }

    const displayedRecords = useMemo(() => {
        if (mode === 'prices' || mode === 'history') return records.filter((record) => record.retailListings.length > 0);
        if (mode === 'review') return records.filter((record) => record.status !== 'approved' && record.status !== 'archived');
        if (mode === 'overview') return filterUnmappedCatalogFactoryRecords(records, starterCards);
        return records;
    }, [mode, records, starterCards]);

    if (allowed === false) return <Denied />;
    const textColor = theme.colors.text;
    const mutedColor = theme.colors.mutedText;

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <AdminNavBar backFallback="/super-admin" />
            <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: scaleIcon(phone ? 14 : 22), paddingBottom: 100, gap: 16, width: '100%', maxWidth: 1240, alignSelf: 'center' }}>
                <View style={{ gap: 6 }}>
                    <Text selectable style={{ color: textColor, fontSize: scaleFont(phone ? 31 : 40), fontWeight: '900' }}>Catalog Factory</Text>
                    <Text selectable style={{ color: mutedColor, fontSize: scaleFont(16), lineHeight: scaleFont(23) }}>
                        Platform master products, live manufacturer research, structured imports, review, approval, retail observations, and company adoption. Research and imports create drafts only.
                    </Text>
                </View>
                <Notice message={message} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
                    <Action title="New Template" onPress={() => setMode('template')} />
                    <Action title="New Seed Record" onPress={() => setMode('seed')} />
                    <Action title="Import Catalog Batch" onPress={() => setMode('import')} />
                    <Action title="Review Drafts" onPress={() => setMode('review')} />
                    <Action title="Compare Retail Prices" onPress={() => setMode('prices')} />
                    <Action title="Approve and Publish" onPress={() => void bulkApprove()} />
                    <Action title="Refresh Selected Prices" onPress={() => { setMode('import'); setMessage('Upload a JSON or CSV price-refresh batch. Every imported price becomes a new historical observation.'); }} />
                    <Action title="View Price History" onPress={() => setMode('history')} />
                    <Action title="Refresh" onPress={() => void refresh()} />
                </View>

                {mode === 'template' && <TemplateEditor draft={templateDraft} setDraft={setTemplateDraft} busy={busy} onSave={() => void createTemplate()} onCancel={() => setMode('overview')} />}
                {mode === 'seed' && <SeedEditor draft={seedDraft} setDraft={(next) => { setSeedDraft(next); setSeedSaveError(''); }} templates={templates} records={deckRecords} starterCards={starterCards} busy={busy} researching={researchingSeed} research={seedResearch} saveError={seedSaveError} onAddCategory={async (categoryName) => (await addAuthoringCategory(categoryName)).templateKey} onResearch={() => void researchSeedProduct()} onUseResearch={useResearchInSeed} onClearResearch={() => setSeedResearch(null)} onSave={() => void createSeedRecord()} onCancel={() => { setSeedResearch(null); setSeedSaveError(''); setMode('overview'); }} />}
                {mode === 'import' && <ImportPanel busy={busy} preview={importPreview} summary={importSummary} fileName={importFileName} onPick={() => void pickImportFile()} onImport={() => void commitImport()} />}

                {mode === 'overview' && (
                    <StarterCardDeck
                        cards={starterCards}
                        records={deckRecords}
                        phone={phone}
                        busy={busy}
                        onMap={beginStarterCardMapping}
                        onSetReadiness={(card, readiness) => void changeStarterCardReadiness(card, readiness)}
                        onEditProduct={(record) => beginEdit(record)}
                        onDetails={setDetailRecord}
                    />
                )}

                {(mode === 'overview' || mode === 'review' || mode === 'prices' || mode === 'history') && (
                    <>
                        {mode === 'overview' && (
                            <View style={{ gap: scaleIcon(4) }}>
                                <Title>Unmapped Master Products</Title>
                                <Text selectable style={{ color: mutedColor, fontSize: scaleFont(14), lineHeight: scaleFont(20), fontWeight: '700' }}>
                                    Products already mapped to a HomeOS starter card appear only inside that card above. This list is for real master products that still need an archetype relationship.
                                </Text>
                            </View>
                        )}
                        <Filters filters={filters} setFilters={setFilters} templates={templates} busy={busy} onApply={() => void refresh(filters)} />
                        {mode === 'review' && <Text selectable style={{ color: mutedColor }}>Select warning-free drafts for bulk approval. Records with unresolved warnings can only be reviewed individually.</Text>}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(12), alignItems: 'stretch' }}>
                            {displayedRecords.map((record) => (
                                <FactoryRecordCard
                                    key={record.id}
                                    record={record}
                                    phone={phone}
                                    selected={selected.includes(record.id)}
                                    busy={busy}
                                    onToggle={() => setSelected((current) => current.includes(record.id) ? current.filter((id) => id !== record.id) : [...current, record.id])}
                                    onEdit={() => beginEdit(record)}
                                    onDetails={() => setDetailRecord(record)}
                                    onApprove={() => void act(record, 'approve')}
                                    onReject={() => void act(record, 'reject')}
                                    onNeedsReview={() => void act(record, 'needs_review')}
                                />
                            ))}
                            {!displayedRecords.length && <Text selectable style={{ color: mutedColor }}>{mode === 'overview' ? 'Every product in this view is already mapped inside the HomeOS deck above.' : 'No catalog records match this view.'}</Text>}
                        </View>
                    </>
                )}

                <FactoryRecordDetailsModal record={detailRecord} onClose={() => setDetailRecord(null)} />

                <StarterCardMappingModal
                    card={editingStarterCard}
                    records={deckRecords}
                    selectedVariantIds={starterVariantIds}
                    setSelectedVariantIds={setStarterVariantIds}
                    readiness={starterReadiness}
                    setReadiness={setStarterReadiness}
                    notes={starterNotes}
                    setNotes={setStarterNotes}
                    busy={busy}
                    onSave={() => void saveStarterCardMapping()}
                    onClose={() => setEditingStarterCard(null)}
                />

                <CatalogFactoryEditModal
                    record={editing}
                    busy={busy}
                    message={message}
                    onClose={() => { setEditing(null); setEditDraft(null); }}
                >
                    {editing && editDraft && <EditPanel record={editing} draft={editDraft} setDraft={setEditDraft} templates={templates} records={deckRecords} starterCards={starterCards} json={editJson} setJson={(value) => { setEditJson(value); setAdvancedJsonDirty(true); }} showAdvancedJson={showAdvancedJson} setShowAdvancedJson={(visible) => { if (visible && !showAdvancedJson && !advancedJsonDirty) setEditJson(JSON.stringify({ specifications: catalogFactoryEditorSpecifications(editDraft), sources: editDraft.sources.map((source) => ({ type: source.sourceType, url: source.sourceUrl, title: source.title || null })), confidence: editing.confidence, validation_warnings: editing.validationWarnings, duplicate_warnings: editing.duplicateWarnings, missing_fields: editing.missingFields }, null, 2)); setShowAdvancedJson(visible); }} mergeTargetId={mergeTargetId} setMergeTargetId={setMergeTargetId} candidates={records.filter((record) => record.id !== editing.id)} busy={busy} onAddCategory={async (categoryName) => (await addAuthoringCategory(categoryName)).id} onSave={() => void saveEdit()} onMerge={() => void mergeRecord()} onUploadPhoto={() => void pickMasterPhoto()} onUploadDocument={(type) => void pickMasterDocument(type)} onChangeMedia={(asset, patch) => void changeMasterMedia(asset, patch)} onCancel={() => { setEditing(null); setEditDraft(null); }} />}
                </CatalogFactoryEditModal>

                {!!imports.length && mode === 'overview' && (
                    <ThemedCard><Text selectable style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(20) }}>Recent import batches</Text>{imports.slice(0, 8).map((item) => <Text selectable key={String(item.id)} style={{ color: mutedColor, marginTop: 8 }}>{String(item.file_name || 'Structured import')} · {String(item.created_count || 0)} created · {String(item.duplicate_count || 0)} duplicate · {String(item.failed_count || 0)} failed</Text>)}</ThemedCard>
                )}
            </ScrollView>
        </View>
    );
}

function StarterCardDeck({
    cards,
    records,
    phone,
    busy,
    onMap,
    onSetReadiness,
    onEditProduct,
    onDetails,
}: {
    cards: HomeOSStarterDeckCard[];
    records: CatalogFactoryRecord[];
    phone: boolean;
    busy: boolean;
    onMap: (card: HomeOSStarterDeckCard) => void;
    onSetReadiness: (card: HomeOSStarterDeckCard, readiness: HomeOSStarterDeckReadiness) => void;
    onEditProduct: (record: CatalogFactoryRecord) => void;
    onDetails: (record: CatalogFactoryRecord) => void;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [query, setQuery] = useState('');
    const [filterKey, setFilterKey] = useState('all');
    const [showMoreFilters, setShowMoreFilters] = useState(false);
    const searchableCards = cards.map((card) => ({
        ...card,
        aliases: [
            ...card.aliases,
            ...card.mappedVariantIds.flatMap((id) => {
                const record = records.find((candidate) => candidate.id === id);
                return record ? [record.shortCode, factoryProductName(record), record.brand, record.modelNumber] : [];
            }),
        ],
    }));
    const visibleCards = filterAndSortCatalogFactoryDeckCards(searchableCards, query, filterKey);
    const filters = catalogFactoryDeckFilterOptions(searchableCards);
    const areaFilters = filters.filter((option) => option.kind === 'area');
    const familyFilters = filters.filter((option) => option.kind === 'family');
    const moreFilters = filters.filter((option) => !['area', 'family'].includes(option.kind));
    const workRoomKinds = [...new Set(visibleCards.filter((card) => card.readinessStatus !== 'ready').map((card) => card.roomKind))];
    const completedRoomKinds = [...new Set(visibleCards.filter((card) => card.readinessStatus === 'ready').map((card) => card.roomKind))];
    const visibleGroups = [
        ...workRoomKinds.map((roomKind) => ({ roomKind, completed: false })),
        ...completedRoomKinds.map((roomKind) => ({ roomKind, completed: true })),
    ];
    const firstCompletedGroupIndex = visibleGroups.findIndex((group) => group.completed);
    const readyCount = cards.filter((card) => card.readinessStatus === 'ready').length;
    const unfinishedCount = cards.length - readyCount;

    return (
        <View style={{ gap: scaleIcon(14) }}>
            <View style={{ gap: scaleIcon(4) }}>
                <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(25), fontWeight: '900' }}>HomeOS Deck of Cards</Text>
                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(15), lineHeight: scaleFont(21), fontWeight: '700' }}>
                    Work the generic starter deck from top to bottom. In-progress and unfinished cards stay first; completed cards remain searchable and move behind them without changing mappings or HomeOS data.
                </Text>
            </View>

            <ThemedCard style={{ padding: scaleIcon(phone ? 12 : 14), gap: scaleIcon(11), borderWidth: 1, borderCurve: 'continuous' }}>
                <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'center', gap: scaleIcon(9) }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <CompactField label="Search starter cards or short codes" value={query} onChangeText={setQuery} placeholder="Shower, A01, Moen, faucet, pool..." />
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(6), alignItems: 'center' }}>
                        <FactoryTileBadge label={`${unfinishedCount} unfinished`} tone={unfinishedCount ? 'amber' : 'green'} />
                        <FactoryTileBadge label={`${readyCount} complete`} tone="green" />
                    </View>
                </View>
                <View style={{ gap: scaleIcon(6) }}>
                    <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900' }}>Areas</Text>
                    <ChoiceWrap>
                        <Chip label="All areas" selected={filterKey === 'all'} onPress={() => setFilterKey('all')} />
                        {areaFilters.map((option) => <Chip key={option.key} label={`${option.label} (${option.count})`} selected={filterKey === option.key} onPress={() => setFilterKey(option.key)} />)}
                    </ChoiceWrap>
                </View>
                {!!familyFilters.length && (
                    <View style={{ gap: scaleIcon(6) }}>
                        <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900' }}>Starter families</Text>
                        <ChoiceWrap>
                            {familyFilters.map((option) => <Chip key={option.key} label={`${option.label} (${option.count})`} selected={filterKey === option.key} onPress={() => setFilterKey(option.key)} />)}
                        </ChoiceWrap>
                    </View>
                )}
                <CompactDisclosureCard title="More taxonomy filters" summary="Systems, categories, and readiness from live starter metadata" expanded={showMoreFilters} onToggle={() => setShowMoreFilters(!showMoreFilters)}>
                    <ChoiceWrap>
                        {moreFilters.map((option) => <Chip key={option.key} label={`${option.label} (${option.count})`} selected={filterKey === option.key} onPress={() => setFilterKey(option.key)} />)}
                    </ChoiceWrap>
                </CompactDisclosureCard>
                {(query || filterKey !== 'all') && <CompactButton title="Clear Search & Filters" disabled={busy} onPress={() => { setQuery(''); setFilterKey('all'); }} />}
            </ThemedCard>

            {visibleGroups.map((group, groupIndex) => {
                const roomKind = group.roomKind;
                const roomCards = visibleCards.filter((card) => card.roomKind === roomKind && (card.readinessStatus === 'ready') === group.completed);
                const roomReadyCount = roomCards.filter((card) => card.readinessStatus === 'ready').length;

                return (
                    <View key={`${roomKind}-${group.completed ? 'complete' : 'work'}`} style={{ gap: scaleIcon(10) }}>
                    {group.completed && groupIndex === firstCompletedGroupIndex && (
                        <View style={{ marginTop: scaleIcon(8), gap: scaleIcon(3) }}>
                            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(23), fontWeight: '900' }}>Completed · Sent to Bottom</Text>
                            <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(20), fontWeight: '700' }}>Completed starter archetypes remain intact and searchable. Mark one in progress to return it to the active work queue.</Text>
                        </View>
                    )}
                    <ThemedCard style={{ padding: scaleIcon(phone ? 12 : 16), gap: scaleIcon(12), borderWidth: 1, borderCurve: 'continuous' }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: scaleIcon(8) }}>
                            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(21), fontWeight: '900' }}>{catalogFactoryDeckGroupLabel(roomKind)} starter deck{group.completed ? ' · Completed' : ''}</Text>
                            <FactoryTileBadge label={group.completed ? `${roomReadyCount} complete` : `${roomCards.length} unfinished`} tone={group.completed ? 'green' : 'amber'} />
                        </View>

                        <View style={{ gap: scaleIcon(12) }}>
                            {roomCards.map((card) => {
                                const mappedRecords = card.mappedVariantIds
                                    .map((id) => records.find((record) => record.id === id))
                                    .filter((record): record is CatalogFactoryRecord => Boolean(record));
                                const parentName = card.parentTemplateKey
                                    ? cards.find((candidate) => candidate.templateKey === card.parentTemplateKey)?.name || ''
                                    : '';

                                return (
                                    <View key={card.templateKey} style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'flex-start', gap: scaleIcon(12), borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: scaleIcon(12) }}>
                                        <CompactHomeOSCard
                                            title={card.name}
                                            subtitle={[card.shortCode, parentName ? `Part of ${parentName}` : card.system].filter(Boolean).join(' · ')}
                                            icon={starterCardIcon(card)}
                                            onOpen={() => onMap(card)}
                                            actionTitle={`${card.mappedCount} option${card.mappedCount === 1 ? '' : 's'}`}
                                            onAction={() => onMap(card)}
                                            secondaryActionTitle="Map Products"
                                            onSecondaryAction={() => onMap(card)}
                                            disabled={busy}
                                            style={{ width: phone ? '100%' : scaleIcon(210), minWidth: phone ? 0 : scaleIcon(210), maxWidth: phone ? '100%' : scaleIcon(210), flexShrink: 0 }}
                                        />

                                        <View style={{ flex: 1, minWidth: 0, gap: scaleIcon(8) }}>
                                            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(17), lineHeight: scaleFont(21), fontWeight: '900' }}>
                                                {catalogFactoryStarterOptionsLabel(card)}
                                            </Text>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(6), alignItems: 'center' }}>
                                                {!!card.shortCode && <ShortCodeBadge code={card.shortCode} />}
                                                <FactoryTileBadge label={card.readinessStatus} tone={card.readinessStatus === 'ready' ? 'green' : 'amber'} />
                                                <FactoryTileBadge label={`${card.approvedOptionCount} approved`} tone={card.approvedOptionCount > 0 ? 'green' : 'amber'} />
                                            </View>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), alignItems: 'stretch' }}>
                                                {mappedRecords.map((record) => (
                                                    <StarterMappedVariant key={record.id} record={record} busy={busy} onEdit={() => onEditProduct(record)} onDetails={() => onDetails(record)} />
                                                ))}
                                            </View>
                                            {mappedRecords.length === 0 && card.mappedCount === 0 ? (
                                                <TouchableOpacity accessibilityRole="button" onPress={() => onMap(card)} disabled={busy} style={{ minHeight: scaleIcon(86), borderWidth: 2, borderStyle: 'dashed', borderColor: '#C88A12', borderRadius: 13, borderCurve: 'continuous', backgroundColor: '#FFF8E8', alignItems: 'center', justifyContent: 'center', padding: scaleIcon(14), gap: scaleIcon(4) }}>
                                                    <Text selectable style={{ color: '#704B00', fontSize: scaleFont(16), fontWeight: '900', textAlign: 'center' }}>No real product options mapped</Text>
                                                    <Text selectable style={{ color: '#704B00', fontSize: scaleFont(13), fontWeight: '700', textAlign: 'center' }}>Open Map Products to connect approved manufacturer/model variants.</Text>
                                                </TouchableOpacity>
                                            ) : mappedRecords.length === 0 ? (
                                                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '800' }}>Mapped product options are hidden by the current product filters.</Text>
                                            ) : null}
                                            {mappedRecords.length < card.mappedCount && (
                                                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '700' }}>
                                                    {card.mappedCount - mappedRecords.length} mapped option{card.mappedCount - mappedRecords.length === 1 ? '' : 's'} hidden by the current product filters.
                                                </Text>
                                            )}
                                            {!!card.adminNotes && <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(18) }}>{card.adminNotes}</Text>}
                                            <FactoryTileAction
                                                title={card.readinessStatus === 'ready' ? 'Mark In Progress' : 'Mark Complete / Send to Bottom'}
                                                variant="secondary"
                                                disabled={busy}
                                                onPress={() => onSetReadiness(card, card.readinessStatus === 'ready' ? 'building' : 'ready')}
                                            />
                                        </View>
                                    </View>
                                );
                            })}
                            {!roomCards.length && <Text selectable style={{ color: theme.colors.mutedText }}>Starter deck is not installed yet.</Text>}
                        </View>
                    </ThemedCard>
                    </View>
                );
            })}
            {!visibleCards.length && (
                <ThemedCard style={{ minHeight: scaleIcon(120), alignItems: 'center', justifyContent: 'center', padding: scaleIcon(18) }}>
                    <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(17), fontWeight: '900', textAlign: 'center' }}>No starter cards match this search and filter.</Text>
                </ThemedCard>
            )}
        </View>
    );
}

function StarterMappedVariant({ record, busy, onEdit, onDetails }: { record: CatalogFactoryRecord; busy: boolean; onEdit: () => void; onDetails: () => void }) {
    const productName = factoryProductName(record);
    return (
        <CompactCatalogProductTile
            shortCode={record.shortCode}
            imageUrl={record.primaryImageUrl}
            productName={productName}
            model={record.modelNumber ? `Model ${record.modelNumber}` : ''}
            identity={[record.brand, record.status].filter(Boolean).join(' · ')}
            disabled={busy}
            onOpen={onDetails}
            primaryAction={{ title: 'Edit', onPress: onEdit }}
            secondaryAction={{ title: 'Details', onPress: onDetails }}
        />
    );
}

function StarterCardMappingModal({
    card,
    records,
    selectedVariantIds,
    setSelectedVariantIds,
    readiness,
    setReadiness,
    notes,
    setNotes,
    busy,
    onSave,
    onClose,
}: {
    card: HomeOSStarterDeckCard | null;
    records: CatalogFactoryRecord[];
    selectedVariantIds: string[];
    setSelectedVariantIds: (ids: string[]) => void;
    readiness: HomeOSStarterDeckReadiness;
    setReadiness: (readiness: HomeOSStarterDeckReadiness) => void;
    notes: string;
    setNotes: (notes: string) => void;
    busy: boolean;
    onSave: () => void;
    onClose: () => void;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [query, setQuery] = useState('');
    useEffect(() => setQuery(''), [card?.templateKey]);
    const normalizedQuery = query.trim().toLowerCase();
    const visibleRecords = records.filter((record) => !normalizedQuery || [
        record.shortCode, factoryProductName(record), record.category, record.manufacturer, record.brand, record.modelNumber,
    ].join(' ').toLowerCase().includes(normalizedQuery));

    function toggleVariant(id: string) {
        setSelectedVariantIds(selectedVariantIds.includes(id)
            ? selectedVariantIds.filter((candidate) => candidate !== id)
            : [...selectedVariantIds, id]);
    }

    return (
        <Modal animationType="slide" transparent visible={Boolean(card)} onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: 'rgba(8, 18, 31, 0.58)', justifyContent: 'center', padding: scaleIcon(14) }}>
                <ThemedCard style={{ width: '100%', maxWidth: 820, maxHeight: '94%', alignSelf: 'center', padding: 0, overflow: 'hidden' }}>
                    <View style={{ padding: scaleIcon(18), borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: scaleIcon(5) }}>
                        <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900', letterSpacing: 0.7 }}>HOMEOS STARTER ARCHETYPE</Text>
                        <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(24), lineHeight: scaleFont(29), fontWeight: '900' }}>{[card?.shortCode, card?.name || 'Starter card'].filter(Boolean).join(' · ')}</Text>
                        <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(20), fontWeight: '700' }}>Choose only real products that are valid options for this exact card. Company entitlement and active offerings are enforced later for TechOS.</Text>
                    </View>
                    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: scaleIcon(18), gap: scaleIcon(14) }}>
                        <View style={{ gap: scaleIcon(7) }}>
                            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '900' }}>Deck readiness</Text>
                            <ChoiceWrap>
                                {(['unbuilt', 'building', 'ready'] as const).map((value) => <Chip key={value} label={value} selected={readiness === value} onPress={() => setReadiness(value)} />)}
                            </ChoiceWrap>
                        </View>
                        <Field label="Super Admin notes" value={notes} onChangeText={setNotes} multiline placeholder="What still needs to be researched or built?" />
                        <Field label="Find a real product variant" value={query} onChangeText={setQuery} placeholder="Brand, model, category, or product name" />
                        <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>{selectedVariantIds.length} mapped option{selectedVariantIds.length === 1 ? '' : 's'}</Text>
                        <View style={{ gap: scaleIcon(8) }}>
                            {visibleRecords.map((record) => {
                                const checked = selectedVariantIds.includes(record.id);
                                return (
                                    <TouchableOpacity key={record.id} accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={`${checked ? 'Remove' : 'Map'} ${factoryProductName(record)}`} disabled={busy} onPress={() => toggleVariant(record.id)} style={{ minHeight: scaleIcon(64), flexDirection: 'row', alignItems: 'center', gap: scaleIcon(10), borderWidth: 2, borderColor: checked ? theme.colors.primary : theme.colors.border, borderRadius: 12, borderCurve: 'continuous', padding: scaleIcon(9), backgroundColor: checked ? theme.colors.surfaceAlt : theme.colors.surface }}>
                                        <ProductCardImage compact imageUrl={record.primaryImageUrl} productName={factoryProductName(record)} style={{ width: scaleIcon(48), height: scaleIcon(48), minHeight: scaleIcon(48) }} />
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Text selectable numberOfLines={2} style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900' }}>{factoryProductName(record)}</Text>
                                            <Text selectable numberOfLines={1} style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '700' }}>{[record.shortCode, record.category, record.brand, record.modelNumber, record.status].filter(Boolean).join(' · ')}</Text>
                                        </View>
                                        <View style={{ width: scaleIcon(44), height: scaleIcon(44), borderRadius: 12, backgroundColor: checked ? theme.colors.primary : theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                                            <Text style={{ color: checked ? theme.colors.primaryText : theme.colors.text, fontSize: scaleFont(20), fontWeight: '900' }}>{checked ? '✓' : '+'}</Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                            {!visibleRecords.length && <Text selectable style={{ color: theme.colors.mutedText }}>No product variants match this search.</Text>}
                        </View>
                    </ScrollView>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(9), padding: scaleIcon(14), borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                        <ThemedButton title={busy ? 'Saving...' : 'Save Starter Mapping'} disabled={busy} onPress={onSave} style={{ flex: 1, minWidth: scaleIcon(180), minHeight: scaleIcon(48) }} />
                        <ThemedButton title="Cancel" variant="secondary" disabled={busy} onPress={onClose} style={{ flex: 1, minWidth: scaleIcon(130), minHeight: scaleIcon(48) }} />
                    </View>
                </ThemedCard>
            </View>
        </Modal>
    );
}

function starterCardIcon(card: HomeOSStarterDeckCard) {
    if (card.name.toLowerCase().includes('toilet')) return '🚽';
    if (card.name.toLowerCase().includes('shower') || card.name.toLowerCase().includes('tub')) return '🚿';
    if (card.name.toLowerCase().includes('sink') || card.name.toLowerCase().includes('faucet')) return '🚰';
    if (card.name.toLowerCase().includes('water heater')) return '🔥';
    if (card.name.toLowerCase().includes('dishwasher')) return '🍽️';
    if (card.name.toLowerCase().includes('filter') || card.name.toLowerCase().includes('osmosis')) return '💧';
    if (card.category === 'Equipment') return '⚙️';
    return '🔧';
}

function TemplateEditor({ draft, setDraft, busy, onSave, onCancel }: { draft: typeof emptyTemplate; setDraft: (draft: typeof emptyTemplate) => void; busy: boolean; onSave: () => void; onCancel: () => void }) {
    return <ThemedCard><Title>New Category Template</Title><Field label="Template key *" value={draft.templateKey} onChangeText={(templateKey) => setDraft({ ...draft, templateKey })} placeholder="tankless_water_heater" /><Field label="Category name *" value={draft.categoryName} onChangeText={(categoryName) => setDraft({ ...draft, categoryName })} placeholder="Tankless Water Heater" /><Field label="Description" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} multiline /><Field label="Universal fields (comma separated)" value={draft.universalFields} onChangeText={(universalFields) => setDraft({ ...draft, universalFields })} /><Field label="Category specification fields (comma separated)" value={draft.specificationFields} onChangeText={(specificationFields) => setDraft({ ...draft, specificationFields })} placeholder="fuel_type, max_gpm, input_btu" /><Field label="Required category fields (comma separated)" value={draft.requiredFields} onChangeText={(requiredFields) => setDraft({ ...draft, requiredFields })} placeholder="fuel_type, max_gpm" /><StatusChoices value={draft.status} onChange={(status) => setDraft({ ...draft, status })} /><ButtonRow><ThemedButton title={busy ? 'Saving...' : 'Save Template'} disabled={busy} onPress={onSave} style={{ flex: 1 }} /><ThemedButton title="Cancel" variant="secondary" disabled={busy} onPress={onCancel} style={{ flex: 1 }} /></ButtonRow></ThemedCard>;
}

function SeedEditor({
    draft,
    setDraft,
    templates,
    records,
    starterCards,
    busy,
    researching,
    research,
    saveError,
    onAddCategory,
    onResearch,
    onUseResearch,
    onClearResearch,
    onSave,
    onCancel,
}: {
    draft: typeof emptySeed;
    setDraft: (draft: typeof emptySeed) => void;
    templates: CatalogTemplateDefinition[];
    records: CatalogFactoryRecord[];
    starterCards: HomeOSStarterDeckCard[];
    busy: boolean;
    researching: boolean;
    research: CatalogProductResearch | null;
    saveError: string;
    onAddCategory: (categoryName: string) => Promise<string>;
    onResearch: () => void;
    onUseResearch: () => void;
    onClearResearch: () => void;
    onSave: () => void;
    onCancel: () => void;
}) {
    const canResearch = Boolean(draft.category.trim() && (draft.brand.trim() || draft.manufacturer.trim()) && (draft.model_number.trim() || draft.manufacturer_part_number.trim()));
    const selectedTemplate = templates.find((template) =>
        template.status === 'approved'
        && (template.templateKey.toLowerCase() === draft.category.trim().toLowerCase()
            || template.categoryName.toLowerCase() === draft.category.trim().toLowerCase())
    );
    const categoryOptions = catalogCategorySuggestions(templates.filter((template) => template.status === 'approved'), starterCards).map((option) => ({
        ...option,
        value: templates.find((template) => template.id === option.value)?.templateKey || option.value,
    }));
    const context = selectedTemplate?.categoryName || draft.category;
    const manufacturerOptions = catalogBrandSuggestions(context, records, 'manufacturer');
    const brandOptions = catalogBrandSuggestions(context, records, 'brand');
    const familyOptions = catalogFamilySuggestions(records, {
        templateId: selectedTemplate?.id,
        category: selectedTemplate?.categoryName,
        manufacturer: draft.manufacturer,
        brand: draft.brand,
    });
    const specificationValues = safeParseObject(draft.specifications);
    const updateSpecification = (key: string, value: string) => {
        setDraft({
            ...draft,
            specifications: JSON.stringify({ ...safeParseObject(draft.specifications), [key]: value }, null, 2),
        });
    };
    return (
        <ThemedCard>
            <Title>New Master Product Seed</Title>
            <Text selectable style={{ color: '#58697A' }}>
                This creates a draft only. Product facts, sources, external image URLs, and retail observations remain pending until review.
            </Text>
            <CatalogQuickStartLibrary
                starterCards={starterCards}
                busy={busy || researching}
                onUse={(suggestion) => setDraft({
                    ...draft,
                    category: suggestion.seed.category,
                    manufacturer: suggestion.seed.manufacturer,
                    brand: suggestion.seed.brand,
                    family_name: suggestion.seed.family_name,
                    model_number: suggestion.seed.model_number,
                    manufacturer_part_number: suggestion.seed.manufacturer_part_number,
                    upc_gtin: '',
                    color: '',
                    finish: suggestion.seed.finish,
                    size: '',
                    capacity: '',
                    description: suggestion.seed.description,
                    specifications: JSON.stringify(suggestion.seed.specifications, null, 2),
                    confidence: suggestion.seed.confidence,
                    primary_image_url: '',
                    sources: JSON.stringify(suggestion.seed.sources, null, 2),
                    retail_listings: '[]',
                })}
            />
            <SearchableCombobox label="Category *" value={draft.category} options={categoryOptions} onChange={(category) => setDraft({ ...draft, category })} onAddNew={onAddCategory} placeholder="Choose a HomeOS-informed category" helperText="Suggestions come from the current HomeOS Deck taxonomy and approved Catalog Factory categories." disabled={busy || researching} />
            <SearchableCombobox label="Manufacturer *" value={draft.manufacturer} options={manufacturerOptions} onChange={(manufacturer) => setDraft({ ...draft, manufacturer })} placeholder="Choose or add a manufacturer" helperText="Common plumbing manufacturers are prioritized for the selected category." disabled={busy || researching} />
            <SearchableCombobox label="Brand *" value={draft.brand} options={brandOptions} onChange={(brand) => setDraft({ ...draft, brand })} placeholder="Choose or add a brand" helperText="The list includes practical US plumbing brands plus brands already in this catalog." disabled={busy || researching} />
            <SearchableCombobox label="Family name *" value={draft.family_name} options={familyOptions} onChange={(family_name) => setDraft({ ...draft, family_name })} placeholder="Choose or add a product family" helperText="Existing families for the selected category and brand appear first." disabled={busy || researching} />
            <Field label="Exact model number *" value={draft.model_number} onChangeText={(model_number) => setDraft({ ...draft, model_number })} />
            <Field label="Manufacturer part number" value={draft.manufacturer_part_number} onChangeText={(manufacturer_part_number) => setDraft({ ...draft, manufacturer_part_number })} />
            <View style={{ gap: 8, borderWidth: 1, borderColor: '#AAB7C5', borderRadius: 12, padding: 12 }}>
                <Text selectable style={{ fontWeight: '900', fontSize: 18 }}>Automatic manufacturer research</Text>
                <Text selectable style={{ color: '#58697A', lineHeight: 20 }}>
                    Searches current manufacturer pages, manuals, specifications, and warranty sources. Each run uses the low-cost research model, at most two web searches, and a 2,400-output-token cap. Results stay in review until you create the draft.
                </Text>
                <ThemedButton title={researching ? 'Researching Manufacturer...' : 'Research Manufacturer'} disabled={busy || researching || !canResearch} onPress={onResearch} />
                {research && (
                    <FactoryResearchReview research={research} onUse={onUseResearch} onClear={onClearResearch} />
                )}
            </View>
            <Field label="UPC / GTIN" value={draft.upc_gtin} onChangeText={(upc_gtin) => setDraft({ ...draft, upc_gtin })} />
            <ButtonRow>
                <FieldBox label="Color" value={draft.color} onChangeText={(color) => setDraft({ ...draft, color })} />
                <FieldBox label="Finish" value={draft.finish} onChangeText={(finish) => setDraft({ ...draft, finish })} />
                <FieldBox label="Size" value={draft.size} onChangeText={(size) => setDraft({ ...draft, size })} />
                <FieldBox label="Capacity" value={draft.capacity} onChangeText={(capacity) => setDraft({ ...draft, capacity })} />
            </ButtonRow>
            <Field label="Description" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} multiline />
            {!!selectedTemplate?.specificationFields.length && (
                <View style={{ gap: 10, borderWidth: 1, borderColor: '#B8CDD4', borderRadius: 12, padding: 12, backgroundColor: '#F5FBFC' }}>
                    <Text selectable style={{ fontWeight: '900', fontSize: 18 }}>{selectedTemplate.categoryName} specifications</Text>
                    <Text selectable style={{ color: '#58697A' }}>Fields marked with * are required before the draft can be created.</Text>
                    {selectedTemplate.specificationFields.map((field) => (
                        <Field
                            key={field.key}
                            label={`${field.label}${selectedTemplate.requiredFields.includes(field.key) ? ' *' : ''}`}
                            value={String(specificationValues[field.key] ?? '')}
                            onChangeText={(value) => updateSpecification(field.key, value)}
                        />
                    ))}
                </View>
            )}
            <Field label="Specifications JSON (advanced)" value={draft.specifications} onChangeText={(specifications) => setDraft({ ...draft, specifications })} multiline monospace />
            <Field label="Primary image source URL" value={draft.primary_image_url} onChangeText={(primary_image_url) => setDraft({ ...draft, primary_image_url })} />
            <Field label="Source links JSON array" value={draft.sources} onChangeText={(sources) => setDraft({ ...draft, sources })} multiline monospace />
            <Field label="Retail listings JSON array" value={draft.retail_listings} onChangeText={(retail_listings) => setDraft({ ...draft, retail_listings })} multiline monospace />
            <Field label="Confidence (0 to 1)" value={draft.confidence} onChangeText={(confidence) => setDraft({ ...draft, confidence })} keyboardType="decimal-pad" />
            <ButtonRow>
                <ThemedButton title={busy ? 'Creating...' : 'Create Draft Seed'} disabled={busy || researching} onPress={onSave} style={{ flex: 1 }} />
                <ThemedButton title="Cancel" variant="secondary" disabled={busy || researching} onPress={onCancel} style={{ flex: 1 }} />
            </ButtonRow>
            {!!saveError && (
                <View accessibilityRole="alert" style={{ backgroundColor: '#FFF1F1', borderColor: '#D36A72', borderWidth: 1, borderRadius: 10, padding: 11 }}>
                    <Text selectable style={{ color: '#7A1720', fontWeight: '800', lineHeight: 20 }}>{saveError}</Text>
                </View>
            )}
        </ThemedCard>
    );
}

function FactoryResearchReview({ research, onUse, onClear }: { research: CatalogProductResearch; onUse: () => void; onClear: () => void }) {
    return (
        <View style={{ gap: 8, backgroundColor: research.exactModelMatch ? '#E9F8F1' : '#FFF4DD', borderRadius: 11, padding: 11 }}>
            <Text selectable style={{ fontWeight: '900' }}>
                {research.productName} · {research.exactModelMatch ? 'exact model confirmed' : 'exact model not confirmed'} · {research.confidence} confidence
            </Text>
            {research.warnings.map((warning) => <Text selectable key={warning} style={{ color: '#704B00' }}>• {warning}</Text>)}
            {research.usage && (
                <Text selectable style={{ color: '#315466' }}>
                    Cost control: {research.usage.totalTokens.toLocaleString()} tokens used · {research.usage.webSearchCalls} web search{research.usage.webSearchCalls === 1 ? '' : 'es'} · {research.usage.maxOutputTokens.toLocaleString()} output-token cap
                </Text>
            )}
            <Text selectable style={{ fontWeight: '900' }}>Sources</Text>
            {research.sources.map((source) => (
                <TouchableOpacity key={source.url} accessibilityRole="link" onPress={() => void Linking.openURL(source.url)}>
                    <Text selectable style={{ color: '#087D78', textDecorationLine: 'underline', fontWeight: '800' }}>{source.title}</Text>
                </TouchableOpacity>
            ))}
            <ButtonRow>
                <ThemedButton title="Use Research in Seed Draft" disabled={!research.sources.length} onPress={onUse} style={{ flex: 1 }} />
                <ThemedButton title="Clear" variant="secondary" onPress={onClear} style={{ flex: 1 }} />
            </ButtonRow>
        </View>
    );
}

function catalogSourceType(sourceType: CatalogResearchSourceType) {
    switch (sourceType) {
        case 'manufacturer_product':
        case 'manufacturer_support':
            return 'manufacturer_page';
        case 'manufacturer_manual':
            return 'installation_manual';
        case 'manufacturer_warranty':
            return 'warranty_document';
        case 'distributor':
            return 'retailer_page';
        default:
            return 'other';
    }
}

function safeParseObject(value: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

function ImportPanel({ busy, preview, summary, fileName, onPick, onImport }: { busy: boolean; preview: CatalogImportPreviewRow[]; summary: CatalogImportSummary | null; fileName: string; onPick: () => void; onImport: () => void }) {
    const invalid = preview.filter((row) => row.errors.length);
    return <ThemedCard><Title>Import Catalog Batch</Title><Text selectable style={{ color: '#58697A', lineHeight: 21 }}>Upload structured JSON or CSV produced externally. Every valid product is created as a draft. Exact duplicates and invalid rows remain in the audit batch but do not create products.</Text><ButtonRow><ThemedButton title={busy ? 'Checking...' : 'Upload JSON or CSV'} disabled={busy} onPress={onPick} style={{ flex: 1 }} /><ThemedButton title={busy ? 'Importing...' : 'Create Draft Records'} disabled={busy || !preview.length} onPress={onImport} style={{ flex: 1 }} /></ButtonRow>{!!fileName && <Text selectable style={{ fontWeight: '800' }}>{fileName}: {preview.length} rows · {invalid.length} invalid · {preview.filter((row) => row.duplicateMatches.length).length} possible duplicates</Text>}{invalid.map((row) => <View key={row.rowNumber} style={{ padding: 10, backgroundColor: '#FFF0F0', borderRadius: 10 }}><Text selectable style={{ fontWeight: '900', color: '#8A1020' }}>Row {row.rowNumber}</Text><Text selectable style={{ color: '#8A1020' }}>{row.errors.join(' ')}</Text></View>)}{preview.filter((row) => row.duplicateMatches.length).map((row) => <View key={`duplicate-${row.rowNumber}`} style={{ padding: 10, backgroundColor: '#FFF8E8', borderRadius: 10 }}><Text selectable style={{ fontWeight: '900', color: '#704B00' }}>Row {row.rowNumber}: possible duplicate</Text><Text selectable style={{ color: '#704B00' }}>{row.duplicateMatches.map((match) => `${match.label} (${match.matchReason})`).join('; ')}</Text></View>)}{summary && <View style={{ padding: 12, backgroundColor: '#E9F8F1', borderRadius: 12 }}><Text selectable style={{ fontWeight: '900' }}>Import summary</Text><Text selectable>{summary.created} created · {summary.duplicate} duplicate · {summary.warning} warning · {summary.failed} failed</Text><Text selectable>Batch {summary.batchId}</Text></View>}</ThemedCard>;
}

function Filters({ filters, setFilters, templates, busy, onApply }: { filters: CatalogFactoryFilters; setFilters: (value: CatalogFactoryFilters) => void; templates: CatalogTemplateDefinition[]; busy: boolean; onApply: () => void }) {
    return <ThemedCard><Title>Catalog filters</Title><ChoiceWrap><Chip label="All categories" selected={!filters.category} onPress={() => setFilters({ ...filters, category: '' })} />{templates.map((template) => <Chip key={template.id} label={template.categoryName} selected={filters.category === template.categoryName} onPress={() => setFilters({ ...filters, category: template.categoryName })} />)}</ChoiceWrap><ButtonRow><FieldBox label="Manufacturer" value={filters.manufacturer || ''} onChangeText={(manufacturer) => setFilters({ ...filters, manufacturer })} /><FieldBox label="Brand" value={filters.brand || ''} onChangeText={(brand) => setFilters({ ...filters, brand })} /><FieldBox label="Retailer" value={filters.retailer || ''} onChangeText={(retailer) => setFilters({ ...filters, retailer })} /><FieldBox label="Verified before (YYYY-MM-DD)" value={filters.lastVerifiedBefore || ''} onChangeText={(lastVerifiedBefore) => setFilters({ ...filters, lastVerifiedBefore })} /></ButtonRow><ChoiceWrap><Chip label="Any status" selected={!filters.status} onPress={() => setFilters({ ...filters, status: '' })} />{CATALOG_STATUSES.map((value) => <Chip key={value} label={value.replace('_', ' ')} selected={filters.status === value} onPress={() => setFilters({ ...filters, status: value })} />)}</ChoiceWrap><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}><Toggle label="Missing information" value={Boolean(filters.missing)} onChange={(missing) => setFilters({ ...filters, missing })} /><Toggle label="Possible duplicates" value={Boolean(filters.duplicates)} onChange={(duplicates) => setFilters({ ...filters, duplicates })} /></View><ThemedButton title={busy ? 'Loading...' : 'Apply Filters'} disabled={busy} onPress={onApply} /></ThemedCard>;
}

function FactoryRecordCard({ record, phone, selected, busy, onToggle, onEdit, onDetails, onApprove, onReject, onNeedsReview }: { record: CatalogFactoryRecord; phone: boolean; selected: boolean; busy: boolean; onToggle: () => void; onEdit: () => void; onDetails: () => void; onApprove: () => void; onReject: () => void; onNeedsReview: () => void }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const warnings = [...record.validationWarnings, ...record.duplicateWarnings, ...record.missingFields];
    const productName = factoryProductName(record);

    return (
        <ThemedCard
            style={{
                width: phone ? '100%' : scaleIcon(320),
                minWidth: phone ? 0 : scaleIcon(280),
                maxWidth: phone ? '100%' : scaleIcon(365),
                flexBasis: phone ? '100%' : scaleIcon(290),
                flexGrow: 1,
                padding: scaleIcon(12),
                borderWidth: 2,
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                borderCurve: 'continuous',
            }}
        >
            <View style={{ flex: 1, gap: scaleIcon(10) }}>
                <View style={{ flexDirection: 'row', gap: scaleIcon(10), alignItems: 'flex-start' }}>
                    <ProductCardImage
                        compact
                        imageUrl={record.primaryImageUrl}
                        productName={productName}
                        style={{ width: scaleIcon(76), height: scaleIcon(76), minHeight: scaleIcon(76), flexShrink: 0 }}
                    />
                    <View style={{ flex: 1, minWidth: 0, gap: scaleIcon(3) }}>
                        <Text selectable numberOfLines={2} ellipsizeMode="tail" style={{ color: theme.colors.text, fontSize: scaleFont(16), lineHeight: scaleFont(20), fontWeight: '900' }}>
                            {productName}
                        </Text>
                        <Text selectable numberOfLines={1} ellipsizeMode="tail" style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '800' }}>
                            {record.modelNumber ? `Model ${record.modelNumber}` : 'Model not supplied'}
                        </Text>
                        <Text selectable numberOfLines={1} ellipsizeMode="tail" style={{ color: theme.colors.mutedText, fontSize: scaleFont(12) }}>
                            {[record.category, record.brand].filter(Boolean).join(' · ')}
                        </Text>
                    </View>
                    <TouchableOpacity
                        accessibilityRole="checkbox"
                        accessibilityLabel={`${selected ? 'Deselect' : 'Select'} ${productName}`}
                        accessibilityState={{ checked: selected }}
                        disabled={busy}
                        onPress={onToggle}
                        style={{ width: scaleIcon(44), height: scaleIcon(44), borderWidth: 2, borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primary : theme.colors.surface, borderRadius: 11, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.55 : 1 }}
                    >
                        <Text style={{ color: selected ? theme.colors.primaryText : theme.colors.text, fontSize: scaleFont(18), fontWeight: '900' }}>{selected ? '✓' : '○'}</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(6) }}>
                    {!!record.shortCode && <ShortCodeBadge code={record.shortCode} />}
                    <FactoryTileBadge label={record.status.replaceAll('_', ' ')} tone={record.status === 'approved' ? 'green' : record.status === 'rejected' ? 'red' : 'amber'} />
                    {warnings.length > 0 && <FactoryTileBadge label={`${warnings.length} review flag${warnings.length === 1 ? '' : 's'}`} tone="amber" />}
                    {selected && <FactoryTileBadge label="Selected" tone="green" />}
                </View>

                <View style={{ flexDirection: 'row', gap: scaleIcon(7), marginTop: 'auto' }}>
                    <FactoryTileAction title="Edit" variant="secondary" disabled={busy} onPress={onEdit} />
                    <FactoryTileAction title="Details / Reference" variant="secondary" disabled={busy} onPress={onDetails} />
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(7) }}>
                    {record.status !== 'approved' && <FactoryTileAction title="Approve" disabled={busy || warnings.length > 0} onPress={onApprove} />}
                    {record.status === 'draft' && <FactoryTileAction title="Needs Review" variant="secondary" disabled={busy} onPress={onNeedsReview} />}
                    {record.status !== 'rejected' && <FactoryTileAction title="Reject" variant="danger" disabled={busy} onPress={onReject} />}
                </View>
            </View>
        </ThemedCard>
    );
}

function FactoryRecordDetailsModal({ record, onClose }: { record: CatalogFactoryRecord | null; onClose: () => void }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const productName = record ? factoryProductName(record) : 'Master product';
    const specifications = record ? catalogSpecificationDisplays(record.specifications) : [];
    const warnings = record ? [...record.validationWarnings, ...record.duplicateWarnings, ...record.missingFields] : [];
    const identityRows = record ? [
        { label: 'Card code', value: record.shortCode },
        { label: 'Manufacturer', value: record.manufacturer },
        { label: 'Brand', value: record.brand },
        { label: 'Model', value: record.modelNumber },
        { label: 'Family', value: record.familyName },
        { label: 'Category', value: record.category },
        { label: 'Manufacturer part number', value: record.manufacturerPartNumber },
        { label: 'UPC / GTIN', value: record.upcGtin },
        { label: 'Finish', value: record.finish || record.color },
    ].filter((row) => row.value) : [];
    const activeAssets = record?.assets.filter((asset) => asset.active) || [];

    return (
        <Modal animationType="slide" transparent visible={Boolean(record)} onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: 'rgba(8, 18, 31, 0.58)', justifyContent: 'center', padding: scaleIcon(14) }}>
                <ThemedCard style={{ width: '100%', maxWidth: 820, maxHeight: '94%', alignSelf: 'center', padding: 0, overflow: 'hidden' }}>
                    <View style={{ padding: scaleIcon(18), borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: scaleIcon(5) }}>
                        <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900', letterSpacing: 0.7 }}>MASTER PRODUCT · DETAILS / REFERENCE</Text>
                        <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(24), lineHeight: scaleFont(29), fontWeight: '900' }}>{productName}</Text>
                        {!!record && <Text selectable style={{ color: theme.colors.mutedText, fontWeight: '800' }}>{[record.shortCode, record.status.replaceAll('_', ' '), 'Read-only master reference'].filter(Boolean).join(' · ')}</Text>}
                    </View>

                    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: scaleIcon(18), gap: scaleIcon(16) }}>
                        {!!record && (
                            <>
                                <ProductCardImage imageUrl={record.primaryImageUrl} productName={productName} style={{ width: '100%', height: scaleIcon(220) }} />

                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
                                    {identityRows.map((row) => (
                                        <View key={row.label} style={{ flexGrow: 1, flexBasis: scaleIcon(145), borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, borderCurve: 'continuous', backgroundColor: theme.colors.surfaceAlt, padding: scaleIcon(11), gap: scaleIcon(3) }}>
                                            <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(11), fontWeight: '900' }}>{row.label.toUpperCase()}</Text>
                                            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '800' }}>{row.value}</Text>
                                        </View>
                                    ))}
                                </View>

                                {!!record.description && (
                                    <FactoryDetailSection title="About this product">
                                        <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(15), lineHeight: scaleFont(22) }}>{record.description}</Text>
                                    </FactoryDetailSection>
                                )}

                                <FactoryDetailSection title="Specifications">
                                    {specifications.length ? specifications.map((specification) => (
                                        <View key={specification.key} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(6), justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: scaleIcon(7) }}>
                                            <Text selectable style={{ color: theme.colors.mutedText, fontWeight: '800', flex: 1, minWidth: scaleIcon(130) }}>{specification.label}</Text>
                                            <Text selectable style={{ color: theme.colors.text, fontWeight: '800', flex: 1, minWidth: scaleIcon(130), textAlign: 'right' }}>{specification.value}</Text>
                                        </View>
                                    )) : <Text selectable style={{ color: theme.colors.mutedText }}>No specifications have been published for this product.</Text>}
                                </FactoryDetailSection>

                                <FactoryDetailSection title="Manufacturer links & manuals">
                                    {record.sources.map((source) => (
                                        <FactoryReferenceLink key={source.id} title={source.title || 'Manufacturer reference'} subtitle={catalogFieldLabel(source.sourceType)} url={source.sourceUrl} />
                                    ))}
                                    {activeAssets.filter((asset) => asset.assetType !== 'image').map((asset) => (
                                        <FactoryReferenceLink key={asset.id} title={asset.fileName} subtitle={`${catalogAssetTypeLabel(asset.assetType)} · ${asset.homeownerVisible ? 'Visible in HomeOS' : 'Staff-only'}`} url={asset.displayUrl} />
                                    ))}
                                    {!record.sources.length && !activeAssets.some((asset) => asset.assetType !== 'image') && <Text selectable style={{ color: theme.colors.mutedText }}>No manufacturer link or manual has been published for this product.</Text>}
                                </FactoryDetailSection>

                                {warnings.length > 0 && (
                                    <FactoryDetailSection title="Review flags">
                                        {warnings.map((warning, index) => <Text selectable key={`${warning}-${index}`} style={{ color: '#704B00', lineHeight: scaleFont(20) }}>• {warning}</Text>)}
                                    </FactoryDetailSection>
                                )}
                            </>
                        )}
                    </ScrollView>

                    <View style={{ padding: scaleIcon(14), borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                        <ThemedButton title="Close Details" variant="secondary" onPress={onClose} />
                    </View>
                </ThemedCard>
            </View>
        </Modal>
    );
}

function FactoryTileAction({ title, variant, disabled, onPress }: { title: string; variant?: 'primary' | 'secondary' | 'danger'; disabled: boolean; onPress: () => void }) {
    const { scaleFont, scaleIcon } = useTheme();
    return <ThemedButton title={title} variant={variant} disabled={disabled} onPress={onPress} style={{ flexGrow: 1, flexBasis: scaleIcon(92), minHeight: scaleIcon(44), paddingHorizontal: scaleIcon(9), paddingVertical: scaleIcon(8) }} textStyle={{ fontSize: scaleFont(13), lineHeight: scaleFont(16) }} />;
}

function FactoryTileBadge({ label, tone }: { label: string; tone: 'green' | 'red' | 'amber' }) {
    const { scaleFont, scaleIcon } = useTheme();
    const colors = tone === 'green' ? ['#DDF7EA', '#086B42'] : tone === 'red' ? ['#FFE7EA', '#961B2C'] : ['#FFF2D7', '#745000'];
    return <View style={{ backgroundColor: colors[0], borderRadius: 999, paddingHorizontal: scaleIcon(9), paddingVertical: scaleIcon(5) }}><Text selectable numberOfLines={1} style={{ color: colors[1], fontSize: scaleFont(11), fontWeight: '900', textTransform: 'capitalize' }}>{label}</Text></View>;
}

function ShortCodeBadge({ code }: { code: string }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return <View style={{ backgroundColor: theme.colors.surfaceAlt, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 999, paddingHorizontal: scaleIcon(9), paddingVertical: scaleIcon(5) }}><Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(11), fontWeight: '900', letterSpacing: 0.7 }}>{code}</Text></View>;
}

function FactoryDetailSection({ title, children }: { title: string; children: React.ReactNode }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, borderCurve: 'continuous', padding: scaleIcon(13), gap: scaleIcon(9) }}><Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(17), fontWeight: '900' }}>{title}</Text>{children}</View>;
}

function FactoryReferenceLink({ title, subtitle, url }: { title: string; subtitle: string; url: string }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const available = Boolean(url.trim());
    return (
        <TouchableOpacity accessibilityRole="link" accessibilityLabel={`Open ${title}`} disabled={!available} onPress={() => void Linking.openURL(url)} style={{ minHeight: scaleIcon(44), borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: scaleIcon(9), gap: scaleIcon(2), opacity: available ? 1 : 0.55 }}>
            <Text selectable style={{ color: available ? theme.colors.primary : theme.colors.mutedText, fontSize: scaleFont(14), fontWeight: '900', textDecorationLine: available ? 'underline' : 'none' }}>{title}</Text>
            <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12) }}>{subtitle}</Text>
        </TouchableOpacity>
    );
}

function factoryProductName(record: CatalogFactoryRecord) {
    const displayName = typeof record.specifications.product_name === 'string' ? record.specifications.product_name.trim() : '';
    return displayName || [record.brand, record.familyName, record.modelNumber].filter(Boolean).join(' ') || 'Master product';
}

function CatalogFactoryEditModal({
    record,
    busy,
    message,
    onClose,
    children,
}: {
    record: CatalogFactoryRecord | null;
    busy: boolean;
    message: string;
    onClose: () => void;
    children: React.ReactNode;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <Modal animationType="slide" transparent visible={Boolean(record)} onRequestClose={() => { if (!busy) onClose(); }}>
            <View style={{ flex: 1, backgroundColor: 'rgba(8, 18, 31, 0.64)', justifyContent: 'center', padding: scaleIcon(10) }}>
                <ThemedCard style={{ width: '100%', maxWidth: 980, maxHeight: '96%', alignSelf: 'center', padding: 0, overflow: 'hidden' }}>
                    <View style={{ paddingHorizontal: scaleIcon(16), paddingVertical: scaleIcon(12), borderBottomWidth: 1, borderBottomColor: theme.colors.border, flexDirection: 'row', alignItems: 'center', gap: scaleIcon(10) }}>
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(19), fontWeight: '900' }}>Edit {record ? [record.shortCode, factoryProductName(record)].filter(Boolean).join(' · ') : 'Master Product'}</Text>
                            <Text selectable numberOfLines={2} style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(18), fontWeight: '700' }}>{message}</Text>
                        </View>
                        <ThemedButton title="Close" variant="secondary" disabled={busy} onPress={onClose} style={{ minWidth: scaleIcon(94), minHeight: scaleIcon(46) }} />
                    </View>
                    <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: scaleIcon(12) }}>
                        {children}
                    </ScrollView>
                </ThemedCard>
            </View>
        </Modal>
    );
}

function EditPanel({
    record,
    draft,
    setDraft,
    templates,
    records,
    starterCards,
    json,
    setJson,
    showAdvancedJson,
    setShowAdvancedJson,
    mergeTargetId,
    setMergeTargetId,
    candidates,
    busy,
    onAddCategory,
    onSave,
    onMerge,
    onUploadPhoto,
    onUploadDocument,
    onChangeMedia,
    onCancel,
}: {
    record: CatalogFactoryRecord;
    draft: CatalogFactoryEditorDraft;
    setDraft: (draft: CatalogFactoryEditorDraft) => void;
    templates: CatalogTemplateDefinition[];
    records: CatalogFactoryRecord[];
    starterCards: HomeOSStarterDeckCard[];
    json: string;
    setJson: (value: string) => void;
    showAdvancedJson: boolean;
    setShowAdvancedJson: (value: boolean) => void;
    mergeTargetId: string;
    setMergeTargetId: (value: string) => void;
    candidates: CatalogFactoryRecord[];
    busy: boolean;
    onAddCategory: (categoryName: string) => Promise<string>;
    onSave: () => void;
    onMerge: () => void;
    onUploadPhoto: () => void;
    onUploadDocument: (type: Exclude<CatalogFactoryAssetType, 'image'>) => void;
    onChangeMedia: (asset: CatalogFactoryAsset, patch: { isPrimary?: boolean; homeownerVisible?: boolean; active?: boolean }) => void;
    onCancel: () => void;
}) {
    const { width } = useWindowDimensions();
    const phone = width < 720;
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [newSpecificationKey, setNewSpecificationKey] = useState('');
    const [newSpecificationValue, setNewSpecificationValue] = useState('');
    const [addingSpecification, setAddingSpecification] = useState(false);
    const [showReferenceMedia, setShowReferenceMedia] = useState(false);
    const [showDescription, setShowDescription] = useState(false);
    const [showReferences, setShowReferences] = useState(false);
    const [showCompatibility, setShowCompatibility] = useState(false);
    const [showApplications, setShowApplications] = useState(false);
    const [showWarranty, setShowWarranty] = useState(false);
    const [showDuplicateMerge, setShowDuplicateMerge] = useState(false);
    const productName = draft.productTitle || [draft.brand, draft.familyName, draft.modelNumber].filter(Boolean).join(' ');
    const specificationEntries = Object.entries(draft.specifications);
    const finishOption = catalogFinishOption(draft.finish);
    const selectedTemplate = templates.find((template) => template.id === draft.templateId);
    const categoryOptions = catalogCategorySuggestions(templates, starterCards);
    const context = selectedTemplate?.categoryName || record.category;
    const manufacturerOptions = catalogBrandSuggestions(context, records, 'manufacturer');
    const brandOptions = catalogBrandSuggestions(context, records, 'brand');
    const familyOptions = catalogFamilySuggestions(records, {
        templateId: draft.templateId,
        manufacturer: draft.manufacturer,
        brand: draft.brand,
    });
    const photoAssets = record.assets.filter((asset) => asset.assetType === 'image');
    const referenceAssets = record.assets.filter((asset) => asset.assetType !== 'image');
    const activePhotos = photoAssets.filter((asset) => asset.active);
    const primaryAsset = activePhotos.find((asset) => asset.isPrimary) || activePhotos[0];

    function updateSpecification(key: string, value: string) {
        setDraft({ ...draft, specifications: { ...draft.specifications, [key]: value } });
    }

    function addSpecification() {
        const key = newSpecificationKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        if (!key) return;
        setDraft({ ...draft, specifications: { ...draft.specifications, [key]: newSpecificationValue.trim() } });
        setNewSpecificationKey('');
        setNewSpecificationValue('');
        setAddingSpecification(false);
    }

    return (
        <ThemedCard style={{ padding: phone ? scaleIcon(12) : scaleIcon(16) }}>
            <View style={{ gap: scaleIcon(12) }}>
                <View style={{ gap: scaleIcon(6) }}>
                    <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(phone ? 23 : 27), fontWeight: '900' }}>Edit Master Product{record.shortCode ? ` · ${record.shortCode}` : ''}</Text>
                    <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(15), lineHeight: scaleFont(21) }}>
                        Edit the compact master reference card. Pricing, service history, and job photos stay separate.
                    </Text>
                </View>

                <CompactEditorCard title={`Product Photos (${photoAssets.length})`} description="Add multiple actual product photos here. One active photo is primary, and every photo can be HomeOS-visible or staff-only. These master reference photos stay separate from installed-item, service, and job media.">
                    <View style={{ flexDirection: phone ? 'column' : 'row', gap: scaleIcon(12), alignItems: phone ? 'stretch' : 'center' }}>
                        <ProductCardImage
                            compact
                            imageUrl={primaryAsset?.displayUrl || record.primaryImageUrl}
                            productName={productName}
                            style={{ width: phone ? '100%' : 116, height: 116, minHeight: 116, alignSelf: 'center' }}
                        />
                        <View style={{ flex: 1, gap: scaleIcon(8) }}>
                            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>{primaryAsset ? primaryAsset.fileName : 'No uploaded primary product photo'}</Text>
                            <Text selectable style={{ color: theme.colors.mutedText, lineHeight: scaleFont(19) }}>{primaryAsset ? 'Primary image on compact catalog and eligible HomeOS reference cards.' : 'Add product photos to replace the placeholder or imported source image.'}</Text>
                            <ThemedButton title="Add Product Photos" disabled={busy} onPress={onUploadPhoto} />
                        </View>
                    </View>
                    <View style={{ borderRadius: 11, borderCurve: 'continuous', padding: scaleIcon(10), backgroundColor: theme.colors.surfaceAlt, gap: scaleIcon(3) }}>
                        <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900' }}>{activePhotos.length} active photo{activePhotos.length === 1 ? '' : 's'} · {photoAssets.length - activePhotos.length} hidden</Text>
                        <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(18) }}>No fixed photo-count limit. Select one or several images per upload; each file can be up to 25 MB. The first newly selected image becomes primary.</Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(9), alignItems: 'stretch' }}>
                        {photoAssets.map((asset) => (
                            <View key={asset.id} style={{ width: phone ? '100%' : '48%', minWidth: phone ? 0 : 280, flexGrow: 1 }}>
                                <MediaTile asset={asset} productName={productName} busy={busy} phone={phone} onChange={(patch) => onChangeMedia(asset, patch)} />
                            </View>
                        ))}
                        {!photoAssets.length && <Text selectable style={{ color: theme.colors.mutedText }}>No product photos have been uploaded yet.</Text>}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(7) }}>
                        <CompactButton title="Upload Manual" onPress={() => onUploadDocument('installation_manual')} disabled={busy} />
                        <CompactButton title="Upload Spec Sheet" onPress={() => onUploadDocument('specification_sheet')} disabled={busy} />
                        <CompactButton title="Upload Warranty" onPress={() => onUploadDocument('warranty_document')} disabled={busy} />
                    </View>
                    <CompactDisclosureCard title={`Manuals & Reference Files (${referenceAssets.length})`} summary="Uploaded manuals, specification sheets, warranties, and other reference files" expanded={showReferenceMedia} onToggle={() => setShowReferenceMedia(!showReferenceMedia)}>
                        {referenceAssets.map((asset) => (
                            <MediaTile key={asset.id} asset={asset} productName={productName} busy={busy} phone={phone} onChange={(patch) => onChangeMedia(asset, patch)} />
                        ))}
                        {!referenceAssets.length && <Text selectable style={{ color: theme.colors.mutedText }}>No reference files have been uploaded yet.</Text>}
                    </CompactDisclosureCard>
                </CompactEditorCard>

                <CompactEditorCard title="Product Information" description="Canonical card identity and finish.">
                    <CompactField label="Product title / name *" value={draft.productTitle} onChangeText={(productTitle) => setDraft({ ...draft, productTitle })} placeholder="Example: Acme Flow 100 Kitchen Faucet" />
                    <View style={{ flexDirection: phone ? 'column' : 'row', gap: scaleIcon(9) }}>
                        <View style={{ flex: 1, minWidth: phone ? 0 : 220 }}><SearchableCombobox label="Manufacturer *" value={draft.manufacturer} options={manufacturerOptions} onChange={(manufacturer) => setDraft({ ...draft, manufacturer })} placeholder="Choose or add manufacturer" helperText="Prioritized for this category." disabled={busy} compact /></View>
                        <View style={{ flex: 1, minWidth: phone ? 0 : 220 }}><SearchableCombobox label="Brand *" value={draft.brand} options={brandOptions} onChange={(brand) => setDraft({ ...draft, brand })} placeholder="Choose or add brand" helperText="Existing and curated plumbing brands." disabled={busy} compact /></View>
                    </View>
                    <View style={{ flexDirection: phone ? 'column' : 'row', gap: scaleIcon(9) }}>
                        <View style={{ flex: 1, minWidth: phone ? 0 : 220 }}><SearchableCombobox label="Product family *" value={draft.familyName} options={familyOptions} onChange={(familyName) => setDraft({ ...draft, familyName })} placeholder="Choose or add family" helperText="Matching existing families appear first." disabled={busy} compact /></View>
                        <CompactFieldBox label="Exact model *" value={draft.modelNumber} onChangeText={(modelNumber) => setDraft({ ...draft, modelNumber })} />
                    </View>
                    <View style={{ flexDirection: phone ? 'column' : 'row', gap: scaleIcon(9) }}>
                        <CompactFieldBox label="MPN" value={draft.manufacturerPartNumber} onChangeText={(manufacturerPartNumber) => setDraft({ ...draft, manufacturerPartNumber })} />
                        <CompactFieldBox label="UPC / GTIN" value={draft.upcGtin} onChangeText={(upcGtin) => setDraft({ ...draft, upcGtin })} />
                    </View>
                    <SearchableCombobox label="Category / Type *" value={draft.templateId} options={categoryOptions} onChange={(templateId) => setDraft({ ...draft, templateId })} onAddNew={onAddCategory} placeholder="Choose a HomeOS-informed category" helperText="Suggestions are derived from the current HomeOS Deck taxonomy. Adding a category does not publish this product." disabled={busy} compact />
                    <View style={{ gap: scaleIcon(7) }}>
                        <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>Finish</Text>
                        <ChoiceWrap>
                            {[...CATALOG_FINISH_OPTIONS, 'Custom' as const].map((option) => <Chip key={option} label={option} selected={finishOption === option} onPress={() => setDraft({ ...draft, finish: option === 'Custom' ? (finishOption === 'Custom' ? draft.finish : '') : option })} />)}
                        </ChoiceWrap>
                        {finishOption === 'Custom' && <CompactField label="Custom finish" value={draft.finish} onChangeText={(finish) => setDraft({ ...draft, finish })} placeholder="Enter the manufacturer finish" />}
                    </View>
                    <CompactDisclosureCard title="Description" summary={draft.description ? compactSummary(draft.description) : 'No description'} expanded={showDescription} onToggle={() => setShowDescription(!showDescription)}>
                        <Field label="Product description" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} multiline />
                    </CompactDisclosureCard>
                </CompactEditorCard>

                <CompactDisclosureCard title={`References · Manufacturer Links & Manuals (${draft.sources.length})`} summary="Open to edit existing links or add a reference" expanded={showReferences} onToggle={() => setShowReferences(!showReferences)}>
                    {draft.sources.map((source, index) => (
                        <ReferenceTile key={source.id || `source-${index}`} source={source} index={index} busy={busy} onChange={(patch) => setDraft({ ...draft, sources: draft.sources.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) })} onRemove={() => setDraft({ ...draft, sources: draft.sources.filter((_, itemIndex) => itemIndex !== index) })} />
                    ))}
                    {!draft.sources.length && <Text selectable style={{ color: theme.colors.mutedText }}>No manufacturer links or manual references yet.</Text>}
                    <CompactButton title="Add Reference" onPress={() => setDraft({ ...draft, sources: [...draft.sources, { sourceType: 'manufacturer_page', sourceUrl: '', title: '' }] })} disabled={busy} />
                </CompactDisclosureCard>

                <CompactEditorCard title="Specifications" description="Product-specific facts such as cartridge, showerhead, monoblock, flow rate, size, and capacity belong here.">
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), alignItems: 'stretch' }}>
                        {specificationEntries.map(([key, value]) => (
                            <SpecificationTile key={key} label={catalogFieldLabel(key)} value={specificationEditorValue(value)} phone={phone} busy={busy} onChange={(next) => updateSpecification(key, next)} onRemove={() => { const next = { ...draft.specifications }; delete next[key]; setDraft({ ...draft, specifications: next }); }} />
                        ))}
                    </View>
                    {!specificationEntries.length && <Text selectable style={{ color: theme.colors.mutedText }}>No product-specific specifications yet.</Text>}
                    {!addingSpecification
                        ? <CompactButton title="+ Add Specification" onPress={() => setAddingSpecification(true)} disabled={busy} />
                        : <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, borderCurve: 'continuous', padding: scaleIcon(10), gap: scaleIcon(8), backgroundColor: theme.colors.surfaceAlt }}>
                            <View style={{ flexDirection: phone ? 'column' : 'row', gap: scaleIcon(8) }}>
                                <CompactFieldBox label="Specification" value={newSpecificationKey} onChangeText={setNewSpecificationKey} placeholder="Flow rate" />
                                <CompactFieldBox label="Value" value={newSpecificationValue} onChangeText={setNewSpecificationValue} placeholder="1.5 GPM" />
                            </View>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(7) }}>
                                <CompactButton title="Add" onPress={addSpecification} disabled={busy || !newSpecificationKey.trim()} />
                                <CompactButton title="Cancel" onPress={() => { setAddingSpecification(false); setNewSpecificationKey(''); setNewSpecificationValue(''); }} disabled={busy} />
                            </View>
                        </View>}
                </CompactEditorCard>

                <CompactDisclosureCard title="Compatibility & Parts" summary={lineSummary(draft.compatibility, draft.compatibleParts)} expanded={showCompatibility} onToggle={() => setShowCompatibility(!showCompatibility)}>
                    <CompactField label="Compatibility" value={draft.compatibility} onChangeText={(compatibility) => setDraft({ ...draft, compatibility })} multiline placeholder="One compatibility note per line" />
                    <CompactField label="Compatible parts / accessories" value={draft.compatibleParts} onChangeText={(compatibleParts) => setDraft({ ...draft, compatibleParts })} multiline placeholder="One part or accessory per line" />
                </CompactDisclosureCard>
                <CompactDisclosureCard title="Applications" summary={lineSummary(draft.applications)} expanded={showApplications} onToggle={() => setShowApplications(!showApplications)}>
                    <CompactField label="Applications / suitable uses" value={draft.applications} onChangeText={(applications) => setDraft({ ...draft, applications })} multiline placeholder="One application per line" />
                </CompactDisclosureCard>
                <CompactDisclosureCard title="Warranty" summary={draft.warranty ? compactSummary(draft.warranty) : 'No manufacturer warranty'} expanded={showWarranty} onToggle={() => setShowWarranty(!showWarranty)}>
                    <CompactField label="Manufacturer warranty" value={draft.warranty} onChangeText={(warranty) => setDraft({ ...draft, warranty })} multiline />
                </CompactDisclosureCard>
                <CompactDisclosureCard title="Advanced JSON" summary="Uncommon structured metadata and workflow warnings" expanded={showAdvancedJson} onToggle={() => setShowAdvancedJson(!showAdvancedJson)}>
                    <Field label="Advanced product data JSON" value={json} onChangeText={setJson} multiline monospace />
                </CompactDisclosureCard>
                <CompactDisclosureCard title="Duplicate Merge" summary="Only use when this is a duplicate master product" expanded={showDuplicateMerge} onToggle={() => setShowDuplicateMerge(!showDuplicateMerge)}>
                    <ChoiceWrap>{candidates.slice(0, 50).map((candidate) => <Chip key={candidate.id} label={`${candidate.brand} ${candidate.modelNumber}`} selected={mergeTargetId === candidate.id} onPress={() => setMergeTargetId(candidate.id)} />)}</ChoiceWrap>
                    <ThemedButton title="Merge Selected Duplicate" variant="danger" disabled={busy || !mergeTargetId} onPress={onMerge} />
                </CompactDisclosureCard>

                <ButtonRow>
                    <ThemedButton title={busy ? 'Saving...' : 'Save Master Product'} disabled={busy} onPress={onSave} style={{ flex: 1, minWidth: 190 }} />
                    <ThemedButton title="Cancel" variant="secondary" disabled={busy} onPress={onCancel} style={{ flex: 1 }} />
                </ButtonRow>
            </View>
        </ThemedCard>
    );
}

function CatalogQuickStartLibrary({ starterCards, busy, onUse }: {
    starterCards: HomeOSStarterDeckCard[];
    busy: boolean;
    onUse: (suggestion: CatalogQuickStartSuggestion) => void;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const groups = catalogQuickStartGroupsForDeck(starterCards);
    const [selectedGroupId, setSelectedGroupId] = useState(groups.find((group) => group.suggestions.length)?.id || groups[0]?.id || '');
    const selectedGroup = groups.find((group) => group.id === selectedGroupId) || groups[0];
    const groupOptions = groups.map((group) => ({
        value: group.id,
        label: group.label,
        description: group.suggestions.length
            ? `${group.suggestions.length} verified editable draft${group.suggestions.length === 1 ? '' : 's'}`
            : 'Research structure ready · no exact sourced draft yet',
        searchText: [...group.archetypeTerms, ...group.matchedStarterNames].join(' '),
    }));

    if (!selectedGroup) return null;

    return (
        <View style={{ gap: scaleIcon(10), borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, borderCurve: 'continuous', padding: scaleIcon(12), backgroundColor: theme.colors.surfaceAlt }}>
            <View style={{ gap: scaleIcon(3) }}>
                <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900' }}>Retailer-verified quick start</Text>
                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(20) }}>
                    Optional authoring help only. Loading a suggestion fills this editable seed form; it never approves a product, activates a company catalog, or sets a selling price.
                </Text>
            </View>
            <SearchableCombobox label="Quick-start category" value={selectedGroup.id} options={groupOptions} onChange={setSelectedGroupId} placeholder="Choose a research category" helperText="Categories are matched to the current HomeOS starter taxonomy where an archetype exists." disabled={busy} allowCustom={false} compact />
            {!!selectedGroup.matchedStarterNames.length && (
                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '800' }}>
                    HomeOS match: {selectedGroup.matchedStarterNames.join(', ')}
                </Text>
            )}
            <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(19) }}>{selectedGroup.authoringNote}</Text>
            {!!selectedGroup.suggestions.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(9), alignItems: 'stretch' }}>
                    {selectedGroup.suggestions.map((suggestion) => {
                        const ready = catalogQuickStartIsReady(suggestion);
                        return (
                            <View key={suggestion.id} style={{ flexGrow: 1, flexBasis: 260, minWidth: 0, maxWidth: 390, gap: scaleIcon(7), borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, borderCurve: 'continuous', padding: scaleIcon(11), backgroundColor: theme.colors.surface }}>
                                <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(16), lineHeight: scaleFont(21), fontWeight: '900' }}>{suggestion.productName}</Text>
                                <Text selectable style={{ color: '#0B6A65', fontSize: scaleFont(13), fontWeight: '900' }}>Retail reference tier: {suggestion.tier}</Text>
                                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(19) }}>{suggestion.fitSummary}</Text>
                                <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL(suggestion.retailerUrl)} style={{ minHeight: scaleIcon(44), justifyContent: 'center' }}>
                                    <Text selectable style={{ color: theme.colors.primary, fontSize: scaleFont(14), fontWeight: '900', textDecorationLine: 'underline' }}>{suggestion.retailerName} source · verified {suggestion.verifiedOn}</Text>
                                </TouchableOpacity>
                                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(18) }}>Required facts checked: installation, size/capacity, fuel/energy, connection, flow/pressure, compatibility, and retail source.</Text>
                                <ThemedButton title="Load Editable Seed" disabled={busy || !ready} onPress={() => onUse(suggestion)} />
                            </View>
                        );
                    })}
                </View>
            ) : (
                <View style={{ gap: scaleIcon(5), borderWidth: 1, borderColor: theme.colors.border, borderRadius: 11, padding: scaleIcon(10), backgroundColor: theme.colors.surface }}>
                    <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '900' }}>No source-verified quick starts yet</Text>
                    <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(19) }}>No placeholder product will be created. Before a product can appear here, research must capture:</Text>
                    <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(19) }}>• {selectedGroup.requiredFacts.map(catalogFieldLabel).join('  • ')}</Text>
                </View>
            )}
        </View>
    );
}

function SearchableCombobox({
    label,
    value,
    options,
    onChange,
    onAddNew,
    placeholder,
    helperText,
    disabled = false,
    allowCustom = true,
    compact = false,
}: {
    label: string;
    value: string;
    options: CatalogSuggestionOption[];
    onChange: (value: string) => void;
    onAddNew?: (value: string) => Promise<string | void> | string | void;
    placeholder?: string;
    helperText?: string;
    disabled?: boolean;
    allowCustom?: boolean;
    compact?: boolean;
}) {
    const { width } = useWindowDimensions();
    const phone = width < 720;
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState('');
    const selectedOption = options.find((option) => option.value.toLowerCase() === value.trim().toLowerCase());
    const selectedLabel = selectedOption?.label || value;
    const normalizedQuery = query.trim().toLowerCase();
    const visibleOptions = options
        .filter((option) => !normalizedQuery || [option.label, option.value, option.description, option.searchText].filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery))
        .slice(0, 60);
    const exactOption = options.find((option) => option.label.trim().toLowerCase() === normalizedQuery || option.value.trim().toLowerCase() === normalizedQuery);

    function showPicker() {
        if (disabled) return;
        setQuery('');
        setError('');
        setOpen(true);
    }

    async function choose(option: CatalogSuggestionOption) {
        if (option.addNewValue && onAddNew) {
            setAdding(true);
            setError('');
            try {
                const nextValue = await onAddNew(option.addNewValue);
                onChange(typeof nextValue === 'string' && nextValue ? nextValue : option.addNewValue);
                setOpen(false);
            } catch (nextError) {
                setError(errorMessage(nextError));
            } finally {
                setAdding(false);
            }
            return;
        }
        onChange(option.value);
        setOpen(false);
    }

    async function addNew() {
        const clean = query.trim();
        if (!clean || adding) return;
        setAdding(true);
        setError('');
        try {
            const nextValue = onAddNew ? await onAddNew(clean) : clean;
            onChange(typeof nextValue === 'string' && nextValue ? nextValue : clean);
            setOpen(false);
        } catch (nextError) {
            setError(errorMessage(nextError));
        } finally {
            setAdding(false);
        }
    }

    return (
        <View style={{ gap: scaleIcon(compact ? 5 : 7) }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>{label}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}. ${selectedLabel || placeholder || 'No selection'}`} accessibilityState={{ disabled }} disabled={disabled} onPress={showPicker} style={{ minHeight: scaleIcon(compact ? 48 : 54), borderWidth: 1, borderColor: '#8EA0B2', borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: scaleIcon(13), paddingVertical: scaleIcon(9), backgroundColor: disabled ? theme.colors.surfaceAlt : theme.colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: scaleIcon(8) }}>
                <Text numberOfLines={2} style={{ color: selectedLabel ? theme.colors.text : theme.colors.mutedText, fontSize: scaleFont(16), lineHeight: scaleFont(20), fontWeight: selectedLabel ? '800' : '600', flex: 1 }}>{selectedLabel || placeholder || 'Choose an option'}</Text>
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(17), fontWeight: '900' }}>⌄</Text>
            </TouchableOpacity>
            {!!helperText && <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(17) }}>{helperText}</Text>}
            <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(5, 20, 32, 0.56)', justifyContent: phone ? 'flex-end' : 'center', alignItems: 'center', padding: phone ? 0 : scaleIcon(18) }}>
                    <View style={{ width: '100%', maxWidth: 680, maxHeight: phone ? '90%' : '82%', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderBottomLeftRadius: phone ? 0 : 18, borderBottomRightRadius: phone ? 0 : 18, borderCurve: 'continuous', backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
                        <View style={{ padding: scaleIcon(14), gap: scaleIcon(9), borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: scaleIcon(8) }}>
                                <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(21), fontWeight: '900', flex: 1 }}>{label}</Text>
                                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close suggestions" onPress={() => setOpen(false)} style={{ minWidth: scaleIcon(44), minHeight: scaleIcon(44), alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: theme.colors.text, fontSize: scaleFont(24), fontWeight: '900' }}>×</Text></TouchableOpacity>
                            </View>
                            <TextInput accessibilityLabel={`Search ${label}`} value={query} onChangeText={setQuery} placeholder={`Search ${label.toLowerCase()} or type a new value`} autoFocus autoCapitalize="words" style={{ minHeight: scaleIcon(52), borderWidth: 1, borderColor: '#8EA0B2', borderRadius: 12, paddingHorizontal: scaleIcon(13), backgroundColor: '#FFFFFF', color: '#09223A', fontSize: scaleFont(16) }} />
                            {!!error && <Text accessibilityRole="alert" selectable style={{ color: '#8E1F2D', fontSize: scaleFont(13), fontWeight: '800' }}>{error}</Text>}
                        </View>
                        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: scaleIcon(10), gap: scaleIcon(6) }}>
                            {visibleOptions.map((option) => (
                                <TouchableOpacity key={`${option.value}-${option.label}`} accessibilityRole="button" accessibilityState={{ selected: option.value === value, disabled: adding }} disabled={adding} onPress={() => void choose(option)} style={{ minHeight: scaleIcon(54), justifyContent: 'center', borderWidth: 1, borderColor: option.value === value ? theme.colors.primary : theme.colors.border, borderRadius: 11, borderCurve: 'continuous', paddingHorizontal: scaleIcon(12), paddingVertical: scaleIcon(9), backgroundColor: option.value === value ? theme.colors.surfaceAlt : theme.colors.surface, opacity: adding ? 0.6 : 1 }}>
                                    <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>{option.label}</Text>
                                    {!!option.description && <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(18), marginTop: scaleIcon(2) }}>{option.description}</Text>}
                                </TouchableOpacity>
                            ))}
                            {!visibleOptions.length && <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), padding: scaleIcon(8) }}>No existing suggestion matches.</Text>}
                            {allowCustom && !!query.trim() && !exactOption && (
                                <TouchableOpacity accessibilityRole="button" disabled={adding} onPress={() => void addNew()} style={{ minHeight: scaleIcon(52), justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.primary, borderRadius: 11, borderCurve: 'continuous', paddingHorizontal: scaleIcon(12), paddingVertical: scaleIcon(9), backgroundColor: theme.colors.surfaceAlt }}>
                                    <Text selectable style={{ color: theme.colors.primary, fontSize: scaleFont(16), fontWeight: '900' }}>{adding ? 'Adding...' : `Add new “${query.trim()}”`}</Text>
                                    <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(17), marginTop: scaleIcon(2) }}>{onAddNew ? 'Creates this authoring category only; no product or price is published.' : 'Uses this custom value without changing existing catalog data.'}</Text>
                                </TouchableOpacity>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function CompactEditorCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, borderCurve: 'continuous', padding: scaleIcon(12), backgroundColor: theme.colors.surface, gap: scaleIcon(10) }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(19), fontWeight: '900' }}>{title}</Text>
            {!!description && <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(19) }}>{description}</Text>}
            {children}
        </View>
    );
}

function CompactDisclosureCard({ title, summary, expanded, onToggle, children }: { title: string; summary: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 13, borderCurve: 'continuous', backgroundColor: theme.colors.surface, overflow: 'hidden' }}>
            <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${title}. ${summary}`}
                onPress={onToggle}
                style={{ minHeight: 54, paddingHorizontal: scaleIcon(12), paddingVertical: scaleIcon(9), flexDirection: 'row', alignItems: 'center', gap: scaleIcon(10) }}
            >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>{title}</Text>
                    <Text selectable numberOfLines={1} ellipsizeMode="tail" style={{ color: theme.colors.mutedText, fontSize: scaleFont(13) }}>{summary}</Text>
                </View>
                <Text accessibilityElementsHidden style={{ color: theme.colors.primary, fontSize: scaleFont(22), fontWeight: '900' }}>{expanded ? '−' : '+'}</Text>
            </TouchableOpacity>
            {expanded && <View style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, padding: scaleIcon(10), gap: scaleIcon(9), backgroundColor: theme.colors.surfaceAlt }}>{children}</View>}
        </View>
    );
}

function CompactField({ label, value, onChangeText, placeholder, multiline }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <View style={{ gap: 5 }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900' }}>{label}</Text>
            <TextInput
                accessibilityLabel={label}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={theme.colors.mutedText}
                multiline={multiline}
                style={{ minHeight: multiline ? 84 : 44, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, borderCurve: 'continuous', paddingHorizontal: scaleIcon(11), paddingVertical: scaleIcon(multiline ? 9 : 7), backgroundColor: theme.colors.background, color: theme.colors.text, fontSize: scaleFont(15), lineHeight: scaleFont(20), textAlignVertical: multiline ? 'top' : 'center' }}
            />
        </View>
    );
}

function CompactFieldBox(props: Parameters<typeof CompactField>[0]) {
    return <View style={{ flex: 1, minWidth: 180 }}><CompactField {...props} /></View>;
}

function CompactButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, borderCurve: 'continuous', paddingHorizontal: scaleIcon(11), paddingVertical: scaleIcon(7), backgroundColor: theme.colors.surface, opacity: disabled ? 0.55 : 1 }}>
            <Text style={{ color: theme.colors.primary, fontSize: scaleFont(14), fontWeight: '900', textAlign: 'center' }}>{title}</Text>
        </TouchableOpacity>
    );
}

function SpecificationTile({ label, value, phone, busy, onChange, onRemove }: { label: string; value: string; phone: boolean; busy: boolean; onChange: (value: string) => void; onRemove: () => void }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <View style={{ width: phone ? '100%' : '31.5%', minWidth: phone ? 0 : 220, flexGrow: 1, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 11, borderCurve: 'continuous', padding: scaleIcon(9), gap: 6, backgroundColor: theme.colors.surfaceAlt }}>
            <View style={{ minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <Text selectable numberOfLines={2} style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900', flex: 1 }}>{label}</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remove ${label}`} disabled={busy} onPress={onRemove} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: theme.colors.danger, fontSize: scaleFont(18), fontWeight: '900' }}>×</Text>
                </TouchableOpacity>
            </View>
            <TextInput accessibilityLabel={`${label} value`} value={value} onChangeText={onChange} style={{ minHeight: 42, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 9, paddingHorizontal: scaleIcon(10), paddingVertical: scaleIcon(6), backgroundColor: theme.colors.background, color: theme.colors.text, fontSize: scaleFont(15) }} />
        </View>
    );
}

function ReferenceTile({ source, index, busy, onChange, onRemove }: { source: CatalogSourceDraft; index: number; busy: boolean; onChange: (patch: Partial<CatalogSourceDraft>) => void; onRemove: () => void }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 11, borderCurve: 'continuous', padding: scaleIcon(10), gap: scaleIcon(8), backgroundColor: theme.colors.surface }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '900' }}>{source.title || `Reference ${index + 1}`}</Text>
                    <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800' }}>{catalogFieldLabel(source.sourceType)}</Text>
                </View>
                <CompactButton title="Remove" onPress={onRemove} disabled={busy} />
            </View>
            <ChoiceWrap>{SOURCE_TYPES.map((type) => <Chip key={type.value} label={type.label} selected={source.sourceType === type.value} onPress={() => onChange({ sourceType: type.value })} />)}</ChoiceWrap>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8) }}>
                <View style={{ flex: 1, minWidth: 200 }}><CompactField label="Title" value={source.title} onChangeText={(title) => onChange({ title })} placeholder="Manufacturer product page" /></View>
                <View style={{ flex: 2, minWidth: 260 }}><CompactField label="URL" value={source.sourceUrl} onChangeText={(sourceUrl) => onChange({ sourceUrl })} placeholder="https://manufacturer.example/product" /></View>
            </View>
        </View>
    );
}

function MediaTile({ asset, productName, busy, phone, onChange }: { asset: CatalogFactoryAsset; productName: string; busy: boolean; phone: boolean; onChange: (patch: { isPrimary?: boolean; homeownerVisible?: boolean; active?: boolean }) => void }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <View style={{ borderWidth: 1, borderColor: asset.isPrimary ? theme.colors.primary : theme.colors.border, borderRadius: 11, borderCurve: 'continuous', padding: scaleIcon(9), gap: scaleIcon(8), opacity: asset.active ? 1 : 0.58, backgroundColor: theme.colors.surface }}>
            <View style={{ flexDirection: 'row', gap: scaleIcon(9), alignItems: 'center' }}>
                {asset.assetType === 'image' && asset.displayUrl
                    ? <ProductCardImage compact imageUrl={asset.displayUrl} productName={productName} style={{ width: 58, height: 58 }} />
                    : <View style={{ width: 58, height: 58, borderRadius: 9, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>FILE</Text></View>}
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text selectable numberOfLines={1} ellipsizeMode="tail" style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900' }}>{asset.fileName}</Text>
                    <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12) }}>{catalogAssetTypeLabel(asset.assetType)}{asset.isPrimary ? ' · Primary' : ''}</Text>
                    <Text selectable style={{ color: asset.homeownerVisible ? theme.colors.primary : theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800' }}>{asset.homeownerVisible ? 'Visible in HomeOS' : 'Staff-only'}</Text>
                </View>
            </View>
            <View style={{ flexDirection: phone ? 'column' : 'row', flexWrap: 'wrap', gap: scaleIcon(7) }}>
                {!!asset.displayUrl && <CompactButton title="Open" onPress={() => void Linking.openURL(asset.displayUrl)} disabled={busy} />}
                {asset.assetType === 'image' && !asset.isPrimary && <CompactButton title="Make Primary" onPress={() => onChange({ isPrimary: true })} disabled={busy || !asset.active} />}
                <CompactButton title={asset.homeownerVisible ? 'Make Staff-Only' : 'Show in HomeOS'} onPress={() => onChange({ homeownerVisible: !asset.homeownerVisible })} disabled={busy || !asset.active} />
                <CompactButton title={asset.active ? 'Hide' : 'Restore'} onPress={() => onChange({ active: !asset.active })} disabled={busy} />
            </View>
        </View>
    );
}

function compactSummary(value: string) {
    const cleaned = value.trim().replace(/\s+/g, ' ');
    return cleaned.length > 72 ? `${cleaned.slice(0, 69)}...` : cleaned;
}

function lineSummary(...values: string[]) {
    const count = values.flatMap((value) => value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean)).length;
    return count ? `${count} item${count === 1 ? '' : 's'}` : 'None added';
}

const SOURCE_TYPES = [
    { value: 'manufacturer_page', label: 'Manufacturer page' },
    { value: 'installation_manual', label: 'Installation manual' },
    { value: 'specification_sheet', label: 'Specification sheet' },
    { value: 'warranty_document', label: 'Warranty' },
    { value: 'retailer_page', label: 'Retailer page' },
    { value: 'other', label: 'Other' },
];

function specificationEditorValue(value: unknown) {
    if (value == null) return '';
    if (Array.isArray(value)) return value.map(String).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function catalogAssetTypeLabel(type: CatalogFactoryAssetType) {
    return ({
        image: 'Product photo',
        installation_manual: 'Installation manual',
        specification_sheet: 'Specification sheet',
        warranty_document: 'Warranty document',
        other: 'Product reference',
    } as const)[type];
}

function StatusChoices({ value, onChange }: { value: CatalogStatus; onChange: (status: CatalogStatus) => void }) { return <ChoiceWrap>{CATALOG_STATUSES.map((status) => <Chip key={status} label={status.replace('_', ' ')} selected={value === status} onPress={() => onChange(status)} />)}</ChoiceWrap>; }
function Field({ label, value, onChangeText, placeholder, multiline, monospace, keyboardType }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean; monospace?: boolean; keyboardType?: 'default' | 'decimal-pad' }) { return <View style={{ gap: 7 }}><Text style={{ fontSize: 16, fontWeight: '900' }}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} placeholder={placeholder} multiline={multiline} keyboardType={keyboardType} autoCapitalize="sentences" style={{ minHeight: multiline ? 126 : 54, borderWidth: 1, borderColor: '#8EA0B2', borderRadius: 12, padding: 13, backgroundColor: '#FFFFFF', fontSize: 16, lineHeight: 22, fontFamily: monospace ? 'monospace' : undefined, textAlignVertical: multiline ? 'top' : 'center' }} /></View>; }
function FieldBox(props: Parameters<typeof Field>[0]) { return <View style={{ flex: 1, minWidth: 180 }}><Field {...props} /></View>; }
function Title({ children }: { children: React.ReactNode }) { return <Text selectable style={{ fontSize: 22, fontWeight: '900' }}>{children}</Text>; }
function ButtonRow({ children }: { children: React.ReactNode }) { return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>; }
function ChoiceWrap({ children }: { children: React.ReactNode }) { return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>; }
function Action({ title, onPress }: { title: string; onPress: () => void }) { return <TouchableOpacity onPress={onPress} style={{ backgroundColor: '#073D57', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 }}><Text style={{ color: '#FFFFFF', fontWeight: '900' }}>{title}</Text></TouchableOpacity>; }
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: selected ? '#087D78' : '#AAB7C5', backgroundColor: selected ? '#D9F5F1' : '#FFFFFF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: '#09223A', fontWeight: '800' }}>{label}</Text></TouchableOpacity>; }
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Switch value={value} onValueChange={onChange} /><Text style={{ fontWeight: '800' }}>{label}</Text></View>; }
function Notice({ message }: { message: string }) { return <View style={{ backgroundColor: '#E8F2FA', borderRadius: 12, padding: 12 }}><Text selectable style={{ color: '#173D59', fontWeight: '700' }}>{message}</Text></View>; }
function Denied() { return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 16 }}><Text style={{ fontSize: 30, fontWeight: '900' }}>Catalog Factory unavailable</Text><Text>This module is restricted to platform administrators.</Text><ThemedButton title="Back to Home" onPress={() => router.replace('/' as never)} /></ScrollView>; }

function fieldList(value: string) { return csvList(value).map((key) => ({ key, label: key.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) })); }
function csvList(value: string) { return value.split(',').map((item) => item.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean); }
function uniqueCatalogTemplateKey(categoryName: string, templates: CatalogTemplateDefinition[]) { const base = categoryName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'catalog_category'; const keys = new Set(templates.map((template) => template.templateKey.toLowerCase())); if (!keys.has(base)) return base; let suffix = 2; while (keys.has(`${base}_${suffix}`)) suffix += 1; return `${base}_${suffix}`; }
function parseObject(value: string, label: string) { const parsed = JSON.parse(value) as unknown; if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object.`); return parsed as Record<string, unknown>; }
function parseArray(value: string, label: string) { const parsed = JSON.parse(value) as unknown; if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`); return parsed; }
function parseRecordValue(value: unknown, label: string) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`); return value as Record<string, unknown>; }
function parseAdvancedSources(value: unknown): CatalogSourceDraft[] { if (!Array.isArray(value)) throw new Error('Advanced sources must be a JSON array.'); return value.map((entry) => { const source = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : {}; return { id: typeof source.id === 'string' ? source.id : undefined, sourceType: typeof source.type === 'string' ? source.type : 'other', sourceUrl: typeof source.url === 'string' ? source.url : '', title: typeof source.title === 'string' ? source.title : '' }; }); }
function nullableNumber(value: unknown) { if (value == null || value === '') return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function textArray(value: unknown) { return Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : []; }
function errorMessage(error: unknown) { if (error instanceof Error && error.message) return error.message; if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || 'Catalog Factory action failed.'); return 'Catalog Factory action failed.'; }
