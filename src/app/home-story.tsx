import DictationTextInput from '@/components/input/DictationTextInput';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import {
    CONSTRUCTION_EVENT_CATEGORIES,
    CONSTRUCTION_EVENT_TYPES,
    constructionCategoryLabel,
    constructionEventTypeLabel,
    createConstructionHistoryEvent,
    formatConstructionEventDate,
    loadConstructionHistory,
    loadConstructionReferenceOptions,
    type ConstructionEventDraft,
    type ConstructionHistoryEvent,
    type ConstructionReferenceItem,
    type ConstructionReferenceJob,
} from '../lib/homeConstructionHistory';
import { loadActiveHomeIdentity, loadCompanyHomeIdentity, type HomeIdentity } from '../lib/homeIdentity';
import {
    providerModePath,
    providerModeQueryParams,
    readProviderModeParams,
} from '../lib/providerMode';
import { useTheme } from '../theme/useTheme';

const EMPTY_DRAFT: ConstructionEventDraft = {
    eventType: 'installation',
    category: 'other',
    title: '',
    eventDate: '',
    datePrecision: 'exact',
    description: '',
    homeItemId: '',
    system: '',
    installerName: '',
    serviceCompany: '',
    serviceContact: '',
    warrantyDetails: '',
    relatedJobId: '',
};

