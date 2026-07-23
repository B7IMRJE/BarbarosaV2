import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../../../components/HomeHeader';
import { getStatusCardStyle } from '../../../components/cards/SystemStatusCard';
import ThemedButton from '../../../components/theme/ThemedButton';
import ThemedCard from '../../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../../lib/activeProperty';
import { scoreAreaHealth, statusForCard, type HomeHealthItem } from '../../../lib/homeHealth';
import { getSystemDefinition, getSystemLabel, isCustomServiceRoot } from '../../../lib/homeSystems';
import {
    providerModeItemPath,
    providerModeQueryParams,
    readProviderModeParams,
} from '../../../lib/providerMode';
import {
    buildProviderHomeItemsRpcArgs,
    hasAssignedProviderHomeItemsContext,
} from '../../../lib/providerHomeItems';
import { isStarterHomeItemShell } from '../../../lib/starterHomeSetup';
import { getAreaIcon, getSystemDefaults } from '../../../lib/systemDefaults';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/useTheme';

type SystemAreaItem = HomeHealthItem & {
    name?: string | null;
    item_slug?: string | null;
};

export default function SystemAreasScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const routeParams = useLocalSearchParams<{
        system: string;
        providerMode?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const { system } = routeParams;
    const providerModeContext = useMemo(() => readProviderModeParams(routeParams), [
        routeParams.providerMode,
        routeParams.companyId,
        routeParams.propertyId,
        routeParams.returnTo,
        routeParams.serviceRequestId,
        routeParams.scheduleSlotId,
        routeParams.jobId,
    ]);
    const [search, setSearch] = useState('');
    const [homeItems, setHomeItems] = useState<SystemAreaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [archivingRecordId, setArchivingRecordId] = useState<string | null>(null);
    const [message, setMessage] = useState('');

    const systemName = decodeRouteParam(system) || 'System';
    const systemLabel = getSystemLabel(systemName);
    const isCustomSystem = !getSystemDefinition(systemName);
    const systemDefaults = useMemo(() => getSystemDefaults(systemName), [systemName]);

    const systemItems = useMemo(
        () => homeItems.filter((item) => sameText(item.system, systemName)),
        [homeItems, systemName]
    );
    const customRootAreaName = useMemo(
        () => getCustomRootAreaName(systemItems),
        [systemItems]
    );
    const savedAreas = useMemo(
        () => getSavedAreasForSystem(homeItems, systemName, customRootAreaName),
        [homeItems, systemName, customRootAreaName]
    );
    const areaChoices = useMemo(
        () => isCustomSystem && savedAreas.length > 0
            ? uniqueAreaNames(savedAreas)
            : uniqueAreaNames([...systemDefaults.areas, ...savedAreas]),
        [isCustomSystem, savedAreas, systemDefaults.areas]
    );
    const filteredAreas = useMemo(() => {
        return areaChoices.filter((area) =>
            area.toLowerCase().includes(search.toLowerCase())
        );
    }, [areaChoices, search]);
    const topLevelAreaRecords = useMemo(
        () => getTopLevelAreaRecords(systemItems, systemName, customRootAreaName),
        [systemItems, systemName, customRootAreaName]
    );
    const topLevelAreaByName = useMemo(() => {
        const recordsByName = new Map<string, SystemAreaItem>();

        topLevelAreaRecords.forEach((item) => {
            const key = normalizeText(item.name || item.location || '');
            if (key && !recordsByName.has(key)) {
                recordsByName.set(key, item);
            }
        });

        return recordsByName;
    }, [topLevelAreaRecords]);
    const directSystemItems = useMemo(
        () => systemItems
            .filter((item) => !sameText(item.category, 'Area') && isDirectSystemItem(item))
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
        [systemItems]
    );

    const loadAreaHealth = useCallback(async () => {
        let activeProperty;

        setLoading(true);

        try {
            activeProperty = await requireActivePropertyMembership({
                propertyIdOverride: providerModeContext?.propertyId,
                companyId: providerModeContext?.companyId,
            });
        } catch (error) {
            setHomeItems([]);
            setMessage(activePropertyErrorMessage(error));
            setLoading(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        let rows: SystemAreaItem[] = [];
        let loadErrorMessage = '';

        if (providerModeContext) {
            if (!hasAssignedProviderHomeItemsContext(providerModeContext)) {
                loadErrorMessage = 'Provider context is missing the assigned request, visit, or job. Use Back to Current Job and reopen Client HomeOS.';
            } else {
                const { data, error } = await supabase.rpc(
                    'get_provider_homeos_items',
                    buildProviderHomeItemsRpcArgs(providerModeContext)
                );

                if (error) {
                    loadErrorMessage = error.message;
                } else {
                    rows = (data || []) as SystemAreaItem[];
                }
            }
        } else {
            const { data, error } = await supabase
                .from('home_items')
                .select('id, name, item_slug, status, install_state, system, location, parent_area, category')
                .eq('property_id', activeProperty.propertyId)
                .or('archived.eq.false,archived.is.null');

            if (error) {
                loadErrorMessage = error.message;
            } else {
                rows = (data || []) as SystemAreaItem[];
            }
        }

        if (loadErrorMessage) {
            setHomeItems([]);
            setMessage(providerModeContext
                ? `Could not load client HomeOS areas: ${loadErrorMessage}`
                : `Could not load area status: ${loadErrorMessage}`
            );
            setLoading(false);
            return;
        }

        setHomeItems(rows);
        setMessage('');
        setLoading(false);
    }, [providerModeContext]);

    useFocusEffect(
        useCallback(() => {
            loadAreaHealth();
        }, [loadAreaHealth])
    );

    useEffect(() => {
        if (!providerModeContext || typeof window === 'undefined') return;

        const refreshFromLifecycle = () => {
            void loadAreaHealth();
        };
        const refreshWhenVisible = () => {
            if (typeof document === 'undefined' || document.visibilityState === 'visible') {
                refreshFromLifecycle();
            }
        };

        window.addEventListener('focus', refreshFromLifecycle);
        document?.addEventListener?.('visibilitychange', refreshWhenVisible);

        return () => {
            window.removeEventListener('focus', refreshFromLifecycle);
            document?.removeEventListener?.('visibilitychange', refreshWhenVisible);
        };
    }, [providerModeContext, loadAreaHealth]);

    function createRootArea() {
        router.push({
            pathname: '/area/create',
            params: {
                system: systemName,
                ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
            },
        } as any);
    }

    function activateRootArea(areaName: string) {
        router.push({
            pathname: '/area/create',
            params: {
                system: systemName,
                areaName,
                ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
            },
        } as any);
    }

    function createRootItem() {
        router.push({
            pathname: '/item/create',
            params: {
                system: systemName,
                area: 'Whole Home',
                category: 'Equipment',
                rootItem: 'true',
                ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
            },
        } as any);
    }

    function openArea(areaName: string, parentAreaName = '') {
        router.push({
            pathname: '/system/[system]/area/[area]',
            params: {
                system: systemName,
                area: areaName,
                ...(parentAreaName ? { parentArea: parentAreaName } : {}),
                ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
            },
        } as any);
    }

    function activateStarterCard(item: SystemAreaItem) {
        const itemSlug = item.item_slug || '';

        if (!itemSlug) {
            setMessage('This starter card cannot be activated yet.');
            return;
        }

        router.push({
            pathname: '/item/edit',
            params: {
                slug: itemSlug,
                activate: '1',
            },
        } as any);
    }

    function confirmArchiveArea(areaRecord: SystemAreaItem) {
        if (providerModeContext) {
            setMessage('Provider mode archive is staged only. Nothing was changed in the customer HomeOS.');
            return;
        }

        const title = areaRecord.name || areaRecord.location || 'this area';

        Alert.alert(
            `Archive ${title}?`,
            'This hides the area/container from HomeOS without deleting your account or home.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Archive',
                    style: 'destructive',
                    onPress: () => {
                        void archiveArea(areaRecord);
                    },
                },
            ]
        );
    }

    async function archiveArea(areaRecord: SystemAreaItem) {
        const targetId = areaRecord.id || '';
        const targetName = areaRecord.name || areaRecord.location || '';

        if (!targetId || !targetName) {
            setMessage('This area/container cannot be archived yet.');
            return;
        }

        setArchivingRecordId(targetId);
        setMessage('Checking area/container before archiving...');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
            setArchivingRecordId(null);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const { data, error } = await supabase
            .from('home_items')
            .select('id, name, item_slug, status, install_state, system, location, parent_area, category')
            .eq('property_id', activeProperty.propertyId)
            .eq('system', systemName)
            .or('archived.eq.false,archived.is.null');

        if (error) {
            setMessage(`Could not check area/container: ${error.message}`);
            setArchivingRecordId(null);
            return;
        }

        const rows = (data || []) as SystemAreaItem[];
        const childCount = rows.filter((row) =>
            row.id !== targetId && isChildOfRootArea(row, targetName)
        ).length;

        if (childCount > 0) {
            setMessage('Move or archive the items inside this area before archiving it.');
            setArchivingRecordId(null);
            return;
        }

        const { error: archiveError } = await supabase
            .from('home_items')
            .update({ archived: true })
            .eq('id', targetId)
            .eq('property_id', activeProperty.propertyId);

        if (archiveError) {
            setMessage(`Archive failed: ${archiveError.message}`);
            setArchivingRecordId(null);
            return;
        }

        setMessage(`${targetName} archived.`);
        setArchivingRecordId(null);
        await loadAreaHealth();
    }

    function confirmArchiveItem(item: SystemAreaItem) {
        if (providerModeContext) {
            setMessage('Provider mode archive is staged only. Nothing was changed in the customer HomeOS.');
            return;
        }

        const title = item.name || 'this item';

        Alert.alert(
            `Archive ${title}?`,
            'This hides the item from HomeOS. It does not delete your home or account.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Archive',
                    style: 'destructive',
                    onPress: () => {
                        void archiveItem(item);
                    },
                },
            ]
        );
    }

    async function archiveItem(item: SystemAreaItem) {
        const itemKey = item.id || item.item_slug || '';

        if (!itemKey) {
            setMessage('This item cannot be archived yet.');
            return;
        }

        setArchivingRecordId(itemKey);
        setMessage('Archiving item...');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
            setArchivingRecordId(null);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const updateQuery = supabase
            .from('home_items')
            .update({ archived: true })
            .eq('property_id', activeProperty.propertyId);
        const scopedUpdateQuery = item.id ? updateQuery.eq('id', item.id) : updateQuery.eq('item_slug', item.item_slug || '');
        const { error } = await scopedUpdateQuery;

        if (error) {
            setMessage(`Archive failed: ${error.message}`);
            setArchivingRecordId(null);
            return;
        }

        setMessage(`${item.name || 'Item'} archived.`);
        setArchivingRecordId(null);
        await loadAreaHealth();
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{
                padding: scaleIcon(20),
                paddingBottom: scaleIcon(40),
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text
                    style={{
                        fontSize: scaleFont(34),
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginBottom: scaleIcon(8),
                    }}
                >
                    {systemLabel}
                </Text>

                <Text
                    style={{
                        fontSize: scaleFont(16),
                        color: theme.colors.mutedText,
                        marginBottom: scaleIcon(14),
                        lineHeight: scaleFont(22),
                    }}
                >
                    Add areas, containers, or direct service items for this HomeOS service.
                </Text>

                <ThemedCard style={actionCardStyle}>
                    <Text style={[sectionHeaderStyle, { color: theme.colors.text }]}>
                        Add to this service
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), fontWeight: '800' }}>
                        Add a top-level area/container, or add an item directly under {systemLabel}.
                    </Text>

                    <View style={actionRowStyle}>
                        <ThemedButton
                            title="+ Add Area / Container"
                            variant="secondary"
                            onPress={createRootArea}
                            style={{ minWidth: scaleIcon(170), paddingVertical: scaleIcon(12) }}
                            textStyle={{ fontSize: scaleFont(14) }}
                        />

                        <ThemedButton
                            title="+ Add Item"
                            onPress={createRootItem}
                            style={{ minWidth: scaleIcon(140), paddingVertical: scaleIcon(12) }}
                            textStyle={{ fontSize: scaleFont(14) }}
                        />
                    </View>
                </ThemedCard>

                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search areas..."
                    placeholderTextColor={theme.colors.mutedText}
                    style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.radii.button,
                        padding: scaleIcon(16),
                        fontSize: scaleFont(16),
                        color: theme.colors.text,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        marginBottom: scaleIcon(20),
                    }}
                />

                {!!message && (
                    <Text
                        style={{
                            color: theme.colors.mutedText,
                            fontSize: scaleFont(14),
                            fontWeight: '800',
                            marginBottom: scaleIcon(14),
                        }}
                    >
                        {message}
                    </Text>
                )}

                {loading ? (
                    <ThemedCard style={loadingCardStyle}>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>
                            Loading areas...
                        </Text>
                    </ThemedCard>
                ) : (
                    <>
                        <Text
                            style={{
                                fontSize: scaleFont(20),
                                color: theme.colors.text,
                                fontWeight: '900',
                                marginBottom: scaleIcon(12),
                            }}
                        >
                            Top-Level Areas / Containers
                        </Text>

                        <View style={gridStyle}>
                            {filteredAreas.map((area) => {
                                const areaSummary = scoreAreaHealth(systemItems, area);
                                const areaRecord = topLevelAreaByName.get(normalizeText(area)) || null;
                                const archiveKey = areaRecord?.id || areaRecord?.item_slug || area;

                                return (
                                    <RootAreaCard
                                        key={area}
                                        title={area}
                                        status={statusForCard(areaSummary)}
                                        onPress={() => openArea(area, areaRecord?.parent_area || '')}
                                        onActivate={!areaRecord ? () => activateRootArea(area) : undefined}
                                        onArchive={areaRecord ? () => confirmArchiveArea(areaRecord) : undefined}
                                        archiveTitle={archivingRecordId === archiveKey ? 'Archiving...' : 'Archive Area'}
                                        archiveDisabled={!!archivingRecordId}
                                    />
                                );
                            })}
                        </View>

                        {filteredAreas.length === 0 && (
                            <ThemedCard style={[emptyStateCardStyle, { marginTop: scaleIcon(8), marginBottom: scaleIcon(18) }]}>
                                <Text style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '900', textAlign: 'center' }}>
                                    No areas or containers yet.
                                </Text>
                            </ThemedCard>
                        )}

                        <View style={sectionBlockStyle}>
                            <Text style={[sectionHeaderStyle, { color: theme.colors.text }]}>
                                Items directly in {systemLabel}
                            </Text>

                            {directSystemItems.length === 0 ? (
                                <ThemedCard style={[emptyStateCardStyle, { marginBottom: scaleIcon(16) }]}>
                                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '900', textAlign: 'center' }}>
                                        No direct items yet.
                                    </Text>
                                </ThemedCard>
                            ) : (
                                <View style={gridStyle}>
                                    {directSystemItems.map((item) => {
                                        const archiveKey = item.id || item.item_slug || item.name || '';
                                        const starterShell = isStarterHomeItemShell(item);

                                        return (
                                            <RootItemCard
                                                key={archiveKey}
                                                item={item}
                                                onOpen={() => {
                                                    const itemSlug = item.item_slug || '';

                                                    if (itemSlug) {
                                                        router.push(providerModeContext ? providerModeItemPath(itemSlug, providerModeContext) : `/item/${itemSlug}` as any);
                                                    }
                                                }}
                                                onActivate={
                                                    starterShell && !providerModeContext
                                                        ? () => activateStarterCard(item)
                                                        : undefined
                                                }
                                                onArchive={() => confirmArchiveItem(item)}
                                                archiveTitle={archivingRecordId === archiveKey ? 'Archiving...' : 'Archive Item'}
                                                archiveDisabled={!!archivingRecordId}
                                            />
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function getSavedAreasForSystem(items: SystemAreaItem[], systemName: string, customRootAreaName = '') {
    return items
        .filter((item) =>
            sameText(item.category, 'Area') &&
            sameText(item.system, systemName) &&
            isVisibleTopLevelArea(item, customRootAreaName) &&
            !isCustomServiceRoot(item)
        )
        .map((item) => item.name || item.location || item.parent_area || '')
        .filter((area) => !!area.trim());
}

function getTopLevelAreaRecords(items: SystemAreaItem[], systemName: string, customRootAreaName = '') {
    return items.filter((item) =>
        sameText(item.category, 'Area') &&
        sameText(item.system, systemName) &&
        isVisibleTopLevelArea(item, customRootAreaName) &&
        !isCustomServiceRoot(item)
    );
}

function getCustomRootAreaName(items: SystemAreaItem[]) {
    const root = items.find((item) => isCustomServiceRoot(item));

    return root?.name || root?.location || '';
}

function isVisibleTopLevelArea(item: SystemAreaItem, customRootAreaName = '') {
    if (customRootAreaName) return sameText(item.parent_area, customRootAreaName);

    return !String(item.parent_area || '').trim();
}

function isDirectSystemItem(item: SystemAreaItem) {
    if (String(item.parent_area || '').trim()) return false;

    const location = String(item.location || '').trim();
    return !location || sameText(location, 'Whole Home');
}

function isChildOfRootArea(item: SystemAreaItem, areaName: string) {
    if (sameText(item.category, 'Area')) {
        return sameText(item.parent_area, areaName);
    }

    return sameText(item.parent_area, areaName) ||
        (sameText(item.location, areaName) && !String(item.parent_area || '').trim());
}

function RootAreaCard({
    title,
    status,
    onPress,
    onActivate,
    onArchive,
    archiveTitle,
    archiveDisabled,
}: {
    title: string;
    status?: string | null;
    onPress: () => void;
    onActivate?: () => void;
    onArchive?: () => void;
    archiveTitle: string;
    archiveDisabled: boolean;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View
            style={[
                rootCardStyle,
                {
                    minWidth: scaleIcon(132),
                    maxWidth: scaleIcon(170),
                    minHeight: scaleIcon(166),
                    padding: scaleIcon(12),
                    borderRadius: theme.radii.card,
                },
                getStatusCardStyle(status, theme),
            ]}
        >
            <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.82}
                style={cardOpenAreaStyle}
            >
                <View
                    style={[
                        iconCircleStyle,
                        {
                            backgroundColor: theme.colors.iconBackground,
                            width: scaleIcon(60),
                            height: scaleIcon(60),
                            marginBottom: scaleIcon(10),
                        },
                    ]}
                >
                    <Text style={{ fontSize: scaleIcon(30) }}>{getAreaIcon(title)}</Text>
                </View>

                <Text
                    style={{
                        color: theme.colors.text,
                        fontSize: scaleFont(15),
                        fontWeight: '900',
                        lineHeight: scaleFont(19),
                        textAlign: 'center',
                    }}
                    numberOfLines={2}
                >
                    {title}
                </Text>
            </TouchableOpacity>

            {onActivate ? (
                <ThemedButton
                    title="Activate Card"
                    disabled={archiveDisabled}
                    onPress={onActivate}
                    style={smallArchiveButtonStyle}
                    textStyle={smallArchiveButtonTextStyle}
                />
            ) : onArchive ? (
                <ThemedButton
                    title={archiveTitle}
                    variant="danger"
                    disabled={archiveDisabled}
                    onPress={onArchive}
                    style={smallArchiveButtonStyle}
                    textStyle={smallArchiveButtonTextStyle}
                />
            ) : null}
        </View>
    );
}

function RootItemCard({
    item,
    onOpen,
    onActivate,
    onArchive,
    archiveTitle,
    archiveDisabled,
}: {
    item: SystemAreaItem;
    onOpen: () => void;
    onActivate?: () => void;
    onArchive: () => void;
    archiveTitle: string;
    archiveDisabled: boolean;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const itemName = item.name || 'Unnamed Item';
    const itemSlug = item.item_slug || '';

    return (
        <View
            style={[
                rootCardStyle,
                {
                    minWidth: scaleIcon(132),
                    maxWidth: scaleIcon(170),
                    minHeight: scaleIcon(166),
                    padding: scaleIcon(12),
                    borderRadius: theme.radii.card,
                },
                getStatusCardStyle(item.status, theme),
            ]}
        >
            <TouchableOpacity
                onPress={onOpen}
                activeOpacity={0.82}
                disabled={!itemSlug}
                style={cardOpenAreaStyle}
            >
                <View
                    style={[
                        iconCircleStyle,
                        {
                            backgroundColor: theme.colors.iconBackground,
                            width: scaleIcon(60),
                            height: scaleIcon(60),
                            marginBottom: scaleIcon(10),
                        },
                    ]}
                >
                    <Text style={{ fontSize: scaleIcon(30) }}>{getItemIcon(item)}</Text>
                </View>

                <Text
                    style={{
                        color: theme.colors.text,
                        fontSize: scaleFont(15),
                        fontWeight: '900',
                        lineHeight: scaleFont(19),
                        textAlign: 'center',
                    }}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                >
                    {itemName}
                </Text>
            </TouchableOpacity>

            {onActivate ? (
                <ThemedButton
                    title="Activate Card"
                    disabled={archiveDisabled}
                    onPress={onActivate}
                    style={smallArchiveButtonStyle}
                    textStyle={smallArchiveButtonTextStyle}
                />
            ) : (
                <ThemedButton
                    title={archiveTitle}
                    variant="danger"
                    disabled={archiveDisabled}
                    onPress={onArchive}
                    style={smallArchiveButtonStyle}
                    textStyle={smallArchiveButtonTextStyle}
                />
            )}
        </View>
    );
}

function getItemIcon(item: SystemAreaItem) {
    const name = normalizeText(item.name || '');
    const category = normalizeText(item.category || '');

    if (name.includes('cabinet') || name.includes('closet') || category.includes('storage')) return '📦';
    if (name.includes('faucet')) return '🚰';
    if (name.includes('outlet') || name.includes('switch')) return '⚡';
    if (name.includes('filter') || name.includes('water')) return '💧';
    if (name.includes('heater') || name.includes('gas')) return '🔥';

    return '🏠';
}

function uniqueAreaNames(areas: string[]) {
    const seen = new Set<string>();

    return areas.filter((area) => {
        const normalizedArea = normalizeText(area);

        if (!normalizedArea || seen.has(normalizedArea)) return false;

        seen.add(normalizedArea);
        return true;
    });
}

function sameText(a?: string | null, b?: string | null) {
    return normalizeText(a) === normalizeText(b);
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function decodeRouteParam(value?: string | string[] | null) {
    const rawValue = Array.isArray(value) ? value[0] : value;
    const text = String(rawValue || '').trim();

    if (!text) return '';

    try {
        return decodeURIComponent(text);
    } catch {
        return text;
    }
}

const actionCardStyle = {
    marginBottom: 20,
};

const actionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 16,
};

const sectionBlockStyle = {
    gap: 14,
    marginTop: 28,
};

const sectionHeaderStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
};

const gridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    justifyContent: 'center' as const,
};

const rootCardStyle = {
    width: '47%' as const,
    minWidth: 132,
    maxWidth: 170,
    minHeight: 166,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
};

const cardOpenAreaStyle = {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '100%' as const,
    flex: 1,
};

const iconCircleStyle = {
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
};

const smallArchiveButtonStyle = {
    alignSelf: 'center' as const,
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    minWidth: 92,
};

const smallArchiveButtonTextStyle = {
    fontSize: 12,
};

const loadingCardStyle = {
    marginBottom: 18,
};

const emptyStateCardStyle = {
    alignSelf: 'center' as const,
    minWidth: 190,
    maxWidth: 260,
    paddingVertical: 12,
    paddingHorizontal: 16,
};
