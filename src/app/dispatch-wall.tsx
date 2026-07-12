import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View, type ViewStyle } from 'react-native';
import {
    getCompanyDispatchRequests,
    isEmergencyDispatchRequest,
    LEAD_ALERT_REFRESH_MS,
    type CompanyDispatchRequest,
} from '../lib/companyLeadAlerts';
import { canAccessDispatch } from '../lib/companyPermissions';
import {
    buildDispatchWallSections,
    formatWallStatusLabel,
    getWallDisplayCode,
    type DispatchWallCompanyUser,
    type DispatchWallItem,
    type DispatchWallRequest,
    type DispatchWallScheduleSlot,
    type DispatchWallSectionKey,
    type DispatchWallTimingEvent,
} from '../lib/dispatchWallClassification';
import { loadLoggedInUserCompanyAccess, type CompanyRouteAccessRow } from '../lib/onboarding';
import { supabase } from '../lib/supabase';

declare const __DEV__: boolean;

type CompanyBrand = {
    id: string;
    name: string | null;
    public_name: string | null;
    dba_name: string | null;
};

type WallCompanyAccess = {
    company_id: string;
    role: string | null;
    status: string | null;
};

type WallAccessResult = {
    access: WallCompanyAccess | null;
    choices: WallCompanyAccess[];
    deniedAccess: WallCompanyAccess | null;
    isPlatformAdmin: boolean;
};

type FullscreenDocument = Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => void;
};

type FullscreenElement = HTMLElement & {
    webkitRequestFullscreen?: () => void;
};

type WallSectionConfig = {
    key: DispatchWallSectionKey;
    title: string;
    icon: string;
    row: 'top' | 'bottom';
    headerColor: string;
    panelColor: string;
    cardColor: string;
    cardBorderColor: string;
    textColor: string;
    mutedColor: string;
    badgeColor: string;
    badgeTextColor: string;
    previewCapacity: number;
    columnWeight: number;
};

const SECTION_CONFIGS: Record<DispatchWallSectionKey, WallSectionConfig> = {
    emergency: {
        key: 'emergency',
        title: 'Emergency',
        icon: '!',
        row: 'top',
        headerColor: '#D90000',
        panelColor: '#2A0507',
        cardColor: '#4A080A',
        cardBorderColor: '#E2251F',
        textColor: '#FFF7F7',
        mutedColor: '#FFD2D2',
        badgeColor: '#910B0B',
        badgeTextColor: '#FFFFFF',
        previewCapacity: 5,
        columnWeight: 1.15,
    },
    emergency_leads: {
        key: 'emergency_leads',
        title: 'Emergency Leads',
        icon: '☎',
        row: 'top',
        headerColor: '#B91C1C',
        panelColor: '#230505',
        cardColor: '#471009',
        cardBorderColor: '#C0261C',
        textColor: '#FFF7F3',
        mutedColor: '#FFD6CC',
        badgeColor: '#85110C',
        badgeTextColor: '#FFFFFF',
        previewCapacity: 5,
        columnWeight: 1.05,
    },
    running_late: {
        key: 'running_late',
        title: 'Running Late',
        icon: '⏱',
        row: 'top',
        headerColor: '#F97316',
        panelColor: '#431407',
        cardColor: '#7C2D12',
        cardBorderColor: '#FB923C',
        textColor: '#FFF7ED',
        mutedColor: '#FED7AA',
        badgeColor: '#EA580C',
        badgeTextColor: '#FFFFFF',
        previewCapacity: 5,
        columnWeight: 1.05,
    },
    regular_leads: {
        key: 'regular_leads',
        title: 'Regular Leads',
        icon: '▣',
        row: 'top',
        headerColor: '#7DD3FC',
        panelColor: '#CFF3FF',
        cardColor: '#F0F9FF',
        cardBorderColor: '#38BDF8',
        textColor: '#082F49',
        mutedColor: '#075985',
        badgeColor: '#BAE6FD',
        badgeTextColor: '#082F49',
        previewCapacity: 5,
        columnWeight: 1,
    },
    unassigned: {
        key: 'unassigned',
        title: 'Unassigned',
        icon: '♙',
        row: 'top',
        headerColor: '#FACC15',
        panelColor: '#8A6500',
        cardColor: '#FDE68A',
        cardBorderColor: '#EAB308',
        textColor: '#111827',
        mutedColor: '#3F2E00',
        badgeColor: '#D6A400',
        badgeTextColor: '#111827',
        previewCapacity: 5,
        columnWeight: 1,
    },
    assigned_ready: {
        key: 'assigned_ready',
        title: 'Assigned / Ready',
        icon: '✓',
        row: 'bottom',
        headerColor: '#16A34A',
        panelColor: '#052E16',
        cardColor: '#064E2A',
        cardBorderColor: '#15803D',
        textColor: '#F0FDF4',
        mutedColor: '#BBF7D0',
        badgeColor: '#0E7A38',
        badgeTextColor: '#FFFFFF',
        previewCapacity: 6,
        columnWeight: 1.25,
    },
    on_my_way: {
        key: 'on_my_way',
        title: 'On My Way',
        icon: '▸',
        row: 'bottom',
        headerColor: '#2563EB',
        panelColor: '#061B3D',
        cardColor: '#083A78',
        cardBorderColor: '#1D4ED8',
        textColor: '#EFF6FF',
        mutedColor: '#BFDBFE',
        badgeColor: '#174EA6',
        badgeTextColor: '#FFFFFF',
        previewCapacity: 5,
        columnWeight: 1,
    },
    in_progress: {
        key: 'in_progress',
        title: 'In Progress',
        icon: '●',
        row: 'bottom',
        headerColor: '#0891B2',
        panelColor: '#062A31',
        cardColor: '#075464',
        cardBorderColor: '#0891B2',
        textColor: '#ECFEFF',
        mutedColor: '#A5F3FC',
        badgeColor: '#0E7490',
        badgeTextColor: '#FFFFFF',
        previewCapacity: 6,
        columnWeight: 1.1,
    },
    available: {
        key: 'available',
        title: 'Available',
        icon: '✓',
        row: 'bottom',
        headerColor: '#22C55E',
        panelColor: '#052E1A',
        cardColor: '#065F46',
        cardBorderColor: '#10B981',
        textColor: '#ECFDF5',
        mutedColor: '#BBF7D0',
        badgeColor: '#15803D',
        badgeTextColor: '#FFFFFF',
        previewCapacity: 5,
        columnWeight: 0.85,
    },
    absent: {
        key: 'absent',
        title: 'Absent',
        icon: '◆',
        row: 'bottom',
        headerColor: '#64748B',
        panelColor: '#17202C',
        cardColor: '#263342',
        cardBorderColor: '#475569',
        textColor: '#F8FAFC',
        mutedColor: '#CBD5E1',
        badgeColor: '#475569',
        badgeTextColor: '#FFFFFF',
        previewCapacity: 5,
        columnWeight: 0.85,
    },
    closed_today: {
        key: 'closed_today',
        title: 'Closed Today',
        icon: '▰',
        row: 'bottom',
        headerColor: '#334155',
        panelColor: '#111827',
        cardColor: '#1F2937',
        cardBorderColor: '#374151',
        textColor: '#F8FAFC',
        mutedColor: '#CBD5E1',
        badgeColor: '#475569',
        badgeTextColor: '#FFFFFF',
        previewCapacity: 5,
        columnWeight: 1,
    },
};

const TOP_SECTION_KEYS: DispatchWallSectionKey[] = ['emergency', 'emergency_leads', 'running_late', 'regular_leads', 'unassigned'];
const BOTTOM_SECTION_KEYS: DispatchWallSectionKey[] = ['assigned_ready', 'on_my_way', 'in_progress', 'available', 'absent', 'closed_today'];

