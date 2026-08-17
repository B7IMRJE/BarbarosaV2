import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import ProductCardImage from '../../components/catalog/product-card-image';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    companyCatalogPackageLabel,
    companyCatalogPackageLimit,
    loadCompanyCatalogEntitlement,
    saveCompanyCatalogEntitlement,
    toggleCompanyCatalogSelection,
    validateCompanyCatalogEntitlementDraft,
    type CompanyCatalogEntitlement,
    type CompanyCatalogEntitlementDraft,
    type CompanyCatalogPackageTier,
} from '../../lib/companyCatalogEntitlement';
import { canManageCompanyCatalog, canManageCompanyCatalogPricing } from '../../lib/companyCatalogAccess';
import {
    loadApprovedMasterCatalogForCompany,
    saveCompanyCatalogOffering,
    type ApprovedMasterCatalogItem,
    type CompanyCatalogOffering,
} from '../../lib/catalogFactory';
import { loadCurrentCompanyPermissionAccess } from '../../lib/companyPermissions';
import {
    createCompanyCatalogFileUrl,
    emptyCompanyCatalogDraft,
    loadCompanyProductCatalog,
    saveCompanyProductCatalogItem,
    setCompanyCatalogFileHomeownerVisibility,
    uploadCompanyCatalogDocument,
    uploadCompanyCatalogPhoto,
    validateCompanyCatalogDraft,
    type CompanyCatalogDraft,
    type CompanyCatalogFileKind,
    type CompanyCatalogItem,
    type CompanyCatalogStatus,
    type CompanyCatalogTier,
} from '../../lib/companyProductCatalog';
import { loadCompanyPriceBook, type CompanyPriceBookItem } from '../../lib/companyPriceBook';
import { resolveCompanyCatalogCardImageUrl } from '../../lib/companyProductCatalogCore';
import {
    calculateCompanyCatalogLaborAmount,
    calculateCompanyCatalogMarkupAmount,
    calculateCompanyCatalogMinimum,
    loadCompanyCatalogPricingSettings,
    saveCompanyCatalogPricingSettings,
    splitCompanyCatalogMasterItems,
} from '../../lib/companyCatalogPricing';
import { researchCatalogProduct } from '../../lib/catalogProductResearch';
import {
    applyCatalogProductResearch,
    type CatalogProductResearch,
    type CatalogResearchApplyGroup,
} from '../../lib/catalogProductResearchCore';
import { loadCurrentUserPlatformAdmin } from '../../lib/roles';
import { useTheme } from '../../theme/useTheme';
import CatalogResearchReview from './CatalogResearchReview';
import {
    CompactMasterCatalogCard,
    MasterCatalogProductDetailsModal,
} from './master-catalog-product-card';
import PlumbingCatalogSuggestionsPanel from './PlumbingCatalogSuggestionsPanel';

