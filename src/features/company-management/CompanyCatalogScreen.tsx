import DictationTextInput from '@/components/input/DictationTextInput';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { canManageCompanyCatalog } from '../../lib/companyCatalogAccess';
import { loadCurrentCompanyPermissionAccess } from '../../lib/companyPermissions';
import {
    createCompanyCatalogFileUrl,
    emptyCompanyCatalogDraft,
    loadCompanyProductCatalog,
    saveCompanyProductCatalogItem,
    uploadCompanyCatalogDocument,
    uploadCompanyCatalogPhoto,
    type CompanyCatalogDraft,
    type CompanyCatalogFileKind,
    type CompanyCatalogItem,
    type CompanyCatalogStatus,
    type CompanyCatalogTier,
} from '../../lib/companyProductCatalog';
import { loadCompanyPriceBook, type CompanyPriceBookItem } from '../../lib/companyPriceBook';
import { loadCurrentUserPlatformAdmin } from '../../lib/roles';
import { useTheme } from '../../theme/useTheme';

export default function CompanyCatalogScreen() {
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const companyId = firstParam(id);
    const { width } = useWindowDimensions();
    const { scaleFont, scaleIcon, theme } = useTheme();
    const phone = width < 700;
    const [items, setItems] = useState<CompanyCatalogItem[]>([]);
    const [priceBookItems, setPriceBookItems] = useState<CompanyPriceBookItem[]>([]);
    const [draft, setDraft] = useState<CompanyCatalogDraft | null>(null);
    const [canManage, setCanManage] = useState(false);
    const [message, setMessage] = useState('Loading the company catalog...');
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

    useEffect(() => {
        if (!companyId) {
            setMessage('A company is required to open the catalog.');
            return;
        }
        void refresh();
        // refresh is scoped to companyId; setters and imported loaders are stable.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId]);

    async function refresh(preferredItemId?: string) {
        if (!companyId) return;
        try {
            setMessage('Loading the company catalog...');
            const [isPlatformAdmin, manageAccess, catalog, priceBook] = await Promise.all([
                loadCurrentUserPlatformAdmin(),
                loadCurrentCompanyPermissionAccess('can_manage_price_book', { companyId }),
                loadCompanyProductCatalog(companyId),
                loadCompanyPriceBook(companyId),
            ]);
            const mayManage = canManageCompanyCatalog({
                isPlatformAdmin,
                hasCompanyPriceBookPermission: Boolean(manageAccess.access),
            });
            setCanManage(mayManage);
            setItems(catalog);
            setPriceBookItems(priceBook.items.filter((item) => item.active));
            setMessage(catalog.length
                ? `${catalog.length} catalog card${catalog.length === 1 ? '' : 's'} ready.`
                : mayManage
                    ? 'No catalog cards yet. Create the first approved product card.'
                    : 'No catalog cards yet. Catalog management access is required to create one.');
            if (preferredItemId) {
                const saved = catalog.find((item) => item.id === preferredItemId);
                if (saved) setDraft(toDraft(saved));
            }
            const photos = catalog.flatMap((item) => item.files.filter((file) => file.kind === 'photo'));
            const nextUrls = await Promise.all(photos.map(async (file) => {
                try { return [file.id, await createCompanyCatalogFileUrl(file)] as const; }
                catch { return null; }
            }));
            setPhotoUrls(nextUrls.reduce<Record<string, string>>((result, entry) => {
                if (entry) result[entry[0]] = entry[1];
                return result;
            }, {}));
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    function editItem(item: CompanyCatalogItem) {
        if (!canManage) return;
        setDraft(toDraft(item));
        setMessage(`Editing ${item.productName}.`);
    }

    async function saveDraft() {
        if (!companyId || !draft || busy || !canManage) return;
        setBusy(true);
        setMessage('Saving catalog card...');
        try {
            const saved = await saveCompanyProductCatalogItem(companyId, draft);
            await refresh(saved.id);
            setMessage(`${saved.productName} saved as ${statusLabel(saved.status)}.`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function addPhoto() {
        if (!companyId || !draft?.id || busy) {
            setMessage('Save the catalog card before attaching photos.');
            return;
        }
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            setMessage('Photo access is required to add product photos.');
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.9 });
        if (result.canceled) return;
        setBusy(true);
        try {
            for (const asset of result.assets) await uploadCompanyCatalogPhoto({ companyId, productId: draft.id, asset });
            await refresh(draft.id);
            setMessage(`${result.assets.length} product photo${result.assets.length === 1 ? '' : 's'} attached.`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally { setBusy(false); }
    }

    async function addDocument(kind: Exclude<CompanyCatalogFileKind, 'photo'>) {
        if (!companyId || !draft?.id || busy) {
            setMessage('Save the catalog card before attaching documents.');
            return;
        }
        const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
        if (result.canceled) return;
        setBusy(true);
        try {
            for (const asset of result.assets) await uploadCompanyCatalogDocument({ companyId, productId: draft.id, kind, asset });
            await refresh(draft.id);
            setMessage(`${result.assets.length} ${fileKindLabel(kind).toLowerCase()} file${result.assets.length === 1 ? '' : 's'} attached.`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally { setBusy(false); }
    }

    async function openFile(item: CompanyCatalogItem, fileId: string) {
        const file = item.files.find((candidate) => candidate.id === fileId);
        if (!file) return;
        try { await Linking.openURL(await createCompanyCatalogFileUrl(file)); }
        catch (error) { setMessage(errorMessage(error)); }
    }

    const normalizedSearch = search.trim().toLowerCase();
    const visibleItems = items.filter((item) => !normalizedSearch || [item.productName, item.category, item.brand, item.model, item.sku]
        .join(' ').toLowerCase().includes(normalizedSearch));
    const editingItem = draft?.id ? items.find((item) => item.id === draft.id) || null : null;
    const textColor = theme.colors.text;
    const mutedColor = theme.colors.mutedText;

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <AdminNavBar companyId={companyId} backFallback={companyId ? `/super-admin/company/${companyId}` as never : '/super-admin'} />
            <ScrollView contentContainerStyle={{ padding: scaleIcon(phone ? 14 : 22), paddingBottom: scaleIcon(80), gap: scaleIcon(16), width: '100%', maxWidth: 1180, alignSelf: 'center' }}>
                <View style={{ gap: 6 }}>
                    <Text style={{ color: textColor, fontSize: scaleFont(phone ? 30 : 38), fontWeight: '900' }}>Product Catalog</Text>
                    <Text style={{ color: mutedColor, fontSize: scaleFont(16), lineHeight: scaleFont(23) }}>
                        Company-approved equipment and fixtures. Product facts live here; labor, scope, and pricing rules stay in the Price Book.
                    </Text>
                </View>
                <ThemedCard>
                    <Text style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(17) }}>How a catalog card moves</Text>
                    <Text style={{ color: mutedColor, marginTop: 8, lineHeight: scaleFont(22) }}>
                        Catalog → Quote → Customer approval → HomeOS destination → Installation closeout. The old item remains in history; the installed card becomes current only after the job is completed.
                    </Text>
                </ThemedCard>
                <Text style={{ color: mutedColor }}>{message}</Text>

                {!draft && (
                    <>
                        <View style={{ flexDirection: phone ? 'column' : 'row', gap: 10 }}>
                            <DictationTextInput value={search} onChangeText={setSearch} placeholder="Search brand, model, category, or SKU" style={{ flex: 1, minHeight: 52, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, color: textColor }} />
                            {canManage && items.length > 0 && <ThemedButton title="Create Catalog Card" onPress={() => setDraft(emptyCompanyCatalogDraft())} />}
                        </View>
                        <View style={{ gap: 14 }}>
                            {visibleItems.map((item) => {
                                const photo = item.files.find((file) => file.kind === 'photo');
                                return (
                                    <ThemedCard key={item.id}>
                                        <View style={{ flexDirection: phone ? 'column' : 'row', gap: 16 }}>
                                            {photo && photoUrls[photo.id] ? <Image source={photoUrls[photo.id]} contentFit="cover" style={{ width: phone ? '100%' : 180, height: 150, borderRadius: 14, backgroundColor: theme.colors.surface }} /> : null}
                                            <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                                    <Text style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(20), flexShrink: 1 }}>{item.productName}</Text>
                                                    <Pill label={statusLabel(item.status)} selected={item.status === 'approved'} />
                                                </View>
                                                <Text style={{ color: mutedColor }}>{item.category} · {item.brand} · Model {item.model}</Text>
                                                {!!item.manufacturerPartNumber && <Text style={{ color: mutedColor }}>Part {item.manufacturerPartNumber}</Text>}
                                                <Text style={{ color: mutedColor }}>{item.files.filter((file) => file.kind === 'photo').length} photos · {item.files.filter((file) => file.kind !== 'photo').length} documents</Text>
                                                {!!item.priceBookItemName && <Text style={{ color: mutedColor }}>Price Book: {item.priceBookItemName}</Text>}
                                                <View style={{ flexDirection: phone ? 'column' : 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                                                    {canManage && <ThemedButton title="Edit Card" variant="secondary" onPress={() => editItem(item)} style={{ flexGrow: 1 }} />}
                                                    {item.status === 'approved' && <ThemedButton title="Add to Quote" onPress={() => router.push({ pathname: '/estimate', params: { companyId, catalogItemId: item.id, mode: 'management' } } as never)} style={{ flexGrow: 1 }} />}
                                                </View>
                                            </View>
                                        </View>
                                    </ThemedCard>
                                );
                            })}
                            {!visibleItems.length && items.length > 0 && <Text style={{ color: mutedColor }}>No catalog cards match this search.</Text>}
                            {!items.length && canManage && (
                                <ThemedCard>
                                    <View style={{ gap: 12 }}>
                                        <Text style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(20) }}>Create your first catalog card</Text>
                                        <Text style={{ color: mutedColor, lineHeight: scaleFont(21) }}>
                                            Add the product name, category, brand, model, photos, manuals, warranty details, and an optional Price Book service link.
                                        </Text>
                                        <ThemedButton title="Create Catalog Card" onPress={() => setDraft(emptyCompanyCatalogDraft())} />
                                    </View>
                                </ThemedCard>
                            )}
                            {!items.length && !canManage && <Text style={{ color: mutedColor }}>There are no approved catalog cards to view.</Text>}
                        </View>
                    </>
                )}

                {draft && (
                    <ThemedCard>
                        <View style={{ gap: 14 }}>
                            <Text style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(24) }}>{draft.id ? 'Edit Catalog Card' : 'New Catalog Card'}</Text>
                            <Text style={{ color: mutedColor }}>Draft cards stay internal. Approved cards become selectable during estimates.</Text>
                            <Field label="Card name" value={draft.productName} onChangeText={(productName) => setDraft({ ...draft, productName })} placeholder="Example: Moen M-Core 3-Series Shower Valve" />
                            <View style={{ flexDirection: phone ? 'column' : 'row', gap: 12 }}>
                                <View style={{ flex: 1 }}><Field label="Category *" value={draft.category} onChangeText={(category) => setDraft({ ...draft, category })} placeholder="Shower Valve" /></View>
                                <View style={{ flex: 1 }}><Field label="Brand *" value={draft.brand} onChangeText={(brand) => setDraft({ ...draft, brand })} placeholder="Moen" /></View>
                                <View style={{ flex: 1 }}><Field label="Model *" value={draft.model} onChangeText={(model) => setDraft({ ...draft, model })} placeholder="Model number" /></View>
                            </View>
                            <View style={{ flexDirection: phone ? 'column' : 'row', gap: 12 }}>
                                <View style={{ flex: 1 }}><Field label="Manufacturer part number" value={draft.manufacturerPartNumber} onChangeText={(manufacturerPartNumber) => setDraft({ ...draft, manufacturerPartNumber })} /></View>
                                <View style={{ flex: 1 }}><Field label="SKU" value={draft.sku} onChangeText={(sku) => setDraft({ ...draft, sku })} /></View>
                            </View>
                            <Field label="Homeowner description" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} multiline />
                            <ChoiceRow label="Card status" values={['draft', 'approved', 'archived'] as CompanyCatalogStatus[]} selected={draft.status} onSelect={(status) => setDraft({ ...draft, status })} />
                            <ChoiceRow label="Product tier" values={['Essential', 'Professional', 'Premium'] as CompanyCatalogTier[]} selected={draft.tier} onSelect={(tier) => setDraft({ ...draft, tier })} />
                            <View style={{ gap: 7 }}>
                                <Text style={{ color: textColor, fontWeight: '800' }}>Optional linked Price Book service</Text>
                                <Text style={{ color: mutedColor }}>The product card supplies model, media, manuals, and warranty. The linked service supplies labor, scope, and company pricing.</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                    <Pill label="No link" selected={!draft.priceBookItemId} onPress={() => setDraft({ ...draft, priceBookItemId: null })} />
                                    {priceBookItems.slice(0, 40).map((item) => <Pill key={item.id} label={item.name} selected={draft.priceBookItemId === item.id} onPress={() => setDraft({ ...draft, priceBookItemId: item.id })} />)}
                                </View>
                            </View>
                            <View style={{ flexDirection: phone ? 'column' : 'row', gap: 12 }}>
                                <View style={{ flex: 1 }}><NumberField label="Approved product price (optional)" value={draft.approvedSellingPrice} onChange={(approvedSellingPrice) => setDraft({ ...draft, approvedSellingPrice })} /></View>
                                <View style={{ flex: 1 }}><NumberField label="Minimum price (optional)" value={draft.minimumSellingPrice} onChange={(minimumSellingPrice) => setDraft({ ...draft, minimumSellingPrice })} /></View>
                                <View style={{ flex: 1 }}><NumberField label="Maximum price (optional)" value={draft.maximumSellingPrice} onChange={(maximumSellingPrice) => setDraft({ ...draft, maximumSellingPrice })} /></View>
                            </View>
                            <Field label="Specifications (one Key: Value per line)" value={specificationsText(draft.specifications)} onChangeText={(value) => setDraft({ ...draft, specifications: parseSpecifications(value) })} multiline />
                            <Field label="Compatible applications (comma separated)" value={draft.compatibleApplications.join(', ')} onChangeText={(value) => setDraft({ ...draft, compatibleApplications: parseList(value) })} multiline />
                            <Field label="Installation requirements (one per line)" value={draft.installationRequirements.join('\n')} onChangeText={(value) => setDraft({ ...draft, installationRequirements: parseLines(value) })} multiline />
                            <View style={{ flexDirection: phone ? 'column' : 'row', gap: 12 }}>
                                <View style={{ flex: 1 }}><Field label="Workmanship warranty" value={draft.workmanshipWarranty} onChangeText={(workmanshipWarranty) => setDraft({ ...draft, workmanshipWarranty })} placeholder="Lifetime" /></View>
                                <View style={{ flex: 1 }}><Field label="Labor warranty" value={draft.laborWarranty} onChangeText={(laborWarranty) => setDraft({ ...draft, laborWarranty })} placeholder="1 Year" /></View>
                                <View style={{ flex: 1 }}><Field label="Manufacturer / parts warranty" value={draft.manufacturerWarranty} onChangeText={(manufacturerWarranty) => setDraft({ ...draft, manufacturerWarranty })} placeholder="Limited Lifetime" /></View>
                            </View>
                            <Field label="Availability / supplier note" value={draft.availabilityNote} onChangeText={(availabilityNote) => setDraft({ ...draft, availabilityNote })} multiline />
                            <Field label="Manufacturer reference or URL" value={draft.manufacturerReference} onChangeText={(manufacturerReference) => setDraft({ ...draft, manufacturerReference })} />
                            <Field label="Internal company notes" value={draft.companyNotes} onChangeText={(companyNotes) => setDraft({ ...draft, companyNotes })} multiline />

                            <View style={{ gap: 10 }}>
                                <Text style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(18) }}>Photos & documents</Text>
                                {!draft.id && <Text style={{ color: mutedColor }}>Save the card once, then attach product photos, manuals, warranty paperwork, and specification sheets.</Text>}
                                <View style={{ flexDirection: phone ? 'column' : 'row', flexWrap: 'wrap', gap: 8 }}>
                                    <ThemedButton title="Add Photos" variant="secondary" disabled={!draft.id || busy} onPress={() => void addPhoto()} />
                                    <ThemedButton title="Add Manual" variant="secondary" disabled={!draft.id || busy} onPress={() => void addDocument('manual')} />
                                    <ThemedButton title="Add Warranty" variant="secondary" disabled={!draft.id || busy} onPress={() => void addDocument('warranty')} />
                                    <ThemedButton title="Add Spec Sheet" variant="secondary" disabled={!draft.id || busy} onPress={() => void addDocument('specification')} />
                                </View>
                                {!!editingItem?.files.length && <View style={{ gap: 8 }}>{editingItem.files.map((file) => (
                                    <TouchableOpacity key={file.id} onPress={() => void openFile(editingItem, file.id)} style={{ padding: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10 }}>
                                        <Text style={{ color: textColor, fontWeight: '800' }}>{fileKindLabel(file.kind)} · {file.fileName}</Text>
                                        <Text style={{ color: mutedColor }}>Tap to open securely</Text>
                                    </TouchableOpacity>
                                ))}</View>}
                            </View>
                            <View style={{ flexDirection: phone ? 'column' : 'row', gap: 10 }}>
                                <ThemedButton title={busy ? 'Saving...' : 'Save Catalog Card'} disabled={busy} onPress={() => void saveDraft()} style={{ flex: 1 }} />
                                <ThemedButton title="Back to Catalog" variant="secondary" disabled={busy} onPress={() => setDraft(null)} style={{ flex: 1 }} />
                            </View>
                        </View>
                    </ThemedCard>
                )}
            </ScrollView>
        </View>
    );
}

