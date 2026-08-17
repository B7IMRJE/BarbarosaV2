import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import { loadHomeOSStarterCardChoices } from '../../lib/homeosStarterCatalog';
import {
    maintenanceDeckSuggestions,
    maintenanceWizardItemStatus,
    sortMaintenanceWizardItems,
    type MaintenanceWizardItem,
} from '../../lib/maintenanceWizardCore';
import {
    providerModeItemPath,
    providerModePath,
    readProviderModeParams,
} from '../../lib/providerMode';
import {
    buildProviderHomeItemsRpcArgs,
    getProviderHomeItemsReadStrategy,
    getProviderHomeItemsRpcName,
    usesProviderHomeItemsRpc,
    type ProviderHomeItemRpcRow,
} from '../../lib/providerHomeItems';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

const LOAD_TIMEOUT_MS = 15_000;

export default function MaintenanceWizardScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const params = useLocalSearchParams<{
        providerMode?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const providerContext = useMemo(() => readProviderModeParams(params), [params]);
    const [items, setItems] = useState<MaintenanceWizardItem[]>([]);
    const [suggestions, setSuggestions] = useState<Awaited<ReturnType<typeof loadHomeOSStarterCardChoices>>>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    const loadProviderItems = useCallback(async (membershipRole: string) => {
        if (!providerContext) return [];
        const strategy = getProviderHomeItemsReadStrategy(providerContext, membershipRole);
        if (!usesProviderHomeItemsRpc(strategy)) {
            throw new Error('This client HomeOS requires an assigned job or sales visit.');
        }
        const { data, error } = await supabase.rpc(
            getProviderHomeItemsRpcName(strategy),
            buildProviderHomeItemsRpcArgs(providerContext)
        );
        if (error) throw error;
        return ((data || []) as ProviderHomeItemRpcRow[]) satisfies MaintenanceWizardItem[];
    }, [providerContext]);

    const loadHomeownerItems = useCallback(async (propertyId: string) => {
        const { data, error } = await supabase
            .from('home_items')
            .select('id, item_slug, name, system, category, location, parent_area, install_state, status, starter_template_key, archived')
            .eq('property_id', propertyId)
            .eq('archived', false);
        if (error) throw error;
        return (data || []) as MaintenanceWizardItem[];
    }, []);

    const loadWizard = useCallback(async () => {
        setLoading(true);
        setMessage('');

        try {
            const activeProperty = await withTimeout(
                requireActivePropertyMembership({
                    propertyIdOverride: providerContext?.propertyId,
                    companyId: providerContext?.companyId,
                }),
                'Account confirmation took too long. Check your connection and try again.'
            );

            const itemPromise = providerContext
                ? loadProviderItems(activeProperty.membershipRole)
                : loadHomeownerItems(activeProperty.propertyId);

            const [loadedItems, deckCards] = await withTimeout(
                Promise.all([itemPromise, loadHomeOSStarterCardChoices()]),
                'HomeOS items took too long to load. Check your connection and try again.'
            );

            const sortedItems = sortMaintenanceWizardItems(loadedItems);
            setItems(sortedItems);
            setSuggestions(maintenanceDeckSuggestions(sortedItems, deckCards).slice(0, 8));
        } catch (error) {
            setItems([]);
            setSuggestions([]);
            setMessage(errorMessage(error));
        } finally {
            setLoading(false);
        }
    }, [loadHomeownerItems, loadProviderItems, providerContext]);

    useFocusEffect(useCallback(() => {
        void loadWizard();
    }, [loadWizard]));

    function openItem(item: MaintenanceWizardItem) {
        const slug = String(item.item_slug || '').trim();
        if (!slug) return;
        router.push(providerContext
            ? providerModeItemPath(slug, providerContext, { maintenanceGuide: 'spotlight' })
            : `/item/${encodeURIComponent(slug)}?maintenanceGuide=spotlight` as any);
    }

    function chooseSuggestionLocation() {
        setMessage('Choose the real area or container for this equipment first, then use Add HomeOS Card → From HomeOS Deck. Nothing is installed or recorded until you explicitly add it.');
        router.push(providerContext
            ? providerModePath('/equipment', providerContext)
            : '/equipment' as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center', paddingBottom: scaleIcon(48) }}
        >
            <View style={{ width: '100%', maxWidth: 980 }}>
                <HomeHeader />
                <Text style={{ color: theme.colors.text, fontSize: scaleFont(32), fontWeight: '900' }}>
                    Maintenance Wizard
                </Text>
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(16), lineHeight: scaleFont(23), marginTop: scaleIcon(8) }}>
                    Choose an item to maintain. The wizard opens its real HomeOS card and guides you to the existing Maintenance action—nothing is changed automatically.
                </Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10), marginTop: scaleIcon(16) }}>
                    <ThemedButton title="Back" variant="secondary" onPress={() => router.back()} />
                    <ThemedButton title="Exit Wizard" variant="secondary" onPress={() => router.replace(providerContext ? providerModePath('/', providerContext) : '/' as any)} />
                </View>

                {loading ? (
                    <ThemedCard style={{ marginTop: scaleIcon(18), alignItems: 'center', gap: scaleIcon(12) }}>
                        <ActivityIndicator size="large" />
                        <Text accessibilityRole="text" style={{ color: theme.colors.mutedText, fontSize: scaleFont(15), fontWeight: '800' }}>
                            Loading this home’s equipment…
                        </Text>
                    </ThemedCard>
                ) : null}

                {!!message ? (
                    <ThemedCard style={{ marginTop: scaleIcon(18), borderColor: theme.colors.danger }}>
                        <Text accessibilityRole="alert" style={{ color: theme.colors.text, fontSize: scaleFont(15), lineHeight: scaleFont(22), fontWeight: '800' }}>
                            {message}
                        </Text>
                        <ThemedButton title="Retry" onPress={() => void loadWizard()} style={{ alignSelf: 'flex-start', marginTop: scaleIcon(12) }} />
                    </ThemedCard>
                ) : null}

                {!loading ? (
                    <>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(23), fontWeight: '900', marginTop: scaleIcon(24) }}>
                            What would you like to maintain?
                        </Text>
                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(20), marginTop: scaleIcon(5) }}>
                            Installed or confirmed equipment appears first.
                        </Text>

                        {items.length === 0 ? (
                            <ThemedCard style={{ marginTop: scaleIcon(14) }}>
                                <Text style={{ color: theme.colors.text, fontSize: scaleFont(17), fontWeight: '900' }}>No HomeOS equipment is available yet.</Text>
                                <Text style={{ color: theme.colors.mutedText, marginTop: scaleIcon(6), lineHeight: scaleFont(20) }}>
                                    Add equipment from a real area or container before creating its maintenance plan.
                                </Text>
                            </ThemedCard>
                        ) : (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(12), marginTop: scaleIcon(14) }}>
                                {items.map((item) => (
                                    <TouchableOpacity
                                        key={item.id}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Maintain ${item.name || 'HomeOS item'}`}
                                        accessibilityHint="Opens this item and highlights its Maintenance action"
                                        onPress={() => openItem(item)}
                                        style={{ width: '100%', maxWidth: scaleIcon(300), minHeight: scaleIcon(154) }}
                                    >
                                        <ThemedCard style={{ flex: 1, borderColor: theme.colors.primary, borderWidth: 2 }}>
                                            <Text style={{ fontSize: scaleFont(28) }}>{itemIcon(item)}</Text>
                                            <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900', marginTop: scaleIcon(8) }} numberOfLines={2}>
                                                {item.name || 'HomeOS item'}
                                            </Text>
                                            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '800', marginTop: scaleIcon(6) }}>
                                                {item.location || item.parent_area || item.system || 'HomeOS'}
                                            </Text>
                                            <Text style={{ color: theme.colors.primary, fontSize: scaleFont(13), fontWeight: '900', marginTop: scaleIcon(8) }}>
                                                {maintenanceWizardItemStatus(item)} · Open Maintenance
                                            </Text>
                                        </ThemedCard>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

                        {suggestions.length > 0 ? (
                            <ThemedCard style={{ marginTop: scaleIcon(26) }}>
                                <Text style={{ color: theme.colors.text, fontSize: scaleFont(21), fontWeight: '900' }}>
                                    Not installed? Add this equipment
                                </Text>
                                <Text style={{ color: theme.colors.mutedText, lineHeight: scaleFont(20), marginTop: scaleIcon(6) }}>
                                    These are reusable Deck suggestions only. Selecting one first asks for its real location and does not create history or claim it is installed.
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10), marginTop: scaleIcon(14) }}>
                                    {suggestions.map((card) => (
                                        <ThemedButton
                                            key={card.templateKey}
                                            title={`Add ${card.name}`}
                                            variant="secondary"
                                            onPress={chooseSuggestionLocation}
                                            accessibilityLabel={`Add ${card.name} from HomeOS Deck`}
                                        />
                                    ))}
                                </View>
                            </ThemedCard>
                        ) : null}
                    </>
                ) : null}
            </View>
        </ScrollView>
    );
}

function itemIcon(item: MaintenanceWizardItem) {
    const value = `${item.name || ''} ${item.system || ''}`.toLowerCase();
    if (value.includes('water heater')) return '♨️';
    if (value.includes('hvac') || value.includes('air conditioner') || value.includes('furnace')) return '🌬️';
    if (value.includes('electrical') || value.includes('panel') || value.includes('outlet')) return '⚡';
    if (value.includes('valve') || value.includes('shutoff')) return '🔧';
    if (value.includes('filter')) return '💧';
    return '🏠';
}

async function withTimeout<T>(promise: Promise<T>, message: string) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeout = setTimeout(() => reject(new Error(message)), LOAD_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

function errorMessage(error: unknown) {
    const message = String((error as { message?: unknown })?.message || '').trim();
    return message || activePropertyErrorMessage(error);
}