export default function CompanyCatalogScreen() {
    const { id, productVariantId } = useLocalSearchParams<{
        id?: string | string[];
        productVariantId?: string | string[];
    }>();
    const companyId = firstParam(id);
    const requestedProductVariantId = firstParam(productVariantId);
    const { width } = useWindowDimensions();
    const { scaleFont, scaleIcon, theme } = useTheme();
    const phone = width < 700;
    const [items, setItems] = useState<CompanyCatalogItem[]>([]);
    const [priceBookItems, setPriceBookItems] = useState<CompanyPriceBookItem[]>([]);
    const [draft, setDraft] = useState<CompanyCatalogDraft | null>(null);
    const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
    const [canManage, setCanManage] = useState(false);
    const [canManagePricing, setCanManagePricing] = useState(false);
    const [entitlement, setEntitlement] = useState<CompanyCatalogEntitlement | null>(null);
    const [entitlementDraft, setEntitlementDraft] = useState<CompanyCatalogEntitlementDraft | null>(null);
    const [entitlementFeedback, setEntitlementFeedback] = useState('');
    const [message, setMessage] = useState('Loading the company catalog...');
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
    const [saveFeedback, setSaveFeedback] = useState('');
    const [masterItems, setMasterItems] = useState<ApprovedMasterCatalogItem[]>([]);
    const [showMasterCatalog, setShowMasterCatalog] = useState(false);
    const [showPricingList, setShowPricingList] = useState(false);
    const [pricingListDrafts, setPricingListDrafts] = useState<Record<string, CompanyCatalogOffering>>({});
    const [masterDetailItem, setMasterDetailItem] = useState<ApprovedMasterCatalogItem | null>(null);
    const [offeringItem, setOfferingItem] = useState<ApprovedMasterCatalogItem | null>(null);
    const [offeringDraft, setOfferingDraft] = useState<CompanyCatalogOffering>(emptyOffering());
    const [researching, setResearching] = useState(false);
    const [researchResult, setResearchResult] = useState<CatalogProductResearch | null>(null);
    const [hourlyLaborRate, setHourlyLaborRate] = useState<number | null>(null);
    const [hourlyLaborRateDraft, setHourlyLaborRateDraft] = useState<number | null>(null);
    const [pricingSettingsFeedback, setPricingSettingsFeedback] = useState('');
    const openedPricingRequestRef = useRef('');

    useEffect(() => {
        if (!companyId) {
            setMessage('A company is required to open the catalog.');
            return;
        }
        void refresh();
        // refresh is scoped to the company and optional company-pricing deep link.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [companyId, requestedProductVariantId]);

    async function refresh(preferredItemId?: string) {
        if (!companyId) return;
        try {
            setMessage('Loading the company catalog...');
            const [platformAdmin, manageAccess, customerAccess, jobAccess, catalogEntitlement] = await Promise.all([
                loadCurrentUserPlatformAdmin(),
                loadCurrentCompanyPermissionAccess('can_manage_price_book', { companyId }),
                loadCurrentCompanyPermissionAccess('can_view_customers', { companyId }),
                loadCurrentCompanyPermissionAccess('can_view_jobs', { companyId }),
                loadCompanyCatalogEntitlement(companyId),
            ]);
            const baseMayManage = canManageCompanyCatalog({
                isPlatformAdmin: platformAdmin,
                hasCompanyPriceBookPermission: Boolean(manageAccess.access),
                canViewCompanyCustomers: Boolean(customerAccess.access),
                canViewCompanyJobs: Boolean(jobAccess.access),
            });
            const baseMayManagePricing = canManageCompanyCatalogPricing({
                isPlatformAdmin: platformAdmin,
                hasCompanyPriceBookPermission: Boolean(manageAccess.access),
            });
            const mayManage = baseMayManage && (
                platformAdmin || (catalogEntitlement.active && catalogEntitlement.packageTier === 'full')
            );
            const mayManagePricing = baseMayManagePricing && catalogEntitlement.active;
            const [catalogResult, priceBookResult, masterResult, pricingSettingsResult] = await Promise.allSettled([
                loadCompanyProductCatalog(companyId),
                mayManagePricing
                    ? loadCompanyPriceBook(companyId)
                    : Promise.resolve(null),
                loadApprovedMasterCatalogForCompany(companyId),
                mayManagePricing
                    ? loadCompanyCatalogPricingSettings(companyId)
                    : Promise.resolve(null),
            ]);
            if (catalogResult.status === 'rejected') throw catalogResult.reason;
            const catalog = catalogResult.value;
            const priceBook = priceBookResult.status === 'fulfilled' ? priceBookResult.value : null;
            const approvedMasterItems = masterResult.status === 'fulfilled' ? masterResult.value : [];
            const pricingSettings = pricingSettingsResult.status === 'fulfilled' ? pricingSettingsResult.value : null;
            setIsPlatformAdmin(platformAdmin);
            setCanManage(mayManage);
            setCanManagePricing(mayManagePricing);
            setEntitlement(catalogEntitlement);
            setEntitlementDraft({
                active: catalogEntitlement.active,
                packageTier: catalogEntitlement.packageTier,
                selectedVariantIds: catalogEntitlement.selectedVariantIds,
            });
            setItems(catalog);
            setPriceBookItems(priceBook?.items.filter((item) => item.active) || []);
            setMasterItems(approvedMasterItems);
            setPricingListDrafts(Object.fromEntries(approvedMasterItems
                .filter((item) => item.offering)
                .map((item) => [item.id, item.offering!] as const)));
            setHourlyLaborRate(pricingSettings?.hourlyLaborRate ?? null);
            setHourlyLaborRateDraft(pricingSettings?.hourlyLaborRate ?? null);
            setMessage(!catalogEntitlement.active
                ? platformAdmin
                    ? 'Catalog access is inactive. Existing catalog records and installed HomeOS history are preserved.'
                    : 'This company catalog is inactive. Contact Platform Administration to restore access.'
                : catalog.length
                    ? `${catalog.length} catalog card${catalog.length === 1 ? '' : 's'} ready in ${companyCatalogPackageLabel(catalogEntitlement.packageTier)}.`
                    : mayManage
                    ? 'No catalog cards yet. Create the first approved product card.'
                    : 'No catalog cards yet. Catalog management access is required to create one.');
            const pricingRequestKey = requestedProductVariantId
                ? `${companyId}:${requestedProductVariantId}`
                : '';
            if (pricingRequestKey && openedPricingRequestRef.current !== pricingRequestKey) {
                openedPricingRequestRef.current = pricingRequestKey;
                setShowMasterCatalog(true);
                const requestedProduct = approvedMasterItems.find((item) => item.id === requestedProductVariantId) || null;
                if (!requestedProduct) {
                    setMessage('The requested approved catalog product is not available to this company.');
                } else if (!mayManagePricing) {
                    setMessage('Manage Price Book permission and active catalog access are required to change company offering prices.');
                } else {
                    setOfferingItem(requestedProduct);
                    setOfferingDraft(requestedProduct.offering || emptyOffering());
                    setMessage(`Company pricing is ready for ${requestedProduct.brand} ${requestedProduct.modelNumber}.`);
                }
            }
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

    async function savePricingSettings() {
        if (!companyId || !canManagePricing || hourlyLaborRateDraft === null || busy) return;
        setBusy(true);
        setPricingSettingsFeedback('Saving hourly labor rate...');
        try {
            const saved = await saveCompanyCatalogPricingSettings(companyId, hourlyLaborRateDraft);
            setHourlyLaborRate(saved.hourlyLaborRate);
            setHourlyLaborRateDraft(saved.hourlyLaborRate);
            setPricingSettingsFeedback(`Catalog labor rate saved at ${money(saved.hourlyLaborRate)} per hour.`);
        } catch (error) {
            setPricingSettingsFeedback(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function saveEntitlement() {
        if (!companyId || !entitlementDraft || busy || !isPlatformAdmin) return;
        const validationMessage = validateCompanyCatalogEntitlementDraft(entitlementDraft);
        if (validationMessage) {
            setEntitlementFeedback(validationMessage);
            return;
        }

        setBusy(true);
        setEntitlementFeedback('Saving catalog access...');
        try {
            const saved = await saveCompanyCatalogEntitlement(companyId, entitlementDraft);
            setEntitlement(saved);
            setEntitlementDraft({
                active: saved.active,
                packageTier: saved.packageTier,
                selectedVariantIds: saved.selectedVariantIds,
            });
            const successMessage = saved.active
                ? `${companyCatalogPackageLabel(saved.packageTier)} is active with ${saved.assignedCount} available card${saved.assignedCount === 1 ? '' : 's'}.`
                : 'Catalog access is inactive. Existing installed HomeOS item history was not changed.';
            setEntitlementFeedback(successMessage);
            await refresh();
            setEntitlementFeedback(successMessage);
        } catch (error) {
            setEntitlementFeedback(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    function choosePackageTier(packageTier: CompanyCatalogPackageTier) {
        setEntitlementDraft((current) => {
            if (!current) return current;
            const limit = companyCatalogPackageLimit(packageTier);
            return {
                ...current,
                packageTier,
                selectedVariantIds: limit === null
                    ? current.selectedVariantIds
                    : current.selectedVariantIds.slice(0, limit),
            };
        });
        setEntitlementFeedback('');
        if (packageTier !== 'full') setShowMasterCatalog(true);
    }

    function togglePackageCard(variantId: string) {
        if (!entitlementDraft || entitlementDraft.packageTier === 'full') return;
        const nextIds = toggleCompanyCatalogSelection(
            entitlementDraft.selectedVariantIds,
            variantId,
            entitlementDraft.packageTier,
        );
        if (nextIds.length === entitlementDraft.selectedVariantIds.length
            && !entitlementDraft.selectedVariantIds.includes(variantId)) {
            const limit = companyCatalogPackageLimit(entitlementDraft.packageTier);
            setEntitlementFeedback(`This package already has its ${limit} selected cards. Remove one before adding another.`);
            return;
        }
        setEntitlementDraft({ ...entitlementDraft, selectedVariantIds: nextIds });
        setEntitlementFeedback('Package selection changed. Save Catalog Access to apply it.');
    }

    function editItem(item: CompanyCatalogItem) {
        if (!canManage) return;
        setDraft(toDraft(item));
        setResearchResult(null);
        setSaveFeedback('');
        setMessage(`Editing ${item.productName}.`);
    }

    async function researchManufacturer() {
        if (!companyId || !draft || researching) return;
        if (!canManage) {
            setSaveFeedback('Catalog management access is required for manufacturer research.');
            return;
        }
        setResearching(true);
        setResearchResult(null);
        setSaveFeedback('Searching manufacturer product pages, manuals, specifications, and warranty information...');
        setMessage('Researching the exact manufacturer product...');
        try {
            const result = await researchCatalogProduct({
                companyId,
                category: draft.category,
                brand: draft.brand,
                model: draft.model,
                manufacturerPartNumber: draft.manufacturerPartNumber,
                notes: draft.companyNotes,
            });
            setResearchResult(result);
            const resultMessage = result.exactModelMatch
                ? 'Exact manufacturer product found. Review the sourced details before applying them.'
                : 'Research finished, but the exact model was not confirmed. Review every warning and source before applying.';
            setSaveFeedback(resultMessage);
            setMessage(resultMessage);
        } catch (error) {
            const failureMessage = errorMessage(error);
            setSaveFeedback(failureMessage);
            setMessage(failureMessage);
        } finally {
            setResearching(false);
        }
    }

    function applyResearch(groups: CatalogResearchApplyGroup[]) {
        if (!researchResult) return;
        setDraft((current) => current ? applyCatalogProductResearch(current, researchResult, groups) : current);
        const applied = groups.length === 6 ? 'All researched details' : groups.map(statusLabel).join(', ');
        setSaveFeedback(`${applied} applied to this draft. Review the fields, then save the catalog card.`);
    }

    function updateIdentity(patch: Partial<Pick<CompanyCatalogDraft, 'category' | 'brand' | 'model' | 'manufacturerPartNumber'>>) {
        setDraft((current) => current ? { ...current, ...patch } : current);
        setResearchResult(null);
    }

    async function saveDraft() {
        if (busy || researching) return;
        if (!companyId || !draft) {
            setSaveFeedback('This catalog card could not be identified. Return to the catalog and open it again.');
            return;
        }
        const validationMessage = validateCompanyCatalogDraft(draft);
        if (validationMessage) {
            setSaveFeedback(validationMessage);
            return;
        }
        if (!canManage) {
            setSaveFeedback('This work account does not have permission to save catalog cards.');
            return;
        }
        setBusy(true);
        setSaveFeedback('Saving catalog card...');
        setMessage('Saving catalog card...');
        try {
            const saved = await saveCompanyProductCatalogItem(companyId, draft);
            setDraft(toDraft(saved));
            await refresh(saved.id);
            const successMessage = `${saved.productName} saved as ${statusLabel(saved.status)}. Photos and documents are now available.`;
            setSaveFeedback(successMessage);
            setMessage(successMessage);
        } catch (error) {
            const failureMessage = errorMessage(error);
            setSaveFeedback(failureMessage);
            setMessage(failureMessage);
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

    async function toggleHomeownerVisibility(item: CompanyCatalogItem, fileId: string) {
        if (!companyId || busy) return;
        const file = item.files.find((candidate) => candidate.id === fileId);
        if (!file) return;

        setBusy(true);
        setMessage(file.homeownerVisible ? 'Removing file from the HomeOS product reference...' : 'Publishing file to the HomeOS product reference...');
        try {
            await setCompanyCatalogFileHomeownerVisibility({
                companyId,
                productId: item.id,
                fileId: file.id,
                visible: !file.homeownerVisible,
            });
            await refresh(item.id);
            setMessage(file.homeownerVisible
                ? `${file.fileName} is now company-only.`
                : `${file.fileName} is now visible in linked HomeOS product references.`
            );
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    function beginOffering(item: ApprovedMasterCatalogItem) {
        setOfferingItem(item);
        setOfferingDraft(item.offering || emptyOffering());
        setMessage(`Setting company pricing for ${item.brand} ${item.modelNumber}.`);
    }

    async function saveOffering() {
        if (!companyId || !offeringItem || busy) return;
        if (!canManagePricing) {
            setMessage('Price Book permission is required to set company offering prices.');
            return;
        }
        if (offeringDraft.laborHours !== null && hourlyLaborRate === null) {
            setMessage('Save the company hourly labor rate before using labor hours. Existing legacy labor amounts remain preserved until then.');
            return;
        }
        setBusy(true);
        try {
            await saveCompanyCatalogOffering(companyId, offeringItem.id, offeringDraft);
            setOfferingItem(null);
            setMessage(`${offeringItem.brand} ${offeringItem.modelNumber} added to this company catalog. Global product facts were not changed.`);
            await refresh();
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    function updatePricingListDraft(variantId: string, patch: Partial<CompanyCatalogOffering>) {
        setPricingListDrafts((current) => ({
            ...current,
            [variantId]: { ...(current[variantId] || emptyOffering()), ...patch },
        }));
    }

    async function savePricingListRow(item: ApprovedMasterCatalogItem) {
        if (!companyId || !canManagePricing || busy) return;
        const rowDraft = pricingListDrafts[item.id];
        if (!rowDraft) return;
        if (rowDraft.laborHours !== null && hourlyLaborRate === null) {
            setMessage('Save the company hourly labor rate before using labor hours.');
            return;
        }
        setBusy(true);
        setMessage(`Saving pricing for ${item.brand} ${item.modelNumber}...`);
        try {
            await saveCompanyCatalogOffering(companyId, item.id, rowDraft);
            setMessage(`${item.brand} ${item.modelNumber} company pricing saved. Master facts and HomeOS were not changed.`);
            await refresh();
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    const normalizedSearch = search.trim().toLowerCase();
    const visibleItems = items.filter((item) => !normalizedSearch || [item.productName, item.category, item.brand, item.model, item.sku]
        .join(' ').toLowerCase().includes(normalizedSearch));
    const editingItem = draft?.id ? items.find((item) => item.id === draft.id) || null : null;
    const textColor = theme.colors.text;
    const mutedColor = theme.colors.mutedText;
    const entitlementValidation = entitlementDraft
        ? validateCompanyCatalogEntitlementDraft(entitlementDraft)
        : '';
    const selectedPackageIds = new Set(entitlementDraft?.selectedVariantIds || []);
    const selectedPackageLimit = entitlementDraft
        ? companyCatalogPackageLimit(entitlementDraft.packageTier)
        : null;
    const masterDetailIncludedInDraftPackage = Boolean(masterDetailItem && (
        entitlementDraft?.packageTier === 'full' || selectedPackageIds.has(masterDetailItem.id)
    ));
    const { companyOfferings, availableMasterProducts } = splitCompanyCatalogMasterItems(masterItems);
    const visibleCompanyOfferings = companyOfferings.filter((item) => masterMatchesSearch(item, normalizedSearch));
    const visibleAvailableMasterProducts = availableMasterProducts.filter((item) => masterMatchesSearch(item, normalizedSearch));
    const visibleCompanyOnlyItems = visibleItems.filter((item) => !item.masterProductVariantId);
    const calculatedLaborAmount = calculateCompanyCatalogLaborAmount(offeringDraft.laborHours, hourlyLaborRate);
    const calculatedMarkupAmount = calculateCompanyCatalogMarkupAmount(offeringDraft.materialCost, offeringDraft.markup, offeringDraft.markupMode);

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <AdminNavBar companyId={companyId} backFallback={companyId ? `/super-admin/company/${companyId}` as never : '/super-admin'} />
            <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: scaleIcon(phone ? 14 : 22), paddingBottom: scaleIcon(80), gap: scaleIcon(16), width: '100%', maxWidth: 1180, alignSelf: 'center' }}>
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

                {entitlement && entitlementDraft && (
                    <ThemedCard>
                        <View style={{ gap: 14 }}>
                            <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'center', justifyContent: 'space-between', gap: 10 }}>
                                <View style={{ flex: 1, gap: 5 }}>
                                    <Text selectable style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(21) }}>Catalog Access</Text>
                                    <Text selectable style={{ color: mutedColor, lineHeight: scaleFont(21) }}>
                                        Controls which master product cards this company can use in ManagementOS, estimates, and technician workflows. Installed HomeOS item history remains available if access is turned off.
                                    </Text>
                                </View>
                                <Pill
                                    label={entitlement.active ? 'Active' : 'Inactive'}
                                    selected={entitlement.active}
                                />
                            </View>

                            {isPlatformAdmin ? (
                                <>
                                    <ChoiceRow
                                        label="Company access"
                                        values={['active', 'inactive']}
                                        selected={entitlementDraft.active ? 'active' : 'inactive'}
                                        onSelect={(value) => {
                                            setEntitlementDraft({ ...entitlementDraft, active: value === 'active' });
                                            setEntitlementFeedback('Catalog access changed. Save to apply it.');
                                        }}
                                    />
                                    <View style={{ gap: 8 }}>
                                        <Text selectable style={{ color: textColor, fontWeight: '800' }}>Card package</Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                            {(['curated_10', 'curated_20', 'full'] as CompanyCatalogPackageTier[]).map((packageTier) => (
                                                <Pill
                                                    key={packageTier}
                                                    label={companyCatalogPackageLabel(packageTier)}
                                                    selected={entitlementDraft.packageTier === packageTier}
                                                    onPress={() => choosePackageTier(packageTier)}
                                                />
                                            ))}
                                        </View>
                                        <Text selectable style={{ color: mutedColor, lineHeight: scaleFont(20) }}>
                                            {selectedPackageLimit === null
                                                ? `All ${entitlement.availableCount} approved master cards are included automatically. Company-authored legacy cards remain available in the full package.`
                                                : `${selectedPackageIds.size} of ${selectedPackageLimit} master cards selected. Open the master catalog below to curate this package.`}
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: phone ? 'column' : 'row', gap: 10 }}>
                                        {selectedPackageLimit !== null && (
                                            <ThemedButton
                                                title={showMasterCatalog ? 'Hide Card Selection' : 'Choose Package Cards'}
                                                variant="secondary"
                                                onPress={() => setShowMasterCatalog((value) => !value)}
                                                style={{ flex: 1 }}
                                            />
                                        )}
                                        <ThemedButton
                                            title={busy ? 'Saving...' : 'Save Catalog Access'}
                                            disabled={busy || Boolean(entitlementValidation)}
                                            onPress={() => void saveEntitlement()}
                                            style={{ flex: 1 }}
                                        />
                                    </View>
                                    <View accessibilityLiveRegion="polite" style={{ borderWidth: 1, borderColor: entitlementFeedback || entitlementValidation ? theme.colors.primary : theme.colors.border, borderRadius: 12, padding: 12, backgroundColor: theme.colors.surface }}>
                                        <Text selectable style={{ color: entitlementFeedback || entitlementValidation ? textColor : mutedColor, fontWeight: '700', lineHeight: scaleFont(20) }}>
                                            {entitlementFeedback || entitlementValidation || 'Catalog access is ready to save.'}
                                        </Text>
                                    </View>
                                </>
                            ) : (
                                <Text selectable style={{ color: mutedColor, lineHeight: scaleFont(21) }}>
                                    {entitlement.active
                                        ? `${companyCatalogPackageLabel(entitlement.packageTier)} provides ${entitlement.assignedCount} catalog card${entitlement.assignedCount === 1 ? '' : 's'} to this company.`
                                        : 'Catalog access is currently inactive. Existing installed HomeOS records are preserved.'}
                                </Text>
                            )}
                        </View>
                    </ThemedCard>
                )}

                {canManagePricing && (
                    <ThemedCard>
                        <View style={{ gap: 12 }}>
                            <Text selectable style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(21) }}>Company Catalog Pricing Settings</Text>
                            <Text selectable style={{ color: mutedColor, lineHeight: scaleFont(21) }}>
                                The hourly labor rate is saved here once for this company. Catalog offering labor hours use this rate; master product facts, HomeOS records, and Price Book service records are not changed.
                            </Text>
                            <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'flex-end', gap: 10 }}>
                                <View style={{ flex: 1 }}><NumberField label="Hourly labor rate" value={hourlyLaborRateDraft} onChange={setHourlyLaborRateDraft} /></View>
                                <ThemedButton title={busy ? 'Saving...' : 'Save Labor Rate'} disabled={busy || hourlyLaborRateDraft === null || hourlyLaborRateDraft <= 0} onPress={() => void savePricingSettings()} />
                            </View>
                            {!!pricingSettingsFeedback && <Text accessibilityLiveRegion="polite" selectable style={{ color: textColor, fontWeight: '700' }}>{pricingSettingsFeedback}</Text>}
                        </View>
                    </ThemedCard>
                )}

                {!draft && (
                    <>
                        {canManagePricing && <ThemedCard>
                            <View style={{ gap: 12 }}>
                                <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'center', justifyContent: 'space-between', gap: 10 }}>
                                    <View style={{ flex: 1, gap: 4 }}>
                                        <Text selectable style={{ color: textColor, fontSize: scaleFont(21), fontWeight: '900' }}>Pricing List</Text>
                                        <Text selectable style={{ color: mutedColor, lineHeight: scaleFont(20) }}>Search and edit company-private offering prices in one place. Master products and HomeOS records remain read-only.</Text>
                                    </View>
                                    <ThemedButton title={showPricingList ? 'Close Pricing List' : `Open Pricing List (${companyOfferings.length})`} variant="secondary" onPress={() => setShowPricingList((value) => !value)} />
                                </View>
                                {showPricingList && <View style={{ gap: 10 }}>
                                    <TextInput value={search} onChangeText={setSearch} placeholder="Search pricing by card code, product, model, or category" placeholderTextColor={theme.colors.mutedText} style={{ minHeight: 52, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, color: textColor }} />
                                    {visibleCompanyOfferings.map((item) => {
                                        const rowDraft = pricingListDrafts[item.id] || item.offering || emptyOffering();
                                        const rowLabor = calculateCompanyCatalogLaborAmount(rowDraft.laborHours, hourlyLaborRate) ?? rowDraft.laborAmount;
                                        const rowMarkup = calculateCompanyCatalogMarkupAmount(rowDraft.materialCost, rowDraft.markup, rowDraft.markupMode);
                                        const calculatedMinimum = calculateCompanyCatalogMinimum(rowDraft, hourlyLaborRate);
                                        return <View key={`pricing-${item.id}`} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 13, padding: scaleIcon(12), gap: 10, backgroundColor: theme.colors.surface }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                <ProductCardImage compact imageUrl={item.primaryImageUrl} productName={[item.brand, item.modelNumber].filter(Boolean).join(' ')} style={{ width: scaleIcon(54), height: scaleIcon(54), minHeight: scaleIcon(54) }} />
                                                <View style={{ flex: 1, minWidth: 0 }}>
                                                    <Text selectable numberOfLines={2} style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(16) }}>{[item.brand, item.familyName, item.modelNumber].filter(Boolean).join(' ')}</Text>
                                                    <Text selectable numberOfLines={1} style={{ color: mutedColor }}>{[item.shortCode, item.category, rowDraft.active ? 'Active' : 'Inactive'].filter(Boolean).join(' · ')}</Text>
                                                </View>
                                            </View>
                                            <View style={{ flexDirection: phone ? 'column' : 'row', flexWrap: 'wrap', gap: 10 }}>
                                                <View style={{ flex: 1, minWidth: phone ? 0 : 145 }}><NumberField label="Material cost" value={rowDraft.materialCost} onChange={(materialCost) => updatePricingListDraft(item.id, { materialCost })} /></View>
                                                <View style={{ flex: 1, minWidth: phone ? 0 : 130 }}><NumberField label="Markup" value={rowDraft.markup} onChange={(markup) => updatePricingListDraft(item.id, { markup })} /></View>
                                                <View style={{ flex: 1, minWidth: phone ? 0 : 180 }}><MarkupModeDropdown value={rowDraft.markupMode} onChange={(markupMode) => updatePricingListDraft(item.id, { markupMode })} /></View>
                                                <View style={{ flex: 1, minWidth: phone ? 0 : 130 }}><NumberField label="Labor hours" value={rowDraft.laborHours} onChange={(laborHours) => updatePricingListDraft(item.id, { laborHours })} /></View>
                                                <View style={{ flex: 1, minWidth: phone ? 0 : 150 }}><NumberField label="Minimum price" value={rowDraft.minimumPrice} onChange={(minimumPrice) => updatePricingListDraft(item.id, { minimumPrice })} /></View>
                                            </View>
                                            <Text selectable style={{ color: mutedColor, lineHeight: scaleFont(19) }}>
                                                Markup {rowMarkup === null ? 'not calculated' : money(rowMarkup)} · Labor {rowLabor === null ? 'not calculated' : money(rowLabor)} · Calculated cost + markup + labor {calculatedMinimum === null ? 'not available' : money(calculatedMinimum)}
                                            </Text>
                                            <ChoiceRow label="Status" values={['active', 'inactive']} selected={rowDraft.active ? 'active' : 'inactive'} onSelect={(value) => updatePricingListDraft(item.id, { active: value === 'active' })} />
                                            <View style={{ flexDirection: phone ? 'column' : 'row', gap: 8 }}>
                                                <ThemedButton title="Use Calculated Minimum" variant="secondary" disabled={calculatedMinimum === null || busy} onPress={() => updatePricingListDraft(item.id, { minimumPrice: calculatedMinimum })} style={{ flex: 1 }} />
                                                <ThemedButton title={busy ? 'Saving...' : 'Save This Row'} disabled={busy} onPress={() => void savePricingListRow(item)} style={{ flex: 1 }} />
                                            </View>
                                        </View>;
                                    })}
                                    {!visibleCompanyOfferings.length && <Text selectable style={{ color: mutedColor }}>{companyOfferings.length ? 'No company offerings match this search.' : 'No company offerings are available yet.'}</Text>}
                                </View>}
                            </View>
                        </ThemedCard>}
                        {offeringItem && <ThemedCard style={{ borderWidth: 2, borderColor: theme.colors.primary }}>
                            <View style={{ gap: 12 }}>
                                <Text style={{ color: mutedColor, fontSize: scaleFont(12), fontWeight: '900', letterSpacing: 0.7 }}>COMPANY-PRIVATE PRICING</Text>
                                <Text style={{ color: textColor, fontSize: scaleFont(21), fontWeight: '900' }}>Company Offering · {offeringItem.brand} {offeringItem.modelNumber}</Text>
                                <Text selectable style={{ color: mutedColor, lineHeight: scaleFont(21) }}>
                                    Set this company&apos;s private cost, labor, and minimum quote price. A technician may raise the quote price but cannot lower it below the minimum. This does not edit the master product, HomeOS, or service history.
                                </Text>
                                <View style={{ flexDirection: phone ? 'column' : 'row', gap: 12 }}>
                                    <View style={{ flex: 1 }}><NumberField label="Material cost" value={offeringDraft.materialCost} onChange={(materialCost) => setOfferingDraft({ ...offeringDraft, materialCost })} /></View>
                                    <View style={{ flex: 1 }}><NumberField label="Markup" value={offeringDraft.markup} onChange={(markup) => setOfferingDraft({ ...offeringDraft, markup })} /></View>
                                    <View style={{ flex: 1 }}>
                                        <MarkupModeDropdown value={offeringDraft.markupMode} onChange={(markupMode) => setOfferingDraft({ ...offeringDraft, markupMode })} />
                                    </View>
                                </View>
                                <View style={{ flexDirection: phone ? 'column' : 'row', gap: 12 }}>
                                    <View style={{ flex: 1 }}><NumberField label="Labor hours" value={offeringDraft.laborHours} onChange={(laborHours) => setOfferingDraft({ ...offeringDraft, laborHours })} /></View>
                                    <View style={{ flex: 1 }}><NumberField label="Minimum price" value={offeringDraft.minimumPrice} onChange={(minimumPrice) => setOfferingDraft({ ...offeringDraft, minimumPrice })} /></View>
                                </View>
                                <Text selectable style={{ color: mutedColor, lineHeight: scaleFont(20) }}>
                                    {hourlyLaborRate === null
                                        ? 'Set the company hourly labor rate above before labor hours can calculate.'
                                        : `${offeringDraft.laborHours ?? 0} labor hour${offeringDraft.laborHours === 1 ? '' : 's'} × ${money(hourlyLaborRate)}/hr = ${money(calculatedLaborAmount)} labor.`}
                                    {' '}Markup contribution: {calculatedMarkupAmount === null ? 'enter material cost and markup' : money(calculatedMarkupAmount)}.
                                </Text>
                                {offeringDraft.laborHours === null && offeringDraft.laborAmount !== null && (
                                    <Text selectable style={{ color: '#704B00', fontWeight: '800' }}>Existing legacy labor amount preserved: {money(offeringDraft.laborAmount)}. Enter labor hours when ready to adopt the company hourly rate.</Text>
                                )}
                                <Field label="Preferred supplier" value={offeringDraft.preferredSupplier} onChangeText={(preferredSupplier) => setOfferingDraft({ ...offeringDraft, preferredSupplier })} />
                                <Field label="Company warranty" value={offeringDraft.companyWarranty} onChangeText={(companyWarranty) => setOfferingDraft({ ...offeringDraft, companyWarranty })} multiline />
                                <ChoiceRow label="Offering status" values={['active', 'inactive']} selected={offeringDraft.active ? 'active' : 'inactive'} onSelect={(value) => setOfferingDraft({ ...offeringDraft, active: value === 'active' })} />
                                <View style={{ flexDirection: phone ? 'column' : 'row', gap: 10 }}>
                                    <ThemedButton title={busy ? 'Saving...' : 'Save Company Offering'} disabled={busy} onPress={() => void saveOffering()} style={{ flex: 1 }} />
                                    <ThemedButton title="Cancel" variant="secondary" disabled={busy} onPress={() => setOfferingItem(null)} style={{ flex: 1 }} />
                                </View>
                            </View>
                        </ThemedCard>}
                        <View style={{ flexDirection: phone ? 'column' : 'row', gap: 10 }}>
                            <TextInput value={search} onChangeText={setSearch} placeholder="Search brand, model, category, or SKU" placeholderTextColor={theme.colors.mutedText} style={{ flex: 1, minHeight: 52, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, color: textColor }} />
                            {canManage && items.length > 0 && <ThemedButton title="Create Catalog Card" onPress={() => { setSaveFeedback(''); setDraft(emptyCompanyCatalogDraft()); }} />}
                        </View>
                        <ThemedCard>
                            <View style={{ gap: 12 }}>
                                <Text style={{ color: textColor, fontSize: scaleFont(21), fontWeight: '900' }}>Company Catalog · Company Offerings</Text>
                                <Text style={{ color: mutedColor, lineHeight: scaleFont(21) }}>These master products already have company-specific offering records. Pricing and activation are managed here.</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(12), alignItems: 'stretch' }}>
                                    {visibleCompanyOfferings.map((item) => <CompactMasterCatalogCard
                                        key={item.id}
                                        item={item}
                                        phone={phone}
                                        includedInDraftPackage={entitlementDraft?.packageTier === 'full' || selectedPackageIds.has(item.id)}
                                        packageSelectionAvailable={isPlatformAdmin && selectedPackageLimit !== null}
                                        canManagePricing={canManagePricing}
                                        onShowDetails={() => setMasterDetailItem(item)}
                                        onTogglePackage={() => togglePackageCard(item.id)}
                                        onBeginOffering={() => beginOffering(item)}
                                    />)}
                                    {!visibleCompanyOfferings.length && <Text style={{ color: mutedColor }}>{companyOfferings.length ? 'No company offerings match this search.' : 'No master products have company offering records yet.'}</Text>}
                                </View>
                            </View>
                        </ThemedCard>
                        <ThemedCard>
                            <View style={{ gap: 12 }}>
                                <Text style={{ color: textColor, fontSize: scaleFont(21), fontWeight: '900' }}>Add Products from Master Catalog</Text>
                                <Text style={{ color: mutedColor, lineHeight: scaleFont(21) }}>Only approved products not yet added for this company appear here. Adding one creates a company offering; it does not alter the master product.</Text>
                                <ThemedButton title={showMasterCatalog ? 'Hide Available Master Products' : `Browse Available Master Products (${availableMasterProducts.length})`} variant="secondary" onPress={() => setShowMasterCatalog((value) => !value)} />
                                {showMasterCatalog && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(12), alignItems: 'stretch' }}>
                                    {visibleAvailableMasterProducts.map((item) => <CompactMasterCatalogCard
                                        key={item.id}
                                        item={item}
                                        phone={phone}
                                        includedInDraftPackage={entitlementDraft?.packageTier === 'full' || selectedPackageIds.has(item.id)}
                                        packageSelectionAvailable={isPlatformAdmin && selectedPackageLimit !== null}
                                        canManagePricing={canManagePricing}
                                        onShowDetails={() => setMasterDetailItem(item)}
                                        onTogglePackage={() => togglePackageCard(item.id)}
                                        onBeginOffering={() => beginOffering(item)}
                                    />)}
                                    {!visibleAvailableMasterProducts.length && <Text style={{ color: mutedColor }}>{availableMasterProducts.length ? 'No available master products match this search.' : 'Every approved master product already has a company offering.'}</Text>}
                                </View>}
                            </View>
                        </ThemedCard>
                        <View style={{ gap: 14 }}>
                            {!!visibleCompanyOnlyItems.length && <Text style={{ color: textColor, fontSize: scaleFont(21), fontWeight: '900' }}>Company-only Products</Text>}
                            {visibleCompanyOnlyItems.map((item) => {
                                const photo = item.files.find((file) => file.kind === 'photo');
                                const cardImageUrl = resolveCompanyCatalogCardImageUrl(
                                    photo ? photoUrls[photo.id] : null,
                                    item.masterPrimaryImageUrl,
                                );
                                return (
                                    <ThemedCard key={item.id}>
                                        <View style={{ flexDirection: phone ? 'column' : 'row', gap: 16 }}>
                                            <ProductCardImage
                                                imageUrl={cardImageUrl}
                                                productName={item.productName}
                                                style={{ width: phone ? '100%' : 180, height: 150 }}
                                            />
                                            <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                                                    <Text style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(20), flexShrink: 1 }}>{item.productName}</Text>
                                                    <Pill label={statusLabel(item.status)} selected={item.status === 'approved'} />
                                                </View>
                                                <Text style={{ color: mutedColor }}>{item.category} · {item.brand} · Model {item.model}</Text>
                                                {!!item.manufacturerPartNumber && <Text style={{ color: mutedColor }}>Part {item.manufacturerPartNumber}</Text>}
                                                <Text style={{ color: mutedColor }}>{item.files.filter((file) => file.kind === 'photo').length} photos · {item.files.filter((file) => file.kind !== 'photo').length} documents</Text>
                                                {!!item.priceBookItemName && <Text style={{ color: mutedColor }}>Price Book: {item.priceBookItemName}</Text>}
                                                <Text style={{ color: item.entitled ? theme.colors.primary : mutedColor, fontWeight: '800' }}>
                                                    {item.entitled ? 'Available in this company package' : 'Preserved but not available in this company package'}
                                                </Text>
                                                <View style={{ flexDirection: phone ? 'column' : 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                                                    {canManage && <ThemedButton title="Edit Card" variant="secondary" onPress={() => editItem(item)} style={{ flexGrow: 1 }} />}
                                                    {item.status === 'approved' && item.entitled && entitlement?.active && <ThemedButton title="Add to Quote" onPress={() => router.push({ pathname: '/estimate', params: { companyId, catalogItemId: item.id, mode: 'management' } } as never)} style={{ flexGrow: 1 }} />}
                                                </View>
                                            </View>
                                        </View>
                                    </ThemedCard>
                                );
                            })}
                            {!visibleCompanyOnlyItems.length && items.some((item) => !item.masterProductVariantId) && <Text style={{ color: mutedColor }}>No company-only cards match this search.</Text>}
                            {!items.length && canManage && (
                                <ThemedCard>
                                    <View style={{ gap: 12 }}>
                                        <Text style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(20) }}>Create your first catalog card</Text>
                                        <Text style={{ color: mutedColor, lineHeight: scaleFont(21) }}>
                                            Add the product name, category, brand, model, photos, manuals, warranty details, and an optional Price Book service link.
                                        </Text>
                                        <ThemedButton title="Create Catalog Card" onPress={() => { setSaveFeedback(''); setResearchResult(null); setDraft(emptyCompanyCatalogDraft()); }} />
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
                                <View style={{ flex: 1 }}><Field label="Category *" value={draft.category} onChangeText={(category) => updateIdentity({ category })} placeholder="Shower Valve" /></View>
                                <View style={{ flex: 1 }}><Field label="Brand *" value={draft.brand} onChangeText={(brand) => updateIdentity({ brand })} placeholder="Moen" /></View>
                                <View style={{ flex: 1 }}><Field label="Model *" value={draft.model} onChangeText={(model) => updateIdentity({ model })} placeholder="Exact model number" /></View>
                            </View>
                            <View style={{ flexDirection: phone ? 'column' : 'row', gap: 12 }}>
                                <View style={{ flex: 1 }}><Field label="Manufacturer part number" value={draft.manufacturerPartNumber} onChangeText={(manufacturerPartNumber) => updateIdentity({ manufacturerPartNumber })} /></View>
                                <View style={{ flex: 1 }}><Field label="SKU" value={draft.sku} onChangeText={(sku) => setDraft({ ...draft, sku })} /></View>
                            </View>
                            <View style={{ gap: 10, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, padding: 13, backgroundColor: theme.colors.surface }}>
                                <Text selectable style={{ color: textColor, fontWeight: '900', fontSize: scaleFont(18) }}>Automatic manufacturer research</Text>
                                <Text selectable style={{ color: mutedColor, lineHeight: scaleFont(20) }}>
                                    Enter the category, brand, and exact model or part number. HomeOS searches current manufacturer product pages, manuals, specifications, and warranty sources, then lets you review before anything is added.
                                </Text>
                                <ThemedButton
                                    title={researching ? 'Researching Manufacturer...' : 'Research Manufacturer & Fill Details'}
                                    disabled={researching || !draft.category.trim() || !draft.brand.trim() || (!draft.model.trim() && !draft.manufacturerPartNumber.trim())}
                                    onPress={() => void researchManufacturer()}
                                />
                            </View>
                            {researchResult && (
                                <CatalogResearchReview
                                    research={researchResult}
                                    onApply={applyResearch}
                                    onClear={() => setResearchResult(null)}
                                />
                            )}
                            <Field label="Homeowner description" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} multiline />
                            <ChoiceRow label="Card status" values={['draft', 'approved', 'archived'] as CompanyCatalogStatus[]} selected={draft.status} onSelect={(status) => setDraft({ ...draft, status })} />
                            <ChoiceRow label="Product tier" values={['Essential', 'Professional', 'Premium'] as CompanyCatalogTier[]} selected={draft.tier} onSelect={(tier) => setDraft({ ...draft, tier })} />
                            {canManagePricing ? <View style={{ gap: 7 }}>
                                <Text style={{ color: textColor, fontWeight: '800' }}>Optional linked Price Book service</Text>
                                <Text style={{ color: mutedColor }}>The product card supplies model, media, manuals, and warranty. The linked service supplies labor, scope, and company pricing.</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                    <Pill label="No link" selected={!draft.priceBookItemId} onPress={() => setDraft({ ...draft, priceBookItemId: null })} />
                                    {priceBookItems.slice(0, 40).map((item) => <Pill key={item.id} label={item.name} selected={draft.priceBookItemId === item.id} onPress={() => setDraft({ ...draft, priceBookItemId: item.id })} />)}
                                </View>
                            </View> : (
                                <View style={{ gap: 5, padding: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12 }}>
                                    <Text style={{ color: textColor, fontWeight: '900' }}>Product details access</Text>
                                    <Text style={{ color: mutedColor, lineHeight: scaleFont(20) }}>
                                        You can create and edit catalog cards. Company prices and Price Book links remain unchanged and require pricing permission.
                                    </Text>
                                </View>
                            )}
                            {canManagePricing && <View style={{ flexDirection: phone ? 'column' : 'row', gap: 12 }}>
                                <View style={{ flex: 1 }}><NumberField label="Approved product price (optional)" value={draft.approvedSellingPrice} onChange={(approvedSellingPrice) => setDraft({ ...draft, approvedSellingPrice })} /></View>
                                <View style={{ flex: 1 }}><NumberField label="Minimum price (optional)" value={draft.minimumSellingPrice} onChange={(minimumSellingPrice) => setDraft({ ...draft, minimumSellingPrice })} /></View>
                                <View style={{ flex: 1 }}><NumberField label="Maximum price (optional)" value={draft.maximumSellingPrice} onChange={(maximumSellingPrice) => setDraft({ ...draft, maximumSellingPrice })} /></View>
                            </View>}
                            <PlumbingCatalogSuggestionsPanel
                                draft={draft}
                                onChange={(patch) => setDraft({ ...draft, ...patch })}
                            />
                            <Field label="Specifications (one Key: Value per line)" value={specificationsText(draft.specifications)} onChangeText={(value) => setDraft({ ...draft, specifications: parseSpecifications(value) })} multiline />
                            <Field label="Compatible parts & applications (comma separated)" value={draft.compatibleApplications.join(', ')} onChangeText={(value) => setDraft({ ...draft, compatibleApplications: parseList(value) })} multiline />
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
                                    <View key={file.id} style={{ padding: 12, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 10, gap: 9 }}>
                                        <TouchableOpacity onPress={() => void openFile(editingItem, file.id)} style={{ gap: 3 }}>
                                            <Text style={{ color: textColor, fontWeight: '800' }}>{fileKindLabel(file.kind)} · {file.fileName}</Text>
                                            <Text style={{ color: mutedColor }}>Tap to open securely</Text>
                                        </TouchableOpacity>
                                        <View style={{ flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'stretch' : 'center', justifyContent: 'space-between', gap: 8 }}>
                                            <Text style={{ color: file.homeownerVisible ? theme.colors.primary : mutedColor, fontWeight: '800', flex: 1 }}>
                                                {file.homeownerVisible ? 'Visible in linked HomeOS product details' : 'Company-only file'}
                                            </Text>
                                            <ThemedButton
                                                title={file.homeownerVisible ? 'Make Company-Only' : 'Show in HomeOS'}
                                                variant="secondary"
                                                disabled={busy}
                                                onPress={() => void toggleHomeownerVisibility(editingItem, file.id)}
                                            />
                                        </View>
                                    </View>
                                ))}</View>}
                            </View>
                            <View style={{ flexDirection: phone ? 'column' : 'row', gap: 10 }}>
                                <ThemedButton title={busy ? 'Saving...' : researching ? 'Finish Research Before Saving' : 'Save Catalog Card'} disabled={busy || researching} onPress={() => void saveDraft()} style={{ flex: 1 }} />
                                <ThemedButton title="Back to Catalog" variant="secondary" disabled={busy || researching} onPress={() => { setResearchResult(null); setDraft(null); }} style={{ flex: 1 }} />
                            </View>
                            <View
                                accessibilityLiveRegion="polite"
                                style={{
                                    borderWidth: 1,
                                    borderColor: saveFeedback ? theme.colors.primary : theme.colors.border,
                                    borderRadius: 12,
                                    backgroundColor: theme.colors.surface,
                                    padding: 12,
                                }}
                            >
                                <Text selectable style={{ color: saveFeedback ? textColor : mutedColor, fontWeight: saveFeedback ? '800' : '600', lineHeight: scaleFont(20) }}>
                                    {saveFeedback || validateCompanyCatalogDraft(draft) || 'Required fields are complete. Tap Save Catalog Card to continue.'}
                                </Text>
                            </View>
                        </View>
                    </ThemedCard>
                )}
            </ScrollView>
            <MasterCatalogProductDetailsModal
                item={masterDetailItem}
                includedInDraftPackage={masterDetailIncludedInDraftPackage}
                onClose={() => setMasterDetailItem(null)}
            />
        </View>
    );
}

