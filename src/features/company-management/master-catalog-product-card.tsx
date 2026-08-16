import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ProductCardImage from '../../components/catalog/product-card-image';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    loadApprovedMasterCatalogDetail,
    type ApprovedMasterCatalogDetail,
    type ApprovedMasterCatalogItem,
    type ApprovedMasterCatalogReference,
} from '../../lib/catalogFactory';
import { catalogFieldLabel, catalogSpecificationDisplays } from '../../lib/catalogFactoryPresentation';
import { useTheme } from '../../theme/useTheme';

type CompactMasterCatalogCardProps = {
    item: ApprovedMasterCatalogItem;
    phone: boolean;
    includedInDraftPackage: boolean;
    packageSelectionAvailable: boolean;
    canManagePricing: boolean;
    onShowDetails: () => void;
    onTogglePackage: () => void;
    onBeginOffering: () => void;
};

export function CompactMasterCatalogCard({
    item,
    phone,
    includedInDraftPackage,
    packageSelectionAvailable,
    canManagePricing,
    onShowDetails,
    onTogglePackage,
    onBeginOffering,
}: CompactMasterCatalogCardProps) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const displayName = typeof item.specifications.product_name === 'string' ? item.specifications.product_name.trim() : '';
    const productName = displayName || [item.brand, item.familyName, item.modelNumber].filter(Boolean).join(' ') || 'Master product';
    const title = displayName || [item.brand, item.familyName].filter(Boolean).join(' ') || item.manufacturer || 'Master product';
    const modelSummary = item.modelNumber ? `Model ${item.modelNumber}` : 'Model not supplied';
    const packageLabel = item.entitled
        ? 'In company package'
        : includedInDraftPackage
            ? 'Pending package save'
            : 'Not in company package';

    return (
        <ThemedCard
            style={{
                width: phone ? '100%' : scaleIcon(320),
                minWidth: phone ? 0 : scaleIcon(280),
                maxWidth: phone ? '100%' : scaleIcon(360),
                flexBasis: phone ? '100%' : scaleIcon(280),
                flexGrow: 1,
                padding: scaleIcon(12),
                borderWidth: 2,
                borderColor: includedInDraftPackage ? theme.colors.primary : theme.colors.border,
                borderCurve: 'continuous',
            }}
        >
            <View style={{ flex: 1, gap: scaleIcon(10) }}>
                <View style={{ flexDirection: 'row', gap: scaleIcon(11), alignItems: 'center' }}>
                    <ProductCardImage
                        compact
                        imageUrl={item.primaryImageUrl}
                        productName={productName}
                        style={{ width: scaleIcon(72), height: scaleIcon(72), minHeight: scaleIcon(72), flexShrink: 0 }}
                    />
                    <View style={{ flex: 1, minWidth: 0, gap: scaleIcon(3) }}>
                        <Text
                            selectable
                            numberOfLines={2}
                            ellipsizeMode="tail"
                            style={{ color: theme.colors.text, fontSize: scaleFont(16), lineHeight: scaleFont(20), fontWeight: '900' }}
                        >
                            {title}
                        </Text>
                        <Text
                            selectable
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '800' }}
                        >
                            {modelSummary}
                        </Text>
                        <Text
                            selectable
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            style={{ color: theme.colors.mutedText, fontSize: scaleFont(12) }}
                        >
                            {[item.category, item.manufacturer].filter(Boolean).join(' · ')}
                        </Text>
                    </View>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(6) }}>
                    {!!item.shortCode && <CompactStatusBadge label={item.shortCode} highlighted />}
                    <CompactStatusBadge label={packageLabel} highlighted={item.entitled || includedInDraftPackage} />
                    <CompactStatusBadge
                        label={item.offering ? `Offering ${item.offering.active ? 'active' : 'inactive'}` : 'No company offering'}
                        highlighted={Boolean(item.offering?.active)}
                    />
                </View>

                <View style={{ gap: scaleIcon(7), marginTop: 'auto' }}>
                    <CompactActionButton title="Details / Advanced" variant="secondary" onPress={onShowDetails} />
                    {packageSelectionAvailable && (
                        <CompactActionButton
                            title={includedInDraftPackage ? 'Remove from Package' : 'Include in Package'}
                            variant="secondary"
                            onPress={onTogglePackage}
                        />
                    )}
                    {canManagePricing && item.entitled && (
                        <CompactActionButton
                            title={item.offering ? 'Edit Company Offering' : 'Add Company Offering'}
                            onPress={onBeginOffering}
                        />
                    )}
                </View>
            </View>
        </ThemedCard>
    );
}