export default function ConstructionHistoryScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const routeParams = useLocalSearchParams<{
        providerMode?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        returnTo?: string | string[];
        serviceRequestId?: string | string[];
        scheduleSlotId?: string | string[];
        jobId?: string | string[];
    }>();
    const providerContext = useMemo(() => readProviderModeParams(routeParams), [routeParams]);
    const [identity, setIdentity] = useState<HomeIdentity | null>(null);
    const [events, setEvents] = useState<ConstructionHistoryEvent[]>([]);
    const [items, setItems] = useState<ConstructionReferenceItem[]>([]);
    const [jobs, setJobs] = useState<ConstructionReferenceJob[]>([]);
    const [draft, setDraft] = useState<ConstructionEventDraft>(EMPTY_DRAFT);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    const loadHistory = useCallback(async () => {
        setLoading(true);
        setMessage('');

        try {
            const [nextIdentity, nextEvents, references] = await Promise.all([
                providerContext ? loadCompanyHomeIdentity(providerContext) : loadActiveHomeIdentity(),
                loadConstructionHistory(providerContext),
                providerContext ? Promise.resolve({ items: [], jobs: [] }) : loadConstructionReferenceOptions(),
            ]);

            setIdentity(nextIdentity);
            setEvents(nextEvents);
            setItems(references.items);
            setJobs(references.jobs);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Construction history could not be loaded.');
        } finally {
            setLoading(false);
        }
    }, [providerContext]);

    useFocusEffect(useCallback(() => {
        void loadHistory();
    }, [loadHistory]));

    async function saveEvent() {
        if (saving || providerContext) return;

        setSaving(true);
        setMessage('');

        try {
            const eventId = await createConstructionHistoryEvent(draft);
            setDraft(EMPTY_DRAFT);
            setShowForm(false);
            router.push(`/home-story/${eventId}` as any);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Construction event could not be saved.');
        } finally {
            setSaving(false);
        }
    }

    function updateDraft<K extends keyof ConstructionEventDraft>(field: K, value: ConstructionEventDraft[K]) {
        setDraft((current) => ({ ...current, [field]: value }));
    }

    function selectItem(item: ConstructionReferenceItem | null) {
        setDraft((current) => ({
            ...current,
            homeItemId: item?.id || '',
            system: item?.system || current.system,
        }));
    }

    function openEvent(event: ConstructionHistoryEvent) {
        router.push(providerContext ? {
            pathname: '/home-story/[id]',
            params: { id: event.id, ...providerModeQueryParams(providerContext) },
        } as any : `/home-story/${event.id}` as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), paddingBottom: scaleIcon(48), alignItems: 'center' }}
            keyboardShouldPersistTaps="handled"
        >
            <View style={{ width: '100%', maxWidth: 980 }}>
                <HomeHeader />
                <ThemedButton
                    title="Back"
                    variant="secondary"
                    onPress={() => providerContext
                        ? router.replace(providerModePath('/', providerContext) as any)
                        : router.back()
                    }
                    style={{ alignSelf: 'flex-start', marginBottom: scaleIcon(18) }}
                />

                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900', textTransform: 'uppercase' }}>
                    Home Profile
                </Text>
                <Text style={{ color: theme.colors.text, fontSize: scaleFont(34), fontWeight: '900', marginTop: scaleIcon(5) }}>
                    Construction History
                </Text>
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(16), lineHeight: scaleFont(23), marginTop: scaleIcon(8) }}>
                    {identity?.name || 'This home'} · durable installations, replacements, upgrades, additions, inspections, and significant repairs only. Routine worker logs stay in job history.
                </Text>

                <ThemedCard style={{ marginTop: scaleIcon(18), marginBottom: scaleIcon(18) }}>
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900' }}>
                        Record source and privacy
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(21), marginTop: scaleIcon(7) }}>
                        Homeowner-entered facts are not publicly verified. HomeOS does not perform paid property lookup. Connected companies can read this history only when service-history sharing is enabled; provider access is read-only.
                    </Text>
                </ThemedCard>

                {!providerContext ? (
                    <ThemedButton
                        title={showForm ? 'Close Add Event' : 'Add Construction Event'}
                        onPress={() => setShowForm((current) => !current)}
                        style={{ alignSelf: 'flex-start', marginBottom: scaleIcon(18) }}
                    />
                ) : null}

                {showForm && !providerContext ? (
                    <ThemedCard style={{ marginBottom: scaleIcon(20) }}>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(22), fontWeight: '900' }}>Add a durable event</Text>
                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(21), marginTop: scaleIcon(6), marginBottom: scaleIcon(16) }}>
                            Do not add daily work notes or routine maintenance. Link a home item and completed job when they apply.
                        </Text>

                        <FieldLabel text="Event type" />
                        <ChoiceGrid>
                            {CONSTRUCTION_EVENT_TYPES.map((option) => (
                                <ChoiceButton
                                    key={option.value}
                                    label={option.label}
                                    selected={draft.eventType === option.value}
                                    onPress={() => updateDraft('eventType', option.value)}
                                />
                            ))}
                        </ChoiceGrid>

                        <FieldLabel text="Category" />
                        <ChoiceGrid>
                            {CONSTRUCTION_EVENT_CATEGORIES.map((option) => (
                                <ChoiceButton
                                    key={option.value}
                                    label={option.label}
                                    selected={draft.category === option.value}
                                    onPress={() => updateDraft('category', option.value)}
                                />
                            ))}
                        </ChoiceGrid>

                        <FieldLabel text="Event title" />
                        <HistoryInput
                            value={draft.title}
                            onChangeText={(value) => updateDraft('title', value)}
                            placeholder="Example: Main electrical panel upgraded"
                        />

                        <FieldLabel text="Date" />
                        <HistoryInput
                            dictationEnabled={false}
                            value={draft.eventDate}
                            onChangeText={(value) => updateDraft('eventDate', value)}
                            placeholder={draft.datePrecision === 'year' ? 'YYYY' : draft.datePrecision === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD'}
                        />
                        <ChoiceGrid>
                            {(['exact', 'month', 'year'] as const).map((precision) => (
                                <ChoiceButton
                                    key={precision}
                                    label={precision === 'exact' ? 'Exact date' : precision === 'month' ? 'Month known' : 'Year known'}
                                    selected={draft.datePrecision === precision}
                                    onPress={() => setDraft((current) => ({ ...current, datePrecision: precision, eventDate: '' }))}
                                />
                            ))}
                        </ChoiceGrid>

                        <FieldLabel text="Description" />
                        <HistoryInput
                            multiline
                            value={draft.description}
                            onChangeText={(value) => updateDraft('description', value)}
                            placeholder="What was installed, replaced, inspected, upgraded, added, or significantly repaired?"
                        />

                        <FieldLabel text="Related HomeOS item (optional)" />
                        <ChoiceGrid>
                            <ChoiceButton label="No linked item" selected={!draft.homeItemId} onPress={() => selectItem(null)} />
                            {items.map((item) => (
                                <ChoiceButton
                                    key={item.id}
                                    label={`${item.name}${item.system ? ` · ${item.system}` : ''}`}
                                    selected={draft.homeItemId === item.id}
                                    onPress={() => selectItem(item)}
                                />
                            ))}
                        </ChoiceGrid>

                        {!draft.homeItemId ? (
                            <>
                                <FieldLabel text="Related system (optional)" />
                                <HistoryInput value={draft.system} onChangeText={(value) => updateDraft('system', value)} placeholder="Example: Electrical" />
                            </>
                        ) : null}

                        <FieldLabel text="Installer or technician (optional)" />
                        <HistoryInput value={draft.installerName} onChangeText={(value) => updateDraft('installerName', value)} placeholder="Name provided in the record" />

                        <FieldLabel text="Service company (optional)" />
                        <HistoryInput value={draft.serviceCompany} onChangeText={(value) => updateDraft('serviceCompany', value)} placeholder="Company provided in the record" />

                        <FieldLabel text="Service contact or reference (optional)" />
                        <HistoryInput value={draft.serviceContact} onChangeText={(value) => updateDraft('serviceContact', value)} placeholder="Phone, email, invoice, or permit reference" />

                        <FieldLabel text="Warranty details (optional)" />
                        <HistoryInput multiline value={draft.warrantyDetails} onChangeText={(value) => updateDraft('warrantyDetails', value)} placeholder="Only the warranty details you have" />

                        <FieldLabel text="Related job history (optional)" />
                        <ChoiceGrid>
                            <ChoiceButton label="No linked job" selected={!draft.relatedJobId} onPress={() => updateDraft('relatedJobId', '')} />
                            {jobs.map((job) => (
                                <ChoiceButton
                                    key={job.id}
                                    label={`${job.title} · ${job.status || 'status unknown'}`}
                                    selected={draft.relatedJobId === job.id}
                                    onPress={() => updateDraft('relatedJobId', job.id)}
                                />
                            ))}
                        </ChoiceGrid>

                        <ThemedButton
                            title={saving ? 'Saving Event…' : 'Save Construction Event'}
                            disabled={saving}
                            onPress={() => void saveEvent()}
                            style={{ marginTop: scaleIcon(20) }}
                        />
                    </ThemedCard>
                ) : null}

                {!!message ? (
                    <ThemedCard style={{ marginBottom: scaleIcon(16) }}>
                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(21) }}>{message}</Text>
                    </ThemedCard>
                ) : null}

                {loading ? (
                    <ThemedCard>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Loading construction history…</Text>
                    </ThemedCard>
                ) : events.length === 0 ? (
                    <ThemedCard>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900' }}>No durable events yet</Text>
                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), lineHeight: scaleFont(21), marginTop: scaleIcon(7) }}>
                            Add a known installation, replacement, upgrade, addition, inspection, or significant repair. Leave unknown history blank rather than guessing.
                        </Text>
                    </ThemedCard>
                ) : (
                    <View style={{ gap: scaleIcon(12) }}>
                        {events.map((event) => (
                            <ThemedCard key={event.id} onPress={() => openEvent(event)}>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: scaleIcon(12) }}>
                                    <View style={{ flex: 1, minWidth: 220 }}>
                                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '900', textTransform: 'uppercase' }}>
                                            {formatConstructionEventDate(event.eventDate, event.datePrecision)} · {constructionEventTypeLabel(event.eventType)}
                                        </Text>
                                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900', marginTop: scaleIcon(5) }}>{event.title}</Text>
                                        <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(14), marginTop: scaleIcon(6) }}>
                                            {constructionCategoryLabel(event.category)}
                                            {event.homeItemName ? ` · ${event.homeItemName}` : event.system ? ` · ${event.system}` : ''}
                                        </Text>
                                    </View>
                                    <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Open details</Text>
                                </View>
                            </ThemedCard>
                        ))}
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

