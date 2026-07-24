import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getStatusCardStyle } from '../../../../components/cards/SystemStatusCard';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../../../lib/activeProperty';
import { getStarterItemsForAreaSystem } from '../../../../lib/areaTemplates';
import { getSystemDefinition, getSystemLabel } from '../../../../lib/homeSystems';
import {
    providerModeItemPath,
    providerModeQueryParams,
    readProviderModeParams,
} from '../../../../lib/providerMode';
import {
    buildProviderHomeItemsRpcArgs,
    hasAssignedProviderHomeItemsContext,
} from '../../../../lib/providerHomeItems';
import {
    formatDirectItemsEmptyMessage,
    resolveAreaVisibleItems,
} from '../../../../lib/providerItemVisibility';
import {
    getAreaIcon,
    getBroadZoneDefinition,
    getSuggestedChildAreas,
    normalizeAreaName,
} from '../../../../lib/systemDefaults';
import {
    buildDefaultStarterHomePlan,
    buildStarterHomeSetupPreview,
    createMissingStarterHomeItems,
    isStarterHomeItemShell,
    starterPlanContainsArea,
    starterSetupHasMissingRecords,
    type StarterHomeArea,
    type StarterHomeSetupPlanResult,
} from '../../../../lib/starterHomeSetup';
import {
    STARTER_RECOVERY_CONFIRMATION_BODY,
    STARTER_RECOVERY_CONFIRMATION_TITLE,
    STARTER_RECOVERY_CREATING_MESSAGE,
    resolveStarterRecoveryOpenAction,
    runStarterRecoverySubmission,
} from '../../../../lib/starterRecoveryConfirmation';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/useTheme';

type AreaHomeItem = {
    id?: string;
    name: string | null;
    system: string | null;
    item_slug: string | null;
    category: string | null;
    status: string | null;
    install_state: string | null;
    location: string | null;
    parent_area: string | null;
};