function Field({ label, value, onChangeText, placeholder = '', multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean }) {
    const { scaleFont, theme } = useTheme();
    return <View style={{ gap: 6 }}><Text style={{ color: theme.colors.text, fontWeight: '800' }}>{label}</Text><DictationTextInput value={value} onChangeText={onChangeText} placeholder={placeholder} multiline={multiline} style={{ minHeight: multiline ? 92 : 50, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, padding: 12, color: theme.colors.text, fontSize: scaleFont(15), textAlignVertical: multiline ? 'top' : 'center' }} /></View>;
}

function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
    return <Field label={label} value={value === null ? '' : String(value)} onChangeText={(textValue) => { const parsed = Number(textValue); onChange(textValue.trim() && Number.isFinite(parsed) ? parsed : null); }} placeholder="0.00" />;
}

function ChoiceRow<T extends string>({ label, values, selected, onSelect }: { label: string; values: T[]; selected: T; onSelect: (value: T) => void }) {
    const { theme } = useTheme();
    return <View style={{ gap: 7 }}><Text style={{ color: theme.colors.text, fontWeight: '800' }}>{label}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{values.map((value) => <Pill key={value} label={statusLabel(value)} selected={selected === value} onPress={() => onSelect(value)} />)}</View></View>;
}

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress?: () => void }) {
    const { theme } = useTheme();
    const content = <Text style={{ color: selected ? theme.colors.primaryText : theme.colors.text, fontWeight: '800', flexShrink: 1 }}>{label}</Text>;
    const style = { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primary : theme.colors.surface, maxWidth: '100%' as const };
    return onPress ? <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={style}>{content}</TouchableOpacity> : <View style={style}>{content}</View>;
}

function toDraft(item: CompanyCatalogItem): CompanyCatalogDraft {
    const { companyId: _companyId, priceBookItemName: _priceBookItemName, files: _files, createdAt: _createdAt, updatedAt: _updatedAt, ...draft } = item;
    return draft;
}
function firstParam(value?: string | string[]) { return Array.isArray(value) ? value[0] || '' : value || ''; }
function statusLabel(value: string) { return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function fileKindLabel(kind: CompanyCatalogFileKind) { return ({ photo: 'Photo', manual: 'Manual', warranty: 'Warranty', specification: 'Specification', document: 'Document' } as const)[kind]; }
function parseList(value: string) { return Array.from(new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))); }
function parseLines(value: string) { return Array.from(new Set(value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean))); }
function parseSpecifications(value: string) { return value.split(/\r?\n/).reduce<Record<string, string>>((result, line) => { const separator = line.indexOf(':'); if (separator > 0) { const key = line.slice(0, separator).trim(); const entry = line.slice(separator + 1).trim(); if (key && entry) result[key] = entry; } return result; }, {}); }
function specificationsText(value: Record<string, string>) { return Object.entries(value).map(([key, entry]) => `${key}: ${entry}`).join('\n'); }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Catalog action failed.'; }