function Field({ label, value, onChangeText, placeholder = '', multiline = false }: { label: string; value: string; onChangeText: (value: string) => void; placeholder?: string; multiline?: boolean }) {
    const { scaleFont, theme } = useTheme();
    return <View style={{ gap: 6 }}><Text style={{ color: theme.colors.text, fontWeight: '800' }}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.colors.mutedText} multiline={multiline} style={{ minHeight: multiline ? 92 : 50, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, padding: 12, color: theme.colors.text, fontSize: scaleFont(15), textAlignVertical: multiline ? 'top' : 'center' }} /></View>;
}

function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
    return <Field label={label} value={value === null ? '' : String(value)} onChangeText={(textValue) => { const parsed = Number(textValue); onChange(textValue.trim() && Number.isFinite(parsed) ? parsed : null); }} placeholder="0.00" />;
}

function MarkupModeDropdown({ value, onChange }: { value: CompanyCatalogOffering['markupMode']; onChange: (value: CompanyCatalogOffering['markupMode']) => void }) {
    const { theme } = useTheme();
    const [open, setOpen] = useState(false);
    const options: { value: CompanyCatalogOffering['markupMode']; label: string }[] = [
        { value: 'amount', label: 'Dollar amount ($)' },
        { value: 'percent', label: 'Percent (%)' },
    ];
    return <View style={{ gap: 6 }}>
        <Text style={{ color: theme.colors.text, fontWeight: '800' }}>Markup mode</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Markup mode, ${options.find((option) => option.value === value)?.label}`} accessibilityState={{ expanded: open }} onPress={() => setOpen((current) => !current)} style={{ minHeight: 50, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, backgroundColor: theme.colors.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '800' }}>{options.find((option) => option.value === value)?.label}</Text>
            <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>{open ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {open && <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.colors.surface }}>
            {options.map((option) => <TouchableOpacity key={option.value} accessibilityRole="button" accessibilityState={{ selected: option.value === value }} onPress={() => { onChange(option.value); setOpen(false); }} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 12, borderTopWidth: option.value === 'percent' ? 1 : 0, borderTopColor: theme.colors.border, backgroundColor: option.value === value ? theme.colors.surfaceAlt : theme.colors.surface }}>
                <Text style={{ color: theme.colors.text, fontWeight: option.value === value ? '900' : '700' }}>{option.label}</Text>
            </TouchableOpacity>)}
        </View>}
    </View>;
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
    const {
        companyId: _companyId,
        priceBookItemName: _priceBookItemName,
        masterPrimaryImageUrl: _masterPrimaryImageUrl,
        masterProductVariantId: _masterProductVariantId,
        entitled: _entitled,
        files: _files,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...draft
    } = item;
    return draft;
}
function emptyOffering(): CompanyCatalogOffering {
    return { materialCost: null, markup: null, markupMode: 'amount', laborHours: null, laborAmount: null, minimumPrice: null, preferredSupplier: '', companyWarranty: '', active: true };
}
function masterMatchesSearch(item: ApprovedMasterCatalogItem, normalizedSearch: string) {
    return !normalizedSearch || [item.shortCode, item.category, item.manufacturer, item.brand, item.familyName, item.modelNumber, item.manufacturerPartNumber, item.upcGtin]
        .join(' ').toLowerCase().includes(normalizedSearch);
}
function money(value: number | null) {
    if (value === null || !Number.isFinite(value)) return 'Not set';
    return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}
function firstParam(value?: string | string[]) { return Array.isArray(value) ? value[0] || '' : value || ''; }
function statusLabel(value: string) { return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function fileKindLabel(kind: CompanyCatalogFileKind) { return ({ photo: 'Photo', manual: 'Manual', warranty: 'Warranty', specification: 'Specification', document: 'Document' } as const)[kind]; }
function parseList(value: string) { return Array.from(new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))); }
function parseLines(value: string) { return Array.from(new Set(value.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean))); }
function parseSpecifications(value: string) { return value.split(/\r?\n/).reduce<Record<string, string>>((result, line) => { const separator = line.indexOf(':'); if (separator > 0) { const key = line.slice(0, separator).trim(); const entry = line.slice(separator + 1).trim(); if (key && entry) result[key] = entry; } return result; }, {}); }
function specificationsText(value: Record<string, string>) { return Object.entries(value).map(([key, entry]) => `${key}: ${entry}`).join('\n'); }
function errorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
    if (typeof error === 'string' && error.trim()) return error.trim();
    return 'Catalog action failed. Check the required fields and try again.';
}
