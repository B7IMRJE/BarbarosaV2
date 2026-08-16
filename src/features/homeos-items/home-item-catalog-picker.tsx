import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import CompactCatalogProductTile from '../../components/catalog/compact-catalog-product-tile';
import ProductCardImage from '../../components/catalog/product-card-image';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { MasterCatalogProductDetailsModal } from '../company-management/master-catalog-product-card';
import {
    loadApprovedMasterCatalogForCompany,
    type ApprovedMasterCatalogItem,
} from '../../lib/catalogFactory';
import {
    addHomeItemCatalogProductToQuote,
    addHomeItemCatalogProductsToQuote,
    catalogProductName,
    estimateCategoryForHomeItemCatalog,
    filterCatalogItemsForHomeItem,
    loadHomeItemCatalogProposals,
    type HomeItemCatalogContext,
    type HomeItemCatalogProposal,
    type HomeItemCatalogRouteContext,
} from '../../lib/home-item-catalog';
import { useTheme } from '../../theme/useTheme';
import { loadCompanyHomeOSStarterCatalogVariantIds } from '../../lib/homeosStarterCatalog';
import { resolveCompleteRoomStarterTemplate } from '../../lib/roomStarterTemplates';
import { loadCurrentCompanyPermissionAccess } from '../../lib/companyPermissions';
import { loadCurrentUserPlatformAdmin } from '../../lib/roles';
import { companyCatalogPricingRoute } from '../../lib/companyCatalogPricingNavigation';

type HomeItemCatalogPickerProps = HomeItemCatalogRouteContext & {
    active: boolean;
    itemContext: HomeItemCatalogContext;
    starterTemplateKey?: string | null;
    quoteAuthorized: boolean;
    quotePermissionMessage: string;
    onOpenQuote: (proposal: HomeItemCatalogProposal) => void;
};

