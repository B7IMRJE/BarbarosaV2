import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import {
    HOMEOWNER_ACTIVE_REQUEST_REFRESH_MS,
    formatActiveRequestCompactLabel,
    formatActiveRequestExpandedTitle,
    getActiveRequestEtaStatusText,
    getActiveRequestTrackerAutoCollapseDelay,
    getActiveRequestTrackerAutoExpansionReason,
    loadActiveHomeownerRequestTrackers,
    selectFeaturedHomeownerActiveRequest,
    type ActiveRequestTrackerAutoExpansionReason,
    type HomeownerActiveRequestTracker,
} from '../../lib/homeownerActiveRequests';
import { requestHomeownerServiceRequestUpdate } from '../../lib/homeServiceRequests';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';
import ServiceRequestMediaGallery from './ServiceRequestMediaGallery';
import ThemedButton from '../theme/ThemedButton';

type HomeownerActiveRequestStatusProps = {
    bottomOffset: number;
};

export default function HomeownerActiveRequestStatus({ bottomOffset }: HomeownerActiveRequestStatusProps) {
    const { width: viewportWidth } = useWindowDimensions();
    const { scaleFont, scaleIcon, theme } = useTheme();
    const autoCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const previousTrackersRef = useRef<HomeownerActiveRequestTracker[]>([]);
    const refreshRunRef = useRef(0);
    const [propertyId, setPropertyId] = useState('');
    const [trackers, setTrackers] = useState<HomeownerActiveRequestTracker[]>([]);
    const [selectedRequestId, setSelectedRequestId] = useState('');
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [requestingUpdateId, setRequestingUpdateId] = useState('');
    const featuredTracker = useMemo(() => selectFeaturedHomeownerActiveRequest(trackers), [trackers]);
    const selectedTracker = useMemo(() => (
        trackers.find((tracker) => tracker.request.id === selectedRequestId) || featuredTracker
    ), [featuredTracker, selectedRequestId, trackers]);
    const cardWidth = Math.min(Math.max(viewportWidth - scaleIcon(28), scaleIcon(280)), scaleIcon(430));

    useEffect(() => {
        let disposed = false;

        async function loadInitialTrackers() {
            const nextTrackers = await refreshTrackers();

            if (!disposed && nextTrackers.length > 0) {
                setSelectedRequestId(selectFeaturedHomeownerActiveRequest(nextTrackers)?.request.id || '');
            }
        }

        void loadInitialTrackers();

        return () => {
            disposed = true;
            clearAutoCollapseTimer();
        };
    }, []);

    useEffect(() => {
        if (!propertyId) return;

        const refresh = () => {
            void refreshTrackers(propertyId);
        };
        const channel = supabase
            .channel(`homeowner-active-requests:${propertyId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'service_request_events',
                    filter: `property_id=eq.${propertyId}`,
                },
                refresh
            )
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'service_requests',
                    filter: `property_id=eq.${propertyId}`,
                },
                refresh
            )
            .subscribe();
        const intervalId = setInterval(refresh, HOMEOWNER_ACTIVE_REQUEST_REFRESH_MS);

        return () => {
            clearInterval(intervalId);
            void supabase.removeChannel(channel);
        };
    }, [propertyId]);

    async function refreshTrackers(propertyIdOverride?: string | null) {
        const runId = refreshRunRef.current + 1;
        refreshRunRef.current = runId;
        setLoading(true);

        try {
            const nextTrackers = await loadActiveHomeownerRequestTrackers(propertyIdOverride);

            if (runId !== refreshRunRef.current) return [];

            const featured = selectFeaturedHomeownerActiveRequest(nextTrackers);
            const expansionReason = getActiveRequestTrackerAutoExpansionReason(previousTrackersRef.current, nextTrackers);

            previousTrackersRef.current = nextTrackers;
            setTrackers(nextTrackers);
            setMessage('');
            setPropertyId(nextTrackers[0]?.request.property_id || String(propertyIdOverride || '').trim());
            setSelectedRequestId((current) => (
                current && nextTrackers.some((tracker) => tracker.request.id === current)
                    ? current
                    : featured?.request.id || ''
            ));

            if (nextTrackers.length === 0) {
                collapseTracker();
            } else if (expansionReason) {
                setSelectedRequestId(featured?.request.id || '');
                expandTemporarily(expansionReason);
            }

            return nextTrackers;
        } catch (error) {
            if (runId === refreshRunRef.current) {
                setTrackers([]);
                setMessage(getErrorMessage(error));
            }

            return [];
        } finally {
            if (runId === refreshRunRef.current) {
                setLoading(false);
            }
        }
    }

    async function requestCompanyUpdate(tracker: HomeownerActiveRequestTracker) {
        setRequestingUpdateId(tracker.request.id);
        setMessage('Requesting an update from the company...');

        try {
            const result = await requestHomeownerServiceRequestUpdate(tracker.request.id);
            setMessage(result.message);
            await refreshTrackers(tracker.request.property_id);
        } catch (error) {
            setMessage(`Could not request an update: ${getErrorMessage(error)}`);
        } finally {
            setRequestingUpdateId('');
        }
    }

    function expandTemporarily(reason: ActiveRequestTrackerAutoExpansionReason) {
        clearAutoCollapseTimer();
        setExpanded(true);

        const delay = getActiveRequestTrackerAutoCollapseDelay(reason);

        if (delay > 0) {
            autoCollapseTimerRef.current = setTimeout(() => {
                setExpanded(false);
                autoCollapseTimerRef.current = null;
            }, delay);
        }
    }

    function expandManually(tracker: HomeownerActiveRequestTracker) {
        clearAutoCollapseTimer();
        setSelectedRequestId(tracker.request.id);
        setExpanded(true);
    }

    function collapseTracker() {
        clearAutoCollapseTimer();
        setExpanded(false);
    }

    function clearAutoCollapseTimer() {
        if (!autoCollapseTimerRef.current) return;

        clearTimeout(autoCollapseTimerRef.current);
        autoCollapseTimerRef.current = null;
    }

    if (!featuredTracker) return null;

    const chipTone = featuredTracker.isEmergency
        ? theme.colors.status.activeEmergency
        : { background: theme.colors.surface, border: theme.colors.border };

    if (!expanded) {
        return (
            <TouchableOpacity
                activeOpacity={0.86}
                accessibilityLabel="Active Request"
                onPress={() => expandManually(featuredTracker)}
                style={{
                    alignItems: 'center',
                    backgroundColor: chipTone.background,
                    borderColor: chipTone.border,
                    borderRadius: theme.radii.pill,
                    borderWidth: 1,
                    bottom: bottomOffset,
                    elevation: 8,
                    flexDirection: 'row',
                    gap: scaleIcon(7),
                    maxWidth: scaleIcon(190),
                    minHeight: scaleIcon(46),
                    paddingHorizontal: scaleIcon(12),
                    paddingVertical: scaleIcon(9),
                    position: 'absolute',
                    right: scaleIcon(14),
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: 0.16,
                    shadowRadius: 14,
                    zIndex: 40,
                }}
            >
                <Ionicons
                    name={featuredTracker.isEmergency ? 'alert-circle-outline' : 'construct-outline'}
                    size={scaleIcon(20)}
                    color={featuredTracker.isEmergency ? theme.colors.danger : theme.colors.primary}
                />
                <Text
                    numberOfLines={1}
                    style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: '900' }}
                >
                    {formatActiveRequestCompactLabel(featuredTracker)}
                </Text>
                {!!featuredTracker.moreCountLabel && (
                    <Text
                        numberOfLines={1}
                        style={{ color: theme.colors.mutedText, fontSize: scaleFont(11), fontWeight: '900' }}
                    >
                        {featuredTracker.moreCountLabel}
                    </Text>
                )}
            </TouchableOpacity>
        );
    }

    return (
        <View
            style={{
                backgroundColor: theme.colors.background,
                borderColor: selectedTracker?.isEmergency ? theme.colors.status.activeEmergency.border : theme.colors.border,
                borderRadius: theme.radii.card,
                borderWidth: 1,
                bottom: bottomOffset,
                elevation: 9,
                maxHeight: '78%',
                overflow: 'hidden',
                position: 'absolute',
                right: scaleIcon(14),
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.18,
                shadowRadius: 18,
                width: cardWidth,
                zIndex: 40,
            }}
        >
            <View
                style={{
                    alignItems: 'center',
                    backgroundColor: selectedTracker?.isEmergency
                        ? theme.colors.status.activeEmergency.background
                        : theme.colors.surface,
                    borderBottomColor: theme.colors.border,
                    borderBottomWidth: 1,
                    flexDirection: 'row',
                    gap: scaleIcon(10),
                    justifyContent: 'space-between',
                    paddingHorizontal: scaleIcon(14),
                    paddingVertical: scaleIcon(12),
                }}
            >
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(12), fontWeight: '900' }}>
                        Active Request
                    </Text>
                    <View style={{ alignItems: 'center', flexDirection: 'row', gap: scaleIcon(7), marginTop: scaleIcon(4) }}>
                        <Ionicons
                            name={selectedTracker?.isEmergency ? 'alert-circle-outline' : 'construct-outline'}
                            size={scaleIcon(18)}
                            color={selectedTracker?.isEmergency ? theme.colors.danger : theme.colors.primary}
                        />
                        <Text
                            numberOfLines={1}
                            style={{ color: theme.colors.text, flex: 1, fontSize: scaleFont(16), fontWeight: '900' }}
                        >
                            {formatActiveRequestExpandedTitle(selectedTracker)}
                        </Text>
                    </View>
                </View>
                <TouchableOpacity activeOpacity={0.82} onPress={collapseTracker}>
                    <Text style={{ color: theme.colors.link, fontSize: scaleFont(14), fontWeight: '900' }}>Close</Text>
                </TouchableOpacity>
            </View>

            {trackers.length > 1 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: scaleIcon(8), padding: scaleIcon(12) }}>
                    {trackers.map((tracker) => {
                        const selected = tracker.request.id === selectedTracker?.request.id;

                        return (
                            <TouchableOpacity
                                key={tracker.request.id}
                                activeOpacity={0.82}
                                onPress={() => setSelectedRequestId(tracker.request.id)}
                                style={{
                                    backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                                    borderRadius: theme.radii.pill,
                                    borderWidth: 1,
                                    paddingHorizontal: scaleIcon(12),
                                    paddingVertical: scaleIcon(8),
                                }}
                            >
                                <Text style={{ color: selected ? theme.colors.primaryText : theme.colors.text, fontSize: scaleFont(12), fontWeight: '900' }}>
                                    {formatSelectorLabel(tracker)}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            <ScrollView contentContainerStyle={{ padding: scaleIcon(14), paddingBottom: scaleIcon(18) }}>
                {selectedTracker && (
                    <>
                        <View
                            style={{
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                                borderRadius: theme.radii.card,
                                borderWidth: 1,
                                padding: scaleIcon(12),
                            }}
                        >
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(7), marginBottom: scaleIcon(8) }}>
                                <Badge label={selectedTracker.requestKindLabel} />
                                {!!selectedTracker.activeCountLabel && <Badge label={selectedTracker.activeCountLabel} />}
                            </View>
                            <Text style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>
                                {selectedTracker.statusLabel}
                            </Text>
                            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '800', lineHeight: scaleFont(19), marginTop: scaleIcon(4) }}>
                                {selectedTracker.latestUpdateLabel}
                            </Text>
                            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800', marginTop: scaleIcon(6) }}>
                                Last updated {formatDateTime(selectedTracker.latestEvent?.created_at || selectedTracker.request.updated_at || selectedTracker.request.created_at)}
                            </Text>
                        </View>

                        <View style={{ gap: scaleIcon(8), marginTop: scaleIcon(12) }}>
                            <DetailLine label="Provider" value={selectedTracker.providerName} />
                            <DetailLine label="Technician" value={selectedTracker.technicianName} />
                            {!!getActiveRequestEtaStatusText(selectedTracker) && (
                                <DetailLine label="ETA" value={getActiveRequestEtaStatusText(selectedTracker)} />
                            )}
                            <DetailLine label="Arrival window" value={selectedTracker.arrivalWindowLabel} />
                            <DetailLine label="Request" value={selectedTracker.request.issue_summary || 'No request description available.'} />
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), marginTop: scaleIcon(14) }}>
                            <ThemedButton
                                title={requestingUpdateId === selectedTracker.request.id ? 'Requesting...' : 'Contact Company'}
                                disabled={!!requestingUpdateId}
                                onPress={() => requestCompanyUpdate(selectedTracker)}
                                style={{ flexGrow: 1, minWidth: scaleIcon(170), paddingVertical: scaleIcon(10) }}
                                textStyle={{ fontSize: scaleFont(13) }}
                            />
                        </View>

                        {!!message && (
                            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800', lineHeight: scaleFont(17), marginTop: scaleIcon(8) }}>
                                {message}
                            </Text>
                        )}

                        <View style={{ marginTop: scaleIcon(16) }}>
                            <Text style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900' }}>
                                Timeline
                            </Text>
                            {selectedTracker.timeline.length === 0 ? (
                                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), fontWeight: '800', lineHeight: scaleFont(19), marginTop: scaleIcon(6) }}>
                                    Updates will appear here as the company works on your request.
                                </Text>
                            ) : (
                                <View style={{ gap: scaleIcon(9), marginTop: scaleIcon(9) }}>
                                    {selectedTracker.timeline.map((event) => (
                                        <View
                                            key={event.id}
                                            style={{
                                                backgroundColor: theme.colors.surface,
                                                borderColor: theme.colors.border,
                                                borderRadius: theme.radii.card,
                                                borderWidth: 1,
                                                padding: scaleIcon(10),
                                            }}
                                        >
                                            <Text style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: '900' }}>
                                                {event.message || 'Request update'}
                                            </Text>
                                            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800', marginTop: scaleIcon(4) }}>
                                                {formatDateTime(event.created_at)}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>

                        <ServiceRequestMediaGallery
                            serviceRequestId={selectedTracker.request.id}
                            title="Submitted photos and videos"
                            compact
                        />
                    </>
                )}

                {loading && (
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800', marginTop: scaleIcon(10) }}>
                        Refreshing status...
                    </Text>
                )}
            </ScrollView>
        </View>
    );
}

function Badge({ label }: { label: string }) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View
            style={{
                backgroundColor: theme.colors.secondaryButton,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.pill,
                borderWidth: 1,
                paddingHorizontal: scaleIcon(9),
                paddingVertical: scaleIcon(4),
            }}
        >
            <Text style={{ color: theme.colors.secondaryButtonText, fontSize: scaleFont(11), fontWeight: '900' }}>
                {label}
            </Text>
        </View>
    );
}

function DetailLine({ label, value }: { label: string; value: string }) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View
            style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
                borderRadius: theme.radii.card,
                borderWidth: 1,
                paddingHorizontal: scaleIcon(10),
                paddingVertical: scaleIcon(9),
            }}
        >
            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(11), fontWeight: '900', textTransform: 'uppercase' }}>
                {label}
            </Text>
            <Text style={{ color: theme.colors.text, fontSize: scaleFont(13), fontWeight: '800', lineHeight: scaleFont(19), marginTop: scaleIcon(2) }}>
                {value}
            </Text>
        </View>
    );
}

function formatSelectorLabel(tracker: HomeownerActiveRequestTracker) {
    return `${tracker.requestKindLabel} ${formatActiveRequestCompactLabel(tracker)}`;
}

function formatDateTime(value?: string | null) {
    if (!value) return 'not available';

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? 'not available' : date.toLocaleString();
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;

    return 'Unknown error';
}
