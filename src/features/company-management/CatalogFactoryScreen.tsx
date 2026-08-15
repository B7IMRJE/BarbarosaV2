import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    Linking,
    ScrollView,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
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
    CATALOG_SOURCE_PREVIEW_COUNT,
    CATALOG_SPECIFICATION_PREVIEW_COUNT,
    catalogFieldLabel,
    catalogPreviewItems,
    catalogSourceDisplayName,
    catalogSpecificationDisplays,
} from '../../lib/catalogFactoryPresentation';
import { researchCatalogProduct } from '../../lib/catalogProductResearch';
import {
    mapCatalogResearchSpecifications,
    type CatalogProductResearch,
    type CatalogResearchSourceType,
} from '../../lib/catalogProductResearchCore';
import { loadCurrentUserPlatformAdmin } from '../../lib/roles';
import { useTheme } from '../../theme/useTheme';

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
    const [editDraft, setEditDraft] = useState<CatalogFactoryEditorDraft | null>(null);
    const [editJson, setEditJson] = useState('{}');
    const [showAdvancedJson, setShowAdvancedJson] = useState(false);
    const [advancedJsonDirty, setAdvancedJsonDirty] = useState(false);
    const [mergeTargetId, setMergeTargetId] = useState('');
    const [seedResearch, setSeedResearch] = useState<CatalogProductResearch | null>(null);
    const [researchingSeed, setResearchingSeed] = useState(false);
    const [seedSaveError, setSeedSaveError] = useState('');

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
            const result = await loadCatalogFactory(nextFilters);
            setTemplates(result.templates);
            setRecords(result.records);
            setImports(result.imports);
            setSelected((current) => current.filter((id) => result.records.some((record) => record.id === id)));
            setMessage(`${result.records.length} master variant${result.records.length === 1 ? '' : 's'} in this view.`);
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
            quality: 0.9,
        });
        if (result.canceled || !result.assets[0]) return;
        setBusy(true);
        setMessage('Uploading the master product photo...');
        try {
            const asset = await uploadCatalogFactoryPhoto({ variantId: editing.id, asset: result.assets[0] });
            replaceEditingAsset(asset);
            setMessage('Product photo uploaded and selected as the primary card image.');
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
    }

    const displayedRecords = useMemo(() => {
        if (mode === 'prices' || mode === 'history') return records.filter((record) => record.retailListings.length > 0);
        if (mode === 'review') return records.filter((record) => record.status !== 'approved' && record.status !== 'archived');
        return records;
    }, [mode, records]);

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
                {mode === 'seed' && <SeedEditor draft={seedDraft} setDraft={(next) => { setSeedDraft(next); setSeedSaveError(''); }} templates={templates} busy={busy} researching={researchingSeed} research={seedResearch} saveError={seedSaveError} onResearch={() => void researchSeedProduct()} onUseResearch={useResearchInSeed} onClearResearch={() => setSeedResearch(null)} onSave={() => void createSeedRecord()} onCancel={() => { setSeedResearch(null); setSeedSaveError(''); setMode('overview'); }} />}
                {mode === 'import' && <ImportPanel busy={busy} preview={importPreview} summary={importSummary} fileName={importFileName} onPick={() => void pickImportFile()} onImport={() => void commitImport()} />}

                {(mode === 'overview' || mode === 'review' || mode === 'prices' || mode === 'history') && (
                    <>
                        <Filters filters={filters} setFilters={setFilters} templates={templates} busy={busy} onApply={() => void refresh(filters)} />
                        {mode === 'review' && <Text selectable style={{ color: mutedColor }}>Select warning-free drafts for bulk approval. Records with unresolved warnings can only be reviewed individually.</Text>}
                        <View style={{ gap: 14 }}>
                            {displayedRecords.map((record) => (
                                <FactoryRecordCard
                                    key={record.id}
                                    record={record}
                                    selected={selected.includes(record.id)}
                                    showPrices={mode === 'prices' || mode === 'history'}
                                    history={mode === 'history'}
                                    busy={busy}
                                    onToggle={() => setSelected((current) => current.includes(record.id) ? current.filter((id) => id !== record.id) : [...current, record.id])}
                                    onEdit={() => beginEdit(record)}
                                    onApprove={() => void act(record, 'approve')}
                                    onReject={() => void act(record, 'reject')}
                                    onNeedsReview={() => void act(record, 'needs_review')}
                                />
                            ))}
                            {!displayedRecords.length && <Text selectable style={{ color: mutedColor }}>No catalog records match this view.</Text>}
                        </View>
                    </>
                )}

                {editing && editDraft && <EditPanel record={editing} draft={editDraft} setDraft={setEditDraft} templates={templates} json={editJson} setJson={(value) => { setEditJson(value); setAdvancedJsonDirty(true); }} showAdvancedJson={showAdvancedJson} setShowAdvancedJson={(visible) => { if (visible && !showAdvancedJson && !advancedJsonDirty) setEditJson(JSON.stringify({ specifications: catalogFactoryEditorSpecifications(editDraft), sources: editDraft.sources.map((source) => ({ type: source.sourceType, url: source.sourceUrl, title: source.title || null })), confidence: editing.confidence, validation_warnings: editing.validationWarnings, duplicate_warnings: editing.duplicateWarnings, missing_fields: editing.missingFields }, null, 2)); setShowAdvancedJson(visible); }} mergeTargetId={mergeTargetId} setMergeTargetId={setMergeTargetId} candidates={records.filter((record) => record.id !== editing.id)} busy={busy} onSave={() => void saveEdit()} onMerge={() => void mergeRecord()} onUploadPhoto={() => void pickMasterPhoto()} onUploadDocument={(type) => void pickMasterDocument(type)} onChangeMedia={(asset, patch) => void changeMasterMedia(asset, patch)} onCancel={() => { setEditing(null); setEditDraft(null); }} />}

                {!!imports.length && mode === 'overview' && (
                    <ThemedCard><Text selectable style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(20) }}>Recent import batches</Text>{imports.slice(0, 8).map((item) => <Text selectable key={String(item.id)} style={{ color: mutedColor, marginTop: 8 }}>{String(item.file_name || 'Structured import')} · {String(item.created_count || 0)} created · {String(item.duplicate_count || 0)} duplicate · {String(item.failed_count || 0)} failed</Text>)}</ThemedCard>
                )}
            </ScrollView>
        </View>
    );
}