export default function HomeItemCatalogPicker({
    active,
    companyId,
    propertyId,
    homeItemId,
    serviceRequestId,
    scheduleSlotId,
    jobId,
    itemContext,
    starterTemplateKey: persistedStarterTemplateKey,
    quoteAuthorized,
    quotePermissionMessage,
    onOpenQuote,
}: HomeItemCatalogPickerProps) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [items, setItems] = useState<ApprovedMasterCatalogItem[]>([]);
    const [proposals, setProposals] = useState<HomeItemCatalogProposal[]>([]);
    const [selectedItem, setSelectedItem] = useState<ApprovedMasterCatalogItem | null>(null);
    const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [addingVariantId, setAddingVariantId] = useState('');
    const [addingSelected, setAddingSelected] = useState(false);
    const [message, setMessage] = useState('');
    const [canManageCompanyPricing, setCanManageCompanyPricing] = useState(false);
    const itemName = itemContext.name;
    const itemSystem = itemContext.system;
    const itemCategory = itemContext.category;
    const itemLocation = itemContext.location;
    const itemParentArea = itemContext.parentArea;
    const starterTemplate = resolveCompleteRoomStarterTemplate({
        name: itemName,
        location: itemLocation,
        parentArea: itemParentArea,
    });
    const starterTemplateKey = String(persistedStarterTemplateKey || '').trim() || starterTemplate?.templateKey || '';

    useEffect(() => {
        let current = true;

        if (!active || !companyId || !propertyId || !homeItemId) return () => { current = false; };

        setLoading(true);
        setMessage('');
        const routeContext = { companyId, propertyId, homeItemId, serviceRequestId, scheduleSlotId, jobId };
        void Promise.all([
            loadApprovedMasterCatalogForCompany(companyId),
            quoteAuthorized ? loadHomeItemCatalogProposals(routeContext) : Promise.resolve([]),
            starterTemplateKey
                ? loadCompanyHomeOSStarterCatalogVariantIds(companyId, starterTemplateKey)
                : Promise.resolve([]),
        ])
            .then(([catalogItems, catalogProposals, mappedVariantIds]) => {
                if (!current) return;
                const nextItems = filterCatalogItemsForHomeItem(catalogItems, {
                    name: itemName,
                    system: itemSystem,
                    category: itemCategory,
                    location: itemLocation,
                    parentArea: itemParentArea,
                }, {
                    mappedVariantIds,
                    requireMappedVariants: Boolean(starterTemplateKey),
                });
                setItems(nextItems);
                setSelectedVariantIds((current) => current.filter((id) => nextItems.some((item) => item.id === id)));
                setProposals(catalogProposals);
            })
            .catch((error) => {
                if (!current) return;
                setItems([]);
                setProposals([]);
                setMessage(errorMessage(error));
            })
            .finally(() => {
                if (current) setLoading(false);
            });

        return () => { current = false; };
    }, [
        active,
        companyId,
        propertyId,
        homeItemId,
        serviceRequestId,
        scheduleSlotId,
        jobId,
        quoteAuthorized,
        itemName,
        itemSystem,
        itemCategory,
        itemLocation,
        itemParentArea,
        starterTemplateKey,
    ]);

    useEffect(() => {
        let current = true;

        if (!active || !companyId) {
            setCanManageCompanyPricing(false);
            return () => { current = false; };
        }

        void Promise.all([
            loadCurrentUserPlatformAdmin(),
            loadCurrentCompanyPermissionAccess('can_manage_price_book', { companyId }),
        ])
            .then(([isPlatformAdmin, permission]) => {
                if (current) setCanManageCompanyPricing(isPlatformAdmin || Boolean(permission.access));
            })
            .catch(() => {
                if (current) setCanManageCompanyPricing(false);
            });

        return () => { current = false; };
    }, [active, companyId]);

    const selectedProposal = selectedItem
        ? proposals.find((proposal) => proposal.productVariantId === selectedItem.id && proposal.status === 'proposed') || null
        : null;
    const selectedEligibility = selectedItem
        ? quoteEligibility(selectedItem, quoteAuthorized, quotePermissionMessage)
        : { allowed: false, reason: 'not_selected' as const, message: '' };
    const selectedNeedsCompanyPricing = selectedItem ? companyPricingRequired(selectedItem) : false;
    const selectedItems = items.filter((item) => selectedVariantIds.includes(item.id));
    const selectedItemsToAdd = selectedItems.filter((item) => !proposals.some((proposal) => proposal.productVariantId === item.id && proposal.status === 'proposed'));
    const selectedBatchBlocked = selectedItemsToAdd.find((item) => !quoteEligibility(item, quoteAuthorized, quotePermissionMessage).allowed);
    const selectedBatchBlockedEligibility = selectedBatchBlocked
        ? quoteEligibility(selectedBatchBlocked, quoteAuthorized, quotePermissionMessage)
        : null;
    const selectedBatchNeedsCompanyPricing = selectedBatchBlocked
        ? companyPricingRequired(selectedBatchBlocked)
        : false;

    function openCompanyPricing(item: ApprovedMasterCatalogItem) {
        router.push(companyCatalogPricingRoute(companyId, item.id) as never);
    }

    async function addSelectedProductToQuote() {
        if (!selectedItem || !selectedEligibility.allowed || addingVariantId) return;

        setAddingVariantId(selectedItem.id);
        setMessage('Adding the proposed product to the quote...');
        try {
            const result = await addHomeItemCatalogProductToQuote({
                companyId,
                propertyId,
                homeItemId,
                serviceRequestId,
                scheduleSlotId,
                jobId,
                productVariantId: selectedItem.id,
                estimateCategory: estimateCategoryForHomeItemCatalog(itemContext, selectedItem),
                source: 'provider_mode',
            });
            setProposals((current) => [
                result.proposal,
                ...current.filter((proposal) => proposal.id !== result.proposal.id),
            ]);
            setSelectedVariantIds((current) => current.filter((id) => id !== selectedItem.id));
            setMessage(`${result.proposal.productName} was added to ${result.proposal.quoteNumber || 'the quote'} as a proposed product.`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setAddingVariantId('');
        }
    }

    async function addSelectedProductsToQuote() {
        if (!selectedItemsToAdd.length || selectedBatchBlocked || addingSelected || addingVariantId) return;
        setAddingSelected(true);
        setMessage(`Adding ${selectedItemsToAdd.length} selected product option${selectedItemsToAdd.length === 1 ? '' : 's'} to the quote...`);
        try {
            const results = await addHomeItemCatalogProductsToQuote({
                companyId,
                propertyId,
                homeItemId,
                serviceRequestId,
                scheduleSlotId,
                jobId,
                products: selectedItemsToAdd.map((item) => ({
                    productVariantId: item.id,
                    estimateCategory: estimateCategoryForHomeItemCatalog(itemContext, item),
                })),
                source: 'provider_mode',
            });
            const nextProposals = results.map((result) => result.proposal);
            setProposals((current) => [
                ...nextProposals,
                ...current.filter((proposal) => !nextProposals.some((candidate) => candidate.id === proposal.id)),
            ]);
            setSelectedVariantIds([]);
            setMessage(`${nextProposals.length} product option${nextProposals.length === 1 ? '' : 's'} added atomically to ${nextProposals[0]?.quoteNumber || 'the quote'} as proposed choices. The installed HomeOS item remains unchanged until completed job closeout.`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setAddingSelected(false);
        }
    }

    return (
        <>
            <ThemedCard style={{ borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, padding: scaleIcon(14), gap: scaleIcon(12) }}>
                <View style={{ gap: scaleIcon(4) }}>
                    <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900' }}>
                        Matching company catalog
                    </Text>
                    <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(19), fontWeight: '700' }}>
                        {starterTemplateKey
                            ? 'These are the real product options mapped to this starter card and included in the company’s active catalog package. Product references do not include service history.'
                            : 'Products are filtered to this item and the company’s active catalog package. Product references do not include service history.'}
                    </Text>
                </View>

                {proposals.length > 0 && (
                    <View style={{ gap: scaleIcon(8) }}>
                        <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '900' }}>
                            Proposed in quote
                        </Text>
                        {proposals.filter((proposal) => proposal.status === 'proposed').map((proposal) => (
                            <View key={proposal.id} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: scaleIcon(10), borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, borderCurve: 'continuous', padding: scaleIcon(10), backgroundColor: theme.colors.surfaceAlt }}>
                                <ProductCardImage imageUrl={proposal.primaryImageUrl} productName={proposal.productName} compact style={{ width: scaleIcon(54), height: scaleIcon(54), minHeight: scaleIcon(54) }} />
                                <View style={{ flex: 1, minWidth: scaleIcon(150), gap: scaleIcon(2) }}>
                                    <Text selectable numberOfLines={2} style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900' }}>{proposal.productName}</Text>
                                    <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800' }}>{proposal.quoteNumber || 'Quote draft'} · Proposed only</Text>
                                </View>
                                <ThemedButton title="Open Quote" variant="secondary" onPress={() => onOpenQuote(proposal)} style={{ minHeight: scaleIcon(42), minWidth: scaleIcon(112) }} textStyle={{ fontSize: scaleFont(13) }} />
                            </View>
                        ))}
                    </View>
                )}

                {loading ? (
                    <View style={{ minHeight: scaleIcon(120), alignItems: 'center', justifyContent: 'center', gap: scaleIcon(8) }}>
                        <ActivityIndicator color={theme.colors.primary} />
                        <Text selectable style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading matching catalog items...</Text>
                    </View>
                ) : items.length === 0 ? (
                    <View style={{ minHeight: scaleIcon(110), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: theme.colors.border, borderRadius: 12, borderCurve: 'continuous', padding: scaleIcon(16) }}>
                        <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(16), lineHeight: scaleFont(22), fontWeight: '900', textAlign: 'center' }}>
                            No matching catalog items available
                        </Text>
                    </View>
                ) : (
                    <View style={{ gap: scaleIcon(10) }}>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: scaleIcon(8) }}>
                            <Text selectable style={{ flex: 1, minWidth: scaleIcon(170), color: theme.colors.text, fontSize: scaleFont(14), lineHeight: scaleFont(19), fontWeight: '800' }}>
                                Select one or more product choices, then add them as separate proposed quote options. Tap a tile to read details.
                            </Text>
                            <ThemedButton
                                title={addingSelected ? 'Adding Selected...' : `Add Selected to Quote (${selectedItemsToAdd.length})`}
                                disabled={!selectedItemsToAdd.length || Boolean(selectedBatchBlocked) || addingSelected || Boolean(addingVariantId)}
                                onPress={() => void addSelectedProductsToQuote()}
                                style={{ minHeight: scaleIcon(46), minWidth: scaleIcon(190) }}
                                textStyle={{ fontSize: scaleFont(13) }}
                            />
                        </View>
                        {!!selectedBatchBlocked && selectedBatchBlockedEligibility && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: scaleIcon(8) }}>
                                <Text selectable style={{ flex: 1, minWidth: scaleIcon(180), color: theme.colors.danger, fontSize: scaleFont(13), fontWeight: '800' }}>
                                    {selectedBatchBlockedEligibility.message}
                                </Text>
                                {canManageCompanyPricing && selectedBatchNeedsCompanyPricing && (
                                    <ThemedButton
                                        title="Set Company Pricing"
                                        variant="secondary"
                                        onPress={() => openCompanyPricing(selectedBatchBlocked)}
                                        style={{ minHeight: scaleIcon(44), minWidth: scaleIcon(160) }}
                                        textStyle={{ fontSize: scaleFont(13) }}
                                    />
                                )}
                            </View>
                        )}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), alignItems: 'stretch' }}>
                        {items.map((item) => {
                            const productName = catalogProductName(item);
                            const proposed = proposals.some((proposal) => proposal.productVariantId === item.id && proposal.status === 'proposed');
                            const selected = selectedVariantIds.includes(item.id);
                            return (
                                <CompactCatalogProductTile
                                    key={item.id}
                                    shortCode={item.shortCode}
                                    imageUrl={item.primaryImageUrl}
                                    productName={productName}
                                    model={item.modelNumber ? `Model ${item.modelNumber}` : ''}
                                    identity={[item.brand, item.category].filter(Boolean).join(' · ')}
                                    selected={selected}
                                    disabled={addingSelected || Boolean(addingVariantId)}
                                    onOpen={() => setSelectedItem(item)}
                                    primaryAction={{
                                        title: proposed ? 'In Quote' : selected ? 'Selected' : 'Select',
                                        selected,
                                        disabled: proposed,
                                        onPress: () => setSelectedVariantIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]),
                                    }}
                                    secondaryAction={{ title: 'Details', onPress: () => setSelectedItem(item) }}
                                />
                            );
                        })}
                        </View>
                    </View>
                )}

                {!!message && (
                    <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(18), fontWeight: '800' }}>
                        {message}
                    </Text>
                )}
            </ThemedCard>

            <MasterCatalogProductDetailsModal
                item={selectedItem}
                includedInDraftPackage={false}
                onClose={() => setSelectedItem(null)}
                primaryAction={selectedItem ? {
                    title: selectedProposal
                        ? 'Open Quote'
                        : canManageCompanyPricing && selectedNeedsCompanyPricing
                            ? 'Set Company Pricing'
                        : addingVariantId === selectedItem.id ? 'Adding to Quote...' : 'Add to Quote',
                    disabled: selectedProposal
                        ? false
                        : canManageCompanyPricing && selectedNeedsCompanyPricing
                            ? false
                            : !selectedEligibility.allowed || Boolean(addingVariantId),
                    message: selectedProposal
                        ? `${selectedProposal.productName} is proposed in ${selectedProposal.quoteNumber || 'the quote'}. Installed HomeOS facts will not change until completed job closeout.`
                        : canManageCompanyPricing && selectedNeedsCompanyPricing
                            ? 'Open this company offering to add private company cost, labor, and installed price. Master product and HomeOS data will not change.'
                        : selectedEligibility.message,
                    onPress: selectedProposal
                        ? () => onOpenQuote(selectedProposal)
                        : canManageCompanyPricing && selectedNeedsCompanyPricing
                            ? () => openCompanyPricing(selectedItem)
                        : () => void addSelectedProductToQuote(),
                } : undefined}
            />
        </>
    );
}

