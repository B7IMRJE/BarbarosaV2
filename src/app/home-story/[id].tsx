import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Linking, ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    constructionCategoryLabel,
    constructionEventTypeLabel,
    formatConstructionEventDate,
    loadConstructionEventFileCandidates,
    loadConstructionHistoryEvent,
    setConstructionEventFileLinked,
    type ConstructionHistoryEvent,
    type ConstructionHistoryFile,
} from '../../lib/homeConstructionHistory';
import {
    providerModeItemPath,
    providerModePath,
    readProviderModeParams,
} from '../../lib/providerMode';
import { useTheme } from '../../theme/useTheme';

export default function ConstructionHistoryDetailScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const params = useLocalSearchParams<{
        id?: string | string[];
        providerMode?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const eventId = firstParam(params.id);
    const providerContext = useMemo(() => readProviderModeParams(params), [params]);
    const [event, setEvent] = useState<ConstructionHistoryEvent | null>(null);
    const [fileCandidates, setFileCandidates] = useState<ConstructionHistoryFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [linkingFileId, setLinkingFileId] = useState('');
    const [message, setMessage] = useState('');

    const loadEvent = useCallback(async () => {
        if (!eventId) {
            setMessage('Construction event not found.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setMessage('');

        try {
            const nextEvent = await loadConstructionHistoryEvent(eventId, providerContext);
            setEvent(nextEvent);
            setFileCandidates(nextEvent && !providerContext
                ? await loadConstructionEventFileCandidates(nextEvent)
                : []
            );
            if (!nextEvent) setMessage('Construction event not found.');
        } catch (error) {
            setEvent(null);
            setFileCandidates([]);
            setMessage(error instanceof Error ? error.message : 'Construction event could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [eventId, providerContext]);

    useFocusEffect(useCallback(() => {
        void loadEvent();
    }, [loadEvent]));

    async function toggleFile(file: ConstructionHistoryFile) {
        if (!event || providerContext || linkingFileId) return;

        const linked = event.files.some((candidate) => candidate.id === file.id);
        setLinkingFileId(file.id);
        setMessage('');

        try {
            await setConstructionEventFileLinked(event, file.id, !linked);
            await loadEvent();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'The file link could not be updated.');
        } finally {
            setLinkingFileId('');
        }
    }

    function openItem() {
        if (!event?.homeItemSlug) return;
        router.push(providerContext
            ? providerModeItemPath(event.homeItemSlug, providerContext) as any
            : `/item/${event.homeItemSlug}` as any
        );
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), paddingBottom: scaleIcon(48), alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />
                <ThemedButton
                    title="Back to Construction History"
                    variant="secondary"
                    onPress={() => router.replace(providerContext
                        ? providerModePath('/home-story', providerContext) as any
                        : '/home-story' as any
                    )}
                    style={{ alignSelf: 'flex-start', marginBottom: scaleIcon(18) }}
                />

                {loading ? (
                    <ThemedCard>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading event details…</Text>
                    </ThemedCard>
                ) : !event ? (
                    <ThemedCard>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900' }}>Event unavailable</Text>
                        <Text style={{ color: theme.colors.mutedText, marginTop: scaleIcon(7) }}>{message || 'This event could not be found.'}</Text>
                    </ThemedCard>
                ) : (
                    <>
                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900', textTransform: 'uppercase' }}>
                            {constructionCategoryLabel(event.category)} · {constructionEventTypeLabel(event.eventType)}
                        </Text>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(34), fontWeight: '900', marginTop: scaleIcon(6) }}>{event.title}</Text>
                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(16), fontWeight: '800', marginTop: scaleIcon(8) }}>
                            {formatConstructionEventDate(event.eventDate, event.datePrecision)}
                        </Text>

                        <ThemedCard style={{ marginTop: scaleIcon(18) }}>
                            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(11), fontWeight: '900', textTransform: 'uppercase' }}>
                                {event.source === 'company_documented' ? 'Company documented' : 'Homeowner-provided · not publicly verified'}
                            </Text>
                            <DetailRow label="Description" value={event.description || 'No description provided.'} />
                            <DetailRow label="Related system" value={event.system || event.homeItemName || 'Not linked'} />
                            <DetailRow label="Installer / technician" value={event.installerName || 'Not provided'} />
                            <DetailRow label="Service company" value={event.serviceCompany || 'Not provided'} />
                            <DetailRow label="Service contact / reference" value={event.serviceContact || 'Not provided'} />
                            <DetailRow label="Warranty details" value={event.warrantyDetails || 'No warranty details linked'} />
                        </ThemedCard>

                        {event.homeItemName || event.relatedJobTitle ? (
                            <ThemedCard style={{ marginTop: scaleIcon(16) }}>
                                <Text style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900' }}>Connected records</Text>
                                {event.homeItemName ? (
                                    <View style={{ marginTop: scaleIcon(13) }}>
                                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900' }}>HOME ITEM</Text>
                                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900', marginTop: scaleIcon(3) }}>{event.homeItemName}</Text>
                                        {event.homeItemSlug ? (
                                            <ThemedButton title="Open Home Item" variant="secondary" onPress={openItem} style={{ alignSelf: 'flex-start', marginTop: scaleIcon(9) }} />
                                        ) : null}
                                    </View>
                                ) : null}
                                {event.relatedJobTitle ? (
                                    <View style={{ marginTop: scaleIcon(15) }}>
                                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900' }}>RELATED JOB HISTORY</Text>
                                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(16), fontWeight: '900', marginTop: scaleIcon(3) }}>{event.relatedJobTitle}</Text>
                                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), marginTop: scaleIcon(3) }}>{event.relatedJobStatus || 'Status unavailable'}</Text>
                                        {!providerContext && event.relatedJobId ? (
                                            <ThemedButton
                                                title="Open Job History"
                                                variant="secondary"
                                                onPress={() => router.push(`/jobs/${event.relatedJobId}` as any)}
                                                style={{ alignSelf: 'flex-start', marginTop: scaleIcon(9) }}
                                            />
                                        ) : null}
                                    </View>
                                ) : null}
                            </ThemedCard>
                        ) : null}

                        <ThemedCard style={{ marginTop: scaleIcon(16) }}>
                            <Text style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900' }}>Photos, documents & warranties</Text>
                            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(21), marginTop: scaleIcon(6) }}>
                                Files stay in the existing protected HomeOS item record. This event only links the relevant files; it does not create a duplicate vault.
                                {providerContext ? ' Linked photos and documents appear only when their separate sharing permissions are enabled.' : ''}
                            </Text>

                            {event.files.length === 0 ? (
                                <Text style={{ color: theme.colors.mutedText, marginTop: scaleIcon(13) }}>No files linked to this event.</Text>
                            ) : (
                                <View style={{ gap: scaleIcon(10), marginTop: scaleIcon(13) }}>
                                    {event.files.map((file) => <LinkedFile key={file.id} file={file} />)}
                                </View>
                            )}

                            {!providerContext ? (
                                <View style={{ marginTop: scaleIcon(17) }}>
                                    {!event.homeItemId ? (
                                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(21) }}>
                                            Link this event to a HomeOS item to attach that item’s photos, permits, receipts, manuals, or warranty documents.
                                        </Text>
                                    ) : fileCandidates.length === 0 ? (
                                        <View>
                                            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(21) }}>
                                                This item has no available files yet. Add photos or documents from the Home Item, then return here.
                                            </Text>
                                            {event.homeItemSlug ? <ThemedButton title="Open Home Item to Add Files" variant="secondary" onPress={openItem} style={{ alignSelf: 'flex-start', marginTop: scaleIcon(10) }} /> : null}
                                        </View>
                                    ) : (
                                        <View style={{ gap: scaleIcon(9) }}>
                                            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Link existing item files</Text>
                                            {fileCandidates.map((file) => {
                                                const linked = event.files.some((candidate) => candidate.id === file.id);
                                                return (
                                                    <ThemedButton
                                                        key={file.id}
                                                        title={`${linked ? 'Linked' : 'Link'} · ${file.fileName || file.category || file.fileType}`}
                                                        variant={linked ? 'primary' : 'secondary'}
                                                        disabled={linkingFileId === file.id}
                                                        onPress={() => void toggleFile(file)}
                                                    />
                                                );
                                            })}
                                        </View>
                                    )}
                                </View>
                            ) : null}
                        </ThemedCard>

                        {!!message ? (
                            <ThemedCard style={{ marginTop: scaleIcon(16) }}>
                                <Text style={{ color: theme.colors.mutedText }}>{message}</Text>
                            </ThemedCard>
                        ) : null}
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View style={{ marginTop: scaleIcon(14) }}>
            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(11), fontWeight: '900', textTransform: 'uppercase' }}>{label}</Text>
            <Text style={{ color: theme.colors.text, fontSize: scaleFont(15), lineHeight: scaleFont(22), fontWeight: '800', marginTop: scaleIcon(4) }}>{value}</Text>
        </View>
    );
}

function LinkedFile({ file }: { file: ConstructionHistoryFile }) {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const isPhoto = file.fileType === 'photo';

    return (
        <ThemedCard onPress={() => void Linking.openURL(file.fileUrl)} style={{ backgroundColor: theme.colors.surfaceAlt }}>
            {isPhoto && file.fileUrl ? (
                <Image source={{ uri: file.fileUrl }} style={{ width: '100%', height: scaleIcon(180), borderRadius: theme.radii.button, marginBottom: scaleIcon(10) }} resizeMode="cover" />
            ) : null}
            <Text style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '900' }}>{file.fileName || file.category || 'HomeOS file'}</Text>
            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), marginTop: scaleIcon(4) }}>{file.fileType || 'document'} · Open file</Text>
        </ThemedCard>
    );
}

function firstParam(value?: string | string[]) {
    return String(Array.isArray(value) ? value[0] || '' : value || '').trim();
}