export function MasterCatalogProductDetailsModal({
    item,
    includedInDraftPackage,
    onClose,
    primaryAction,
}: {
    item: ApprovedMasterCatalogItem | null;
    includedInDraftPackage: boolean;
    onClose: () => void;
    primaryAction?: {
        title: string;
        disabled?: boolean;
        message?: string;
        onPress: () => void;
    };
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [detail, setDetail] = useState<ApprovedMasterCatalogDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        let current = true;

        if (!item) {
            setDetail(null);
            setLoading(false);
            setMessage('');
            return () => { current = false; };
        }

        setDetail(null);
        setLoading(true);
        setMessage('');
        void loadApprovedMasterCatalogDetail(item.id)
            .then((nextDetail) => {
                if (current) setDetail(nextDetail);
            })
            .catch((error) => {
                if (current) setMessage(errorMessage(error));
            })
            .finally(() => {
                if (current) setLoading(false);
            });

        return () => { current = false; };
    }, [item]);

    const productName = item
        ? (typeof item.specifications.product_name === 'string' ? item.specifications.product_name.trim() : '')
            || [item.brand, item.familyName, item.modelNumber].filter(Boolean).join(' ') || 'Master product'
        : 'Master product';
    const specifications = item ? catalogSpecificationDisplays(item.specifications) : [];
    const identityRows = item ? [
        { label: 'Card code', value: item.shortCode },
        { label: 'Manufacturer', value: item.manufacturer },
        { label: 'Brand', value: item.brand },
        { label: 'Model', value: item.modelNumber },
        { label: 'Family', value: item.familyName },
        { label: 'Category', value: item.category },
        { label: 'Manufacturer part number', value: item.manufacturerPartNumber },
        { label: 'UPC / GTIN', value: item.upcGtin },
    ].filter((row) => row.value) : [];
    const references = detail?.references || [];
    const imageReferences = references.filter((reference) => reference.kind === 'image');
    const documentReferences = references.filter((reference) => reference.kind !== 'image');
    const packageLabel = item?.entitled
        ? 'Currently included in the company package'
        : includedInDraftPackage
            ? 'Will be included after Catalog Access is saved'
            : 'Not included in the company package';

    async function openReference(reference: ApprovedMasterCatalogReference) {
        try {
            await Linking.openURL(reference.url);
        } catch {
            setMessage(`${reference.title} could not be opened.`);
        }
    }

    return (
        <Modal animationType="slide" transparent visible={Boolean(item)} onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: 'rgba(8, 18, 31, 0.58)', justifyContent: 'center', padding: scaleIcon(14) }}>
                <ThemedCard style={{ width: '100%', maxWidth: 820, maxHeight: '94%', alignSelf: 'center', padding: 0, overflow: 'hidden' }}>
                    <View style={{ padding: scaleIcon(18), borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: scaleIcon(5) }}>
                        <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900', letterSpacing: 0.7 }}>
                            MASTER PRODUCT · DETAILS / ADVANCED
                        </Text>
                        <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(24), lineHeight: scaleFont(29), fontWeight: '900' }}>
                            {productName}
                        </Text>
                        <Text selectable style={{ color: item?.entitled ? theme.colors.primary : theme.colors.mutedText, fontWeight: '800' }}>
                            {[item?.shortCode, packageLabel].filter(Boolean).join(' · ')}
                        </Text>
                    </View>

                    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: scaleIcon(18), gap: scaleIcon(16) }}>
                        {item && (
                            <>
                                <ProductCardImage
                                    imageUrl={item.primaryImageUrl}
                                    productName={productName}
                                    style={{ width: '100%', height: scaleIcon(220) }}
                                />

                                {!!identityRows.length && (
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
                                        {identityRows.map((row) => (
                                            <View key={row.label} style={{ flexGrow: 1, flexBasis: scaleIcon(145), borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, borderCurve: 'continuous', backgroundColor: theme.colors.surfaceAlt, padding: scaleIcon(11), gap: scaleIcon(3) }}>
                                                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(11), fontWeight: '900' }}>{row.label.toUpperCase()}</Text>
                                                <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '800' }}>{row.value}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {!!item.description && (
                                    <DetailSection title="About this product">
                                        <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(15), lineHeight: scaleFont(22) }}>{item.description}</Text>
                                    </DetailSection>
                                )}

                                <DetailSection title="Specifications">
                                    {specifications.length ? specifications.map((specification) => (
                                        <View key={specification.key} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(6), justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: scaleIcon(7) }}>
                                            <Text selectable style={{ color: theme.colors.mutedText, fontWeight: '800', flex: 1, minWidth: scaleIcon(130) }}>{specification.label}</Text>
                                            <Text selectable style={{ color: theme.colors.text, fontWeight: '800', flex: 1, minWidth: scaleIcon(130), textAlign: 'right' }}>{specification.value}</Text>
                                        </View>
                                    )) : (
                                        <Text selectable style={{ color: theme.colors.mutedText }}>No advanced specifications have been published for this product.</Text>
                                    )}
                                </DetailSection>

                                <DetailSection title="Manuals & manufacturer references">
                                    {loading && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: scaleIcon(8) }}>
                                            <ActivityIndicator color={theme.colors.primary} />
                                            <Text selectable style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading product references...</Text>
                                        </View>
                                    )}
                                    {!loading && documentReferences.map((reference) => (
                                        <ReferenceLink key={reference.id} reference={reference} onPress={() => void openReference(reference)} />
                                    ))}
                                    {!loading && !documentReferences.length && (
                                        <Text selectable style={{ color: theme.colors.mutedText }}>No manual or manufacturer reference has been published for this product.</Text>
                                    )}
                                </DetailSection>

                                {!!imageReferences.length && (
                                    <DetailSection title="Additional product images">
                                        {imageReferences.map((reference) => (
                                            <ReferenceLink key={reference.id} reference={reference} onPress={() => void openReference(reference)} />
                                        ))}
                                    </DetailSection>
                                )}

                                {!!message && <Text selectable style={{ color: theme.colors.danger, fontWeight: '800' }}>{message}</Text>}
                            </>
                        )}
                    </ScrollView>

                    <View style={{ padding: scaleIcon(14), borderTopWidth: 1, borderTopColor: theme.colors.border, gap: scaleIcon(8) }}>
                        {!!primaryAction?.message && (
                            <Text selectable style={{ color: primaryAction.disabled ? theme.colors.mutedText : theme.colors.text, fontSize: scaleFont(13), lineHeight: scaleFont(18), fontWeight: '800' }}>
                                {primaryAction.message}
                            </Text>
                        )}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8) }}>
                            {primaryAction && (
                                <ThemedButton
                                    title={primaryAction.title}
                                    disabled={primaryAction.disabled}
                                    onPress={primaryAction.onPress}
                                    style={{ flexGrow: 1, minWidth: scaleIcon(180) }}
                                />
                            )}
                            <ThemedButton
                                title="Close Details"
                                variant="secondary"
                                onPress={onClose}
                                style={{ flexGrow: 1, minWidth: scaleIcon(150) }}
                            />
                        </View>
                    </View>
                </ThemedCard>
            </View>
        </Modal>
    );
}