function quoteEligibility(
    item: ApprovedMasterCatalogItem,
    quoteAuthorized: boolean,
    quotePermissionMessage: string,
) {
    if (!quoteAuthorized) {
        return {
            allowed: false,
            reason: 'not_authorized' as const,
            message: quotePermissionMessage || 'This work account is not authorized to create estimates for this company.',
        };
    }
    if (!item.offering?.active || !item.offering.companyCatalogProductId) {
        return { allowed: false, reason: 'inactive_offering' as const, message: 'This catalog item does not have an active company offering.' };
    }
    if (item.offering.installedPrice === null || item.offering.installedPrice < 0) {
        return { allowed: false, reason: 'missing_price' as const, message: 'Management must add an installed price before this product can be added to a quote.' };
    }
    return {
        allowed: true,
        reason: 'ready' as const,
        message: 'Adds this product as a proposed quote option. The installed HomeOS item will not change at quote time.',
    };
}

function companyPricingRequired(item: ApprovedMasterCatalogItem) {
    return (
        !item.offering?.active ||
        !item.offering.companyCatalogProductId ||
        item.offering.installedPrice === null ||
        item.offering.installedPrice < 0
    );
}

function errorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === 'object' && 'message' in error) return String(error.message || 'Catalog items could not be loaded.');
    return 'Catalog items could not be loaded.';
}