export default function AreaScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const routeParams = useLocalSearchParams<{
        system: string;
        area: string;
        parentArea?: string;
        refresh?: string;
        providerMode?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const { system, area, parentArea, refresh } = routeParams;
    const providerModeContext = readProviderModeParams(routeParams);

    const systemName = decodeRouteParam(system) || 'System';
    const systemLabel = getSystemLabel(systemName);
    const areaName = decodeRouteParam(area) || 'Area';
    const parentAreaName = decodeRouteParam(parentArea).trim();
    const refreshKey = String(refresh || '');
    const [items, setItems] = useState<AreaHomeItem[]>([]);
    const [childAreas, setChildAreas] = useState<AreaHomeItem[]>([]);
    const [currentAreaRecord, setCurrentAreaRecord] = useState<AreaHomeItem | null>(null);
    const [suggestedChildAreas, setSuggestedChildAreas] = useState<string[]>([]);
    const [starterRecoveryPlan, setStarterRecoveryPlan] = useState<StarterHomeArea[]>([]);
    const [starterRecoveryPreview, setStarterRecoveryPreview] = useState<StarterHomeSetupPlanResult | null>(null);
    const [starterRecoveryConfirmationVisible, setStarterRecoveryConfirmationVisible] = useState(false);
    const [recoveringStarterSetup, setRecoveringStarterSetup] = useState(false);
    const [returnedHomeItemRowCount, setReturnedHomeItemRowCount] = useState<number | null>(null);
    const [homeItemsQueryFailed, setHomeItemsQueryFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [archivingRecordId, setArchivingRecordId] = useState<string | null>(null);
    const [message, setMessage] = useState('');
    const starterRecoverySubmittingRef = useRef(false);
    const itemSections = groupItemsBySystem(items);
    const suggestedStarterItems = useMemo(() => {
        const existingItemNames = new Set(items.map((item) => normalize(item.name || '')));

        return getStarterItemsForAreaSystem(areaName, systemName)
            .filter((item) => !existingItemNames.has(normalize(item.name)))
            .map<AreaHomeItem>((item) => ({
                name: item.name,
                system: item.system,
                item_slug: null,
                category: item.category,
                status: item.status,
                install_state: item.install_state,
                location: areaName,
                parent_area: parentAreaName || null,
            }));
    }, [areaName, items, parentAreaName, systemName]);

    useEffect(() => {
        loadAreaItems();
    }, [
        systemName,
        areaName,
        parentAreaName,
        refreshKey,
        providerModeContext?.companyId,
        providerModeContext?.propertyId,
        providerModeContext?.serviceRequestId,
        providerModeContext?.scheduleSlotId,
        providerModeContext?.jobId,
    ]);

    useFocusEffect(
        useCallback(() => {
            if (!providerModeContext) return;

            void loadAreaItems({ preserveMessage: true });
        }, [
            systemName,
            areaName,
            parentAreaName,
            providerModeContext?.companyId,
            providerModeContext?.propertyId,
            providerModeContext?.serviceRequestId,
            providerModeContext?.scheduleSlotId,
            providerModeContext?.jobId,
        ])
    );

    useEffect(() => {
        if (!providerModeContext || typeof window === 'undefined') return;

        const refreshFromLifecycle = () => {
            void loadAreaItems({ preserveMessage: true });
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
    }, [
        systemName,
        areaName,
        parentAreaName,
        providerModeContext?.companyId,
        providerModeContext?.propertyId,
        providerModeContext?.serviceRequestId,
        providerModeContext?.scheduleSlotId,
        providerModeContext?.jobId,
    ]);

    useEffect(() => {
        if (!starterRecoveryPreview) setStarterRecoveryConfirmationVisible(false);
    }, [starterRecoveryPreview]);

    async function loadAreaItems(options: { preserveMessage?: boolean } = {}) {
        let activeProperty;

        setLoading(true);

        try {
            activeProperty = await requireActivePropertyMembership({
                propertyIdOverride: providerModeContext?.propertyId,
                companyId: providerModeContext?.companyId,
            });
        } catch (error) {
            setItems([]);
            setChildAreas([]);
            setCurrentAreaRecord(null);
            setSuggestedChildAreas([]);
            setStarterRecoveryPlan([]);
            setStarterRecoveryPreview(null);
            setReturnedHomeItemRowCount(null);
            setHomeItemsQueryFailed(true);
            setMessage(activePropertyErrorMessage(error));
            setLoading(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        let rows: AreaHomeItem[] = [];
        let loadErrorMessage = '';

        if (providerModeContext) {
            if (!hasAssignedProviderHomeItemsContext(providerModeContext)) {
                loadErrorMessage = 'Client HomeOS requires an assigned request, visit, or job context.';
            } else {
                const { data, error } = await supabase.rpc(
                    'get_provider_homeos_items',
                    buildProviderHomeItemsRpcArgs(providerModeContext)
                );

                if (error) {
                    loadErrorMessage = error.message;
                } else {
                    rows = (data || []) as AreaHomeItem[];
                }
            }
        } else {
            const { data, error } = await supabase
                .from('home_items')
                .select('id, name, system, item_slug, category, status, install_state, location, parent_area')
                .eq('property_id', activeProperty.propertyId)
                .or('archived.eq.false,archived.is.null')
                .order('system', { ascending: true })
                .order('name', { ascending: true });

            if (error) {
                loadErrorMessage = error.message;
            } else {
                rows = (data || []) as AreaHomeItem[];
            }
        }

        if (loadErrorMessage) {
            setItems([]);
            setChildAreas([]);
            setCurrentAreaRecord(null);
            setSuggestedChildAreas([]);
            setStarterRecoveryPlan([]);
            setStarterRecoveryPreview(null);
            setReturnedHomeItemRowCount(null);
            setHomeItemsQueryFailed(true);
            setMessage(providerModeContext
                ? `Could not load client HomeOS items: ${loadErrorMessage}`
                : `Could not load items: ${loadErrorMessage}`
            );
            setLoading(false);
            return;
        }

        const visibleRows = resolveAreaVisibleItems(rows, {
            systemName,
            areaName,
            parentAreaName,
        });
        const savedChildAreas = visibleRows.childAreas;
        const broadZoneDefinition = getBroadZoneDefinition(areaName);
        const nextBroadZoneMode = !parentAreaName && (!!broadZoneDefinition || savedChildAreas.length > 0);
        const savedChildNames = new Set(savedChildAreas.map((item) => normalizeAreaName(item.name)));
        const nextSuggestedChildAreas = nextBroadZoneMode
            ? getSuggestedChildAreas(areaName).filter((childArea) => !savedChildNames.has(normalizeAreaName(childArea)))
            : [];
        const propertyType = await loadPropertyType(activeProperty.propertyId);
        const nextStarterRecoveryPlan = buildDefaultStarterHomePlan(propertyType);
        const nextStarterRecoveryPreview = buildStarterHomeSetupPreview({
            userId: activeProperty.userId,
            propertyId: activeProperty.propertyId,
            plan: nextStarterRecoveryPlan,
            existingItems: rows,
        });
        const showStarterRecovery =
            starterPlanContainsArea(nextStarterRecoveryPlan, areaName, parentAreaName) &&
            starterSetupHasMissingRecords(nextStarterRecoveryPreview);

        setChildAreas(sortAreaRecords(savedChildAreas));
        setCurrentAreaRecord(visibleRows.currentAreaRecord);
        setSuggestedChildAreas(nextSuggestedChildAreas);
        setStarterRecoveryPlan(showStarterRecovery ? nextStarterRecoveryPlan : []);
        setStarterRecoveryPreview(showStarterRecovery ? nextStarterRecoveryPreview : null);
        setReturnedHomeItemRowCount(rows.length);
        setHomeItemsQueryFailed(false);
        setItems(
            sortAreaItems(
                areaName,
                visibleRows.directItems
            )
        );
        if (!options.preserveMessage) setMessage('');
        setLoading(false);
    }

    function confirmAddMissingStarterEquipment() {
        const action = resolveStarterRecoveryOpenAction({
            hasPreview: !!starterRecoveryPreview,
            providerMode: !!providerModeContext,
            recovering: starterRecoverySubmittingRef.current || recoveringStarterSetup,
        });

        if (action.type === 'provider_blocked') {
            setMessage(action.message);
            return;
        }

        if (action.type === 'open_confirmation') {
            setMessage('');
            setStarterRecoveryConfirmationVisible(true);
        }
    }

    async function addMissingStarterEquipment() {
        await runStarterRecoverySubmission({
            closeConfirmation: () => setStarterRecoveryConfirmationVisible(false),
            create: async () => {
                let activeProperty;

                try {
                    activeProperty = await requireActivePropertyMembership();
                } catch (error) {
                    const errorMessage = activePropertyErrorMessage(error);

                    if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                        router.replace('/auth/login' as any);
                    } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                        router.replace('/onboarding/create-home' as any);
                    }

                    throw new Error(errorMessage);
                }

                setMessage(STARTER_RECOVERY_CREATING_MESSAGE);

                return createMissingStarterHomeItems(
                    {
                        userId: activeProperty.userId,
                        propertyId: activeProperty.propertyId,
                    },
                    starterRecoveryPlan
                );
            },
            isSubmitting: () => starterRecoverySubmittingRef.current,
            planCount: starterRecoveryPlan.length,
            reload: () => loadAreaItems({ preserveMessage: true }),
            setMessage,
            setSubmitting: (submitting) => {
                starterRecoverySubmittingRef.current = submitting;
                setRecoveringStarterSetup(submitting);
            },
        });
    }

    function createSuggestedItem(category: string, name?: string) {
        router.push({
            pathname: '/item/create',
            params: {
                system: systemName,
                area: areaName,
                ...(parentAreaName ? { parentArea: parentAreaName } : {}),
                category,
                name: name || '',
                ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
            },
        } as any);
    }

    function openChildArea(childAreaName: string) {
        router.push({
            pathname: '/system/[system]/area/[area]',
            params: {
                system: systemName,
                area: childAreaName,
                parentArea: areaName,
                ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
            },
        } as any);
    }

    function createChildArea(childAreaName?: string) {
        router.push({
            pathname: '/area/create',
            params: {
                system: systemName,
                parentArea: areaName,
                ...(childAreaName ? { areaName: childAreaName } : {}),
                ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
            },
        } as any);
    }

    function confirmArchiveArea(areaRecord: AreaHomeItem, isCurrentArea = false) {
        if (providerModeContext) {
            setMessage('Provider mode archive is staged only. Nothing was changed in the customer HomeOS.');
            return;
        }

        const title = areaRecord.name || areaRecord.location || areaName;

        Alert.alert(
            `Archive ${title}?`,
            'This hides the area/container from HomeOS without deleting your account or home.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Archive',
                    style: 'destructive',
                    onPress: () => {
                        void archiveArea(areaRecord, isCurrentArea);
                    },
                },
            ]
        );
    }

    async function archiveArea(areaRecord: AreaHomeItem, isCurrentArea = false) {
        const targetId = areaRecord.id;
        const targetName = areaRecord.name || areaRecord.location || '';
        const targetParentArea = areaRecord.parent_area || '';

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
            .select('id, name, system, item_slug, category, status, location, parent_area')
            .eq('property_id', activeProperty.propertyId)
            .eq('system', systemName)
            .or('archived.eq.false,archived.is.null');

        if (error) {
            setMessage(`Could not check area/container: ${error.message}`);
            setArchivingRecordId(null);
            return;
        }

        const rows = (data || []) as AreaHomeItem[];
        const childCount = rows.filter((row) =>
            row.id !== targetId && isChildOfAreaRecord(row, targetName, targetParentArea)
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

        if (isCurrentArea) {
            setTimeout(() => {
                router.back();
            }, 700);
            return;
        }

        await loadAreaItems();
    }

    function confirmArchiveItem(item: AreaHomeItem) {
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

    async function archiveItem(item: AreaHomeItem) {
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
        await loadAreaItems();
    }

    function activateStarterCard(item: AreaHomeItem) {
        const itemSlug = item.item_slug || '';

        if (!itemSlug) {
            setMessage('This starter card cannot be activated yet.');
            return;
        }

        if (providerModeContext) {
            router.push(providerModeItemPath(itemSlug, providerModeContext));
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

    return (
        <>
            <ScrollView
                style={{
                    flex: 1,
                    backgroundColor: theme.colors.background,
                }}
                contentContainerStyle={{
                    padding: scaleIcon(20),
                    paddingBottom: scaleIcon(40),
                    alignItems: 'center',
                }}
            >
            <View
                style={{
                    width: '100%',
                    maxWidth: 1200,
                }}
            >
                <Text
                    onPress={() => router.back()}
                    style={{
                        marginTop: scaleIcon(20),
                        marginBottom: scaleIcon(20),
                        fontSize: scaleFont(18),
                        color: theme.colors.text,
                        fontWeight: '900',
                    }}
                >
                    Back
                </Text>

                <Text
                    style={{
                        fontSize: scaleFont(34),
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginBottom: scaleIcon(6),
                    }}
                >
                    {areaName}
                </Text>

                <Text
                    style={{
                        fontSize: scaleFont(16),
                        color: theme.colors.mutedText,
                        marginBottom: scaleIcon(25),
                    }}
                >
                    {parentAreaName ? `${systemLabel} / ${parentAreaName}` : systemLabel}
                </Text>

                <View style={areaActionGridStyle}>
                    <ThemedCard style={[areaQuickActionCardStyle, areaContainerActionCardStyle]}>
                        <Text style={[areaQuickActionTitleStyle, { color: theme.colors.text, fontSize: scaleFont(15) }]}>
                            Add Area / Container
                        </Text>
                        <Text style={[areaQuickActionTextStyle, { color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(16) }]}>
                            Closet, cabinet, stove, vanity, or nested space.
                        </Text>
                        <ThemedButton
                            title="+ Area / Container"
                            variant="secondary"
                            onPress={() => createChildArea()}
                            style={areaQuickActionButtonStyle}
                            textStyle={areaQuickActionButtonTextStyle}
                        />
                    </ThemedCard>

                    <ThemedCard style={[areaQuickActionCardStyle, areaItemActionCardStyle]}>
                        <Text style={[areaQuickActionTitleStyle, { color: theme.colors.text, fontSize: scaleFont(15) }]}>
                            Add Item
                        </Text>
                        <Text style={[areaQuickActionTextStyle, { color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(16) }]}>
                            {getAreaAddItemDescription(systemName)}
                        </Text>
                        <ThemedButton
                            title="+ Add Item"
                            onPress={() => createSuggestedItem('Equipment')}
                            style={areaQuickActionButtonStyle}
                            textStyle={areaQuickActionButtonTextStyle}
                        />
                    </ThemedCard>

                    {currentAreaRecord?.id && (
                        <ThemedCard style={[areaQuickActionCardStyle, areaArchiveActionCardStyle]}>
                            <Text style={[areaQuickActionTitleStyle, { color: theme.colors.text, fontSize: scaleFont(15) }]}>
                                Manage Area
                            </Text>
                            <Text style={[areaQuickActionTextStyle, { color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(16) }]}>
                                Archive this area or container when it is no longer active.
                            </Text>
                            <ThemedButton
                                title={archivingRecordId === currentAreaRecord.id ? 'Archiving...' : 'Archive'}
                                variant="danger"
                                disabled={!!archivingRecordId}
                                onPress={() => confirmArchiveArea(currentAreaRecord, true)}
                                style={areaQuickActionButtonStyle}
                                textStyle={areaQuickActionButtonTextStyle}
                            />
                        </ThemedCard>
                    )}
                </View>

                {!!starterRecoveryPreview && (
                    <ThemedCard style={starterRecoveryBannerStyle}>
                        <View style={starterRecoveryBannerTextStyle}>
                            <Text style={[areaQuickActionTitleStyle, { color: theme.colors.text, fontSize: scaleFont(15) }]}>
                                Starter Equipment
                            </Text>
                            <Text style={[areaQuickActionTextStyle, { color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(16) }]}>
                                Missing now: {starterRecoveryPreview.createdItemRows} card{starterRecoveryPreview.createdItemRows === 1 ? '' : 's'} and {starterRecoveryPreview.createdAreaRows} area{starterRecoveryPreview.createdAreaRows === 1 ? '' : 's'}.
                            </Text>
                        </View>
                        <View style={starterRecoveryBannerActionStyle}>
                            <ThemedButton
                                title={providerModeContext
                                    ? 'Provider Recovery Requires Approved Workflow'
                                    : recoveringStarterSetup
                                        ? 'Adding Missing Cards...'
                                        : 'Add Missing Starter Equipment'}
                                variant="secondary"
                                disabled={recoveringStarterSetup}
                                onPress={confirmAddMissingStarterEquipment}
                                style={starterRecoveryButtonStyle}
                                textStyle={areaQuickActionButtonTextStyle}
                            />
                        </View>
                    </ThemedCard>
                )}

                {loading ? (
                    <ThemedCard style={loadingCardStyle}>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>
                            Loading items...
                        </Text>
                    </ThemedCard>
                ) : (
                    <>
                        <View style={sectionBlockStyle}>
                            <Text style={[sectionHeaderStyle, { color: theme.colors.text }]}>
                                Areas / Containers inside {areaName}
                            </Text>

                            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), fontWeight: '800' }}>
                                Examples: Closet, Cabinet, Garage Shelf, Bathroom Vanity.
                            </Text>

                            <View style={gridStyle}>
                                {childAreas.map((childArea) => {
                                    const archiveKey = childArea.id || childArea.item_slug || childArea.name || '';

                                    return (
                                        <ChildAreaCard
                                            key={archiveKey}
                                            title={childArea.name || 'Unnamed Area'}
                                            subtitle="Area / Container"
                                            onPress={() => openChildArea(childArea.name || '')}
                                            onArchive={() => confirmArchiveArea(childArea)}
                                            archiveTitle={archivingRecordId === archiveKey ? 'Archiving...' : 'Archive Area'}
                                            archiveDisabled={!!archivingRecordId}
                                        />
                                    );
                                })}

                                {suggestedChildAreas.map((childArea) => (
                                    <ChildAreaCard
                                        key={childArea}
                                        title={childArea}
                                        subtitle="Suggested area"
                                        onPress={() => openChildArea(childArea)}
                                        onActivate={() => createChildArea(childArea)}
                                    />
                                ))}
                            </View>

                            {childAreas.length === 0 && suggestedChildAreas.length === 0 && (
                                <ThemedCard style={[emptyStateCardStyle, { marginBottom: 16 }]}>
                                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '900', textAlign: 'center' }}>
                                        No areas or containers inside this area yet.
                                    </Text>
                                </ThemedCard>
                            )}
                        </View>

                        <View style={[sectionListStyle, directItemsSectionStyle]}>
                            <View style={sectionBlockStyle}>
                                <Text style={[sectionHeaderStyle, { color: theme.colors.text }]}>
                                    Items directly in {areaName}
                                </Text>

                                {items.length === 0 && suggestedStarterItems.length === 0 ? (
                                    <ThemedCard style={[emptyStateCardStyle, { marginBottom: 16 }]}>
                                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '900', textAlign: 'center' }}>
                                            {formatDirectItemsEmptyMessage({
                                                providerMode: !!providerModeContext,
                                                queryFailed: homeItemsQueryFailed,
                                                returnedRowCount: returnedHomeItemRowCount,
                                            })}
                                        </Text>
                                    </ThemedCard>
                                ) : (
                                    <>
                                        {itemSections.map((section) => (
                                            <View key={section.title} style={sectionBlockStyle}>
                                                {itemSections.length > 1 && (
                                                    <Text style={[subsectionHeaderStyle, { color: theme.colors.text }]}>
                                                        {getItemGroupHeading(section.title)}
                                                    </Text>
                                                )}

                                                <View style={gridStyle}>
                                                    {section.items.map((item) => {
                                                        const archiveKey = item.id || item.item_slug || item.name || '';
                                                        const starterShell = isStarterHomeItemShell(item);

                                                        return (
                                                            <AreaItemCard
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
                                            </View>
                                        ))}

                                        {suggestedStarterItems.length > 0 && (
                                            <View style={sectionBlockStyle}>
                                                <Text style={[subsectionHeaderStyle, { color: theme.colors.text }]}>
                                                    Suggested items
                                                </Text>
                                                <View style={gridStyle}>
                                                    {suggestedStarterItems.map((item) => (
                                                        <AreaItemCard
                                                            key={`${item.system}-${item.name}`}
                                                            item={item}
                                                            onOpen={() => undefined}
                                                            onActivate={() => createSuggestedItem(item.category || 'Equipment', item.name || '')}
                                                        />
                                                    ))}
                                                </View>
                                            </View>
                                        )}
                                    </>
                                )}
                            </View>
                        </View>
                    </>
                )}

                {!!message && (
                    <ThemedCard style={{ marginBottom: 16 }}>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>{message}</Text>
                    </ThemedCard>
                )}
            </View>
            </ScrollView>

            <Modal
                animationType="fade"
                transparent
                visible={starterRecoveryConfirmationVisible}
                onRequestClose={() => {
                    if (!recoveringStarterSetup) setStarterRecoveryConfirmationVisible(false);
                }}
            >
                <View style={starterRecoveryModalBackdropStyle}>
                    <ThemedCard style={starterRecoveryModalCardStyle}>
                        <Text style={[sectionHeaderStyle, { color: theme.colors.text }]}>
                            {STARTER_RECOVERY_CONFIRMATION_TITLE}
                        </Text>
                        <Text style={[starterRecoveryModalBodyStyle, { color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(20) }]}>
                            {STARTER_RECOVERY_CONFIRMATION_BODY}
                        </Text>
                        {!!starterRecoveryPreview && (
                            <Text style={[starterRecoveryModalMetaStyle, { color: theme.colors.mutedText, fontSize: scaleFont(13) }]}>
                                Missing now: {starterRecoveryPreview.createdItemRows} card{starterRecoveryPreview.createdItemRows === 1 ? '' : 's'} and {starterRecoveryPreview.createdAreaRows} area{starterRecoveryPreview.createdAreaRows === 1 ? '' : 's'}.
                            </Text>
                        )}
                        {!!message && (
                            <View style={[starterRecoveryModalMessageStyle, { borderColor: theme.colors.border }]}>
                                <Text style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: '900', lineHeight: scaleFont(18) }}>
                                    {message}
                                </Text>
                            </View>
                        )}
                        <View style={starterRecoveryModalActionsStyle}>
                            <ThemedButton
                                title="Cancel"
                                variant="secondary"
                                disabled={recoveringStarterSetup}
                                onPress={() => setStarterRecoveryConfirmationVisible(false)}
                                style={starterRecoveryModalButtonStyle}
                                textStyle={{ fontSize: scaleFont(14) }}
                            />
                            <ThemedButton
                                title={recoveringStarterSetup ? 'Creating Starter Equipment...' : 'Add Missing Cards'}
                                disabled={recoveringStarterSetup}
                                onPress={() => {
                                    void addMissingStarterEquipment();
                                }}
                                style={starterRecoveryModalButtonStyle}
                                textStyle={{ fontSize: scaleFont(14) }}
                            />
                        </View>
                    </ThemedCard>
                </View>
            </Modal>
        </>
    );
}