function TemplateEditor({ draft, setDraft, busy, onSave, onCancel }: { draft: typeof emptyTemplate; setDraft: (draft: typeof emptyTemplate) => void; busy: boolean; onSave: () => void; onCancel: () => void }) {
    return <ThemedCard><Title>New Category Template</Title><Field label="Template key *" value={draft.templateKey} onChangeText={(templateKey) => setDraft({ ...draft, templateKey })} placeholder="tankless_water_heater" /><Field label="Category name *" value={draft.categoryName} onChangeText={(categoryName) => setDraft({ ...draft, categoryName })} placeholder="Tankless Water Heater" /><Field label="Description" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} multiline /><Field label="Universal fields (comma separated)" value={draft.universalFields} onChangeText={(universalFields) => setDraft({ ...draft, universalFields })} /><Field label="Category specification fields (comma separated)" value={draft.specificationFields} onChangeText={(specificationFields) => setDraft({ ...draft, specificationFields })} placeholder="fuel_type, max_gpm, input_btu" /><Field label="Required category fields (comma separated)" value={draft.requiredFields} onChangeText={(requiredFields) => setDraft({ ...draft, requiredFields })} placeholder="fuel_type, max_gpm" /><StatusChoices value={draft.status} onChange={(status) => setDraft({ ...draft, status })} /><ButtonRow><ThemedButton title={busy ? 'Saving...' : 'Save Template'} disabled={busy} onPress={onSave} style={{ flex: 1 }} /><ThemedButton title="Cancel" variant="secondary" disabled={busy} onPress={onCancel} style={{ flex: 1 }} /></ButtonRow></ThemedCard>;
}

