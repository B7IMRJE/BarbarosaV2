import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
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

type HomeItemCatalogPickerProps = HomeItemCatalogRouteContext & {
    active: boolean;
    itemContext: HomeItemCatalogContext;
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
    quoteAuthorized,
    quotePermissionMessage,
    onOpenQuote,
}: HomeItemCatalogPickerProps) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [items, setItems] = useState<ApprovedMasterCatalogItem[]>([]);
    const [proposals, setProposals] = useState<HomeItemCatalogProposal[]>([]);
    const [selectedItem, setSelectedItem] = useState<ApprovedMasterCatalogItem | null>(null);
    const [loading, setLoading] = useState(false);
    const [addingVariantId, setAddingVariantId] = useState('');
    const [message, setMessage] = useState('');
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
    const starterTemplateKey = starterTemplate?.templateKey || '';

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
                setItems(filterCatalogItemsForHomeItem(catalogItems, {
                    name: itemName,
                    system: itemSystem,
                    category: itemCategory,
                    location: itemLocation,
                    parentArea: itemParentArea,
                }, {
                    mappedVariantIds,
                    requireMappedVariants: Boolean(starterTemplateKey),
                }));
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

    const selectedProposal = selectedItem
        ? proposals.find((proposal) => proposal.productVariantId === selectedItem.id && proposal.status === 'proposed') || null
        : null;
    const selectedEligibility = selectedItem
        ? quoteEligibility(selectedItem, quoteAuthorized, quotePermissionMessage)
        : { allowed: false, message: '' };

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
            setMessage(`${result.proposal.productName} was added to ${result.proposal.quoteNumber || 'the quote'} as a proposed product.`);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setAddingVariantId('');
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
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
                        {items.map((item) => {
                            const productName = catalogProductName(item);
                            return (
                                <ThemedCard key={item.id} style={{ width: '47%', minWidth: scaleIcon(180), maxWidth: scaleIcon(250), minHeight: scaleIcon(214), padding: scaleIcon(12), borderWidth: 2, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'space-between', gap: scaleIcon(8) }}>
                                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Open ${productName} product details`} activeOpacity={0.82} onPress={() => setSelectedItem(item)} style={{ width: '100%', alignItems: 'center', gap: scaleIcon(7) }}>
                                        <ProductCardImage imageUrl={item.primaryImageUrl} productName={productName} compact style={{ width: scaleIcon(68), height: scaleIcon(68), minHeight: scaleIcon(68) }} />
                                        <Text selectable numberOfLines={2} style={{ color: theme.colors.text, fontSize: scaleFont(15), lineHeight: scaleFont(19), fontWeight: '900', textAlign: 'center' }}>{productName}</Text>
                                        <Text selectable numberOfLines={2} style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(16), fontWeight: '800', textAlign: 'center' }}>
                                            {[item.brand, item.modelNumber, item.category].filter(Boolean).join(' · ')}
                                        </Text>
                                    </TouchableOpacity>
                                    <ThemedButton title="Details" variant="secondary" onPress={() => setSelectedItem(item)} style={{ minHeight: scaleIcon(42), width: '100%' }} textStyle={{ fontSize: scaleFont(13) }} />
                                </ThemedCard>
                            );
                        })}
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
                        : addingVariantId === selectedItem.id ? 'Adding to Quote...' : 'Add to Quote',
                    disabled: selectedProposal ? false : !selectedEligibility.allowed || Boolean(addingVariantId),
                    message: selectedProposal
                        ? `${selectedProposal.productName} is proposed in ${selectedProposal.quoteNumber || 'the quote'}. Installed HomeOS facts will not change until completed job closeout.`
                        : selectedEligibility.message,
                    onPress: selectedProposal
                        ? () => onOpenQuote(selectedProposal)
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
            message: quotePermissionMessage || 'This work account is not authorized to create estimates for this company.',
        };
    }
    if (!item.offering?.active || !item.offering.companyCatalogProductId) {
        return { allowed: false, message: 'This catalog item does not have an active company offering.' };
    }
    if (item.offering.installedPrice === null || item.offering.installedPrice < 0) {
        return { allowed: false, message: 'Management must add an installed price before this product can be added to a quote.' };
    }
    return {
        allowed: true,
        message: 'Adds this product as a proposed quote option. The installed HomeOS item will not change at quote time.',
    };
}

function errorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === 'object' && 'message' in error) return String(error.message || 'Catalog items could not be loaded.');
    return 'Catalog items could not be loaded.';
}
