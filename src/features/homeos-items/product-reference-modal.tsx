import { Image } from 'expo-image';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { DetailSection, EquipmentDetailHeader, RoleActionBar } from '../../components/homeos/HomeOSVisualFoundation';
import {
    createHomeItemProductReferenceAssetUrl,
    loadHomeItemProductReference,
    type HomeItemProductReference,
    type HomeItemProductReferenceAsset,
} from '../../lib/homeItemProductReference';
import { useTheme } from '../../theme/useTheme';

export default function ProductReferenceModal({
    visible,
    homeItemId,
    itemName,
    onClose,
}: {
    visible: boolean;
    homeItemId: string;
    itemName: string;
    onClose: () => void;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [reference, setReference] = useState<HomeItemProductReference | null>(null);
    const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        let current = true;

        if (!visible || !homeItemId) {
            setReference(null);
            setAssetUrls({});
            setMessage('');
            setLoading(false);
            return () => { current = false; };
        }

        setLoading(true);
        setMessage('');

        void (async () => {
            try {
                const nextReference = await loadHomeItemProductReference(homeItemId);
                if (!current) return;

                setReference(nextReference);
                if (!nextReference) {
                    setMessage('Product reference information has not been published for this item yet.');
                    return;
                }

                const nextAssetUrls = await Promise.all(nextReference.assets.map(async (asset) => {
                    try {
                        return [asset.id, await createHomeItemProductReferenceAssetUrl(asset)] as const;
                    } catch {
                        return null;
                    }
                }));
                if (!current) return;

                setAssetUrls(nextAssetUrls.reduce<Record<string, string>>((result, entry) => {
                    if (entry) result[entry[0]] = entry[1];
                    return result;
                }, {}));
            } catch (error) {
                if (current) setMessage(errorMessage(error));
            } finally {
                if (current) setLoading(false);
            }
        })();

        return () => { current = false; };
    }, [homeItemId, visible]);

    async function openAsset(asset: HomeItemProductReferenceAsset) {
        try {
            const url = assetUrls[asset.id] || await createHomeItemProductReferenceAssetUrl(asset);
            await Linking.openURL(url);
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    async function openManufacturerReference() {
        if (!reference?.manufacturerReference) return;

        try {
            await Linking.openURL(reference.manufacturerReference);
        } catch {
            setMessage('The manufacturer link could not be opened.');
        }
    }

    const images = reference?.assets.filter((asset) => asset.isImage && assetUrls[asset.id]) || [];
    const documents = reference?.assets.filter((asset) => !asset.isImage) || [];
    const identityRows = reference ? [
        { label: 'Brand', value: reference.brand },
        { label: 'Model', value: reference.model },
        { label: 'Type', value: reference.productType },
        { label: 'Finish', value: reference.finish },
        { label: 'Color', value: reference.color },
        { label: 'Part number', value: reference.manufacturerPartNumber },
        { label: 'Size', value: reference.size },
        { label: 'Capacity', value: reference.capacity },
    ].filter((row) => row.value) : [];

    return (
        <Modal
            animationType="slide"
            transparent
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={{ flex: 1, backgroundColor: 'rgba(8, 18, 31, 0.58)', justifyContent: 'center', padding: scaleIcon(14) }}>
                <ThemedCard style={{ width: '100%', maxWidth: 820, maxHeight: '94%', alignSelf: 'center', padding: 0, overflow: 'hidden' }}>
                    <View style={{ padding: scaleIcon(18), borderBottomWidth: 1, borderBottomColor: theme.colors.border, gap: scaleIcon(5) }}>
                        <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900', letterSpacing: 0.7 }}>
                            PRODUCT REFERENCE
                        </Text>
                        <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(24), lineHeight: scaleFont(29), fontWeight: '900' }}>
                            {reference?.productName || itemName || 'Product details'}
                        </Text>
                        <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(20) }}>
                            Current product facts only. HomeOS photos, job notes, videos, and installation history remain on the item record.
                        </Text>
                    </View>

                    <ScrollView
                        contentInsetAdjustmentBehavior="automatic"
                        contentContainerStyle={{ padding: scaleIcon(18), gap: scaleIcon(16) }}
                    >
                        {loading ? (
                            <View style={{ minHeight: scaleIcon(180), alignItems: 'center', justifyContent: 'center', gap: scaleIcon(12) }}>
                                <ActivityIndicator size="large" color={theme.colors.primary} />
                                <Text selectable style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading product reference...</Text>
                            </View>
                        ) : reference ? (
                            <>
                                <EquipmentDetailHeader
                                    title={reference.productName || itemName || 'Product details'}
                                    type={reference.productType || reference.category || undefined}
                                    identifier={[reference.brand, reference.model, reference.manufacturerPartNumber].filter(Boolean).join(' · ') || undefined}
                                    visual={{ uri: images[0] ? assetUrls[images[0].id] : '' }}
                                />
                                {images.length > 0 ? (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: scaleIcon(10) }}>
                                        {images.map((asset) => (
                                            <TouchableOpacity
                                                key={asset.id}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Open ${asset.title}`}
                                                onPress={() => void openAsset(asset)}
                                                style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, borderCurve: 'continuous', overflow: 'hidden' }}
                                            >
                                                <Image
                                                    source={assetUrls[asset.id]}
                                                    contentFit="contain"
                                                    style={{ width: scaleIcon(260), height: scaleIcon(190), backgroundColor: theme.colors.surfaceAlt }}
                                                />
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                ) : (
                                    <View style={{ minHeight: scaleIcon(120), borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, borderCurve: 'continuous', backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: scaleIcon(7), padding: scaleIcon(16) }}>
                                        <Text style={{ fontSize: scaleIcon(32) }}>🏠</Text>
                                        <Text selectable style={{ color: theme.colors.mutedText, textAlign: 'center', fontWeight: '800' }}>
                                            No homeowner-visible product image has been selected. The HomeOS icon remains the fallback.
                                        </Text>
                                    </View>
                                )}

                                {identityRows.length > 0 && (
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
                                        {identityRows.map((row) => (
                                            <View key={row.label} style={{ flexGrow: 1, flexBasis: scaleIcon(145), borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, borderCurve: 'continuous', backgroundColor: theme.colors.surfaceAlt, padding: scaleIcon(11), gap: scaleIcon(3) }}>
                                                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(11), fontWeight: '900' }}>{row.label.toUpperCase()}</Text>
                                                <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '800' }}>{row.value}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}

                                {!!reference.description && (
                                    <ReferenceSection title="About this product">
                                        <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(15), lineHeight: scaleFont(22) }}>{reference.description}</Text>
                                    </ReferenceSection>
                                )}

                                {reference.compatibleParts.length > 0 && (
                                    <ReferenceSection title="Compatible parts & applications">
                                        {reference.compatibleParts.map((part) => (
                                            <Text selectable key={part} style={{ color: theme.colors.text, fontSize: scaleFont(14), lineHeight: scaleFont(21) }}>• {part}</Text>
                                        ))}
                                    </ReferenceSection>
                                )}

                                {Object.keys(reference.specifications).length > 0 && (
                                    <ReferenceSection title="Specifications">
                                        {Object.entries(reference.specifications).map(([key, value]) => (
                                            <View key={key} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(6), justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingVertical: scaleIcon(7) }}>
                                                <Text selectable style={{ color: theme.colors.mutedText, fontWeight: '800', flex: 1, minWidth: scaleIcon(130) }}>{formatSpecificationLabel(key)}</Text>
                                                <Text selectable style={{ color: theme.colors.text, fontWeight: '800', flex: 1, minWidth: scaleIcon(130), textAlign: 'right' }}>{value}</Text>
                                            </View>
                                        ))}
                                    </ReferenceSection>
                                )}

                                {!!reference.manufacturerWarranty && (
                                    <ReferenceSection title="Manufacturer warranty">
                                        <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(15), lineHeight: scaleFont(22) }}>{reference.manufacturerWarranty}</Text>
                                    </ReferenceSection>
                                )}

                                {(documents.length > 0 || reference.manufacturerReference) && (
                                    <ReferenceSection title="Manuals & manufacturer links">
                                        <View style={{ gap: scaleIcon(8) }}>
                                            {documents.map((asset) => (
                                                <ThemedButton
                                                    key={asset.id}
                                                    title={asset.title}
                                                    variant="secondary"
                                                    onPress={() => void openAsset(asset)}
                                                />
                                            ))}
                                            {!!reference.manufacturerReference && (
                                                <ThemedButton
                                                    title="Open Manufacturer Reference"
                                                    variant="secondary"
                                                    onPress={() => void openManufacturerReference()}
                                                />
                                            )}
                                        </View>
                                    </ReferenceSection>
                                )}
                            </>
                        ) : (
                            <View style={{ minHeight: scaleIcon(160), alignItems: 'center', justifyContent: 'center' }}>
                                <Text selectable style={{ color: theme.colors.mutedText, textAlign: 'center', fontSize: scaleFont(15), lineHeight: scaleFont(22), fontWeight: '800' }}>
                                    {message || 'Product reference information has not been published for this item yet.'}
                                </Text>
                            </View>
                        )}

                        {!!message && !!reference && (
                            <Text selectable style={{ color: theme.colors.danger, fontWeight: '800' }}>{message}</Text>
                        )}
                    </ScrollView>

                    <RoleActionBar actions={[{ key: 'close', title: 'Close Product Details', variant: 'secondary', onPress: onClose }]} style={{ borderTopWidth: 1, borderTopColor: theme.colors.border, borderRadius: 0 }} />
                </ThemedCard>
            </View>
        </Modal>
    );
}

function ReferenceSection({ title, children }: { title: string; children: ReactNode }) {
    const { scaleIcon } = useTheme();

    return (
        <DetailSection title={title} style={{ gap: scaleIcon(9) }}>{children}</DetailSection>
    );
}

function formatSpecificationLabel(value: string) {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function errorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message;
    if (error && typeof error === 'object' && 'message' in error) return String(error.message || 'Product reference could not be loaded.');
    return 'Product reference could not be loaded.';
}
