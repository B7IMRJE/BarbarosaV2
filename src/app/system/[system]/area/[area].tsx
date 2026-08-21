import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { getStatusCardStyle } from '../../../../components/cards/SystemStatusCard';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../../../lib/activeProperty';
import { getAreaTemplateByName, getStarterItemsForAreaSystem } from '../../../../lib/areaTemplates';
import { getSystemLabel } from '../../../../lib/homeSystems';
import {
    providerModeItemPath,
    providerModeQueryParams,
    readProviderModeParams,
} from '../../../../lib/providerMode';
import {
    buildProviderHomeItemsRpcArgs,
    getProviderHomeItemsReadStrategy,
    getProviderHomeItemsRpcName,
    usesProviderHomeItemsRpc,
} from '../../../../lib/providerHomeItems';
import {
    formatDirectItemsEmptyMessage,
    resolveAreaVisibleItems,
} from '../../../../lib/providerItemVisibility';
import { saveEstimateDraftContext } from '../../../../lib/estimateDraft';
import {
    historicalHomeOSTradeNotice,
    isHomeOSTradeEnabled,
    isWholeHomeRepipePlacement,
    tradeKeyForHomeOSSystem,
    type HomeOSTradeContext,
} from '../../../../lib/homeosTradeCapabilitiesCore';
import {
    resolveHomeOSContainerGrid,
    resolveHomeOSContainerItemWidth,
} from '../../../../lib/homeos-responsive-layout';
import {
    canonicalAreaTemplateForTrades,
    planAddMissingAreaCards,
} from '../../../../lib/homeAreaCardActions';
import {
    loadHomeOSTradeContext,
    startCompanyRepipeWizard,
} from '../../../../lib/homeosTradeCapabilities';
import {
    getAreaIcon,
    getBroadZoneDefinition,
    getSuggestedChildAreas,
    normalizeAreaName,
} from '../../../../lib/systemDefaults';
import { areEquivalentStarterItemNames } from '../../../../lib/starterHomeSetup';
import { supabase } from '../../../../lib/supabase';
import { useStableCallback } from '../../../../hooks/useStableCallback';
import { useTheme } from '../../../../theme/useTheme';
import ProductReferenceModal from '../../../../features/homeos-items/product-reference-modal';
import CompactHomeOSCard from '../../../../features/homeos-items/compact-homeos-card';

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
    catalog_product_id?: string | null;
    master_product_variant_id?: string | null;
    starter_template_key?: string | null;
};