export default function DispatchWallScreen() {
    const params = useLocalSearchParams<{ companyId?: string | string[]; demo?: string | string[] }>();
    const requestedCompanyId = firstParam(params.companyId);
    const demoMode = isDevelopmentMode() && firstParam(params.demo).trim() === '1';
    const { width, height } = useWindowDimensions();
    const refreshInFlight = useRef(false);
    const [clockNow, setClockNow] = useState(() => new Date());
    const [dataNow, setDataNow] = useState(() => new Date());
    const [companyAccess, setCompanyAccess] = useState<WallCompanyAccess | null>(null);
    const [companyChoices, setCompanyChoices] = useState<WallCompanyAccess[]>([]);
    const [company, setCompany] = useState<CompanyBrand | null>(null);
    const [requests, setRequests] = useState<DispatchWallRequest[]>([]);
    const [scheduleSlots, setScheduleSlots] = useState<DispatchWallScheduleSlot[]>([]);
    const [timingEvents, setTimingEvents] = useState<DispatchWallTimingEvent[]>([]);
    const [companyUsers, setCompanyUsers] = useState<DispatchWallCompanyUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
    const [expandedSectionKey, setExpandedSectionKey] = useState<DispatchWallSectionKey | null>(null);
    const [detailItem, setDetailItem] = useState<DispatchWallItem | null>(null);
    const [fullscreenMessage, setFullscreenMessage] = useState('');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const compactHeight = height <= 820;
    const narrowLayout = width < 900;

    useEffect(() => {
        const intervalId = setInterval(() => {
            setClockNow(new Date());
        }, 1000);

        return () => clearInterval(intervalId);
    }, []);

    useEffect(() => {
        const intervalId = setInterval(() => {
            setDataNow(new Date());
        }, 30_000);

        return () => clearInterval(intervalId);
    }, []);

    useEffect(() => {
        if (Platform.OS !== 'web') return;

        const documentLike = getFullscreenDocument();
        if (!documentLike) return;

        const syncFullscreenState = () => {
            setIsFullscreen(isDocumentFullscreen(documentLike));
        };

        syncFullscreenState();
        documentLike.addEventListener('fullscreenchange', syncFullscreenState);
        documentLike.addEventListener('webkitfullscreenchange', syncFullscreenState);

        return () => {
            documentLike.removeEventListener('fullscreenchange', syncFullscreenState);
            documentLike.removeEventListener('webkitfullscreenchange', syncFullscreenState);
        };
    }, []);

    useEffect(() => {
        loadWallboard();
    }, [requestedCompanyId, demoMode]);

    useEffect(() => {
        const activeCompanyId = companyAccess?.company_id;

        if (!activeCompanyId || demoMode) return;

        const refreshQuietly = () => {
            void refreshWallboard(activeCompanyId);
        };

        const intervalId = setInterval(refreshQuietly, LEAD_ALERT_REFRESH_MS);
        const requestChannel = supabase
            .channel(`dispatch-wall-service-requests:${activeCompanyId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'service_requests',
                    filter: `company_id=eq.${activeCompanyId}`,
                },
                refreshQuietly
            )
            .subscribe();
        const slotChannel = supabase
            .channel(`dispatch-wall-job-slots:${activeCompanyId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'job_schedule_slots',
                    filter: `company_id=eq.${activeCompanyId}`,
                },
                refreshQuietly
            )
            .subscribe();
        const eventChannel = supabase
            .channel(`dispatch-wall-service-request-events:${activeCompanyId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'service_request_events',
                    filter: `company_id=eq.${activeCompanyId}`,
                },
                refreshQuietly
            )
            .subscribe();
        const appStateSubscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') refreshQuietly();
        });
        const focusTarget = globalThis as {
            addEventListener?: (type: 'focus', listener: () => void) => void;
            removeEventListener?: (type: 'focus', listener: () => void) => void;
        };

        focusTarget.addEventListener?.('focus', refreshQuietly);

        return () => {
            clearInterval(intervalId);
            void supabase.removeChannel(requestChannel);
            void supabase.removeChannel(slotChannel);
            void supabase.removeChannel(eventChannel);
            appStateSubscription.remove();
            focusTarget.removeEventListener?.('focus', refreshQuietly);
        };
    }, [companyAccess?.company_id, demoMode]);

    useEffect(() => {
        if (Platform.OS !== 'web' || (!expandedSectionKey && !detailItem)) return;

        const keyTarget = globalThis as {
            addEventListener?: (type: 'keydown', listener: (event: KeyboardEvent) => void) => void;
            removeEventListener?: (type: 'keydown', listener: (event: KeyboardEvent) => void) => void;
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setExpandedSectionKey(null);
                setDetailItem(null);
            }
        };

        keyTarget.addEventListener?.('keydown', handleKeyDown);

        return () => keyTarget.removeEventListener?.('keydown', handleKeyDown);
    }, [expandedSectionKey, detailItem]);

    const sections = useMemo(() => (
        buildDispatchWallSections(requests, scheduleSlots, companyUsers, dataNow, timingEvents)
    ), [requests, scheduleSlots, companyUsers, dataNow, timingEvents]);
    const companyName = getCompanyName(company) || (demoMode ? 'Bravo Dispatch' : 'Dispatch');
    const expandedItems = expandedSectionKey ? sections[expandedSectionKey] : [];

    async function loadWallboard() {
        setLoading(true);
        setMessage(demoMode ? 'Loading demo wallboard...' : 'Loading Dispatch Activity Board...');
        setExpandedSectionKey(null);
        setDetailItem(null);

        if (demoMode) {
            const demoData = createDemoWallboardData(new Date());
            setCompanyAccess({
                company_id: demoData.company.id,
                role: 'demo',
                status: 'active',
            });
            setCompany(demoData.company);
            setCompanyUsers(demoData.companyUsers);
            setRequests(demoData.requests);
            setScheduleSlots(demoData.scheduleSlots);
            setTimingEvents(demoData.timingEvents);
            setCompanyChoices([]);
            setDataNow(new Date());
            setLastUpdatedAt(new Date().toISOString());
            setMessage('');
            setLoading(false);
            return;
        }

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
            setMessage(`Could not load authenticated user: ${userError.message}`);
            setLoading(false);
            return;
        }

        if (!user) {
            router.replace('/auth/login' as never);
            return;
        }

        let accessResult: WallAccessResult;

        try {
            accessResult = await resolveWallCompanyAccess(user.id, requestedCompanyId);
        } catch (error) {
            setMessage(`Could not resolve company access: ${getErrorMessage(error)}`);
            setLoading(false);
            return;
        }

        if (!accessResult.access) {
            setCompanyChoices(accessResult.choices);

            if (accessResult.deniedAccess) {
                setMessage('Dispatch Activity Board requires office, dispatcher, supervisor, manager, admin, or owner access.');
            } else if (!requestedCompanyId && accessResult.choices.length > 1) {
                setMessage('Choose a company to open the Dispatch Activity Board.');
            } else {
                setMessage('No company Dispatch access found.');
            }

            setLoading(false);
            return;
        }

        if (!requestedCompanyId && accessResult.choices.length === 1) {
            router.replace(`/dispatch-wall?companyId=${encodeURIComponent(accessResult.access.company_id)}` as never);
        }

        setCompanyAccess(accessResult.access);
        setCompanyChoices([]);
        await refreshWallboard(accessResult.access.company_id, { showErrors: true });
        setLoading(false);
    }

    async function refreshWallboard(companyId: string, options: { showErrors?: boolean } = {}) {
        if (refreshInFlight.current) return;

        refreshInFlight.current = true;

        try {
            const [loadedCompany, loadedUsers, loadedRequests] = await Promise.all([
                loadWallCompany(companyId),
                loadWallCompanyUsers(companyId),
                loadWallDispatchRequests(companyId),
            ]);
            const [loadedSlots, loadedTimingEvents] = await Promise.all([
                loadWallScheduleSlots(companyId, loadedRequests),
                loadWallTimingEvents(companyId, loadedRequests),
            ]);

            setCompany(loadedCompany);
            setCompanyUsers(loadedUsers);
            setRequests(loadedRequests);
            setScheduleSlots(loadedSlots);
            setTimingEvents(loadedTimingEvents);
            setDataNow(new Date());
            setLastUpdatedAt(new Date().toISOString());
            setMessage('');
        } catch (error) {
            if (options.showErrors) {
                setMessage(`Could not load Dispatch Activity Board: ${getErrorMessage(error)}`);
            }
        } finally {
            refreshInFlight.current = false;
        }
    }

    function renderWallContent() {
        if (loading) {
            return (
                <View style={wallCenterStateStyle}>
                    <Text style={wallCenterTitleStyle}>Loading Dispatch Activity Board...</Text>
                    <Text style={wallCenterTextStyle}>Pulling live dispatch, schedule, and TechOS status data.</Text>
                </View>
            );
        }

        if (message && !companyAccess && !demoMode) {
            return (
                <View style={wallCenterStateStyle}>
                    <Text style={wallCenterTitleStyle}>{message}</Text>
                    {companyChoices.length > 0 && (
                        <View style={companyChoiceGridStyle}>
                            {companyChoices.map((choice) => (
                                <Pressable
                                    key={choice.company_id}
                                    accessibilityRole="button"
                                    onPress={() => router.replace(`/dispatch-wall?companyId=${encodeURIComponent(choice.company_id)}` as never)}
                                    style={companyChoiceButtonStyle}
                                >
                                    <Text style={companyChoiceButtonTextStyle}>Open {choice.company_id.slice(0, 8)}</Text>
                                </Pressable>
                            ))}
                        </View>
                    )}
                </View>
            );
        }

        if (narrowLayout) {
            return (
                <ScrollView
                    style={wallMobileScrollStyle}
                    contentContainerStyle={wallMobileScrollContentStyle}
                >
                    {[...TOP_SECTION_KEYS, ...BOTTOM_SECTION_KEYS].map((key) => (
                        <DispatchWallSection
                            key={key}
                            config={SECTION_CONFIGS[key]}
                            items={sections[key]}
                            compactHeight={compactHeight}
                            stacked
                            onExpand={() => setExpandedSectionKey(key)}
                            onOpenDetail={setDetailItem}
                        />
                    ))}
                </ScrollView>
            );
        }

        return (
            <View style={wallRowsStyle}>
                <View style={[wallRowStyle, wallTopRowStyle]}>
                    {TOP_SECTION_KEYS.map((key) => (
                        <DispatchWallSection
                            key={key}
                            config={SECTION_CONFIGS[key]}
                            items={sections[key]}
                            compactHeight={compactHeight}
                            stacked={false}
                            onExpand={() => setExpandedSectionKey(key)}
                            onOpenDetail={setDetailItem}
                        />
                    ))}
                </View>
                <View style={[wallRowStyle, wallBottomRowStyle]}>
                    {BOTTOM_SECTION_KEYS.map((key) => (
                        <DispatchWallSection
                            key={key}
                            config={SECTION_CONFIGS[key]}
                            items={sections[key]}
                            compactHeight={compactHeight}
                            stacked={false}
                            onExpand={() => setExpandedSectionKey(key)}
                            onOpenDetail={setDetailItem}
                        />
                    ))}
                </View>
            </View>
        );
    }

    return (
        <View style={wallRootStyle}>
            <View style={[wallHeaderStyle, narrowLayout ? wallHeaderNarrowStyle : null]}>
                <View style={[wallHeaderLeftStyle, narrowLayout ? wallHeaderLeftNarrowStyle : null]}>
                    <View style={wallLogoShieldStyle}>
                        <Text style={wallLogoTextStyle}>B</Text>
                    </View>
                    {!narrowLayout && <View style={wallHeaderDividerStyle} />}
                    <Text style={[wallTitleStyle, { fontSize: narrowLayout ? 24 : width >= 1600 ? 42 : 34 }]} numberOfLines={1}>
                        Dispatch Activity Board
                    </Text>
                </View>
                <View style={[wallHeaderRightStyle, narrowLayout ? wallHeaderRightNarrowStyle : null]}>
                    <View style={[brandClusterStyle, narrowLayout ? brandClusterNarrowStyle : null]}>
                        <Text style={[brandMarkStyle, narrowLayout ? brandMarkNarrowStyle : null]}>B</Text>
                        <Text
                            {...getWebTitleProps(companyName)}
                            style={[brandNameStyle, narrowLayout ? brandNameNarrowStyle : null]}
                            numberOfLines={1}
                        >
                            {companyName}
                        </Text>
                    </View>
                    {!narrowLayout && <View style={wallHeaderDividerStyle} />}
                    <View style={clockClusterStyle}>
                        <Text style={[clockTextStyle, narrowLayout ? clockTextNarrowStyle : null]}>{formatClockTime(clockNow)}</Text>
                        <Text style={[dateTextStyle, narrowLayout ? dateTextNarrowStyle : null]}>{formatClockDate(clockNow)}</Text>
                    </View>
                    {!narrowLayout && (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={isFullscreen ? 'Exit full screen' : 'Open full screen'}
                            onPress={requestFullscreen}
                            style={fullscreenButtonStyle}
                        >
                            <Text style={fullscreenButtonTextStyle}>{isFullscreen ? 'Exit Full Screen' : 'Full Screen'}</Text>
                        </Pressable>
                    )}
                </View>
            </View>

            <View style={wallStatusRowStyle}>
                <Text style={liveStatusStyle}>
                    ● Live{lastUpdatedAt ? ` · Updated ${formatShortTime(lastUpdatedAt)}` : ''}
                    {demoMode ? ' · Demo data' : ''}
                </Text>
                {!!fullscreenMessage && <Text style={wallHintTextStyle}>{fullscreenMessage}</Text>}
                {!!message && (companyAccess || demoMode) && <Text style={wallHintTextStyle}>{message}</Text>}
            </View>

            <View style={wallBodyStyle}>{renderWallContent()}</View>

            <View style={wallFooterStyle}>
                <Text style={wallFooterTextStyle}>ⓘ Fixed live previews are shown for each category. Timing risk refreshes automatically without creating notifications.</Text>
            </View>

            <ExpandedSectionOverlay
                config={expandedSectionKey ? SECTION_CONFIGS[expandedSectionKey] : null}
                items={expandedItems}
                visible={!!expandedSectionKey}
                onClose={() => setExpandedSectionKey(null)}
                onOpenDetail={setDetailItem}
            />
            <WallDetailOverlay
                item={detailItem}
                visible={!!detailItem}
                companyId={companyAccess?.company_id || requestedCompanyId}
                onClose={() => setDetailItem(null)}
            />
        </View>
    );

    function requestFullscreen() {
        if (Platform.OS !== 'web') {
            setFullscreenMessage('Full screen is available on web displays.');
            return;
        }

        const documentLike = getFullscreenDocument();
        const root = documentLike?.documentElement as FullscreenElement | undefined;

        if (!documentLike || (!root?.requestFullscreen && !root?.webkitRequestFullscreen)) {
            setFullscreenMessage('Full screen is not available in this browser.');
            return;
        }

        const action = isDocumentFullscreen(documentLike)
            ? exitDocumentFullscreen(documentLike)
            : requestDocumentFullscreen(root);

        action.then(() => {
            setIsFullscreen(isDocumentFullscreen(documentLike));
            setFullscreenMessage('');
        }).catch(() => setFullscreenMessage('Full screen could not be changed.'));
    }
}

function DispatchWallSection({
    config,
    items,
    compactHeight,
    stacked,
    onExpand,
    onOpenDetail,
}: {
    config: WallSectionConfig;
    items: DispatchWallItem[];
    compactHeight: boolean;
    stacked: boolean;
    onExpand: () => void;
    onOpenDetail: (item: DispatchWallItem) => void;
}) {
    const visibleItems = items.slice(0, config.previewCapacity);
    const hiddenCount = Math.max(0, items.length - visibleItems.length);
    const previewSlots = Array.from({ length: config.previewCapacity }, (_, index) => visibleItems[index] || null);

    return (
        <View
            style={[
                sectionPanelStyle,
                stacked ? sectionPanelStackedStyle : { flexGrow: config.columnWeight },
                { backgroundColor: config.panelColor, borderColor: config.cardBorderColor },
            ]}
        >
            <View style={[sectionHeaderStyle, { backgroundColor: config.headerColor }]}>
                <View style={sectionHeaderLeftStyle}>
                    <View style={[sectionIconStyle, { backgroundColor: config.badgeColor }]}>
                        <Text style={[sectionIconTextStyle, { color: config.badgeTextColor }]}>{config.icon}</Text>
                    </View>
                    <Text
                        style={[sectionTitleStyle, { color: config.textColor }]}
                        numberOfLines={1}
                    >
                        {config.title}
                    </Text>
                    <View style={[sectionCountBadgeStyle, { backgroundColor: config.badgeColor }]}>
                        <Text style={[sectionCountTextStyle, { color: config.badgeTextColor }]}>{items.length}</Text>
                    </View>
                </View>
                <View style={sectionHeaderRightStyle}>
                    {hiddenCount > 0 && (
                        <View style={[sectionMoreBadgeStyle, { backgroundColor: config.badgeColor }]}>
                            <Text style={[sectionMoreTextStyle, { color: config.badgeTextColor }]}>+{hiddenCount} more</Text>
                        </View>
                    )}
                    <Pressable accessibilityRole="button" accessibilityLabel={`Expand ${config.title}`} onPress={onExpand} style={expandButtonStyle}>
                        <Text style={[expandButtonTextStyle, { color: config.textColor }]}>Expand ↗</Text>
                    </Pressable>
                </View>
            </View>
            <View style={sectionCardsStyle}>
                {previewSlots.map((item, index) => (
                    <View key={item?.request.id || `${config.key}-blank-${index}`} style={sectionCardSlotStyle}>
                        {item && (
                            <DispatchWallCard
                                item={item}
                                config={config}
                                compactHeight={compactHeight}
                                previewSlot
                                onPress={() => onOpenDetail(item)}
                            />
                        )}
                    </View>
                ))}
            </View>
        </View>
    );
}

function DispatchWallCard({
    item,
    config,
    compactHeight,
    previewSlot,
    onPress,
}: {
    item: DispatchWallItem;
    config: WallSectionConfig;
    compactHeight: boolean;
    previewSlot?: boolean;
    onPress: () => void;
}) {
    const request = item.request;
    const slot = item.slot;
    const availableTechnician = item.sectionKey === 'available';
    const code = availableTechnician ? 'READY' : getWallDisplayCode(request);
    const title = availableTechnician && item.technician
        ? getPersonName(item.technician)
        : request.customer_display_name || request.property_display_name || 'Homeowner';
    const address = availableTechnician
        ? item.technician?.full_name ? 'Technician' : item.technician?.email || 'Technician'
        : formatShortAddress(request);
    const issue = getCardIssueText(item);
    const technicianName = item.technician && !availableTechnician ? getPersonName(item.technician) : '';
    const relevantTime = getCardTimeText(item);
    const riskText = getWallTimingSummary(item);
    const visibleRiskText = item.risk.needsReassignment ? 'Reassign' : riskText;
    const showRiskChip = item.risk.state !== 'ON_TIME';
    const showEmergencyChip = item.sectionKey !== 'emergency' && isEmergencyDispatchRequest(request);
    const showStatusChip = showRiskChip || ['available', 'in_progress', 'closed_today', 'emergency'].includes(item.sectionKey);

    if (previewSlot) {
        return (
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open details for ${code}`}
                onPress={onPress}
                style={[
                    wallPreviewCardStyle,
                    {
                        backgroundColor: config.cardColor,
                        borderColor: config.cardBorderColor,
                    },
                ]}
            >
                <View style={wallPreviewCardContentStyle}>
                    {item.sectionKey === 'emergency' && (
                        <View style={emergencyMarkerCompactStyle}>
                            <Text style={emergencyMarkerCompactTextStyle}>!</Text>
                        </View>
                    )}
                    <Text style={[wallPreviewCardCodeStyle, { color: config.textColor }]} numberOfLines={1}>{code}</Text>
                    <View style={wallPreviewCardMainStyle}>
                        <Text style={[wallPreviewCardTitleStyle, { color: config.textColor }]} numberOfLines={1}>{title}</Text>
                        <Text style={[wallPreviewCardAddressStyle, { color: config.mutedColor }]} numberOfLines={1}>{address}</Text>
                    </View>
                    <View style={wallPreviewCardRightStyle}>
                        {showRiskChip ? (
                            <View style={wallPreviewChipRowStyle}>
                                {showEmergencyChip && (
                                    <View style={wallPreviewEmergencyBadgeStyle}>
                                        <Text style={wallPreviewRiskBadgeTextStyle} numberOfLines={1}>Emergency</Text>
                                    </View>
                                )}
                                <View style={[
                                    wallPreviewRiskBadgeStyle,
                                    item.risk.needsReassignment ? wallPreviewReassignmentBadgeStyle : null,
                                ]}>
                                    <Text
                                        {...getWebTitleProps(riskText || visibleRiskText)}
                                        style={wallPreviewRiskBadgeTextStyle}
                                        numberOfLines={1}
                                    >
                                        {visibleRiskText}
                                    </Text>
                                </View>
                            </View>
                        ) : (
                            <Text style={[wallPreviewCardIssueStyle, { color: config.textColor }]} numberOfLines={1}>{issue}</Text>
                        )}
                        <Text style={[wallPreviewCardMetaStyle, { color: config.mutedColor }]} numberOfLines={1}>
                            {technicianName || relevantTime || item.statusLabel}
                        </Text>
                    </View>
                </View>
            </Pressable>
        );
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open details for ${code}`}
            onPress={onPress}
            style={[
                wallCardStyle,
                {
                    backgroundColor: config.cardColor,
                    borderColor: config.cardBorderColor,
                    minHeight: compactHeight ? 52 : 64,
                },
            ]}
        >
            <View style={wallCardTopLineStyle}>
                <Text style={[wallCardCodeStyle, { color: config.textColor }]} numberOfLines={1}>{code}</Text>
                {!!relevantTime && <Text style={[wallCardTimeStyle, { color: config.mutedColor }]} numberOfLines={1}>{relevantTime}</Text>}
            </View>
            <View style={wallCardMainLineStyle}>
                {item.sectionKey === 'emergency' && (
                    <View style={emergencyMarkerStyle}>
                        <Text style={emergencyMarkerTextStyle}>!</Text>
                    </View>
                )}
                <Text style={[wallCardTitleStyle, { color: config.textColor }]} numberOfLines={1}>{title}</Text>
            </View>
            <Text style={[wallCardAddressStyle, { color: config.mutedColor }]} numberOfLines={1}>{address}</Text>
            <View style={wallCardBottomLineStyle}>
                <Text style={[wallCardIssueStyle, { color: config.textColor }]} numberOfLines={1}>{issue}</Text>
                {!!technicianName && (
                    <Text style={[wallCardTechStyle, { color: config.mutedColor }]} numberOfLines={1}>{technicianName}</Text>
                )}
            </View>
            {showStatusChip && (
                <View style={wallChipRowStyle}>
                    {showEmergencyChip && (
                        <View style={[wallStatusChipStyle, wallEmergencyStatusChipStyle]}>
                            <Text style={[wallStatusChipTextStyle, wallEmergencyStatusChipTextStyle]} numberOfLines={1}>Emergency</Text>
                        </View>
                    )}
                    <View style={[
                        wallStatusChipStyle,
                        { borderColor: config.cardBorderColor },
                        showRiskChip ? wallRiskStatusChipStyle : null,
                        item.risk.needsReassignment ? wallReassignmentStatusChipStyle : null,
                    ]}>
                        <Text
                            {...getWebTitleProps(showRiskChip ? riskText || visibleRiskText : item.statusLabel)}
                            style={[wallStatusChipTextStyle, { color: showRiskChip ? '#FFFFFF' : config.mutedColor }]}
                            numberOfLines={1}
                        >
                            {showRiskChip ? visibleRiskText : item.statusLabel}
                        </Text>
                    </View>
                </View>
            )}
            {!!slot?.tech_status_note && (
                <Text style={[wallCardNoteStyle, { color: config.mutedColor }]} numberOfLines={1}>{slot.tech_status_note}</Text>
            )}
        </Pressable>
    );
}

function ExpandedSectionOverlay({
    config,
    items,
    visible,
    onClose,
    onOpenDetail,
}: {
    config: WallSectionConfig | null;
    items: DispatchWallItem[];
    visible: boolean;
    onClose: () => void;
    onOpenDetail: (item: DispatchWallItem) => void;
}) {
    if (!config) return null;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={overlayBackdropStyle}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close expanded section backdrop"
                    onPress={onClose}
                    style={overlayBackdropPressTargetStyle}
                />
                <View style={expandedPanelStyle}>
                    <View style={[expandedHeaderStyle, { borderBottomColor: config.cardBorderColor }]}>
                        <View style={sectionHeaderLeftStyle}>
                            <View style={[sectionIconStyle, { backgroundColor: config.headerColor }]}>
                                <Text style={[sectionIconTextStyle, { color: config.textColor }]}>{config.icon}</Text>
                            </View>
                            <Text style={expandedTitleStyle}>{config.title}</Text>
                            <View style={[sectionCountBadgeStyle, { backgroundColor: config.headerColor }]}>
                                <Text style={[sectionCountTextStyle, { color: config.textColor }]}>{items.length}</Text>
                            </View>
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel="Close expanded section" onPress={onClose} style={overlayCloseButtonStyle}>
                            <Text style={overlayCloseButtonTextStyle}>✕ Close</Text>
                        </Pressable>
                    </View>
                    <ScrollView contentContainerStyle={expandedGridStyle}>
                        {items.map((item) => (
                            <View key={item.request.id} style={expandedCardWrapStyle}>
                                <DispatchWallCard
                                    item={item}
                                    config={config}
                                    compactHeight={false}
                                    onPress={() => onOpenDetail(item)}
                                />
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function WallDetailOverlay({
    item,
    visible,
    companyId,
    onClose,
}: {
    item: DispatchWallItem | null;
    visible: boolean;
    companyId: string;
    onClose: () => void;
}) {
    if (!item) return null;

    const request = item.request;
    const availableTechnician = item.sectionKey === 'available';
    const code = availableTechnician ? 'READY' : getWallDisplayCode(request);
    const title = availableTechnician && item.technician
        ? getPersonName(item.technician)
        : request.customer_display_name || request.property_display_name || 'Homeowner';
    const riskSummary = getWallTimingSummary(item);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={overlayBackdropStyle}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close job details backdrop"
                    onPress={onClose}
                    style={overlayBackdropPressTargetStyle}
                />
                <View style={detailPanelStyle}>
                    <View style={expandedHeaderStyle}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={expandedTitleStyle} numberOfLines={1}>{code} · {title}</Text>
                            <Text style={detailSubtitleStyle} numberOfLines={1}>{formatFullAddress(request)}</Text>
                        </View>
                        <Pressable accessibilityRole="button" accessibilityLabel="Close job details" onPress={onClose} style={overlayCloseButtonStyle}>
                            <Text style={overlayCloseButtonTextStyle}>✕ Close</Text>
                        </Pressable>
                    </View>
                    <ScrollView contentContainerStyle={detailBodyStyle}>
                        <DetailRow label="Issue" value={request.issue_summary || 'Issue not provided'} />
                        <DetailRow label="Priority" value={formatLabel(request.priority)} />
                        <DetailRow label="Status" value={item.statusLabel} />
                        <DetailRow label="Technician" value={item.technician ? getPersonName(item.technician) : 'Not assigned'} />
                        {!availableTechnician && <DetailRow label="Arrival Window" value={formatArrivalWindow(item.slot)} />}
                        {!availableTechnician && <DetailRow label="Scheduled" value={item.slot?.start_at ? formatDateTime(item.slot.start_at) : 'Not scheduled'} />}
                        {availableTechnician && <DetailRow label="Availability" value={getAvailableTechnicianIssueText(item)} />}
                        {availableTechnician && <DetailRow label="Ready Signal" value={item.availability?.signalLabel || 'Ready'} />}
                        {availableTechnician && <DetailRow label="Next Appointment" value={item.availability?.availableUntil ? formatDateTime(item.availability.availableUntil) : 'No upcoming assignment'} />}
                        {availableTechnician && <DetailRow label="Last Update" value={item.slot?.updated_at ? formatDateTime(item.slot.updated_at) : 'No slot update'} />}
                        {item.risk.state !== 'ON_TIME' && (
                            <>
                                <DetailRow label="Timing" value={riskSummary || item.risk.label} />
                                <DetailRow label="Timing Reason" value={item.risk.reason} />
                                <DetailRow label="Latest Departure" value={item.risk.latestDepartureAt ? formatDateTime(item.risk.latestDepartureAt) : 'Not calculated'} />
                                <DetailRow label="Expected Arrival" value={item.risk.estimatedArrivalAt ? formatDateTime(item.risk.estimatedArrivalAt) : 'Not calculated'} />
                            </>
                        )}
                        {item.risk.needsReassignment && <DetailRow label="Dispatch Action" value="Needs reassignment in ManagementOS." />}
                        {item.timingEvent?.message && <DetailRow label="Timing Response" value={item.timingEvent.message} />}
                        {!!item.slot?.tech_status_note && <DetailRow label="Tech Status" value={item.slot.tech_status_note} />}
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Open in ManagementOS"
                            onPress={() => openManagementOS(companyId)}
                            style={openManagementButtonStyle}
                        >
                            <Text style={openManagementButtonTextStyle}>Open in ManagementOS</Text>
                        </Pressable>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <View style={detailRowStyle}>
            <Text style={detailLabelStyle}>{label}</Text>
            <Text style={detailValueStyle}>{value}</Text>
        </View>
    );
}

async function resolveWallCompanyAccess(userId: string, requestedCompanyId: string): Promise<WallAccessResult> {
    const isPlatformAdmin = await loadWallPlatformAdminStatus(userId);

    if (isPlatformAdmin && requestedCompanyId) {
        return {
            access: {
                company_id: requestedCompanyId,
                role: 'platform_admin',
                status: 'active',
            },
            choices: [],
            deniedAccess: null,
            isPlatformAdmin,
        };
    }

    const accessResult = await loadLoggedInUserCompanyAccess(userId);

    if (accessResult.error) {
        throw new Error(accessResult.error.message);
    }

    const choices = getActiveWallDispatchChoices(accessResult.data);
    const deniedAccess = getDeniedWallDispatchAccess(accessResult.data, requestedCompanyId);
    const access = requestedCompanyId
        ? choices.find((choice) => choice.company_id === requestedCompanyId) || null
        : choices.length === 1
            ? choices[0]
            : null;

    return {
        access,
        choices,
        deniedAccess,
        isPlatformAdmin,
    };
}

async function loadWallPlatformAdminStatus(userId: string) {
    const rpcResult = await supabase.rpc('homeos_is_platform_admin');

    if (!rpcResult.error) return rpcResult.data === true;

    const fallbackQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

    if (fallbackQuery.error) {
        throw new Error(fallbackQuery.error.message);
    }

    return String(fallbackQuery.data?.role || '').trim().toUpperCase() === 'SUPER_ADMIN';
}

function getActiveWallDispatchChoices(rows: CompanyRouteAccessRow[]) {
    const choicesByCompanyId = new Map<string, WallCompanyAccess>();

    rows.forEach((row) => {
        if (!row.company_id || choicesByCompanyId.has(row.company_id)) return;
        if (!isActiveStatus(row.status) || !canAccessDispatch(row)) return;

        choicesByCompanyId.set(row.company_id, {
            company_id: row.company_id,
            role: row.role,
            status: row.status,
        });
    });

    return Array.from(choicesByCompanyId.values());
}

function getDeniedWallDispatchAccess(rows: CompanyRouteAccessRow[], requestedCompanyId: string) {
    const deniedRows = rows
        .filter((row) => row.company_id && isActiveStatus(row.status) && !canAccessDispatch(row))
        .map((row) => ({
            company_id: row.company_id,
            role: row.role,
            status: row.status,
        }));

    if (requestedCompanyId) {
        return deniedRows.find((row) => row.company_id === requestedCompanyId) || null;
    }

    return deniedRows[0] || null;
}

async function loadWallCompany(companyId: string): Promise<CompanyBrand | null> {
    const { data, error } = await supabase
        .from('companies')
        .select('id, name, public_name, dba_name')
        .eq('id', companyId)
        .maybeSingle();

    if (error) throw new Error(error.message);

    return (data || null) as CompanyBrand | null;
}

async function loadWallDispatchRequests(companyId: string): Promise<DispatchWallRequest[]> {
    const baseRequests = await getCompanyDispatchRequests(companyId);
    const requestIds = baseRequests.map((request) => request.id).filter(Boolean);

    if (requestIds.length === 0) return baseRequests;

    const { data, error } = await supabase
        .from('service_requests')
        .select('id, closeout_outcome, next_action_at, closed_at, cancelled_at, archived_at')
        .eq('company_id', companyId)
        .in('id', requestIds);

    if (error) return baseRequests;

    const extraById = new Map<string, Partial<DispatchWallRequest>>();
    (Array.isArray(data) ? data : []).forEach((row) => {
        const record = toRecord(row);
        const id = readString(record.id);

        if (!id) return;

        extraById.set(id, {
            closeout_outcome: readNullableString(record.closeout_outcome),
            next_action_at: readNullableString(record.next_action_at),
            closed_at: readNullableString(record.closed_at),
            cancelled_at: readNullableString(record.cancelled_at),
            archived_at: readNullableString(record.archived_at),
        });
    });

    return baseRequests.map((request) => ({
        ...request,
        ...(extraById.get(request.id) || {}),
    }));
}

async function loadWallCompanyUsers(companyId: string): Promise<DispatchWallCompanyUser[]> {
    const rpcResult = await supabase.rpc('get_company_users_for_management', {
        p_company_id: companyId,
    });

    if (!rpcResult.error) {
        return normalizeWallCompanyUsers(rpcResult.data);
    }

    const directResult = await supabase
        .from('company_users')
        .select('id, company_id, full_name, email, role, status')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

    if (directResult.error) {
        throw new Error(`${directResult.error.message}. Management user RPC also failed: ${rpcResult.error.message}`);
    }

    return normalizeWallCompanyUsers(directResult.data);
}

async function loadWallScheduleSlots(
    companyId: string,
    requestScope: DispatchWallRequest[]
): Promise<DispatchWallScheduleSlot[]> {
    const windowStart = new Date();
    const windowEnd = new Date();
    windowStart.setDate(windowStart.getDate() - 7);
    windowEnd.setDate(windowEnd.getDate() + 14);

    const selectColumns = 'id, company_id, service_request_id, technician_company_user_id, start_at, end_at, arrival_window_start, arrival_window_end, status, priority, tech_status_note, visit_outcome, visit_closed_at, updated_at';
    const windowResult = await supabase
        .from('job_schedule_slots')
        .select(selectColumns)
        .eq('company_id', companyId)
        .gte('start_at', windowStart.toISOString())
        .lte('start_at', windowEnd.toISOString())
        .order('start_at', { ascending: true });
    const requestIds = Array.from(new Set(requestScope.map((request) => request.id).filter(Boolean)));
    const requestResult = requestIds.length > 0
        ? await supabase
            .from('job_schedule_slots')
            .select(selectColumns)
            .eq('company_id', companyId)
            .in('service_request_id', requestIds)
            .order('start_at', { ascending: true })
        : { data: [], error: null };

    if (windowResult.error && requestResult.error) {
        throw new Error(`Schedule assignments unavailable: ${windowResult.error.message}; ${requestResult.error.message}`);
    }

    return sortWallScheduleSlots(mergeWallScheduleSlots(
        normalizeWallScheduleSlots(windowResult.data),
        normalizeWallScheduleSlots(requestResult.data)
    ));
}

async function loadWallTimingEvents(
    companyId: string,
    requestScope: DispatchWallRequest[]
): Promise<DispatchWallTimingEvent[]> {
    const requestIds = Array.from(new Set(requestScope.map((request) => request.id).filter(Boolean)));

    if (requestIds.length === 0) return [];

    const eventResults = await Promise.all(requestIds.map(async (requestId) => {
        const { data, error } = await supabase.rpc('get_service_request_events', {
            p_company_id: companyId,
            p_service_request_id: requestId,
        });

        if (error) {
            if (__DEV__) {
                console.warn('[dispatch-wall] timing events unavailable', {
                    requestId,
                    message: error.message,
                });
            }
            return [];
        }

        return normalizeWallTimingEvents(data);
    }));

    return eventResults
        .flat()
        .filter((event) => event.event_type === 'technician_timing_response');
}

function normalizeWallCompanyUsers(data: unknown): DispatchWallCompanyUser[] {
    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const record = toRecord(row);

            return {
                id: readString(record.id),
                company_id: readString(record.company_id),
                full_name: readNullableString(record.full_name),
                email: readNullableString(record.email),
                role: readNullableString(record.role),
                status: readNullableString(record.status),
            };
        })
        .filter((user) => user.id && user.company_id);
}

function normalizeWallScheduleSlots(data: unknown): DispatchWallScheduleSlot[] {
    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const record = toRecord(row);

            return {
                id: readString(record.id),
                company_id: readString(record.company_id),
                service_request_id: readNullableString(record.service_request_id),
                technician_company_user_id: readNullableString(record.technician_company_user_id),
                start_at: readNullableString(record.start_at),
                end_at: readNullableString(record.end_at),
                arrival_window_start: readNullableString(record.arrival_window_start),
                arrival_window_end: readNullableString(record.arrival_window_end),
                status: readNullableString(record.status),
                priority: readNullableString(record.priority),
                tech_status_note: readNullableString(record.tech_status_note),
                visit_outcome: readNullableString(record.visit_outcome),
                visit_closed_at: readNullableString(record.visit_closed_at),
                updated_at: readNullableString(record.updated_at),
            };
        })
        .filter((slot) => slot.id && slot.company_id);
}

function normalizeWallTimingEvents(data: unknown): DispatchWallTimingEvent[] {
    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const record = toRecord(row);
            const metadata = toRecord(record.metadata);

            return {
                id: readString(record.id),
                service_request_id: readString(record.service_request_id),
                event_type: readNullableString(record.event_type),
                message: readNullableString(record.message),
                schedule_slot_id: readNullableString(record.schedule_slot_id),
                metadata,
                created_at: readNullableString(record.created_at),
            };
        })
        .filter((event) => event.id && event.service_request_id);
}

function mergeWallScheduleSlots(...slotLists: DispatchWallScheduleSlot[][]) {
    const slotsById = new Map<string, DispatchWallScheduleSlot>();

    slotLists.flat().forEach((slot) => {
        if (!slot.id) return;
        slotsById.set(slot.id, slot);
    });

    return Array.from(slotsById.values());
}

function sortWallScheduleSlots(slots: DispatchWallScheduleSlot[]) {
    return [...slots].sort((first, second) => getTimeValue(first.start_at) - getTimeValue(second.start_at));
}

function createDemoWallboardData(now: Date) {
    const company: CompanyBrand = {
        id: 'demo-company',
        name: 'Bravo Dispatch',
        public_name: 'Bravo Dispatch',
        dba_name: 'Bravo Dispatch',
    };
    const companyUsers: DispatchWallCompanyUser[] = [
        createDemoUser('tech-mike', 'Mike R.'),
        createDemoUser('tech-sarah', 'Sarah T.'),
        createDemoUser('tech-james', 'James K.'),
        createDemoUser('tech-chris', 'Chris L.'),
        createDemoUser('tech-jose', 'Jose M.'),
        createDemoUser('tech-dan', 'Dan P.'),
        createDemoUser('tech-alex', 'Alex W.', 'available'),
    ];
    const requests: DispatchWallRequest[] = [
        createDemoRequest('A0012', 'Riverside Apartments', '123 River Rd', 'Burst leak', 'emergency', 'acknowledged', 'emergency', -70),
        createDemoRequest('A0015', 'Maplewood Office Park', '4500 Maple Ave', 'Flooding', 'emergency', 'acknowledged', 'emergency', -53),
        createDemoRequest('A0019', 'Greenview Condos', '210 Greenview Dr', 'No water', 'emergency', 'acknowledged', 'emergency', -43),
        createDemoRequest('A0021', 'Trader Joe’s #065', '2901 N Lamar Blvd', 'Possible gas leak', 'emergency', 'new', 'emergency', -57),
        createDemoRequest('A0023', 'The Park at Westgate', '1122 Westgate Blvd', 'Sewer backup', 'emergency', 'open', 'emergency', -37),
        createDemoRequest('A0024', 'Sunset Villas', '3200 Sunset Dr', 'Leaky faucet', 'regular', 'new', 'normal', -20),
        createDemoRequest('A0025', 'Pinecrest Townhomes', '7801 Pinecrest Dr', 'Toilet running', 'regular', 'new', 'normal', -18),
        createDemoRequest('A0026', 'Austin Fitness Center', '6501 Burnet Rd', 'Water heater', 'regular', 'open', 'normal', -15),
        createDemoRequest('A0027', 'Tech Ridge Retail', '12500 Tech Ridge Blvd', 'Low pressure', 'regular', 'reported', 'normal', -10),
        createDemoRequest('A0028', 'Oakridge Apartments', '600 Oakridge Dr', 'Drain slow', 'regular', 'new', 'normal', -8),
        createDemoRequest('A0029', 'Hillside Office Building', '9600 Capital of TX Hwy', 'Sink leak', 'regular', 'acknowledged', 'normal', -5),
        createDemoRequest('A0030', 'Villa del Sol', '3001 S Congress Ave', 'Shower leak', 'regular', 'acknowledged', 'normal', -4),
        createDemoRequest('A0031', 'North Austin Storage', '8711 Research Blvd', 'No hot water', 'regular', 'acknowledged', 'normal', -3),
        createDemoRequest('A0032', 'Redbud Retail Center', '1400 W Parmer Ln', 'Toilet leaking', 'regular', 'acknowledged', 'normal', -2),
        createDemoRequest('A0006', 'Domain Office Park', '11501 Domain Dr', 'Routine service', 'regular', 'scheduled', 'normal', -30),
        createDemoRequest('A0007', 'Walnut Creek Apartments', '2211 Walnut Creek Dr', 'Routine service', 'regular', 'scheduled', 'normal', -29),
        createDemoRequest('A0008', 'H-E-B Plus #244', '9900 S IH 35', 'Routine service', 'regular', 'scheduled', 'normal', -28),
        createDemoRequest('A0009', 'Bridgeview Office Suites', '5100 N Mopac Expy', 'Routine service', 'regular', 'scheduled', 'normal', -27),
        createDemoRequest('A0010', 'Great Hills Medical', '9700 Great Hills Trl', 'Routine service', 'regular', 'scheduled', 'normal', -26),
        createDemoRequest('A0011', 'Westgate Shopping Center', '1200 S Mopac Expy', 'Routine service', 'regular', 'scheduled', 'normal', -25),
        createDemoRequest('A0013', 'Gateway Church', '7101 US-290', 'ETA 10:32 AM', 'regular', 'scheduled', 'normal', -27),
        createDemoRequest('A0014', 'Barton Creek Square', '2901 Barton Creek Blvd', 'Routine service', 'regular', 'scheduled', 'normal', -24),
        createDemoRequest('A0016', 'The Arbors at Avery Ranch', '10001 Avery Ranch Blvd', 'Routine service', 'regular', 'scheduled', 'normal', -23),
        createDemoRequest('A0017', 'Travis Heights Retail', '1313 S Congress Ave', 'Needs reassignment', 'regular', 'scheduled', 'normal', -22),
        createDemoRequest('A0001', 'Northridge Apartments', 'Working on main line repair', 'Main line repair', 'regular', 'scheduled', 'normal', -26),
        createDemoRequest('A0002', 'Austin Country Club', 'Replacing pressure regulator', 'Pressure regulator', 'regular', 'scheduled', 'normal', -25),
        createDemoRequest('A0034', 'Lakeside Office Building', 'Completed', 'Completed', 'regular', 'completed', 'normal', -24),
        createDemoRequest('A0035', 'Sunset Strip Plaza', 'Completed', 'Completed', 'regular', 'completed', 'normal', -23),
    ];
    const scheduleSlots: DispatchWallScheduleSlot[] = [
        createDemoSlotOffset('A0006', companyUsers[4], now, 20, 'scheduled', 60),
        createDemoSlotOffset('A0007', companyUsers[1], now, 45, 'scheduled', 60),
        createDemoSlotOffset('A0008', companyUsers[2], now, 70, 'scheduled', 60),
        createDemoSlotOffset('A0009', companyUsers[3], now, 95, 'scheduled', 60),
        createDemoSlotOffset('A0010', companyUsers[4], now, 120, 'scheduled', 60),
        createDemoSlotOffset('A0011', companyUsers[5], now, 145, 'scheduled', 60),
        createDemoSlotOffset('A0014', companyUsers[1], now, -15, 'scheduled', 60),
        createDemoSlotOffset('A0016', companyUsers[2], now, -45, 'scheduled', 90),
        createDemoSlotOffset('A0017', companyUsers[5], now, -45, 'scheduled', 30),
        createDemoSlotOffset('A0013', companyUsers[0], now, -20, 'on_my_way', 60, 'Late +20 min · ETA updated'),
        createDemoSlotOffset('A0001', companyUsers[0], now, -90, 'working', 120),
        createDemoSlotOffset('A0002', companyUsers[1], now, -80, 'in_progress', 120),
        createDemoSlotOffset('A0034', companyUsers[2], now, -120, 'completed', 60),
        createDemoSlotOffset('A0035', companyUsers[3], now, -105, 'completed', 60),
    ];
    const timingEvents: DispatchWallTimingEvent[] = [
        createDemoTimingEvent('A0014', 'Running late', 15),
        createDemoTimingEvent('A0016', 'Running late 45 minutes', 45),
        createDemoTimingEvent('A0017', 'Cannot make it', null),
    ];

    return { company, companyUsers, requests, scheduleSlots, timingEvents };
}

function createDemoUser(id: string, fullName: string, status = 'active'): DispatchWallCompanyUser {
    return {
        id,
        company_id: 'demo-company',
        full_name: fullName,
        email: null,
        role: 'technician',
        status,
    };
}

function createDemoRequest(
    code: string,
    propertyName: string,
    address: string,
    issue: string,
    requestType: string,
    status: string,
    priority: string,
    minutesOffset: number
): DispatchWallRequest {
    const createdAt = new Date(Date.now() + minutesOffset * 60 * 1000).toISOString();
    const numericSequence = Number(code.replace(/\D/g, '')) || 1;

    return {
        id: `demo-${code}`,
        display_sequence: numericSequence,
        display_code: code.endsWith('C') ? code.replace('C', '') : code,
        company_id: 'demo-company',
        property_id: `property-${code}`,
        company_property_client_id: null,
        request_type: requestType,
        status,
        priority,
        issue_summary: issue,
        customer_display_name: propertyName,
        property_display_name: propertyName,
        property_address: address,
        property_city: 'Austin',
        property_state: 'TX',
        property_postal_code: '78701',
        created_at: createdAt,
        acknowledged_at: status === 'new' ? null : createdAt,
        converted_job_id: null,
        converted_at: null,
        closed_at: status === 'completed' ? createdAt : null,
        cancelled_at: null,
        archived_at: null,
    };
}

function createDemoSlotOffset(
    code: string,
    technician: DispatchWallCompanyUser,
    now: Date,
    startOffsetMinutes: number,
    status: string,
    windowMinutes: number,
    techStatusNote: string | null = null
): DispatchWallScheduleSlot {
    const start = new Date(now.getTime() + startOffsetMinutes * 60 * 1000);
    const end = new Date(start.getTime() + 90 * 60 * 1000);

    return {
        id: `slot-${code}`,
        company_id: 'demo-company',
        service_request_id: `demo-${code}`,
        technician_company_user_id: technician.id,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        arrival_window_start: start.toISOString(),
        arrival_window_end: new Date(start.getTime() + windowMinutes * 60 * 1000).toISOString(),
        status,
        priority: 'normal',
        tech_status_note: techStatusNote,
        visit_outcome: status === 'completed' ? 'completed' : null,
        visit_closed_at: status === 'completed' ? start.toISOString() : null,
        updated_at: new Date(now.getTime() - 4 * 60 * 1000).toISOString(),
    };
}

function createDemoTimingEvent(code: string, response: string, estimatedRemainingMinutes: number | null): DispatchWallTimingEvent {
    return {
        id: `timing-${code}`,
        service_request_id: `demo-${code}`,
        event_type: 'technician_timing_response',
        message: `Technician timing response: ${response}.`,
        schedule_slot_id: `slot-${code}`,
        metadata: {
            response,
            estimated_remaining_minutes: estimatedRemainingMinutes,
        },
        created_at: new Date().toISOString(),
    };
}

function getCardIssueText(item: DispatchWallItem) {
    const timingSummary = getWallTimingSummary(item);

    if (item.sectionKey === 'closed_today') {
        return getTerminalOutcomeLabel(item);
    }

    if (item.sectionKey === 'available') {
        return getAvailableTechnicianIssueText(item);
    }

    if (timingSummary && ['running_late', 'assigned_ready', 'on_my_way'].includes(item.sectionKey)) {
        return timingSummary;
    }

    if (item.sectionKey === 'on_my_way') {
        return item.slot?.tech_status_note || 'ETA pending';
    }

    if (item.sectionKey === 'assigned_ready') {
        return formatArrivalWindow(item.slot);
    }

    return item.slot?.tech_status_note || item.request.issue_summary || item.statusLabel;
}

function getAvailableTechnicianIssueText(item: DispatchWallItem) {
    if (item.availability?.availableUntil) {
        return `Available until ${formatShortTime(item.availability.availableUntil)}`;
    }

    if (item.availability?.signalLabel) return item.availability.signalLabel;
    if (!item.slot) return 'Ready';
    if (item.slot.status === 'available') return 'Available';
    if (isTerminalDisplayStatus(item.slot.status)) return 'Ready';

    return 'Ready for assignment';
}

function getTerminalOutcomeLabel(item: DispatchWallItem) {
    const requestStatus = item.request.status;
    const slotStatus = item.slot?.status;

    if (isTerminalDisplayStatus(requestStatus)) return formatWallStatusLabel(requestStatus);
    if (isTerminalDisplayStatus(slotStatus)) return formatWallStatusLabel(slotStatus);
    if (item.slot?.visit_outcome) return formatLabel(item.slot.visit_outcome);

    return 'Closed';
}

function isTerminalDisplayStatus(status?: string | null) {
    const normalized = String(status || '').trim().toLowerCase();

    return ['completed', 'resolved', 'closed', 'done', 'cancelled', 'canceled', 'archived', 'void', 'duplicate_or_void'].includes(normalized);
}

function getWallTimingSummary(item: DispatchWallItem) {
    if (item.risk.needsReassignment) return 'Needs Reassignment';

    if (item.risk.estimatedDelayMinutes !== null && item.risk.estimatedDelayMinutes > 0) {
        return `Late +${item.risk.estimatedDelayMinutes} min`;
    }

    if (item.risk.state === 'AT_RISK') return 'At Risk';
    if (item.risk.state === 'RUNNING_LATE') return 'Running Late';
    if (item.risk.estimatedArrivalAt) return `ETA ${formatShortTime(item.risk.estimatedArrivalAt)}`;

    return '';
}

function getCardTimeText(item: DispatchWallItem) {
    if (item.sectionKey === 'closed_today') {
        return formatShortTime(item.request.closed_at || item.request.cancelled_at || item.request.archived_at || item.slot?.visit_closed_at || item.slot?.updated_at);
    }

    if (item.sectionKey === 'available') {
        return item.availability?.availableUntil
            ? formatShortTime(item.availability.availableUntil)
            : formatShortTime(item.slot?.updated_at || item.slot?.visit_closed_at || item.slot?.end_at);
    }

    if (item.sectionKey === 'regular_leads' || item.sectionKey === 'emergency_leads' || item.sectionKey === 'emergency') {
        return formatShortTime(item.request.acknowledged_at || item.request.created_at);
    }

    if (item.slot?.arrival_window_start || item.slot?.start_at) {
        return formatShortTime(item.slot.arrival_window_start || item.slot.start_at);
    }

    return '';
}

function formatArrivalWindow(slot?: DispatchWallScheduleSlot | null) {
    if (!slot) return 'No arrival window';
    if (slot.arrival_window_start && slot.arrival_window_end) {
        return `${formatShortTime(slot.arrival_window_start)} – ${formatShortTime(slot.arrival_window_end)}`;
    }
    if (slot.start_at && slot.end_at) {
        return `${formatShortTime(slot.start_at)} – ${formatShortTime(slot.end_at)}`;
    }
    if (slot.start_at) return formatShortTime(slot.start_at);

    return 'Window not set';
}

function formatShortAddress(request: CompanyDispatchRequest) {
    return [
        request.property_address,
        request.property_city,
        request.property_state,
        request.property_postal_code,
    ].filter(Boolean).join(', ') || request.property_display_name || 'Address not available';
}

function formatFullAddress(request: CompanyDispatchRequest) {
    return [
        request.property_address,
        request.property_city,
        request.property_state,
        request.property_postal_code,
    ].filter(Boolean).join(', ') || 'Address not available';
}

function getPersonName(user: DispatchWallCompanyUser) {
    return user.full_name || user.email || 'Technician';
}

function getFullscreenDocument() {
    if (Platform.OS !== 'web') return null;

    return typeof globalThis.document === 'undefined'
        ? null
        : globalThis.document as FullscreenDocument;
}

function getFullscreenElement(documentLike: FullscreenDocument) {
    return documentLike.fullscreenElement || documentLike.webkitFullscreenElement || null;
}

function isDocumentFullscreen(documentLike: FullscreenDocument) {
    return Boolean(getFullscreenElement(documentLike));
}

function requestDocumentFullscreen(root: FullscreenElement) {
    if (root.requestFullscreen) return root.requestFullscreen();
    if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
        return Promise.resolve();
    }

    return Promise.reject(new Error('Fullscreen API unavailable.'));
}

function exitDocumentFullscreen(documentLike: FullscreenDocument) {
    if (documentLike.exitFullscreen) return documentLike.exitFullscreen();
    if (documentLike.webkitExitFullscreen) {
        documentLike.webkitExitFullscreen();
        return Promise.resolve();
    }

    return Promise.reject(new Error('Fullscreen API unavailable.'));
}

function getWebTitleProps(title: string) {
    return Platform.OS === 'web' ? { title } : {};
}

function getCompanyName(company: CompanyBrand | null) {
    return company?.public_name || company?.dba_name || company?.name || '';
}

function openManagementOS(companyId: string) {
    const path = `/dispatch?companyId=${encodeURIComponent(companyId)}`;

    if (Platform.OS === 'web') {
        const windowLike = globalThis as { open?: (url?: string, target?: string, features?: string) => Window | null };
        windowLike.open?.(path, '_blank', 'noopener,noreferrer');
        return;
    }

    router.push(path as never);
}

function firstParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

function isDevelopmentMode() {
    return typeof __DEV__ !== 'undefined' && __DEV__;
}

function isActiveStatus(status?: string | null) {
    return String(status || '').trim().toLowerCase() === 'active';
}

function formatClockTime(value: Date) {
    return value.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatClockDate(value: Date) {
    return value.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatShortTime(value?: string | null) {
    if (!value) return '';

    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(value?: string | null) {
    if (!value) return 'Not available';

    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Not available'
        : date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatLabel(value?: string | null) {
    const cleanValue = String(value || '').trim();

    if (!cleanValue) return 'Not set';

    return cleanValue
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getTimeValue(value?: string | null) {
    if (!value) return 0;

    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

function toRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown) {
    const text = readString(value);

    return text || null;
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
}

const wallRootStyle: ViewStyle = {
    backgroundColor: '#020915',
    flex: 1,
    height: Platform.OS === 'web' ? ('100vh' as ViewStyle['height']) : '100%',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: Platform.OS === 'web' ? ('100vw' as ViewStyle['width']) : '100%',
};

const wallHeaderStyle: ViewStyle = {
    alignItems: 'center',
    backgroundColor: '#050D1A',
    borderBottomColor: '#16263B',
    borderBottomWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    height: Platform.OS === 'web' ? ('8vh' as ViewStyle['height']) : undefined,
    justifyContent: 'space-between',
    maxHeight: 96,
    minHeight: 72,
    paddingHorizontal: 24,
};

const wallHeaderNarrowStyle: ViewStyle = {
    alignItems: 'stretch',
    flexDirection: 'column',
    gap: 8,
    minHeight: 118,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const wallHeaderLeftStyle: ViewStyle = {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 22,
    minWidth: 0,
};

const wallHeaderLeftNarrowStyle: ViewStyle = {
    flex: 0,
    gap: 10,
};

const wallHeaderRightStyle: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 22,
};

const wallHeaderRightNarrowStyle: ViewStyle = {
    gap: 10,
    justifyContent: 'space-between',
    width: '100%',
};

const wallLogoShieldStyle: ViewStyle = {
    alignItems: 'center',
    borderColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 3,
    height: 56,
    justifyContent: 'center',
    width: 56,
};

const wallLogoTextStyle = {
    color: '#F8FAFC',
    fontSize: 26,
    fontWeight: '900' as const,
};

const wallHeaderDividerStyle: ViewStyle = {
    backgroundColor: '#64748B',
    height: 56,
    opacity: 0.75,
    width: 1,
};

const wallTitleStyle = {
    color: '#FFFFFF',
    flex: 1,
    fontWeight: '900' as const,
    letterSpacing: 0,
};

const brandClusterStyle: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    maxWidth: 320,
};

const brandClusterNarrowStyle: ViewStyle = {
    flex: 1,
    gap: 6,
    minWidth: 0,
};

const brandMarkStyle = {
    color: '#0EA5E9',
    fontSize: 42,
    fontStyle: 'italic' as const,
    fontWeight: '900' as const,
};

const brandMarkNarrowStyle = {
    fontSize: 28,
};

const brandNameStyle = {
    color: '#F8FAFC',
    fontSize: 24,
    fontWeight: '900' as const,
};

const brandNameNarrowStyle = {
    flex: 1,
    fontSize: 18,
};

const clockClusterStyle: ViewStyle = {
    alignItems: 'flex-end',
};

const clockTextStyle = {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '900' as const,
};

const clockTextNarrowStyle = {
    fontSize: 22,
};

const dateTextStyle = {
    color: '#CBD5E1',
    fontSize: 18,
    fontWeight: '700' as const,
};

const dateTextNarrowStyle = {
    fontSize: 13,
};

const fullscreenButtonStyle: ViewStyle = {
    borderColor: '#334155',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
};

const fullscreenButtonTextStyle = {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '900' as const,
};

const wallStatusRowStyle: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    minHeight: 28,
    paddingHorizontal: 10,
};

const liveStatusStyle = {
    color: '#86EFAC',
    fontSize: 13,
    fontWeight: '900' as const,
};

const wallHintTextStyle = {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '700' as const,
};

const wallBodyStyle: ViewStyle = {
    flex: 1,
    minHeight: 0,
};

const wallRowsStyle: ViewStyle = {
    flex: 1,
    gap: 8,
    minHeight: 0,
};

const wallRowStyle: ViewStyle = {
    flexDirection: 'row',
    gap: 8,
    minHeight: 0,
};

const wallTopRowStyle: ViewStyle = {
    flex: 0.92,
};

const wallBottomRowStyle: ViewStyle = {
    flex: 1,
};

const sectionPanelStyle: ViewStyle = {
    borderRadius: 10,
    borderWidth: 1,
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
};

const sectionPanelStackedStyle: ViewStyle = {
    flexBasis: 'auto' as ViewStyle['flexBasis'],
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 330,
};

const sectionHeaderStyle: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 12,
};

const sectionHeaderLeftStyle: ViewStyle = {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
};

const sectionHeaderRightStyle: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
};

const sectionIconStyle: ViewStyle = {
    alignItems: 'center',
    borderRadius: 8,
    height: 30,
    justifyContent: 'center',
    width: 30,
};

const sectionIconTextStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const sectionTitleStyle = {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '900' as const,
    letterSpacing: 0,
};

const sectionCountBadgeStyle: ViewStyle = {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 34,
    paddingHorizontal: 9,
    paddingVertical: 4,
};

const sectionCountTextStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const sectionMoreBadgeStyle: ViewStyle = {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
};

const sectionMoreTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const expandButtonStyle: ViewStyle = {
    paddingHorizontal: 4,
    paddingVertical: 8,
};

const expandButtonTextStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const sectionCardsStyle: ViewStyle = {
    flex: 1,
    gap: 5,
    minHeight: 0,
    padding: 7,
};

const sectionCardSlotStyle: ViewStyle = {
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    overflow: 'hidden',
};

const wallPreviewCardStyle: ViewStyle = {
    borderRadius: 7,
    borderWidth: 1,
    height: '100%',
    justifyContent: 'center',
    minHeight: 0,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 4,
};

const wallPreviewCardContentStyle: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 0,
};

const wallPreviewCardMainStyle: ViewStyle = {
    flex: 1,
    minWidth: 0,
};

const wallPreviewCardRightStyle: ViewStyle = {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: 112,
    minWidth: 64,
};

const wallPreviewCardCodeStyle = {
    fontSize: 17,
    fontWeight: '900' as const,
};

const wallPreviewCardTitleStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};

const wallPreviewCardAddressStyle = {
    fontSize: 11,
    fontWeight: '700' as const,
};

const wallPreviewCardIssueStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const wallPreviewCardMetaStyle = {
    fontSize: 11,
    fontWeight: '800' as const,
};

const wallPreviewChipRowStyle: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'flex-end',
};

const wallPreviewEmergencyBadgeStyle: ViewStyle = {
    backgroundColor: '#DC2626',
    borderRadius: 999,
    maxWidth: 84,
    paddingHorizontal: 7,
    paddingVertical: 3,
};

const wallPreviewRiskBadgeStyle: ViewStyle = {
    backgroundColor: '#F97316',
    borderRadius: 999,
    maxWidth: 124,
    paddingHorizontal: 8,
    paddingVertical: 3,
};

const wallPreviewReassignmentBadgeStyle: ViewStyle = {
    backgroundColor: '#7E22CE',
};

const wallPreviewRiskBadgeTextStyle = {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900' as const,
};

const wallCardStyle: ViewStyle = {
    borderRadius: 7,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
};

const wallCardTopLineStyle: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
};

const wallCardMainLineStyle: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
};

const wallCardBottomLineStyle: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
};

const wallCardCodeStyle = {
    fontSize: 17,
    fontWeight: '900' as const,
};

const wallCardTimeStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const wallCardTitleStyle = {
    flex: 1,
    fontSize: 14,
    fontWeight: '900' as const,
};

const wallCardAddressStyle = {
    fontSize: 12,
    fontWeight: '700' as const,
};

const wallCardIssueStyle = {
    flex: 1,
    fontSize: 12,
    fontWeight: '800' as const,
};

const wallCardTechStyle = {
    maxWidth: 92,
    fontSize: 12,
    fontWeight: '900' as const,
};

const wallCardNoteStyle = {
    fontSize: 11,
    fontWeight: '800' as const,
    marginTop: 2,
};

const wallChipRowStyle: ViewStyle = {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
};

const emergencyMarkerStyle: ViewStyle = {
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 6,
    height: 24,
    justifyContent: 'center',
    width: 24,
};

const emergencyMarkerCompactStyle: ViewStyle = {
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 6,
    height: 24,
    justifyContent: 'center',
    width: 24,
};

const emergencyMarkerCompactTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
};

const emergencyMarkerTextStyle = {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900' as const,
};

const wallStatusChipStyle: ViewStyle = {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
};

const wallRiskStatusChipStyle: ViewStyle = {
    backgroundColor: '#F97316',
    borderWidth: 0,
};

const wallReassignmentStatusChipStyle: ViewStyle = {
    backgroundColor: '#7E22CE',
};

const wallEmergencyStatusChipStyle: ViewStyle = {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
};

const wallEmergencyStatusChipTextStyle = {
    color: '#FFFFFF',
};

const wallStatusChipTextStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
};

const wallFooterStyle: ViewStyle = {
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
};

const wallFooterTextStyle = {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '700' as const,
};

const wallCenterStateStyle: ViewStyle = {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
};

const wallCenterTitleStyle = {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
};

const wallCenterTextStyle = {
    color: '#CBD5E1',
    fontSize: 16,
    fontWeight: '700' as const,
    marginTop: 10,
    textAlign: 'center' as const,
};

const companyChoiceGridStyle: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
    marginTop: 18,
};

const companyChoiceButtonStyle: ViewStyle = {
    backgroundColor: '#0EA5E9',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
};

const companyChoiceButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900' as const,
};

const wallMobileScrollStyle: ViewStyle = {
    flex: 1,
};

const wallMobileScrollContentStyle: ViewStyle = {
    gap: 10,
    paddingBottom: 24,
};

const overlayBackdropStyle: ViewStyle = {
    alignItems: 'center',
    backgroundColor: 'rgba(2, 9, 21, 0.88)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
};

const overlayBackdropPressTargetStyle: ViewStyle = {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
};

const expandedPanelStyle: ViewStyle = {
    backgroundColor: '#06101F',
    borderColor: '#1E3A5F',
    borderRadius: 14,
    borderWidth: 1,
    height: Platform.OS === 'web' ? ('calc(100vh - 48px)' as ViewStyle['height']) : '96%',
    maxWidth: 1500,
    overflow: 'hidden',
    width: '100%',
    zIndex: 2,
};

const detailPanelStyle: ViewStyle = {
    backgroundColor: '#07111F',
    borderColor: '#1E3A5F',
    borderRadius: 14,
    borderWidth: 1,
    maxHeight: Platform.OS === 'web' ? ('calc(100vh - 72px)' as ViewStyle['maxHeight']) : '92%',
    maxWidth: 760,
    overflow: 'hidden',
    width: '100%',
    zIndex: 2,
};

const expandedHeaderStyle: ViewStyle = {
    alignItems: 'center',
    backgroundColor: '#0B1625',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    minHeight: 68,
    paddingHorizontal: 20,
};

const expandedTitleStyle = {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900' as const,
};

const overlayCloseButtonStyle: ViewStyle = {
    backgroundColor: '#E2E8F0',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
};

const overlayCloseButtonTextStyle = {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900' as const,
};

const expandedGridStyle: ViewStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    padding: 16,
};

const expandedCardWrapStyle: ViewStyle = {
    minWidth: 280,
    width: 340,
};

const detailSubtitleStyle = {
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: '700' as const,
    marginTop: 4,
};

const detailBodyStyle: ViewStyle = {
    gap: 12,
    padding: 20,
};

const detailRowStyle: ViewStyle = {
    borderBottomColor: '#1E293B',
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: 10,
};

const detailLabelStyle = {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const detailValueStyle = {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800' as const,
};

const openManagementButtonStyle: ViewStyle = {
    alignItems: 'center',
    backgroundColor: '#0EA5E9',
    borderRadius: 999,
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 12,
};

const openManagementButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900' as const,
};
