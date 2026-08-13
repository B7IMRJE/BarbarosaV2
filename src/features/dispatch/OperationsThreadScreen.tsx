import DictationTextInput from '@/components/input/DictationTextInput';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import {
    createOperationsRoom,
    loadOperationsEvents,
    loadOperationsPeople,
    loadOperationsRooms,
    loadOperationsRoster,
    postOperationsUpdate,
    updateOperationsRoom,
    type OperationsEvent,
    type OperationsPerson,
    type OperationsRoom,
    type OperationsRosterMember,
} from '../../lib/companyOperations';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

export default function OperationsThreadScreen() {
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const companyId = firstParam(id);
    const { width } = useWindowDimensions();
    const { scaleFont, scaleIcon, theme } = useTheme();
    const phone = width < 720;
    const [rooms, setRooms] = useState<OperationsRoom[]>([]);
    const [people, setPeople] = useState<OperationsPerson[]>([]);
    const [activeRoomId, setActiveRoomId] = useState('');
    const [events, setEvents] = useState<OperationsEvent[]>([]);
    const [roster, setRoster] = useState<OperationsRosterMember[]>([]);
    const [selectedDate, setSelectedDate] = useState(todayInputValue());
    const [message, setMessage] = useState('Loading Operations Rooms...');
    const [busy, setBusy] = useState(false);
    const [roomEditorOpen, setRoomEditorOpen] = useState(false);
    const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
    const [roomName, setRoomName] = useState('');
    const [roomDescription, setRoomDescription] = useState('');
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [manualUpdate, setManualUpdate] = useState('');
    const activeRoom = rooms.find((room) => room.id === activeRoomId) || null;
    const dayRange = useMemo(() => dateRange(selectedDate), [selectedDate]);
    const initializeEvent = useEffectEvent(initialize);
    const refreshTimelineEvent = useEffectEvent(refreshTimeline);

    useEffect(() => {
        if (!companyId) {
            setMessage('A company is required to open Operations Rooms.');
            return;
        }
        void initializeEvent();
    }, [companyId]);

    useEffect(() => {
        if (!companyId || !activeRoomId || !dayRange) return;
        void refreshTimelineEvent();
    }, [companyId, activeRoomId, dayRange]);

    useEffect(() => {
        if (!companyId) return;

        const channel = supabase
            .channel(`company-operations-thread:${companyId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'company_operations_events',
                filter: `company_id=eq.${companyId}`,
            }, () => void refreshTimelineEvent())
            .subscribe();
        const fallback = setInterval(() => void refreshTimelineEvent(), 30_000);

        return () => {
            clearInterval(fallback);
            void supabase.removeChannel(channel);
        };
    }, [companyId]);

    async function initialize(preferredRoomId?: string) {
        if (!companyId) return;
        try {
            setMessage('Loading Operations Rooms...');
            const [loadedRooms, loadedPeople] = await Promise.all([
                loadOperationsRooms(companyId),
                loadOperationsPeople(companyId),
            ]);
            setRooms(loadedRooms);
            setPeople(loadedPeople);
            const nextRoomId = preferredRoomId && loadedRooms.some((room) => room.id === preferredRoomId)
                ? preferredRoomId
                : activeRoomId && loadedRooms.some((room) => room.id === activeRoomId)
                    ? activeRoomId
                    : loadedRooms[0]?.id || '';
            setActiveRoomId(nextRoomId);
            setMessage(loadedRooms.length ? '' : 'No Operations Rooms are available.');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    async function refreshTimeline() {
        if (!companyId || !activeRoomId || !dayRange) return;
        try {
            const [loadedEvents, loadedRoster] = await Promise.all([
                loadOperationsEvents({
                    companyId,
                    roomId: activeRoomId,
                    startAt: dayRange.startAt,
                    endAt: dayRange.endAt,
                }),
                loadOperationsRoster({
                    companyId,
                    roomId: activeRoomId,
                    dayStartAt: dayRange.startAt,
                    dayEndAt: dayRange.endAt,
                }),
            ]);
            setEvents(loadedEvents);
            setRoster(loadedRoster);
            setMessage('');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    function beginCreateRoom() {
        setEditingRoomId(null);
        setRoomName('');
        setRoomDescription('');
        setSelectedMemberIds([]);
        setRoomEditorOpen(true);
    }

    function beginEditRoom(room: OperationsRoom) {
        if (room.isDefault) return;
        setEditingRoomId(room.id);
        setRoomName(room.name);
        setRoomDescription(room.description || '');
        setSelectedMemberIds(room.memberIds);
        setRoomEditorOpen(true);
    }

    function toggleMember(personId: string) {
        setSelectedMemberIds((current) => current.includes(personId)
            ? current.filter((idValue) => idValue !== personId)
            : [...current, personId]);
    }

    async function saveRoom() {
        if (!companyId || busy) return;
        try {
            setBusy(true);
            setMessage(editingRoomId ? 'Updating Operations Room...' : 'Creating Operations Room...');
            const result = editingRoomId
                ? await updateOperationsRoom({
                    companyId,
                    roomId: editingRoomId,
                    name: roomName,
                    description: roomDescription,
                    memberIds: selectedMemberIds,
                })
                : await createOperationsRoom({
                    companyId,
                    name: roomName,
                    description: roomDescription,
                    memberIds: selectedMemberIds,
                });
            const savedRoomId = String((result as { id?: unknown })?.id || editingRoomId || '');
            setRoomEditorOpen(false);
            await initialize(savedRoomId);
            setMessage('Operations Room saved.');
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    async function postUpdate() {
        if (!companyId || !activeRoomId || !manualUpdate.trim() || busy) return;
        try {
            setBusy(true);
            await postOperationsUpdate({ companyId, roomId: activeRoomId, message: manualUpdate });
            setManualUpdate('');
            await refreshTimeline();
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    function moveDay(offset: number) {
        const parsed = parseDateInput(selectedDate) || new Date();
        parsed.setDate(parsed.getDate() + offset);
        setSelectedDate(formatDateInput(parsed));
    }

    function openSource(event: OperationsEvent) {
        if (!companyId || !event.serviceRequestId) return;
        router.push({ pathname: '/dispatch', params: { companyId } } as never);
    }

    return (
        <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(phone ? 14 : 22), paddingBottom: scaleIcon(64), alignItems: 'center', gap: scaleIcon(16) }}
        >
            <View style={{ width: '100%', maxWidth: 1180, gap: scaleIcon(16) }}>
                <AdminNavBar companyId={companyId} backFallback={companyId ? `/super-admin/company/${companyId}` : '/super-admin'} />

                <View style={{ gap: scaleIcon(6) }}>
                    <Text selectable style={{ color: theme.colors.text, fontSize: scaleFont(phone ? 32 : 42), fontWeight: '900' }}>
                        Operations Rooms
                    </Text>
                    <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(16), lineHeight: scaleFont(23) }}>
                        Live, timestamped company activity. Every update remains connected to its original shift, job, or media record.
                    </Text>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: scaleIcon(8), paddingVertical: scaleIcon(2) }}>
                    {rooms.map((room) => {
                        const selected = room.id === activeRoomId;
                        return (
                            <Pressable
                                key={room.id}
                                accessibilityRole="button"
                                accessibilityLabel={`Open ${room.name}`}
                                onPress={() => setActiveRoomId(room.id)}
                                onLongPress={() => activeRoom?.canManage && beginEditRoom(room)}
                                style={{
                                    minHeight: scaleIcon(44),
                                    justifyContent: 'center',
                                    paddingHorizontal: scaleIcon(16),
                                    borderRadius: 999,
                                    borderWidth: 1,
                                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                                    backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                                }}
                            >
                                <Text selectable style={{ color: selected ? theme.colors.primaryText : theme.colors.text, fontWeight: '900' }}>
                                    {room.name}{room.isDefault ? '' : ` · ${room.memberCount}`}
                                </Text>
                            </Pressable>
                        );
                    })}
                    {activeRoom?.canManage && (
                        <Pressable
                            accessibilityRole="button"
                            onPress={beginCreateRoom}
                            style={{ minHeight: scaleIcon(44), justifyContent: 'center', paddingHorizontal: scaleIcon(16), borderRadius: 999, borderWidth: 1, borderColor: theme.colors.primary, backgroundColor: theme.colors.surface }}
                        >
                            <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>+ New Room</Text>
                        </Pressable>
                    )}
                </ScrollView>

                {activeRoom && !activeRoom.isDefault && activeRoom.canManage && (
                    <Pressable accessibilityRole="button" onPress={() => beginEditRoom(activeRoom)}>
                        <Text style={{ color: theme.colors.primary, fontWeight: '900' }}>Edit {activeRoom.name} members</Text>
                    </Pressable>
                )}

                {roomEditorOpen && (
                    <View style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 24, padding: scaleIcon(18), gap: scaleIcon(14), boxShadow: '0 8px 28px rgba(7,27,51,0.10)' }}>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(22), fontWeight: '900' }}>
                            {editingRoomId ? 'Edit Operations Room' : 'Create Operations Room'}
                        </Text>
                        <DictationTextInput
                            value={roomName}
                            onChangeText={setRoomName}
                            placeholder="Room name — Install Crew, Plumbing Team..."
                            placeholderTextColor={theme.colors.mutedText}
                            style={{ color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, minHeight: 52, paddingHorizontal: 14 }}
                        />
                        <DictationTextInput
                            value={roomDescription}
                            onChangeText={setRoomDescription}
                            placeholder="Optional description"
                            placeholderTextColor={theme.colors.mutedText}
                            multiline
                            style={{ color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, minHeight: 76, padding: 14, textAlignVertical: 'top' }}
                        />
                        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Whose activity belongs in this room?</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8) }}>
                            {people.map((person) => {
                                const selected = selectedMemberIds.includes(person.id);
                                return (
                                    <Pressable
                                        key={person.id}
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked: selected }}
                                        onPress={() => toggleMember(person.id)}
                                        style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt }}
                                    >
                                        <Text style={{ color: selected ? theme.colors.primaryText : theme.colors.text, fontWeight: '800' }}>
                                            {selected ? '✓ ' : ''}{person.fullName} · {roleLabel(person.role)}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
                            <ActionButton title={busy ? 'Saving...' : 'Save Room'} primary disabled={busy || roomName.trim().length < 2 || selectedMemberIds.length === 0} onPress={saveRoom} />
                            <ActionButton title="Cancel" onPress={() => setRoomEditorOpen(false)} />
                        </View>
                    </View>
                )}

                <View style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 24, padding: scaleIcon(18), gap: scaleIcon(14) }}>
                    <View style={{ flexDirection: phone ? 'column' : 'row', justifyContent: 'space-between', gap: scaleIcon(12) }}>
                        <View style={{ flex: 1, gap: 4 }}>
                            <Text style={{ color: theme.colors.text, fontSize: scaleFont(23), fontWeight: '900' }}>Live roster</Text>
                            <Text style={{ color: theme.colors.mutedText }}>Clocked in, available, traveling, working, at the store, or clocked out.</Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            <ActionButton title="‹ Day" onPress={() => moveDay(-1)} />
                            <DictationTextInput
                                value={selectedDate}
                                onChangeText={setSelectedDate}
                                placeholder="YYYY-MM-DD"
                                placeholderTextColor={theme.colors.mutedText}
                                style={{ color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 14, minHeight: 44, width: 132, paddingHorizontal: 12 }}
                            />
                            <ActionButton title="Day ›" onPress={() => moveDay(1)} />
                            <ActionButton title="Today" primary onPress={() => setSelectedDate(todayInputValue())} />
                        </View>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
                        {roster.map((member) => (
                            <RosterCard key={member.companyUserId} member={member} />
                        ))}
                        {roster.length === 0 && <Text style={{ color: theme.colors.mutedText }}>No team members are assigned to this room.</Text>}
                    </View>
                </View>

                <View style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 24, padding: scaleIcon(18), gap: scaleIcon(12) }}>
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(21), fontWeight: '900' }}>Add a timestamped room update</Text>
                    <DictationTextInput
                        value={manualUpdate}
                        onChangeText={setManualUpdate}
                        placeholder="Decision, instruction, handoff, or note for this room"
                        placeholderTextColor={theme.colors.mutedText}
                        multiline
                        style={{ color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, minHeight: 84, padding: 14, textAlignVertical: 'top' }}
                    />
                    <ActionButton title={busy ? 'Posting...' : 'Post Update'} primary disabled={busy || !manualUpdate.trim()} onPress={postUpdate} />
                </View>

                {!!message && (
                    <Text selectable style={{ color: theme.colors.mutedText, fontWeight: '700' }}>{message}</Text>
                )}

                <View style={{ gap: scaleIcon(12) }}>
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(25), fontWeight: '900' }}>
                        {activeRoom?.name || 'Operations'} · {displayDate(selectedDate)}
                    </Text>
                    {events.map((event) => (
                        <EventCard key={event.id} event={event} onOpenSource={() => openSource(event)} />
                    ))}
                    {events.length === 0 && !message && (
                        <View style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 22, padding: scaleIcon(22) }}>
                            <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: scaleFont(18) }}>No activity recorded for this date.</Text>
                            <Text style={{ color: theme.colors.mutedText, marginTop: 6 }}>Clock-ins, job activity, media, and room updates will appear here automatically.</Text>
                        </View>
                    )}
                </View>
            </View>
        </ScrollView>
    );
}

function RosterCard({ member }: { member: OperationsRosterMember }) {
    const { theme } = useTheme();
    const colors = rosterColors(member.activityStatus);
    return (
        <View style={{ minWidth: 180, flexGrow: 1, flexBasis: 210, maxWidth: 310, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 14, gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text selectable numberOfLines={1} style={{ color: theme.colors.text, fontWeight: '900', flex: 1 }}>{member.fullName}</Text>
                <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: colors.dot, marginTop: 4 }} />
            </View>
            <Text selectable style={{ color: colors.text, fontWeight: '900' }}>{member.statusLabel}</Text>
            <Text selectable style={{ color: theme.colors.mutedText, fontSize: 12 }}>{roleLabel(member.role)}{member.displayCode ? ` · ${member.displayCode}` : ''}</Text>
        </View>
    );
}

function EventCard({ event, onOpenSource }: { event: OperationsEvent; onOpenSource: () => void }) {
    const { theme } = useTheme();
    const hasSource = Boolean(event.serviceRequestId);
    const isVideo = event.mediaMimeType?.startsWith('video/');
    return (
        <View style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 22, padding: 16, gap: 10, boxShadow: '0 4px 18px rgba(7,27,51,0.07)' }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                <Text selectable style={{ color: theme.colors.primary, fontWeight: '900' }}>{event.actorName}</Text>
                <Text selectable style={{ color: theme.colors.mutedText, fontVariant: ['tabular-nums'], fontWeight: '700' }}>
                    {fullTimestamp(event.occurredAt)}
                </Text>
            </View>
            <Text selectable style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>{event.title}</Text>
            {!!event.detail && <Text selectable style={{ color: theme.colors.mutedText, lineHeight: 21 }}>{event.detail}</Text>}
            {!!event.mediaUrl && !isVideo && (
                <Pressable onPress={() => void Linking.openURL(event.mediaUrl!)} accessibilityRole="button" accessibilityLabel={`Open ${event.mediaFileName || 'job photo'}`}>
                    <Image source={{ uri: event.mediaUrl }} contentFit="cover" style={{ width: '100%', height: 240, borderRadius: 16, backgroundColor: theme.colors.surfaceAlt }} />
                </Pressable>
            )}
            {!!event.mediaUrl && isVideo && (
                <ActionButton title={`Open video${event.mediaFileName ? ` · ${event.mediaFileName}` : ''}`} onPress={() => void Linking.openURL(event.mediaUrl!)} />
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                {!!event.displayCode && <Text selectable style={{ color: theme.colors.text, fontWeight: '800' }}>{event.displayCode}</Text>}
                <Text selectable style={{ color: theme.colors.mutedText, fontSize: 12 }}>{eventTypeLabel(event.eventType)}</Text>
                {hasSource && <ActionButton title="Open original job" onPress={onOpenSource} />}
            </View>
        </View>
    );
}

function ActionButton({ title, onPress, primary = false, disabled = false }: { title: string; onPress: () => void; primary?: boolean; disabled?: boolean }) {
    const { theme } = useTheme();
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onPress}
            style={{ alignSelf: 'flex-start', minHeight: 42, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: primary ? theme.colors.primary : theme.colors.border, backgroundColor: primary ? theme.colors.primary : theme.colors.surfaceAlt, opacity: disabled ? 0.45 : 1 }}
        >
            <Text style={{ color: primary ? theme.colors.primaryText : theme.colors.text, fontWeight: '900' }}>{title}</Text>
        </Pressable>
    );
}

function rosterColors(status: OperationsRosterMember['activityStatus']) {
    if (status === 'available' || status === 'clocked_in') return { background: '#EAF9F0', border: '#86D4A1', dot: '#159947', text: '#116A35' };
    if (status === 'on_job') return { background: '#EAF6FF', border: '#82BEEB', dot: '#1678C2', text: '#135F98' };
    if (status === 'on_my_way') return { background: '#EEF2FF', border: '#9AAAF2', dot: '#4B62D1', text: '#3B4DAA' };
    if (status === 'at_store') return { background: '#FFF4E7', border: '#EABB78', dot: '#C4770B', text: '#8F580B' };
    if (status === 'on_break') return { background: '#FFF9DB', border: '#D9C45F', dot: '#A88500', text: '#725E00' };
    return { background: '#F3F5F8', border: '#CCD3DE', dot: '#7D8795', text: '#596271' };
}

function dateRange(value: string) {
    const date = parseDateInput(value);
    if (!date) return null;
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    return { startAt: date.toISOString(), endAt: end.toISOString() };
}

function parseDateInput(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function todayInputValue() { return formatDateInput(new Date()); }
function formatDateInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function displayDate(value: string) {
    const date = parseDateInput(value);
    return date ? date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : value;
}
function fullTimestamp(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}
function roleLabel(value: string) { return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function eventTypeLabel(value: string) { return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function firstParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] || '' : value || ''; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Operations Rooms could not be loaded.'; }