export default function AreaScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const { width: viewportWidth } = useWindowDimensions();
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
    const providerModeContext = useMemo(() => readProviderModeParams({
        providerMode: routeParams.providerMode,
        companyId: routeParams.companyId,
        propertyId: routeParams.propertyId,
        returnTo: routeParams.returnTo,
        serviceRequestId: routeParams.serviceRequestId,
        scheduleSlotId: routeParams.scheduleSlotId,
        jobId: routeParams.jobId,
    }), [
        routeParams.companyId,
        routeParams.jobId,
        routeParams.propertyId,
        routeParams.providerMode,
        routeParams.returnTo,
        routeParams.scheduleSlotId,
        routeParams.serviceRequestId,
    ]);

    const systemName = decodeRouteParam(system) || 'System';
    const systemLabel = getSystemLabel(systemName);
    const areaName = decodeRouteParam(area) || 'Area';
    const parentAreaName = decodeRouteParam(parentArea).trim();
    const refreshKey = String(refresh || '');
    const [items, setItems] = useState<AreaHomeItem[]>([]);
    const [childAreas, setChildAreas] = useState<AreaHomeItem[]>([]);
    const [currentAreaRecord, setCurrentAreaRecord] = useState<AreaHomeItem | null>(null);
    const [suggestedChildAreas, setSuggestedChildAreas] = useState<string[]>([]);
    const [starterRecoveryPreview, setStarterRecoveryPreview] = useState<{ missing: number; present: number } | null>(null);
    const [returnedHomeItemRowCount, setReturnedHomeItemRowCount] = useState<number | null>(null);
    const [homeItemsQueryFailed, setHomeItemsQueryFailed] = useState(false);
    const [loading, setLoading] = useState(true);
    const [archivingRecordId, setArchivingRecordId] = useState<string | null>(null);
    const [productReferenceItem, setProductReferenceItem] = useState<AreaHomeItem | null>(null);
    const [message, setMessage] = useState('');
    const [tradeContext, setTradeContext] = useState<HomeOSTradeContext | null>(null);
    const [tradeMessage, setTradeMessage] = useState('');
    const [startingRepipe, setStartingRepipe] = useState(false);
    const gridGap = scaleIcon(12);
    const gridContentWidth = Math.min(Math.max(viewportWidth - scaleIcon(40), 0), 900);
    const gridMinimumWidth = scaleIcon(152);
    const gridColumns = resolveHomeOSContainerGrid({
        viewportWidth,
        contentWidth: gridContentWidth,
        minimumItemWidth: gridMinimumWidth,
        gap: gridGap,
    });
    const gridCardWidth = resolveHomeOSContainerItemWidth({
        contentWidth: gridContentWidth,
        columns: gridColumns,
        gap: gridGap,
        minimumItemWidth: gridMinimumWidth,
        maximumItemWidth: scaleIcon(220),
    });
    const loadAreaItemsStable = useStableCallback(loadAreaItems);
    const itemSections = groupItemsBySystem(items);
    const currentTradeKey = tradeKeyForHomeOSSystem(systemName);
    const currentTradeEnabled = isHomeOSTradeEnabled(tradeContext?.enabledTradeKeys || [], currentTradeKey);
    const showDirectRepipeAction = !!providerModeContext
        && isWholeHomeRepipePlacement(systemName, areaName, parentAreaName)
        && tradeContext?.repipeTradeEnabled === true;
    const suggestedStarterItems = useMemo(() => {
        return getStarterItemsForAreaSystem(areaName, systemName)
            .filter((item) => !items.some((existingItem) =>
                areEquivalentStarterItemNames(areaName, existingItem.name || '', item.name)
            ))
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
        void loadAreaItemsStable();
    }, [
        systemName,
        areaName,
        parentAreaName,
        refreshKey,
        providerModeContext,
        loadAreaItemsStable,
    ]);

    useFocusEffect(
        useCallback(() => {
            if (!providerModeContext) return;

            void loadAreaItemsStable({ preserveMessage: true });
        }, [
            providerModeContext,
            loadAreaItemsStable,
        ])
    );

    useEffect(() => {
        if (!providerModeContext || typeof window === 'undefined') return;

        const refreshFromLifecycle = () => {
            void loadAreaItemsStable({ preserveMessage: true });
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
        providerModeContext,
        loadAreaItemsStable,
    ]);

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
        let loadedTradeContext: HomeOSTradeContext | null = null;

        try {
            loadedTradeContext = await loadHomeOSTradeContext({
                companyId: providerModeContext?.companyId,
                propertyId: activeProperty.propertyId,
                serviceRequestId: providerModeContext?.serviceRequestId,
                scheduleSlotId: providerModeContext?.scheduleSlotId,
                jobId: providerModeContext?.jobId,
            });
            setTradeContext(loadedTradeContext);
            setTradeMessage('');
        } catch (error) {
            setTradeContext(null);
            setTradeMessage(error instanceof Error ? error.message : 'Company trade access could not be confirmed.');
        }

        if (providerModeContext) {
            const readStrategy = getProviderHomeItemsReadStrategy(
                providerModeContext,
                activeProperty.membershipRole
            );

            if (readStrategy === 'denied') {
                loadErrorMessage = 'Client HomeOS requires an assigned request, visit, or job context.';
            } else if (usesProviderHomeItemsRpc(readStrategy)) {
                const { data, error } = await supabase.rpc(
                    getProviderHomeItemsRpcName(readStrategy),
                    buildProviderHomeItemsRpcArgs(providerModeContext)
                );

                if (error) {
                    loadErrorMessage = error.message;
                } else {
                    rows = (data || []) as AreaHomeItem[];
                }
            } else {
                const { data, error } = await supabase
                    .from('home_items')
                    .select('id, name, system, item_slug, category, status, install_state, location, parent_area, catalog_product_id, master_product_variant_id, starter_template_key')
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
        } else {
            const { data, error } = await supabase
                .from('home_items')
                .select('id, name, system, item_slug, category, status, install_state, location, parent_area, catalog_product_id, master_product_variant_id, starter_template_key')
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
        const areaTemplate = getAreaTemplateByName(areaName);
        const areaStarterPlan = areaTemplate && areaTemplate.id !== 'custom-area'
            ? planAddMissingAreaCards({
                userId: activeProperty.userId,
                propertyId: activeProperty.propertyId,
                areaName,
                system: systemName,
                parentArea: parentAreaName,
                template: canonicalAreaTemplateForTrades(
                    areaTemplate,
                    loadedTradeContext?.enabledTradeKeys || [],
                ),
                existingRows: rows,
            })
            : null;
        const showStarterRecovery = Boolean(
            areaStarterPlan?.areaExists && areaStarterPlan.rowsToInsert.length > 0
        );

        setChildAreas(sortAreaRecords(savedChildAreas));
        setCurrentAreaRecord(visibleRows.currentAreaRecord);
        setSuggestedChildAreas(nextSuggestedChildAreas);
        setStarterRecoveryPreview(showStarterRecovery && areaStarterPlan ? {
            missing: areaStarterPlan.rowsToInsert.length,
            present: areaStarterPlan.alreadyPresent,
        } : null);
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

    function openAddMissingStarterEquipment() {
        const template = getAreaTemplateByName(areaName);

        if (!template || template.id === 'custom-area') {
            setMessage('This area does not have a reusable canonical starter-card template.');
            return;
        }

        router.push({
            pathname: '/area/add-missing',
            params: {
                system: systemName,
                sourceArea: areaName,
                templateId: template.id,
                ...(parentAreaName ? { parentArea: parentAreaName } : {}),
                ...(providerModeContext ? providerModeQueryParams(providerModeContext) : {}),
            },
        } as any);
    }

    function createSuggestedItem(category: string, name?: string, openDeckPicker = false) {
        router.push({
            pathname: '/item/create',
            params: {
                system: systemName,
                area: areaName,
                ...(parentAreaName ? { parentArea: parentAreaName } : {}),
                category,
                name: name || '',
                ...(openDeckPicker ? { deckPicker: 'true' } : {}),
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

    async function openRepipeWizard() {
        if (!providerModeContext || !tradeContext?.canStartRepipe) {
            setMessage('This account cannot start a Repipe estimate for this customer. Confirm the assigned visit and company Plumbing / Repipe capability, then retry.');
            return;
        }

        setStartingRepipe(true);
        setMessage('Opening the secure Repipe workspace…');

        try {
            const activeProperty = await requireActivePropertyMembership({
                propertyIdOverride: providerModeContext.propertyId,
                companyId: providerModeContext.companyId,
            });
            const result = await startCompanyRepipeWizard({
                companyId: providerModeContext.companyId,
                propertyId: providerModeContext.propertyId,
                serviceRequestId: providerModeContext.serviceRequestId,
                scheduleSlotId: providerModeContext.scheduleSlotId,
                jobId: providerModeContext.jobId,
            });

            await saveEstimateDraftContext({
                estimate_session_id: result.estimateSessionId,
                estimate_category: 'whole_home_repipe',
                company_id: providerModeContext.companyId,
                property_id: providerModeContext.propertyId,
                customer_home_name: null,
                service_request_id: providerModeContext.serviceRequestId || null,
                job_id: providerModeContext.jobId || null,
                schedule_slot_id: providerModeContext.scheduleSlotId || null,
                technician_company_user_id: result.companyUserId,
                technician_name: null,
                issue_summary: 'Whole Home Repipe estimate',
                source: 'provider_mode',
                updated_at: new Date().toISOString(),
            }, {
                userId: activeProperty.userId,
                companyId: providerModeContext.companyId,
                propertyId: providerModeContext.propertyId,
            });

            router.push({
                pathname: '/estimate/workspace',
                params: {
                    ...providerModeQueryParams(providerModeContext),
                    estimateSessionId: result.estimateSessionId,
                    step: 'build',
                },
            } as any);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'The Repipe workspace could not be opened. Please retry.');
        } finally {
            setStartingRepipe(false);
        }
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

    return (
        <>
            <ScrollView
                contentInsetAdjustmentBehavior="automatic"
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
                    {showDirectRepipeAction && (
                        <ThemedCard style={[areaQuickActionCardStyle, { borderColor: theme.colors.primary, borderWidth: 2 }]}>
                            <Text style={[areaQuickActionTitleStyle, { color: theme.colors.text, fontSize: scaleFont(17) }]}>
                                Whole Home Repipe
                            </Text>
                            <Text style={[areaQuickActionTextStyle, { color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(16) }]}>
                                Start the assigned customer’s Repipe scope and estimate without adding a duplicate HomeOS card.
                            </Text>
                            <ThemedButton
                                title={startingRepipe ? 'Opening Repipe Wizard…' : 'Start Repipe Wizard'}
                                disabled={startingRepipe || !tradeContext?.canStartRepipe}
                                onPress={() => void openRepipeWizard()}
                                style={areaQuickActionButtonStyle}
                                textStyle={areaQuickActionButtonTextStyle}
                            />
                            {!tradeContext?.canStartRepipe && (
                                <Text accessibilityRole="alert" style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(16) }}>
                                    An assigned visit and estimate permission are required.
                                </Text>
                            )}
                        </ThemedCard>
                    )}

                    <ThemedCard style={areaQuickActionCardStyle}>
                        <Text style={[areaQuickActionTitleStyle, { color: theme.colors.text, fontSize: scaleFont(15) }]}>
                            Add Area / Container
                        </Text>
                        <Text style={[areaQuickActionTextStyle, { color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(16) }]}>
                            Closet, cabinet, stove, vanity, or nested space.
                        </Text>
                        <ThemedButton
                            title="+ Area / Container"
                            variant="glass"
                            disabled={!currentTradeEnabled}
                            onPress={() => createChildArea()}
                            style={areaQuickActionButtonStyle}
                            textStyle={areaQuickActionButtonTextStyle}
                        />
                    </ThemedCard>

                    <ThemedCard style={areaQuickActionCardStyle}>
                        <Text style={[areaQuickActionTitleStyle, { color: theme.colors.text, fontSize: scaleFont(15) }]}>
                            Add HomeOS Card
                        </Text>
                        <Text style={[areaQuickActionTextStyle, { color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(16) }]}>
                            Search the reusable HomeOS Deck, or create a one-off custom item.
                        </Text>
                        <ThemedButton
                            title="+ From HomeOS Deck"
                            disabled={!currentTradeEnabled}
                            onPress={() => createSuggestedItem('Equipment', '', true)}
                            style={areaQuickActionButtonStyle}
                            textStyle={areaQuickActionButtonTextStyle}
                        />
                        <ThemedButton
                            title="Manual Custom Item"
                            variant="glass"
                            disabled={!currentTradeEnabled}
                            onPress={() => createSuggestedItem('Equipment')}
                            style={areaQuickActionButtonStyle}
                            textStyle={areaQuickActionButtonTextStyle}
                        />
                    </ThemedCard>

                    {currentAreaRecord?.id && (
                        <ThemedCard style={areaQuickActionCardStyle}>
                            <Text style={[areaQuickActionTitleStyle, { color: theme.colors.text, fontSize: scaleFont(15) }]}>
                                Manage Area
                            </Text>
                            <Text style={[areaQuickActionTextStyle, { color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(16) }]}>
                                Archive this area or container when it is no longer active.
                            </Text>
                            <ThemedButton
                                title={archivingRecordId === currentAreaRecord.id ? 'Archiving...' : 'Archive Area'}
                                variant="glass"
                                disabled={!!archivingRecordId}
                                onPress={() => confirmArchiveArea(currentAreaRecord, true)}
                                style={areaQuickActionButtonStyle}
                                textStyle={areaQuickActionButtonTextStyle}
                            />
                        </ThemedCard>
                    )}
                </View>

                {!!tradeContext && !currentTradeEnabled && currentTradeKey && (
                    <ThemedCard style={{ marginTop: scaleIcon(12), borderColor: theme.colors.primary }}>
                        <Text accessibilityRole="alert" style={{ color: theme.colors.text, fontSize: scaleFont(14), lineHeight: scaleFont(20), fontWeight: '800' }}>
                            Existing {systemLabel} records remain visible as history. This company has not enabled {currentTradeKey === 'hvac' ? 'HVAC' : currentTradeKey.charAt(0).toUpperCase() + currentTradeKey.slice(1)}, so new cards and suggestions are unavailable.
                        </Text>
                    </ThemedCard>
                )}

                {!!tradeMessage && (
                    <ThemedCard style={{ marginTop: scaleIcon(12), borderColor: theme.colors.danger }}>
                        <Text accessibilityRole="alert" style={{ color: theme.colors.text, fontSize: scaleFont(14), lineHeight: scaleFont(20), fontWeight: '800' }}>{tradeMessage}</Text>
                        <ThemedButton title="Retry Access Check" variant="secondary" onPress={() => void loadAreaItems()} style={{ alignSelf: 'flex-start', marginTop: scaleIcon(10) }} />
                    </ThemedCard>
                )}

                {!!starterRecoveryPreview && (
                    <ThemedCard style={starterRecoveryBannerStyle}>
                        <View style={starterRecoveryBannerTextStyle}>
                            <Text style={[areaQuickActionTitleStyle, { color: theme.colors.text, fontSize: scaleFont(15) }]}>
                                Starter Equipment
                            </Text>
                            <Text style={[areaQuickActionTextStyle, { color: theme.colors.mutedText, fontSize: scaleFont(12), lineHeight: scaleFont(16) }]}>
                                Missing now: {starterRecoveryPreview.missing} canonical card{starterRecoveryPreview.missing === 1 ? '' : 's'} · {starterRecoveryPreview.present} already present.
                            </Text>
                        </View>
                        <View style={starterRecoveryBannerActionStyle}>
                            <ThemedButton
                                title="Review Missing Cards"
                                variant="secondary"
                                onPress={openAddMissingStarterEquipment}
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

                            <View style={[gridStyle, { gap: gridGap }]}>
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
                                            width={gridCardWidth}
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
                                        width={gridCardWidth}
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

                                                <View style={[gridStyle, { gap: gridGap }]}>
                                                    {section.items.map((item) => {
                                                        const archiveKey = item.id || item.item_slug || item.name || '';

                                                        return (
                                                            <AreaItemCard
                                                                key={archiveKey}
                                                                item={item}
                                                                historicalNotice={historicalHomeOSTradeNotice(item.system, tradeContext?.enabledTradeKeys || [])}
                                                                onOpen={() => {
                                                                    const itemSlug = item.item_slug || '';

                                                                    if (itemSlug) {
                                                                        router.push(providerModeContext ? providerModeItemPath(itemSlug, providerModeContext) : `/item/${itemSlug}` as any);
                                                                    }
                                                                }}
                                                                onArchive={() => confirmArchiveItem(item)}
                                                                onShowProductReference={
                                                                    !providerModeContext && item.id && (item.catalog_product_id || item.master_product_variant_id)
                                                                        ? () => setProductReferenceItem(item)
                                                                        : undefined
                                                                }
                                                                archiveTitle={archivingRecordId === archiveKey ? 'Archiving...' : 'Archive Item'}
                                                                archiveDisabled={!!archivingRecordId}
                                                                width={gridCardWidth}
                                                            />
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                        ))}

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

            <ProductReferenceModal
                visible={Boolean(productReferenceItem)}
                homeItemId={productReferenceItem?.id || ''}
                itemName={productReferenceItem?.name || 'HomeOS item'}
                onClose={() => setProductReferenceItem(null)}
            />
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
    width,
}: {
    title: string;
    subtitle: string;
    onPress: () => void;
    onActivate?: () => void;
    onArchive?: () => void;
    archiveTitle?: string;
    archiveDisabled?: boolean;
    width: number;
}) {
    return (
        <CompactHomeOSCard
            title={title}
            subtitle={subtitle}
            icon={getAreaIcon(title)}
            kind="area"
            onOpen={onPress}
            secondaryActionTitle={onActivate ? 'Activate Card' : undefined}
            onSecondaryAction={onActivate}
            menuTitle={archiveTitle}
            onMenu={onActivate ? undefined : onArchive}
            disabled={archiveDisabled}
            style={{ width, minWidth: width, maxWidth: width }}
        />
    );
}

function AreaItemCard({
    item,
    historicalNotice,
    onOpen,
    onActivate,
    onArchive,
    onShowProductReference,
    archiveTitle = 'Archive',
    archiveDisabled = false,
    width,
}: {
    item: AreaHomeItem;
    historicalNotice?: string;
    onOpen: () => void;
    onActivate?: () => void;
    onArchive?: () => void;
    onShowProductReference?: () => void;
    archiveTitle?: string;
    archiveDisabled?: boolean;
    width: number;
}) {
    const { theme } = useTheme();
    const itemName = item.name || 'Unnamed Item';
    const systemLabel = item.system ? getSystemLabel(item.system) : '';
    const itemSlug = item.item_slug || '';
    const statusStyle = getStatusCardStyle(item.status, theme);

    return (
        <CompactHomeOSCard
            title={itemName}
            semanticIdentity={item.starter_template_key || undefined}
            subtitle={[systemLabel, historicalNotice].filter(Boolean).join(' · ')}
            icon={getItemIcon(item)}
            onOpen={onOpen}
            openDisabled={!itemSlug}
            actionTitle={onShowProductReference ? 'Product Details' : undefined}
            onAction={onShowProductReference}
            secondaryActionTitle={onActivate ? 'Activate Card' : undefined}
            onSecondaryAction={onActivate}
            menuTitle={archiveTitle}
            onMenu={onActivate ? undefined : onArchive}
            disabled={archiveDisabled}
            accentColor={statusStyle.borderColor}
            style={{ width, minWidth: width, maxWidth: width }}
        />
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
    justifyContent: 'center' as const,
};

const directItemsSectionStyle = {
    marginTop: 32,
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