function FieldLabel({ text }: { text: string }) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return <Text style={{ color: theme.colors.text, fontSize: scaleFont(14), fontWeight: '900', marginTop: scaleIcon(16), marginBottom: scaleIcon(7) }}>{text}</Text>;
}

function ChoiceGrid({ children }: { children: ReactNode }) {
    const { scaleIcon } = useTheme();

    return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8) }}>{children}</View>;
}

function ChoiceButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
    return (
        <ThemedButton
            title={label}
            variant={selected ? 'primary' : 'secondary'}
            onPress={onPress}
            style={{ flexGrow: 1, minWidth: 130, paddingVertical: 11 }}
            textStyle={{ fontSize: 12 }}
        />
    );
}

function HistoryInput(props: ComponentProps<typeof DictationTextInput>) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <DictationTextInput
            {...props}
            placeholderTextColor={theme.colors.mutedText}
            style={[
                {
                    minHeight: props.multiline ? scaleIcon(110) : scaleIcon(50),
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radii.button,
                    backgroundColor: theme.colors.surfaceAlt,
                    color: theme.colors.text,
                    fontSize: scaleFont(15),
                    padding: scaleIcon(13),
                    textAlignVertical: props.multiline ? 'top' : 'center',
                },
                props.style,
            ]}
        />
    );
}