function CompactStatusBadge({ label, highlighted }: { label: string; highlighted: boolean }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <View style={{ maxWidth: '100%', borderWidth: 1, borderColor: highlighted ? theme.colors.primary : theme.colors.border, borderRadius: 999, backgroundColor: highlighted ? theme.colors.primary : theme.colors.surface, paddingHorizontal: scaleIcon(8), paddingVertical: scaleIcon(4) }}>
            <Text selectable numberOfLines={1} style={{ color: highlighted ? theme.colors.primaryText : theme.colors.text, fontSize: scaleFont(11), fontWeight: '900' }}>{label}</Text>
        </View>
    );
}

function CompactActionButton({
    title,
    variant,
    onPress,
}: {
    title: string;
    variant?: 'primary' | 'secondary';
    onPress: () => void;
}) {
    const { scaleFont, scaleIcon } = useTheme();
    return (
        <ThemedButton
            title={title}
            variant={variant}
            onPress={onPress}
            style={{ minHeight: scaleIcon(40), paddingHorizontal: scaleIcon(10), paddingVertical: scaleIcon(8) }}
            textStyle={{ fontSize: scaleFont(13), lineHeight: scaleFont(16) }}
        />
    );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <View style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, borderCurve: 'continuous', padding: scaleIcon(13), gap: scaleIcon(9) }}>
            <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(17), fontWeight: '900' }}>{title}</Text>
            {children}
        </View>
    );
}

function ReferenceLink({ reference, onPress }: { reference: ApprovedMasterCatalogReference; onPress: () => void }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    return (
        <TouchableOpacity accessibilityRole="link" accessibilityLabel={`Open ${reference.title}`} onPress={onPress} style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: scaleIcon(9), gap: scaleIcon(2) }}>
            <Text selectable style={{ color: theme.colors.primary, fontSize: scaleFont(14), fontWeight: '900', textDecorationLine: 'underline' }}>{reference.title}</Text>
            <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12) }}>{catalogFieldLabel(reference.kind)}</Text>
        </TouchableOpacity>
    );
}

function errorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === 'object' && 'message' in error) return String(error.message || 'Product references could not be loaded.');
    return 'Product references could not be loaded.';
}
