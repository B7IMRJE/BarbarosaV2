import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../lib/activeProperty';
import {
    formatDateLabel,
    formatRecurrence,
    labelDueStatus,
    type DueStatusLabel,
    type RecurrenceUnit,
} from '../../lib/maintenanceTimers';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type MaintenanceRecord = {
    id: string;
    system: string | null;
    area: string | null;
    title: string;
    description: string | null;
    service_date: string | null;
    next_service_date: string | null;
    created_at: string;
};

type MaintenanceReminder = {
    id: string;
    property_id: string;
    home_item_id: string | null;
    item_slug: string | null;
    system: string | null;
    title: string;
    description: string | null;
    recurrence_interval: number;
    recurrence_unit: RecurrenceUnit;
    last_completed_date: string | null;
    next_due_date: string;
    reminder_status: 'active' | 'paused' | 'archived';
    notes: string | null;
    created_at: string;
};

type MaintenanceReminderItem = {
    id: string;
    name: string | null;
    system: string | null;
    location: string | null;
    parent_area: string | null;
    item_slug: string | null;
};

function formatDate(value?: string | null) {
    if (!value) return 'Not set';
    return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function logMaintenanceDashboardError(stage: string, error: unknown) {
    const safeError = error as {
        message?: unknown;
        code?: unknown;
        details?: unknown;
        hint?: unknown;
    };

    console.error('[MaintenanceDashboard]', {
        stage,
        message: typeof safeError?.message === 'string' ? safeError.message : 'Unknown error',
        code: typeof safeError?.code === 'string' || typeof safeError?.code === 'number' ? safeError.code : null,
        details: typeof safeError?.details === 'string' ? safeError.details : null,
        hint: typeof safeError?.hint === 'string' ? safeError.hint : null,
    });
}

export default function MaintenanceCenterScreen() {
    const { theme } = useTheme();
    const [records, setRecords] = useState<MaintenanceRecord[]>([]);
    const [reminders, setReminders] = useState<MaintenanceReminder[]>([]);
    const [reminderItems, setReminderItems] = useState<Record<string, MaintenanceReminderItem>>({});
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useFocusEffect(
        useCallback(() => {
            void loadDashboard();
        }, [])
    );

    async function loadDashboard() {
        setLoading(true);
        setMessage('');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
            setRecords([]);
            setReminders([]);
            setReminderItems({});
            setLoading(false);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const messages: string[] = [];

        const { data: reminderData, error: reminderError } = await supabase
            .from('home_item_maintenance_tasks')
            .select('id, property_id, home_item_id, item_slug, system, title, description, recurrence_interval, recurrence_unit, last_completed_date, next_due_date, reminder_status, notes, created_at')
            .eq('property_id', activeProperty.propertyId)
            .neq('reminder_status', 'archived')
            .order('next_due_date', { ascending: true });

        if (reminderError) {
            logMaintenanceDashboardError('load-reminders', reminderError);
            setReminders([]);
            setReminderItems({});
            messages.push('Maintenance reminders could not be loaded. Please try again.');
        } else {
            const loadedReminders = (reminderData || []) as MaintenanceReminder[];
            setReminders(loadedReminders);

            const homeItemIds = Array.from(
                new Set(loadedReminders.map((reminder) => reminder.home_item_id).filter(Boolean) as string[])
            );

            if (homeItemIds.length > 0) {
                const { data: itemData, error: itemError } = await supabase
                    .from('home_items')
                    .select('id, name, system, location, parent_area, item_slug')
                    .in('id', homeItemIds);

                if (itemError) {
                    logMaintenanceDashboardError('load-reminder-items', itemError);
                    setReminderItems({});
                    messages.push('Reminder item details could not be loaded. Some cards may show limited information.');
                } else {
                    const itemMap = ((itemData || []) as MaintenanceReminderItem[]).reduce<Record<string, MaintenanceReminderItem>>(
                        (accumulator, item) => {
                            accumulator[item.id] = item;
                            return accumulator;
                        },
                        {}
                    );
                    setReminderItems(itemMap);
                }
            } else {
                setReminderItems({});
            }
        }

        const { data, error } = await supabase
            .from('maintenance_records')
            .select('id, system, area, title, description, service_date, next_service_date, created_at')
            .eq('property_id', activeProperty.propertyId)
            .order('service_date', { ascending: false, nullsFirst: false })
            .order('created_at', { ascending: false });

        if (error) {
            logMaintenanceDashboardError('load-records', error);
            setRecords([]);
            messages.push('Maintenance records could not be loaded. Please try again.');
        } else {
            setRecords((data || []) as MaintenanceRecord[]);
        }

        setMessage(messages.join(' '));
        setLoading(false);
    }

    const groupedReminders = {
        Overdue: [] as MaintenanceReminder[],
        'Due Soon': [] as MaintenanceReminder[],
        Upcoming: [] as MaintenanceReminder[],
        Paused: [] as MaintenanceReminder[],
    } satisfies Record<DueStatusLabel, MaintenanceReminder[]>;

    reminders.forEach((reminder) => {
        groupedReminders[labelDueStatus(reminder)].push(reminder);
    });

    const reminderGroups = [
        { label: 'Overdue' as const, reminders: groupedReminders.Overdue },
        { label: 'Due Soon' as const, reminders: groupedReminders['Due Soon'] },
        { label: 'Upcoming' as const, reminders: groupedReminders.Upcoming },
        { label: 'Paused' as const, reminders: groupedReminders.Paused },
    ];

    function openReminderItem(reminder: MaintenanceReminder) {
        const linkedItem = reminder.home_item_id ? reminderItems[reminder.home_item_id] : null;
        const itemSlug = reminder.item_slug || linkedItem?.item_slug;

        if (!itemSlug) {
            setMessage('This reminder is missing an item link.');
            return;
        }

        router.push(`/item/${itemSlug}` as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: 34, fontWeight: '900' }}>
                    Maintenance Center
                </Text>
                <Text
                    style={{
                        color: theme.colors.mutedText,
                        fontSize: 16,
                        lineHeight: 22,
                        marginTop: 8,
                        marginBottom: 20,
                    }}
                >
                    Track homeowner maintenance history, photos, documents, and future service dates.
                </Text>

                <ThemedButton
                    title="Add Maintenance Record"
                    onPress={() => router.push('/maintenance/create' as any)}
                    style={{ marginBottom: 18 }}
                />

                {loading && (
                    <View style={{ padding: 24 }}>
                        <ActivityIndicator size="large" />
                    </View>
                )}

                {!!message && (
                    <ThemedCard style={{ marginBottom: 14 }}>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>
                            {message}
                        </Text>
                    </ThemedCard>
                )}

                {!loading && (
                    <ThemedCard style={{ marginBottom: 18 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>
                            Maintenance Reminders
                        </Text>

                        {reminders.length === 0 ? (
                            <Text style={{ color: theme.colors.mutedText, marginTop: 8, lineHeight: 20 }}>
                                No maintenance reminders yet. Open an item to add presets or custom reminders.
                            </Text>
                        ) : (
                            <View style={{ gap: 14, marginTop: 14 }}>
                                {reminderGroups.map((group) => {
                                    if (group.reminders.length === 0) return null;

                                    return (
                                        <View key={group.label}>
                                            <Text
                                                style={{
                                                    color: theme.colors.mutedText,
                                                    fontSize: 16,
                                                    fontWeight: '900',
                                                    marginBottom: 8,
                                                }}
                                            >
                                                {group.label}
                                            </Text>

                                            <View style={{ gap: 10 }}>
                                                {group.reminders.map((reminder) => {
                                                    const linkedItem = reminder.home_item_id
                                                        ? reminderItems[reminder.home_item_id]
                                                        : null;
                                                    const itemName = linkedItem?.name || 'Unknown item';
                                                    const system = reminder.system || linkedItem?.system || 'Unknown system';
                                                    const location =
                                                        linkedItem?.location ||
                                                        linkedItem?.parent_area ||
                                                        'Unknown location';
                                                    const status = labelDueStatus(reminder);

                                                    return (
                                                        <ThemedCard
                                                            key={reminder.id}
                                                            style={{
                                                                backgroundColor: theme.colors.surfaceAlt,
                                                                borderColor: theme.colors.border,
                                                            }}
                                                        >
                                                            <View
                                                                style={{
                                                                    flexDirection: 'row',
                                                                    flexWrap: 'wrap',
                                                                    justifyContent: 'space-between',
                                                                    gap: 10,
                                                                }}
                                                            >
                                                                <Text
                                                                    style={{
                                                                        color: theme.colors.text,
                                                                        fontSize: 19,
                                                                        fontWeight: '900',
                                                                        flex: 1,
                                                                        minWidth: 220,
                                                                    }}
                                                                >
                                                                    {reminder.title}
                                                                </Text>
                                                                <Text
                                                                    style={{
                                                                        color:
                                                                            status === 'Overdue'
                                                                                ? theme.colors.danger
                                                                                : status === 'Due Soon'
                                                                                    ? theme.colors.primary
                                                                                    : theme.colors.mutedText,
                                                                        fontWeight: '900',
                                                                    }}
                                                                >
                                                                    {status}
                                                                </Text>
                                                            </View>

                                                            <Text
                                                                style={{
                                                                    color: theme.colors.text,
                                                                    marginTop: 8,
                                                                    fontWeight: '900',
                                                                }}
                                                            >
                                                                {itemName}
                                                            </Text>
                                                            <Text
                                                                style={{
                                                                    color: theme.colors.mutedText,
                                                                    marginTop: 6,
                                                                    fontWeight: '800',
                                                                }}
                                                            >
                                                                {system} Â· {location}
                                                            </Text>
                                                            <Text style={{ color: theme.colors.mutedText, marginTop: 8 }}>
                                                                {formatRecurrence(
                                                                    reminder.recurrence_interval,
                                                                    reminder.recurrence_unit
                                                                )}
                                                            </Text>
                                                            <Text style={{ color: theme.colors.mutedText, marginTop: 6 }}>
                                                                Next due: {formatDateLabel(reminder.next_due_date)}
                                                            </Text>
                                                            {!!reminder.last_completed_date && (
                                                                <Text style={{ color: theme.colors.mutedText, marginTop: 6 }}>
                                                                    Last completed: {formatDateLabel(reminder.last_completed_date)}
                                                                </Text>
                                                            )}

                                                            <ThemedButton
                                                                title="Open Item"
                                                                variant="secondary"
                                                                onPress={() => openReminderItem(reminder)}
                                                                style={{
                                                                    alignSelf: 'flex-start',
                                                                    marginTop: 12,
                                                                    paddingVertical: 12,
                                                                    paddingHorizontal: 18,
                                                                }}
                                                                textStyle={{ fontSize: 14, fontWeight: '900' }}
                                                            />
                                                        </ThemedCard>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </ThemedCard>
                )}

                {!loading && records.length === 0 && !message && (
                    <ThemedCard>
                        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                            No maintenance records yet
                        </Text>
                        <Text style={{ color: theme.colors.mutedText, marginTop: 8, lineHeight: 20 }}>
                            Add service visits, filter changes, repairs, inspections, and warranty documents here.
                        </Text>
                    </ThemedCard>
                )}

                <View style={{ gap: 12 }}>
                    {records.map((record) => (
                        <ThemedCard
                            key={record.id}
                            onPress={() => router.push(`/maintenance/${record.id}` as any)}
                        >
                            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                                {record.title}
                            </Text>
                            <Text
                                style={{
                                    color: theme.colors.mutedText,
                                    marginTop: 6,
                                    fontWeight: '800',
                                }}
                            >
                                {record.system || 'Unknown system'} · {record.area || 'Unknown area'}
                            </Text>
                            <Text style={{ color: theme.colors.mutedText, marginTop: 8 }}>
                                Service: {formatDate(record.service_date)}
                                {record.next_service_date ? ` · Next: ${formatDate(record.next_service_date)}` : ''}
                            </Text>
                            {!!record.description && (
                                <Text
                                    numberOfLines={2}
                                    style={{
                                        color: theme.colors.mutedText,
                                        marginTop: 8,
                                        lineHeight: 20,
                                    }}
                                >
                                    {record.description}
                                </Text>
                            )}
                        </ThemedCard>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