function sameText(a?: string | null, b?: string | null) {
    return normalizeAreaName(a) === normalizeAreaName(b);
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

async function loadPropertyType(propertyId: string) {
    const cleanPropertyId = propertyId.trim();

    if (!cleanPropertyId) return null;

    const { data, error } = await supabase
        .from('properties')
        .select('property_type')
        .eq('id', cleanPropertyId)
        .maybeSingle();

    if (error) return null;

    return String((data as { property_type?: string | null } | null)?.property_type || '').trim() || null;
}

function isChildOfAreaRecord(item: AreaHomeItem, areaName: string, parentAreaName: string) {
    if (sameText(item.category, 'Area')) {
        return sameText(item.parent_area, areaName);
    }

    if (sameText(item.location, areaName) && sameText(item.parent_area, parentAreaName)) {
        return true;
    }

    if (!parentAreaName && sameText(item.location, areaName) && !String(item.parent_area || '').trim()) {
        return true;
    }

    return !String(item.location || '').trim() && sameText(item.parent_area, areaName);
}

function sortAreaRecords(areas: AreaHomeItem[]) {
    return [...areas].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

function ChildAreaCard({
    title,
    subtitle,
    onPress,
    onActivate,
    onArchive,
    archiveTitle = 'Archive',
    archiveDisabled = false,
}: {
    title: string;
    subtitle: string;
    onPress: () => void;
    onActivate?: () => void;
    onArchive?: () => void;
    archiveTitle?: string;
    archiveDisabled?: boolean;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View
            style={[
                childAreaCardStyle,
                {
                    minWidth: scaleIcon(132),
                    maxWidth: scaleIcon(170),
                    minHeight: scaleIcon(166),
                    padding: scaleIcon(12),
                },
                {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radii.card,
                },
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
                    <Text style={[iconTextStyle, { fontSize: scaleIcon(30) }]}>{getAreaIcon(title)}</Text>
                </View>

                <Text
                    style={[
                        itemTitleStyle,
                        {
                            color: theme.colors.text,
                            fontSize: scaleFont(15),
                            lineHeight: scaleFont(19),
                        },
                    ]}
                    numberOfLines={2}
                >
                    {title}
                </Text>
                <Text
                    style={[
                        childAreaSubtitleStyle,
                        {
                            color: theme.colors.mutedText,
                            marginTop: scaleIcon(6),
                            fontSize: scaleFont(12),
                        },
                    ]}
                    numberOfLines={1}
                >
                    {subtitle}
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

function AreaItemCard({
    item,
    onOpen,
    onActivate,
    onArchive,
    archiveTitle = 'Archive',
    archiveDisabled = false,
}: {
    item: AreaHomeItem;
    onOpen: () => void;
    onActivate?: () => void;
    onArchive?: () => void;
    archiveTitle?: string;
    archiveDisabled?: boolean;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const itemName = item.name || 'Unnamed Item';
    const systemLabel = item.system ? getSystemLabel(item.system) : '';
    const itemSlug = item.item_slug || '';

    return (
        <View
            style={[
                itemCardStyle,
                {
                    minWidth: scaleIcon(132),
                    maxWidth: scaleIcon(170),
                    minHeight: scaleIcon(166),
                    padding: scaleIcon(12),
                },
                { borderRadius: theme.radii.card },
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
                    <Text style={[iconTextStyle, { fontSize: scaleIcon(30) }]}>{getItemIcon(item)}</Text>
                </View>

                <Text
                    style={[
                        itemTitleStyle,
                        {
                            color: theme.colors.text,
                            fontSize: scaleFont(15),
                            lineHeight: scaleFont(19),
                        },
                    ]}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                >
                    {itemName}
                </Text>

                {!!systemLabel && (
                    <Text
                        style={[
                            systemLabelStyle,
                            {
                                color: theme.colors.mutedText,
                                marginTop: scaleIcon(6),
                                fontSize: scaleFont(12),
                            },
                        ]}
                        numberOfLines={1}
                    >
                        {systemLabel}
                    </Text>
                )}
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

function sortAreaItems(areaName: string, items: AreaHomeItem[]) {
    const preferredNames = getPreferredItemOrder(areaName);

    return [...items].sort((a, b) => {
        const aName = a.name || '';
        const bName = b.name || '';
        const aIndex = preferredNames.indexOf(normalize(aName));
        const bIndex = preferredNames.indexOf(normalize(bName));

        if (aIndex !== -1 || bIndex !== -1) {
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        }

        return aName.localeCompare(bName);
    });
}

function getPreferredItemOrder(areaName: string) {
    if (!sameText(areaName, 'Kitchen')) return [];

    return [
        'kitchen faucet',
        'kitchen sink',
        'garbage disposal',
        'dishwasher',
        'dishwasher supply line',
        'dishwasher drain line',
        'dishwasher air gap',
        'kitchen drain / p-trap',
        'kitchen hot angle stop',
        'kitchen cold angle stop',
        'refrigerator water line',
        'stove / range',
        'counter gfci - left of sink',
        'counter gfci - right of sink',
        'countertop outlet circuit 1',
        'countertop outlet circuit 2',
        'island / peninsula outlet',
        'refrigerator dedicated outlet',
        'dishwasher dedicated outlet',
        'microwave dedicated outlet',
        'garbage disposal dedicated outlet',
        'garbage disposal switch',
        'range / oven outlet',
        'range hood outlet',
        'under-cabinet led lighting',
        'ceiling led lighting',
        'kitchen exhaust fan',
        'usb outlet',
        'usb-c outlet',
        'ethernet / data outlet',
        'kitchen subpanel if present',
        'reverse osmosis',
        'sink drain',
        'p-trap',
        'stove',
        'dishwasher',
        'refrigerator',
        'gfci outlet',
    ];
}

function normalize(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function groupItemsBySystem(items: AreaHomeItem[]) {
    const grouped = new Map<string, AreaHomeItem[]>();

    items.forEach((item) => {
        const title = getAreaItemSectionTitle(item);
        grouped.set(title, [...(grouped.get(title) || []), item]);
    });

    const sortedSections = areaItemSectionOrder
        .map((title) => ({ title, items: grouped.get(title) || [] }))
        .filter((section) => section.items.length > 0);

    const remainingSections = [...grouped.entries()]
        .filter(([title]) => !areaItemSectionOrder.includes(title))
        .map(([title, sectionItems]) => ({ title, items: sectionItems }));

    return [...sortedSections, ...remainingSections];
}

function getItemGroupHeading(sectionTitle: string) {
    return `${sectionTitle} items`;
}

function getAreaAddItemDescription(systemName: string) {
    const system = normalize(getSystemDefinition(systemName)?.key || systemName);

    if (system === 'electrical') return 'Outlet, switch, light, fan, panel, or circuit.';
    if (system === 'gas') return 'Meter, shutoff, connector, appliance line, or safety device.';
    if (system === 'drains / sewer') return 'Drain, trap, cleanout, vent, sewer line, or fixture.';
    if (system === 'hvac') return 'Unit, thermostat, register, disconnect, duct, or component.';
    if (system === 'irrigation') return 'Controller, valve, station, sprinkler, drip line, or sensor.';
    if (system === 'pool') return 'Pump, filter, heater, light, control, or safety component.';

    return 'Faucet, valve, supply line, appliance, equipment, or fixture.';
}

function getAreaItemSectionTitle(item: AreaHomeItem) {
    const category = normalize(item.category || '');
    const system = normalize(item.system || '');

    if (category === 'work history') return 'Work History';
    if (category === 'documents' || system === 'documents') return 'Documents';
    if (system === 'plumbing' || system === 'water service' || system === 'water') return 'Water Service';
    if (system === 'electrical' || system === 'electrical system') return 'Electrical System';
    if (system === 'appliances') return 'Appliances';
    if (system === 'gas' || system === 'gas service') return 'Gas Service';
    if (system === 'hvac' || system === 'ac service' || system === 'heating and cooling') return 'HVAC / AC Service';
    if (
        system === 'drains / sewer' ||
        system === 'drains' ||
        system === 'sewer' ||
        system === 'sewer service'
    ) {
        return 'Sewer Service';
    }
    if (system === 'safety' || system === 'safety system') return 'Safety System';

    return item.system ? getSystemLabel(item.system) : 'Other Items';
}

function getItemIcon(item: AreaHomeItem) {
    const name = normalize(item.name || '');
    const system = normalize(item.system || '');

    if (name.includes('faucet')) return '🚰';
    if (name.includes('garbage disposal')) return '⚙️';
    if (name.includes('dishwasher')) return '🍽️';
    if (name.includes('angle stop') || name.includes('shutoff') || name.includes('valve')) return '🔘';
    if (name.includes('air gap')) return '↕️';
    if (name.includes('refrigerator')) return '🧊';
    if (name.includes('reverse osmosis') || system.includes('water quality')) return '💧';
    if (name.includes('drain') || name.includes('p-trap')) return '🔧';
    if (name.includes('stove')) return '🔥';
    if (name.includes('gfci') || name.includes('switch') || system.includes('electrical')) return '⚡';
    if (system.includes('appliance')) return '🔌';
    if (system.includes('drain')) return '🧰';

    return '🏠';
}

/*
 * The current schema stores one immediate parent name on home_items.parent_area.
 * That supports Service -> Area -> Container -> Item. Repeating the same
 * container name under two different parents in the same service is safe for
 * direct items, but deeper grandchildren with the same container name can still
 * be ambiguous until containers get stable parent ids.
 */

const areaItemSectionOrder = [
    'Water Service',
    'Electrical System',
    'Appliances',
    'Gas Service',
    'HVAC / AC Service',
    'Sewer Service',
    'Safety System',
    'Documents',
    'Work History',
];

const areaActionGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 18,
};

const areaQuickActionCardStyle = {
    width: '31%' as const,
    minWidth: 180,
    minHeight: 132,
    borderWidth: 1,
    justifyContent: 'space-between' as const,
    paddingVertical: 12,
    paddingHorizontal: 14,
};

const areaContainerActionCardStyle = {
    backgroundColor: '#EEF4FF',
    borderColor: '#C8DAFF',
};

const areaItemActionCardStyle = {
    backgroundColor: '#FFF8DF',
    borderColor: '#F2DC92',
};

const areaArchiveActionCardStyle = {
    backgroundColor: '#FFF1F4',
    borderColor: '#F6CAD3',
};

const areaQuickActionTitleStyle = {
    fontWeight: '900' as const,
};

const areaQuickActionTextStyle = {
    fontWeight: '800' as const,
    marginTop: 4,
    marginBottom: 10,
};

const areaQuickActionButtonStyle = {
    alignSelf: 'flex-start' as const,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 112,
};

const areaQuickActionButtonTextStyle = {
    fontSize: 12,
};

const starterRecoveryBannerStyle = {
    backgroundColor: '#ECFBF5',
    borderColor: '#BFEEDC',
    borderWidth: 1,
    marginBottom: 20,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
};

const starterRecoveryBannerTextStyle = {
    flex: 1,
    minWidth: 190,
};

const starterRecoveryBannerActionStyle = {
    flexShrink: 0,
};

const starterRecoveryButtonStyle = {
    minWidth: 170,
    paddingVertical: 8,
    paddingHorizontal: 12,
};

const sectionListStyle = {
    gap: 28,
};

const sectionBlockStyle = {
    gap: 14,
};

const sectionHeaderStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
};

const subsectionHeaderStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const gridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 14,
    justifyContent: 'center' as const,
};

const directItemsSectionStyle = {
    marginTop: 32,
};

const childAreaCardStyle = {
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

const childAreaSubtitleStyle = {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '800' as const,
    textAlign: 'center' as const,
};

const itemCardStyle = {
    width: '47%' as const,
    minWidth: 132,
    maxWidth: 170,
    minHeight: 166,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
};

const iconCircleStyle = {
    width: 76,
    height: 76,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
};

const iconTextStyle = {
    fontSize: 36,
};

const itemTitleStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
    lineHeight: 19,
};

const systemLabelStyle = {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800' as const,
    textAlign: 'center' as const,
};

const loadingCardStyle = {
    marginBottom: 18,
};

const emptyStateCardStyle = {
    alignSelf: 'center' as const,
    minWidth: 190,
    maxWidth: 280,
    paddingVertical: 12,
    paddingHorizontal: 16,
};

const starterRecoveryModalBackdropStyle = {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 18,
};

const starterRecoveryModalCardStyle = {
    width: '100%' as const,
    maxWidth: 520,
};

const starterRecoveryModalBodyStyle = {
    marginTop: 12,
    fontWeight: '800' as const,
};

const starterRecoveryModalMetaStyle = {
    marginTop: 12,
    fontWeight: '900' as const,
};

const starterRecoveryModalMessageStyle = {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
};

const starterRecoveryModalActionsStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end' as const,
    gap: 12,
    marginTop: 18,
};

const starterRecoveryModalButtonStyle = {
    minWidth: 150,
    paddingVertical: 11,
};