function SeedEditor({
    draft,
    setDraft,
    templates,
    busy,
    researching,
    research,
    saveError,
    onResearch,
    onUseResearch,
    onClearResearch,
    onSave,
    onCancel,
}: {
    draft: typeof emptySeed;
    setDraft: (draft: typeof emptySeed) => void;
    templates: CatalogTemplateDefinition[];
    busy: boolean;
    researching: boolean;
    research: CatalogProductResearch | null;
    saveError: string;
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
            <ChoiceWrap>
                {templates.filter((template) => template.status === 'approved').map((template) => (
                    <Chip key={template.id} label={template.categoryName} selected={draft.category === template.templateKey} onPress={() => setDraft({ ...draft, category: template.templateKey })} />
                ))}
            </ChoiceWrap>
            <Field label="Category *" value={draft.category} onChangeText={(category) => setDraft({ ...draft, category })} />
            <Field label="Manufacturer *" value={draft.manufacturer} onChangeText={(manufacturer) => setDraft({ ...draft, manufacturer })} />
            <Field label="Brand *" value={draft.brand} onChangeText={(brand) => setDraft({ ...draft, brand })} />
            <Field label="Family name *" value={draft.family_name} onChangeText={(family_name) => setDraft({ ...draft, family_name })} />
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

function FactoryRecordCard({ record, selected, showPrices, history, busy, onToggle, onEdit, onApprove, onReject, onNeedsReview }: { record: CatalogFactoryRecord; selected: boolean; showPrices: boolean; history: boolean; busy: boolean; onToggle: () => void; onEdit: () => void; onApprove: () => void; onReject: () => void; onNeedsReview: () => void }) {
    const [specificationsExpanded, setSpecificationsExpanded] = useState(false);
    const [sourcesExpanded, setSourcesExpanded] = useState(false);
    const warnings = [...record.validationWarnings, ...record.duplicateWarnings, ...record.missingFields];
    const latestPrices = record.retailListings.flatMap((listing) => listing.observations.slice(0, history ? 100 : 1).map((observation) => ({ listing, observation })));
    const specificationDisplays = catalogSpecificationDisplays(record.specifications);
    const visibleSpecifications = catalogPreviewItems(specificationDisplays, specificationsExpanded, CATALOG_SPECIFICATION_PREVIEW_COUNT);
    const visibleSources = catalogPreviewItems(record.sources, sourcesExpanded, CATALOG_SOURCE_PREVIEW_COUNT);

    return (
        <ThemedCard>
            <View style={{ gap: 14 }}>
                <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                    {record.primaryImageUrl ? (
                        <Image source={record.primaryImageUrl} contentFit="contain" style={{ width: 110, height: 110, borderRadius: 12, backgroundColor: '#FFFFFF' }} />
                    ) : (
                        <View style={{ width: 90, height: 90, borderRadius: 12, backgroundColor: '#E7EDF3', alignItems: 'center', justifyContent: 'center' }}>
                            <Text>No image</Text>
                        </View>
                    )}
                    <View style={{ flex: 1, gap: 5 }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                            <TouchableOpacity
                                accessibilityRole="checkbox"
                                accessibilityLabel={`Select ${record.brand} ${record.modelNumber}`}
                                accessibilityState={{ checked: selected }}
                                onPress={onToggle}
                                style={{ borderWidth: 2, borderColor: selected ? '#087D78' : '#9BA8B5', backgroundColor: selected ? '#D9F5F1' : '#FFFFFF', borderRadius: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}
                            >
                                <Text style={{ fontWeight: '900' }}>{selected ? '✓' : ''}</Text>
                            </TouchableOpacity>
                            <Text selectable style={{ fontSize: 20, fontWeight: '900', flexShrink: 1 }}>{record.brand} {record.familyName} {record.modelNumber}</Text>
                            <Badge label={record.status.replace('_', ' ')} tone={record.status === 'approved' ? 'green' : record.status === 'rejected' ? 'red' : 'amber'} />
                        </View>
                        <Text selectable style={{ color: '#58697A' }}>{record.category} · {record.manufacturer}</Text>
                        <Text selectable style={{ color: '#58697A' }}>MPN {record.manufacturerPartNumber || 'missing'} · UPC/GTIN {record.upcGtin || 'missing'}</Text>
                        <Text selectable style={{ color: '#58697A' }}>Confidence {record.confidence == null ? 'not supplied' : `${Math.round(record.confidence * 100)}%`} · Verified {record.lastVerifiedAt ? new Date(record.lastVerifiedAt).toLocaleString() : 'not verified'}</Text>
                    </View>
                </View>

                {!!record.description && <Text selectable style={{ lineHeight: 21 }}>{record.description}</Text>}

                <View style={{ gap: 9 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <Text selectable style={{ fontWeight: '900', fontSize: 17 }}>Specifications</Text>
                        <Text selectable style={{ color: '#58697A' }}>{specificationDisplays.length} detail{specificationDisplays.length === 1 ? '' : 's'}</Text>
                    </View>
                    {visibleSpecifications.length > 0 ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {visibleSpecifications.map((specification) => (
                                <View key={specification.key} style={{ flexGrow: 1, flexBasis: 300, minWidth: 220, gap: 3, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#D8E0E8', backgroundColor: '#F6F8FA' }}>
                                    <Text selectable style={{ color: '#58697A', fontSize: 12, fontWeight: '900', letterSpacing: 0.3 }}>{specification.label}</Text>
                                    <Text selectable style={{ color: '#12283D', lineHeight: 20 }}>{specification.value}</Text>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <Text selectable style={{ color: '#58697A' }}>No specifications supplied.</Text>
                    )}
                    {specificationDisplays.length > CATALOG_SPECIFICATION_PREVIEW_COUNT && (
                        <DisclosureButton
                            expanded={specificationsExpanded}
                            label={specificationsExpanded ? 'Show fewer specifications' : `Show all ${specificationDisplays.length} specifications`}
                            onPress={() => setSpecificationsExpanded((current) => !current)}
                        />
                    )}
                </View>

                {warnings.length > 0 && (
                    <View accessibilityRole="alert" style={{ backgroundColor: '#FFF4DD', padding: 11, borderRadius: 10, gap: 3 }}>
                        <Text selectable style={{ fontWeight: '900', color: '#704B00' }}>Unresolved warnings</Text>
                        {warnings.map((warning, index) => <Text selectable key={`${warning}-${index}`} style={{ color: '#704B00' }}>• {warning}</Text>)}
                    </View>
                )}

                <View style={{ gap: 8 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', justifyContent: 'space-between' }}>
                        <Text selectable style={{ fontWeight: '900', fontSize: 17 }}>Sources</Text>
                        <Text selectable style={{ color: '#58697A' }}>{record.sources.length} link{record.sources.length === 1 ? '' : 's'}</Text>
                    </View>
                    {visibleSources.map((source) => (
                        <View key={source.id} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#D8E0E8', paddingTop: 8 }}>
                            <View style={{ backgroundColor: '#E8F2FA', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
                                <Text selectable style={{ color: '#315466', fontSize: 12, fontWeight: '900' }}>{catalogFieldLabel(source.sourceType)}</Text>
                            </View>
                            <TouchableOpacity
                                accessibilityRole="link"
                                accessibilityLabel={`Open ${catalogSourceDisplayName(source.title, source.sourceUrl)}`}
                                onPress={() => void Linking.openURL(source.sourceUrl)}
                                style={{ flex: 1, minWidth: 180 }}
                            >
                                <Text selectable numberOfLines={sourcesExpanded ? undefined : 2} style={{ color: '#087D78', textDecorationLine: 'underline', fontWeight: '700' }}>
                                    {catalogSourceDisplayName(source.title, source.sourceUrl)}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                    {!record.sources.length && <Text selectable style={{ color: '#58697A' }}>No source links supplied.</Text>}
                    {record.sources.length > CATALOG_SOURCE_PREVIEW_COUNT && (
                        <DisclosureButton
                            expanded={sourcesExpanded}
                            label={sourcesExpanded ? 'Show fewer sources' : `Show all ${record.sources.length} sources`}
                            onPress={() => setSourcesExpanded((current) => !current)}
                        />
                    )}
                </View>

                {showPrices && (
                    <View style={{ gap: 7 }}>
                        <Text selectable style={{ fontWeight: '900' }}>{history ? 'Historical retail observations' : 'Retail price comparison'}</Text>
                        {latestPrices.map(({ listing, observation }) => (
                            <View key={observation.id} style={{ borderTopWidth: 1, borderTopColor: '#D8E0E8', paddingTop: 7 }}>
                                <Text selectable style={{ fontWeight: '800' }}>{listing.retailer} {listing.retailerSku ? `· ${listing.retailerSku}` : ''}</Text>
                                <Text selectable>Regular {money(observation.regularPrice)} · Sale {money(observation.salePrice)} · {observation.availability || 'availability unknown'}</Text>
                                <Text selectable style={{ color: '#58697A' }}>{new Date(observation.observedAt).toLocaleString()} · {observation.zipCode || observation.market || 'market not supplied'}</Text>
                                {!!listing.productUrl && (
                                    <TouchableOpacity accessibilityRole="link" onPress={() => void Linking.openURL(listing.productUrl)}>
                                        <Text selectable style={{ color: '#087D78', textDecorationLine: 'underline' }}>Open retailer page</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
                        {!latestPrices.length && <Text selectable style={{ color: '#58697A' }}>No retail observations yet.</Text>}
                    </View>
                )}

                <ButtonRow>
                    <ThemedButton title="Edit" variant="secondary" disabled={busy} onPress={onEdit} style={{ flex: 1 }} />
                    {record.status !== 'approved' && <ThemedButton title="Approve" disabled={busy || warnings.length > 0} onPress={onApprove} style={{ flex: 1 }} />}
                    {record.status !== 'rejected' && <ThemedButton title="Reject" variant="danger" disabled={busy} onPress={onReject} style={{ flex: 1 }} />}
                    {record.status === 'draft' && <ThemedButton title="Needs Review" variant="secondary" disabled={busy} onPress={onNeedsReview} style={{ flex: 1 }} />}
                </ButtonRow>
            </View>
        </ThemedCard>
    );
}

function DisclosureButton({ expanded, label, onPress }: { expanded: boolean; label: string; onPress: () => void }) {
    return (
        <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            onPress={onPress}
            style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: '#8EA0B2', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#FFFFFF' }}
        >
            <Text style={{ color: '#173D59', fontWeight: '900' }}>{label}</Text>
        </TouchableOpacity>
    );
}

function EditPanel({
    record,
    draft,
    setDraft,
    templates,
    json,
    setJson,
    showAdvancedJson,
    setShowAdvancedJson,
    mergeTargetId,
    setMergeTargetId,
    candidates,
    busy,
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
    json: string;
    setJson: (value: string) => void;
    showAdvancedJson: boolean;
    setShowAdvancedJson: (value: boolean) => void;
    mergeTargetId: string;
    setMergeTargetId: (value: string) => void;
    candidates: CatalogFactoryRecord[];
    busy: boolean;
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
    const productName = draft.productTitle || [draft.brand, draft.familyName, draft.modelNumber].filter(Boolean).join(' ');
    const specificationEntries = Object.entries(draft.specifications);

    function updateSpecification(key: string, value: string) {
        setDraft({ ...draft, specifications: { ...draft.specifications, [key]: value } });
    }

    function addSpecification() {
        const key = newSpecificationKey.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        if (!key) return;
        setDraft({ ...draft, specifications: { ...draft.specifications, [key]: newSpecificationValue.trim() } });
        setNewSpecificationKey('');
        setNewSpecificationValue('');
    }

    return (
        <ThemedCard style={{ padding: phone ? scaleIcon(14) : scaleIcon(20) }}>
            <View style={{ gap: scaleIcon(18) }}>
                <View style={{ gap: scaleIcon(6) }}>
                    <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(phone ? 25 : 30), fontWeight: '900' }}>Edit Master Product</Text>
                    <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(16), lineHeight: scaleFont(23) }}>
                        Clear visual fields cover the product card and its reference details. Changes here do not add service history, job photos, or pricing.
                    </Text>
                </View>

                <EditorSection title="Product identity" description="This information identifies the exact manufacturer product shown across entitled catalogs and HomeOS references.">
                    <Field label="Product title / name *" value={draft.productTitle} onChangeText={(productTitle) => setDraft({ ...draft, productTitle })} placeholder="Example: Acme Flow 100 Kitchen Faucet" />
                    <View style={{ gap: 7 }}>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>Category / product type *</Text>
                        <ChoiceWrap>
                            {templates.filter((template) => template.status === 'approved' || template.id === draft.templateId).map((template) => (
                                <Chip key={template.id} label={template.categoryName} selected={draft.templateId === template.id} onPress={() => setDraft({ ...draft, templateId: template.id, productType: draft.productType || template.categoryName })} />
                            ))}
                        </ChoiceWrap>
                    </View>
                    <Field label="Product type" value={draft.productType} onChangeText={(productType) => setDraft({ ...draft, productType })} placeholder="Example: Kitchen faucet" />
                    <View style={{ flexDirection: phone ? 'column' : 'row', gap: scaleIcon(12) }}>
                        <FieldBox label="Manufacturer *" value={draft.manufacturer} onChangeText={(manufacturer) => setDraft({ ...draft, manufacturer })} />
                        <FieldBox label="Brand *" value={draft.brand} onChangeText={(brand) => setDraft({ ...draft, brand })} />
                    </View>
                    <View style={{ flexDirection: phone ? 'column' : 'row', gap: scaleIcon(12) }}>
                        <FieldBox label="Product family *" value={draft.familyName} onChangeText={(familyName) => setDraft({ ...draft, familyName })} />
                        <FieldBox label="Exact model number *" value={draft.modelNumber} onChangeText={(modelNumber) => setDraft({ ...draft, modelNumber })} />
                    </View>
                    <View style={{ flexDirection: phone ? 'column' : 'row', gap: scaleIcon(12) }}>
                        <FieldBox label="Manufacturer part number / MPN" value={draft.manufacturerPartNumber} onChangeText={(manufacturerPartNumber) => setDraft({ ...draft, manufacturerPartNumber })} />
                        <FieldBox label="UPC / GTIN" value={draft.upcGtin} onChangeText={(upcGtin) => setDraft({ ...draft, upcGtin })} />
                    </View>
                    <Field label="Product description" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} multiline />
                </EditorSection>

                <EditorSection title="Appearance & sizing" description="Use the exact manufacturer values where they apply.">
                    <View style={{ flexDirection: phone ? 'column' : 'row', flexWrap: 'wrap', gap: scaleIcon(12) }}>
                        <FieldBox label="Finish" value={draft.finish} onChangeText={(finish) => setDraft({ ...draft, finish })} />
                        <FieldBox label="Color" value={draft.color} onChangeText={(color) => setDraft({ ...draft, color })} />
                        <FieldBox label="Size" value={draft.size} onChangeText={(size) => setDraft({ ...draft, size })} />
                        <FieldBox label="Capacity" value={draft.capacity} onChangeText={(capacity) => setDraft({ ...draft, capacity })} />
                    </View>
                </EditorSection>

                <EditorSection title="Compatibility, applications & warranty" description="Enter one part, application, or compatibility note per line so the reference remains easy to scan.">
                    <Field label="Compatibility" value={draft.compatibility} onChangeText={(compatibility) => setDraft({ ...draft, compatibility })} multiline placeholder="One compatibility note per line" />
                    <Field label="Compatible parts / accessories" value={draft.compatibleParts} onChangeText={(compatibleParts) => setDraft({ ...draft, compatibleParts })} multiline placeholder="One part or accessory per line" />
                    <Field label="Applications / suitable uses" value={draft.applications} onChangeText={(applications) => setDraft({ ...draft, applications })} multiline placeholder="One application per line" />
                    <Field label="Manufacturer warranty" value={draft.warranty} onChangeText={(warranty) => setDraft({ ...draft, warranty })} multiline />
                </EditorSection>

                <EditorSection title="Specifications" description="Every stored specification stays editable. Add uncommon manufacturer metadata with a plainly labeled field below.">
                    {specificationEntries.map(([key, value]) => (
                        <View key={key} style={{ gap: 7 }}>
                            <Field label={catalogFieldLabel(key)} value={specificationEditorValue(value)} onChangeText={(next) => updateSpecification(key, next)} />
                            <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => { const next = { ...draft.specifications }; delete next[key]; setDraft({ ...draft, specifications: next }); }} style={{ alignSelf: 'flex-start', paddingVertical: 5 }}>
                                <Text style={{ color: theme.colors.danger, fontWeight: '900' }}>Remove {catalogFieldLabel(key)}</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                    {!specificationEntries.length && <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(15) }}>No additional specifications yet.</Text>}
                    <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: scaleIcon(12), gap: scaleIcon(10), backgroundColor: theme.colors.surfaceAlt }}>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(17), fontWeight: '900' }}>Add a specification</Text>
                        <Field label="Specification label" value={newSpecificationKey} onChangeText={setNewSpecificationKey} placeholder="Example: Max flow rate" />
                        <Field label="Specification value" value={newSpecificationValue} onChangeText={setNewSpecificationValue} placeholder="Example: 1.5 GPM" />
                        <ThemedButton title="Add Specification" variant="secondary" disabled={busy || !newSpecificationKey.trim()} onPress={addSpecification} />
                    </View>
                </EditorSection>

                <EditorSection title="Manufacturer links & manuals" description="Add verified web references. Uploaded manuals and documents are managed separately in Product media below.">
                    {draft.sources.map((source, index) => (
                        <View key={source.id || `source-${index}`} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: scaleIcon(12), gap: scaleIcon(10) }}>
                            <Text style={{ color: theme.colors.text, fontSize: scaleFont(17), fontWeight: '900' }}>Reference {index + 1}</Text>
                            <ChoiceWrap>
                                {SOURCE_TYPES.map((type) => <Chip key={type.value} label={type.label} selected={source.sourceType === type.value} onPress={() => setDraft({ ...draft, sources: draft.sources.map((item, itemIndex) => itemIndex === index ? { ...item, sourceType: type.value } : item) })} />)}
                            </ChoiceWrap>
                            <Field label="Link title" value={source.title} onChangeText={(title) => setDraft({ ...draft, sources: draft.sources.map((item, itemIndex) => itemIndex === index ? { ...item, title } : item) })} placeholder="Example: Manufacturer product page" />
                            <Field label="Source URL" value={source.sourceUrl} onChangeText={(sourceUrl) => setDraft({ ...draft, sources: draft.sources.map((item, itemIndex) => itemIndex === index ? { ...item, sourceUrl } : item) })} placeholder="https://manufacturer.example/product" />
                            <ThemedButton title="Remove Reference" variant="secondary" disabled={busy} onPress={() => setDraft({ ...draft, sources: draft.sources.filter((_, itemIndex) => itemIndex !== index) })} />
                        </View>
                    ))}
                    <ThemedButton title="Add Manufacturer or Manual Link" variant="secondary" disabled={busy} onPress={() => setDraft({ ...draft, sources: [...draft.sources, { sourceType: 'manufacturer_page', sourceUrl: '', title: '' }] })} />
                </EditorSection>

                <EditorSection title="Product media" description="Master reference media is separate from HomeOS service history and job photos. The primary image appears on compact master cards after save.">
                    <View style={{ flexDirection: phone ? 'column' : 'row', flexWrap: 'wrap', gap: scaleIcon(9) }}>
                        <ThemedButton title="Upload Product Photo" disabled={busy} onPress={onUploadPhoto} style={{ flexGrow: 1 }} />
                        <ThemedButton title="Upload Manual" variant="secondary" disabled={busy} onPress={() => onUploadDocument('installation_manual')} style={{ flexGrow: 1 }} />
                        <ThemedButton title="Upload Spec Sheet" variant="secondary" disabled={busy} onPress={() => onUploadDocument('specification_sheet')} style={{ flexGrow: 1 }} />
                        <ThemedButton title="Upload Warranty" variant="secondary" disabled={busy} onPress={() => onUploadDocument('warranty_document')} style={{ flexGrow: 1 }} />
                    </View>
                    {!!record.primaryImageUrl && <ProductCardImage imageUrl={record.primaryImageUrl} productName={productName} style={{ width: '100%', maxWidth: 420, height: 210, alignSelf: 'center' }} />}
                    {record.assets.map((asset) => (
                        <View key={asset.id} style={{ borderWidth: 1, borderColor: asset.isPrimary ? theme.colors.primary : theme.colors.border, borderRadius: 12, padding: scaleIcon(12), gap: scaleIcon(9), opacity: asset.active ? 1 : 0.58 }}>
                            <View style={{ flexDirection: 'row', gap: scaleIcon(11), alignItems: 'center' }}>
                                {asset.assetType === 'image' && asset.displayUrl
                                    ? <ProductCardImage compact imageUrl={asset.displayUrl} productName={productName} style={{ width: 72, height: 72 }} />
                                    : <View style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>FILE</Text></View>}
                                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                                    <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>{asset.fileName}</Text>
                                    <Text selectable style={{ color: theme.colors.mutedText }}>{catalogAssetTypeLabel(asset.assetType)}{asset.isPrimary ? ' · Primary card image' : ''}</Text>
                                    <Text selectable style={{ color: asset.homeownerVisible ? theme.colors.primary : theme.colors.mutedText, fontWeight: '800' }}>{asset.homeownerVisible ? 'Visible in linked HomeOS product details' : 'Company staff only'}</Text>
                                </View>
                            </View>
                            <View style={{ flexDirection: phone ? 'column' : 'row', flexWrap: 'wrap', gap: scaleIcon(8) }}>
                                {!!asset.displayUrl && <ThemedButton title="Open" variant="secondary" disabled={busy} onPress={() => void Linking.openURL(asset.displayUrl)} style={{ flexGrow: 1 }} />}
                                {asset.assetType === 'image' && !asset.isPrimary && <ThemedButton title="Use as Primary Image" variant="secondary" disabled={busy || !asset.active} onPress={() => onChangeMedia(asset, { isPrimary: true })} style={{ flexGrow: 1 }} />}
                                <ThemedButton title={asset.homeownerVisible ? 'Make Staff-Only' : 'Show in HomeOS'} variant="secondary" disabled={busy || !asset.active} onPress={() => onChangeMedia(asset, { homeownerVisible: !asset.homeownerVisible })} style={{ flexGrow: 1 }} />
                                <ThemedButton title={asset.active ? 'Hide Reference' : 'Restore Reference'} variant="secondary" disabled={busy} onPress={() => onChangeMedia(asset, { active: !asset.active })} style={{ flexGrow: 1 }} />
                            </View>
                        </View>
                    ))}
                    {!record.assets.length && <Text selectable style={{ color: theme.colors.mutedText }}>No master product media yet. Upload a product photo to give the compact card an image.</Text>}
                </EditorSection>

                <EditorSection title="Advanced JSON" description="Uncommon structured metadata and workflow warnings remain available here without blocking the visual editor.">
                    <DisclosureButton expanded={showAdvancedJson} label={showAdvancedJson ? 'Hide Advanced JSON' : 'Show Advanced JSON'} onPress={() => setShowAdvancedJson(!showAdvancedJson)} />
                    {showAdvancedJson && <Field label="Advanced product data JSON" value={json} onChangeText={setJson} multiline monospace />}
                </EditorSection>

                <EditorSection title="Duplicate merge" description="Use only when this record duplicates another master product. Saving normal edits does not merge records.">
                    <ChoiceWrap>{candidates.slice(0, 50).map((candidate) => <Chip key={candidate.id} label={`${candidate.brand} ${candidate.modelNumber}`} selected={mergeTargetId === candidate.id} onPress={() => setMergeTargetId(candidate.id)} />)}</ChoiceWrap>
                    <ThemedButton title="Merge Selected Duplicate" variant="danger" disabled={busy || !mergeTargetId} onPress={onMerge} />
                </EditorSection>

                <ButtonRow>
                    <ThemedButton title={busy ? 'Saving...' : 'Save Master Product'} disabled={busy} onPress={onSave} style={{ flex: 1 }} />
                    <ThemedButton title="Cancel" variant="secondary" disabled={busy} onPress={onCancel} style={{ flex: 1 }} />
                </ButtonRow>
            </View>
        </ThemedCard>
    );
}

function EditorSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 15, padding: scaleIcon(14), backgroundColor: theme.colors.surface, gap: scaleIcon(12) }}>
            <View style={{ gap: 4 }}>
                <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900' }}>{title}</Text>
                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(15), lineHeight: scaleFont(21) }}>{description}</Text>
            </View>
            {children}
        </View>
    );
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
function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) { return <TouchableOpacity onPress={onPress} style={{ borderWidth: 1, borderColor: selected ? '#087D78' : '#AAB7C5', backgroundColor: selected ? '#D9F5F1' : '#FFFFFF', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: '#09223A', fontWeight: '800' }}>{label}</Text></TouchableOpacity>; }
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Switch value={value} onValueChange={onChange} /><Text style={{ fontWeight: '800' }}>{label}</Text></View>; }
function Badge({ label, tone }: { label: string; tone: 'green' | 'red' | 'amber' }) { const colors = tone === 'green' ? ['#DDF7EA', '#086B42'] : tone === 'red' ? ['#FFE7EA', '#961B2C'] : ['#FFF2D7', '#745000']; return <View style={{ backgroundColor: colors[0], borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}><Text style={{ color: colors[1], fontWeight: '900' }}>{label}</Text></View>; }
function Notice({ message }: { message: string }) { return <View style={{ backgroundColor: '#E8F2FA', borderRadius: 12, padding: 12 }}><Text selectable style={{ color: '#173D59', fontWeight: '700' }}>{message}</Text></View>; }
function Denied() { return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 24, gap: 16 }}><Text style={{ fontSize: 30, fontWeight: '900' }}>Catalog Factory unavailable</Text><Text>This module is restricted to platform administrators.</Text><ThemedButton title="Back to Home" onPress={() => router.replace('/' as never)} /></ScrollView>; }

function fieldList(value: string) { return csvList(value).map((key) => ({ key, label: key.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase()) })); }
function csvList(value: string) { return value.split(',').map((item) => item.trim().toLowerCase().replace(/\s+/g, '_')).filter(Boolean); }
function parseObject(value: string, label: string) { const parsed = JSON.parse(value) as unknown; if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object.`); return parsed as Record<string, unknown>; }
function parseArray(value: string, label: string) { const parsed = JSON.parse(value) as unknown; if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`); return parsed; }
function parseRecordValue(value: unknown, label: string) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object.`); return value as Record<string, unknown>; }
function parseAdvancedSources(value: unknown): CatalogSourceDraft[] { if (!Array.isArray(value)) throw new Error('Advanced sources must be a JSON array.'); return value.map((entry) => { const source = entry && typeof entry === 'object' && !Array.isArray(entry) ? entry as Record<string, unknown> : {}; return { id: typeof source.id === 'string' ? source.id : undefined, sourceType: typeof source.type === 'string' ? source.type : 'other', sourceUrl: typeof source.url === 'string' ? source.url : '', title: typeof source.title === 'string' ? source.title : '' }; }); }
function nullableNumber(value: unknown) { if (value == null || value === '') return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function textArray(value: unknown) { return Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : []; }
function money(value: number | null) { return value == null ? 'not listed' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); }
function errorMessage(error: unknown) { if (error instanceof Error && error.message) return error.message; if (error && typeof error === 'object' && 'message' in error) return String((error as { message?: unknown }).message || 'Catalog Factory action failed.'); return 'Catalog Factory action failed.'; }
