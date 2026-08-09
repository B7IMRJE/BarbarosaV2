import DictationTextInput from '@/components/input/DictationTextInput';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import AdminNavBar from '../components/AdminNavBar';
import HomeHeader from '../components/HomeHeader';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import { getCompanyDisplayName } from '../lib/companyDisplayName';
import {
    getCompanyScheduleCrewRoleLabel,
    getScheduleCrewForSlot,
    normalizeCompanyScheduleOverview,
    type CompanyScheduleCrewRole,
    type CompanyScheduleMeeting,
    type CompanyScheduleSlotAssignment,
} from '../lib/companySchedule';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

type ScheduleAccess = {
    company_id: string;
    role: string | null;
    status: string | null;
};

type ScheduleSlot = {
    id: string;
    company_id: string;
    job_id: string | null;
    service_request_id: string | null;
    technician_company_user_id: string;
    start_at: string | null;
    end_at: string | null;
    arrival_window_start: string | null;
    arrival_window_end: string | null;
    status: string | null;
    estimated_duration_minutes: number | null;
    priority: string | null;
    notes: string | null;
};

type ScheduleTechnician = {
    id: string;
    full_name: string | null;
    email: string | null;
    auth_user_id: string | null;
    role: string | null;
    status: string | null;
};

type MeetingForm = {
    title: string;
    notes: string;
    date: string;
    startTime: string;
    durationMinutes: string;
    attendeeIds: string[];
};

const SCHEDULE_CREW_ROLES: CompanyScheduleCrewRole[] = ['lead', 'technician', 'helper', 'observer'];

export default function ScheduleBoardScreen() {
    const { companyId } = useLocalSearchParams<{ companyId?: string | string[] }>();
    const { theme } = useTheme();
    const requestedCompanyId = useMemo(() => firstParam(companyId), [companyId]);
    const [loading, setLoading] = useState(true);
    const [access, setAccess] = useState<ScheduleAccess | null>(null);
    const [message, setMessage] = useState('Loading Schedule Board...');
    const [companyName, setCompanyName] = useState('Company');
    const [slots, setSlots] = useState<ScheduleSlot[]>([]);
    const [techniciansById, setTechniciansById] = useState<Record<string, ScheduleTechnician>>({});
    const [selectedTechnicianId, setSelectedTechnicianId] = useState('');
    const [slotAssignments, setSlotAssignments] = useState<CompanyScheduleSlotAssignment[]>([]);
    const [meetings, setMeetings] = useState<CompanyScheduleMeeting[]>([]);
    const [scheduleFeatureMessage, setScheduleFeatureMessage] = useState('');
    const [crewEditorSlotId, setCrewEditorSlotId] = useState('');
    const [crewMemberBySlotId, setCrewMemberBySlotId] = useState<Record<string, string>>({});
    const [crewRoleBySlotId, setCrewRoleBySlotId] = useState<Record<string, CompanyScheduleCrewRole>>({});
    const [savingScheduleItemId, setSavingScheduleItemId] = useState('');
    const [meetingForm, setMeetingForm] = useState<MeetingForm>(() => createDefaultMeetingForm());
    const [meetingFormOpen, setMeetingFormOpen] = useState(false);
    const technicians = useMemo(() => Object.values(techniciansById), [techniciansById]);
    const groupedSlots = useMemo(() => groupScheduleSlotsByDate(slots), [slots]);
    const selectedTechnician = selectedTechnicianId ? techniciansById[selectedTechnicianId] || null : null;
    const selectedTechnicianSlots = useMemo(
        () => slots.filter((slot) => (
            slot.technician_company_user_id === selectedTechnicianId ||
            getScheduleCrewForSlot(slotAssignments, slot.id).some((assignment) => assignment.company_user_id === selectedTechnicianId)
        )),
        [selectedTechnicianId, slotAssignments, slots]
    );
    const selectedTechnicianGroupedSlots = useMemo(
        () => groupScheduleSlotsByDate(selectedTechnicianSlots),
        [selectedTechnicianSlots]
    );
    const scheduleCompanyId = access?.company_id || requestedCompanyId;
    const scheduleBackFallback = scheduleCompanyId
        ? (`/super-admin/company/${scheduleCompanyId}` as Href)
        : ('/super-admin' as Href);
    const loadScheduleBoardEvent = useEffectEvent(loadScheduleBoard);

    useEffect(() => {
        void loadScheduleBoardEvent();
    }, [requestedCompanyId]);

    async function loadScheduleBoard() {
        setLoading(true);
        setMessage('Loading Schedule Board...');
        setAccess(null);
        setSlots([]);
        setTechniciansById({});
        setSelectedTechnicianId('');
        setSlotAssignments([]);
        setMeetings([]);
        setScheduleFeatureMessage('');
        setCrewEditorSlotId('');

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
            setLoading(false);
            setMessage(`Could not load authenticated user: ${userError.message}`);
            return;
        }

        if (!user) {
            router.replace('/auth/login' as any);
            return;
        }

        try {
            const resolvedAccess = await resolveScheduleCompanyAccess(user.id, requestedCompanyId);

            if (!resolvedAccess) {
                setLoading(false);
                setMessage(
                    requestedCompanyId
                        ? 'You do not have Schedule Board access for this company.'
                        : 'Choose a company before opening Schedule Board as a platform admin.'
                );
                return;
            }

            setAccess(resolvedAccess);
            await Promise.all([
                loadCompanyName(resolvedAccess.company_id),
                loadScheduleTechnicians(resolvedAccess.company_id),
                loadScheduleSlots(resolvedAccess.company_id),
                loadScheduleOverview(resolvedAccess.company_id),
            ]);
        } catch (error: any) {
            setMessage(`Could not resolve Schedule Board access: ${error.message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    }

    async function loadCompanyName(companyIdToLoad: string) {
        const { data } = await supabase
            .from('companies')
            .select('name, public_name, dba_name')
            .eq('id', companyIdToLoad)
            .maybeSingle();
        const company = (data || {}) as { name?: string | null; public_name?: string | null; dba_name?: string | null };

        setCompanyName(getCompanyDisplayName(company));
    }

    async function loadScheduleTechnicians(companyIdToLoad: string) {
        const dispatchRosterResult = await supabase.rpc('get_company_users_for_dispatch', {
            p_company_id: companyIdToLoad,
        });

        if (!dispatchRosterResult.error) {
            setTechniciansById(buildTechnicianLookup(dispatchRosterResult.data));
            return;
        }

        const managementRpcResult = await supabase.rpc('get_company_users_for_management', {
            p_company_id: companyIdToLoad,
        });

        if (!managementRpcResult.error) {
            setTechniciansById(buildTechnicianLookup(managementRpcResult.data));
            return;
        }

        const { data, error } = await supabase
            .from('company_users')
            .select('id, full_name, email, auth_user_id, role, status')
            .eq('company_id', companyIdToLoad);

        if (error) {
            setTechniciansById({});
            setMessage(`Scheduled slots loaded, but technician names could not be loaded: ${error.message}. Dispatch roster RPC failed: ${dispatchRosterResult.error.message}. Management RPC also failed: ${managementRpcResult.error.message}`);
            return;
        }

        setTechniciansById(buildTechnicianLookup(data));
    }

    async function loadScheduleSlots(companyIdToLoad: string) {
        const { start, end } = getScheduleWindow();
        const { data, error } = await supabase
            .from('job_schedule_slots')
            .select('id, company_id, job_id, service_request_id, technician_company_user_id, start_at, end_at, arrival_window_start, arrival_window_end, status, estimated_duration_minutes, priority, notes')
            .eq('company_id', companyIdToLoad)
            .gte('start_at', start.toISOString())
            .lte('start_at', end.toISOString())
            .order('start_at', { ascending: true });

        if (error) {
            setSlots([]);
            setMessage(`Schedule Board setup is not installed yet or cannot be read: ${error.message}`);
            return;
        }

        setSlots((data || []) as ScheduleSlot[]);
        setMessage((data || []).length === 0 ? 'No scheduled jobs in the schedule window.' : `Loaded ${(data || []).length} scheduled slot${(data || []).length === 1 ? '' : 's'}.`);
    }

    async function loadScheduleOverview(companyIdToLoad: string) {
        const { start, end } = getScheduleWindow();
        const { data, error } = await supabase.rpc('get_company_schedule_overview', {
            p_company_id: companyIdToLoad,
            p_start_at: start.toISOString(),
            p_end_at: end.toISOString(),
        });

        if (error) {
            setSlotAssignments([]);
            setMeetings([]);
            setScheduleFeatureMessage(`Job crews and meetings are not available yet: ${error.message}`);
            return;
        }

        const overview = normalizeCompanyScheduleOverview(data);
        setSlotAssignments(overview.slotAssignments);
        setMeetings(overview.meetings);
        setScheduleFeatureMessage('');
    }

    async function handleSaveCrewAssignment(slot: ScheduleSlot) {
        const companyUserId = crewMemberBySlotId[slot.id] || '';
        const role = crewRoleBySlotId[slot.id] || 'technician';

        if (!companyUserId) {
            setScheduleFeatureMessage('Choose a team member before adding them to the job crew.');
            return;
        }

        setSavingScheduleItemId(slot.id);
        setScheduleFeatureMessage(`Saving ${getCompanyScheduleCrewRoleLabel(role).toLowerCase()}...`);
        const { error } = await supabase.rpc('set_job_schedule_slot_assignment', {
            p_company_id: slot.company_id,
            p_schedule_slot_id: slot.id,
            p_company_user_id: companyUserId,
            p_role_on_schedule: role,
        });

        if (error) {
            setScheduleFeatureMessage(`Could not update job crew: ${error.message}`);
            setSavingScheduleItemId('');
            return;
        }

        setCrewMemberBySlotId((current) => ({ ...current, [slot.id]: '' }));
        setCrewRoleBySlotId((current) => ({ ...current, [slot.id]: 'technician' }));
        await loadScheduleOverview(slot.company_id);
        setScheduleFeatureMessage('Job crew updated. Everyone assigned will see this job on their schedule.');
        setSavingScheduleItemId('');
    }

    async function handleRemoveCrewAssignment(slot: ScheduleSlot, assignment: CompanyScheduleSlotAssignment) {
        setSavingScheduleItemId(slot.id);
        setScheduleFeatureMessage(`Removing ${assignment.display_name} from this job...`);
        const { error } = await supabase.rpc('remove_job_schedule_slot_assignment', {
            p_company_id: slot.company_id,
            p_schedule_slot_id: slot.id,
            p_company_user_id: assignment.company_user_id,
        });

        if (error) {
            setScheduleFeatureMessage(`Could not remove crew member: ${error.message}`);
            setSavingScheduleItemId('');
            return;
        }

        await loadScheduleOverview(slot.company_id);
        setScheduleFeatureMessage(`${assignment.display_name} was removed from this job.`);
        setSavingScheduleItemId('');
    }

    function toggleMeetingAttendee(companyUserId: string) {
        setMeetingForm((current) => ({
            ...current,
            attendeeIds: current.attendeeIds.includes(companyUserId)
                ? current.attendeeIds.filter((id) => id !== companyUserId)
                : [...current.attendeeIds, companyUserId],
        }));
    }

    async function handleCreateMeeting() {
        if (!scheduleCompanyId) return;

        const startAt = parseLocalScheduleDateTime(meetingForm.date, meetingForm.startTime);
        const durationMinutes = Number(meetingForm.durationMinutes);

        if (!meetingForm.title.trim()) {
            setScheduleFeatureMessage('Enter a meeting title.');
            return;
        }

        if (!startAt || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
            setScheduleFeatureMessage('Choose a valid meeting date, start time, and duration.');
            return;
        }

        if (meetingForm.attendeeIds.length === 0) {
            setScheduleFeatureMessage('Choose at least one attendee.');
            return;
        }

        const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);
        setSavingScheduleItemId('meeting-new');
        setScheduleFeatureMessage('Adding meeting to the team schedule...');
        const { error } = await supabase.rpc('create_company_schedule_meeting', {
            p_company_id: scheduleCompanyId,
            p_title: meetingForm.title.trim(),
            p_notes: meetingForm.notes.trim() || null,
            p_start_at: startAt.toISOString(),
            p_end_at: endAt.toISOString(),
            p_attendee_company_user_ids: meetingForm.attendeeIds,
        });

        if (error) {
            setScheduleFeatureMessage(`Could not create meeting: ${error.message}`);
            setSavingScheduleItemId('');
            return;
        }

        await loadScheduleOverview(scheduleCompanyId);
        setMeetingForm(createDefaultMeetingForm());
        setMeetingFormOpen(false);
        setScheduleFeatureMessage('Meeting added. Every attendee will see it in TechOS.');
        setSavingScheduleItemId('');
    }

    async function handleCompleteMeeting(meeting: CompanyScheduleMeeting) {
        setSavingScheduleItemId(meeting.id);
        setScheduleFeatureMessage(`Completing ${meeting.title}...`);
        const { error } = await supabase.rpc('complete_company_schedule_meeting', {
            p_company_id: meeting.company_id,
            p_meeting_id: meeting.id,
        });

        if (error) {
            setScheduleFeatureMessage(`Could not complete meeting: ${error.message}`);
            setSavingScheduleItemId('');
            return;
        }

        await loadScheduleOverview(meeting.company_id);
        setScheduleFeatureMessage('Meeting completed.');
        setSavingScheduleItemId('');
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 44, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1120 }}>
                <HomeHeader />
                <AdminNavBar companyId={scheduleCompanyId} backFallback={scheduleBackFallback} />

                <ThemedCard style={{ marginBottom: 16 }}>
                    <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: '900', marginBottom: 6 }}>
                        Operations
                    </Text>
                    <Text style={{ color: theme.colors.text, fontSize: 34, fontWeight: '900', marginBottom: 10 }}>
                        Schedule Board
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 15, fontWeight: '800', lineHeight: 22 }}>
                        Plan customer jobs, build multi-person crews, and add internal team meetings for {companyName}.
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 13, fontWeight: '800', lineHeight: 19, marginTop: 10 }}>
                        Selected company: {access?.company_id || requestedCompanyId || 'Not selected'}
                        {access?.role ? ` / Access: ${formatLabel(access.role)}` : ''}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                        <ThemedButton title="Refresh" onPress={loadScheduleBoard} style={{ flexBasis: 160, flexGrow: 1 }} />
                        <ThemedButton
                            title="Back Home"
                            variant="secondary"
                            onPress={() => router.push('/' as any)}
                            style={{ flexBasis: 160, flexGrow: 1 }}
                        />
                    </View>
                </ThemedCard>

                <ThemedCard style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                            {loading ? 'Loading...' : slots.length + meetings.length > 0 ? 'Upcoming Schedule' : 'Schedule Status'}
                        </Text>
                        <ThemedButton
                            title={meetingFormOpen ? 'Close Meeting Form' : 'Add Team Meeting'}
                            variant={meetingFormOpen ? 'secondary' : 'primary'}
                            onPress={() => setMeetingFormOpen((current) => !current)}
                            style={{ minWidth: 180 }}
                        />
                    </View>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 15, fontWeight: '800', lineHeight: 22, marginTop: 8 }}>
                        {message}
                    </Text>
                    {!!scheduleFeatureMessage && (
                        <Text style={{ color: theme.colors.primary, fontSize: 14, fontWeight: '900', lineHeight: 21, marginTop: 8 }}>
                            {scheduleFeatureMessage}
                        </Text>
                    )}
                </ThemedCard>

                {meetingFormOpen && (
                    <MeetingComposer
                        form={meetingForm}
                        technicians={technicians}
                        saving={savingScheduleItemId === 'meeting-new'}
                        onChange={(updates) => setMeetingForm((current) => ({ ...current, ...updates }))}
                        onToggleAttendee={toggleMeetingAttendee}
                        onSave={handleCreateMeeting}
                    />
                )}

                <View style={{ marginBottom: 16, gap: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>Team Meetings</Text>
                            <Text style={{ color: theme.colors.mutedText, fontWeight: '800', lineHeight: 20, marginTop: 3 }}>
                                Calls, training, and internal appointments belong here instead of being entered as customer jobs.
                            </Text>
                        </View>
                        <Text style={chipStyle(theme.colors.secondaryButton, theme.colors.border, theme.colors.secondaryButtonText)}>
                            {meetings.length}
                        </Text>
                    </View>
                    {meetings.length === 0 ? (
                        <ThemedCard>
                            <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>No team meetings in this schedule window.</Text>
                        </ThemedCard>
                    ) : (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                            {meetings.map((meeting) => (
                                <MeetingCard
                                    key={meeting.id}
                                    meeting={meeting}
                                    saving={savingScheduleItemId === meeting.id}
                                    onComplete={() => handleCompleteMeeting(meeting)}
                                />
                            ))}
                        </View>
                    )}
                </View>

                <View style={{ marginBottom: 16, gap: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>Technician Roster</Text>
                        <Text
                            style={{
                                backgroundColor: theme.colors.secondaryButton,
                                borderRadius: 999,
                                color: theme.colors.secondaryButtonText,
                                fontSize: 12,
                                fontWeight: '900',
                                overflow: 'hidden',
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                            }}
                        >
                            {technicians.length}
                        </Text>
                    </View>
                    {technicians.length === 0 ? (
                        <ThemedCard>
                            <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>
                                No active technicians found for this company.
                            </Text>
                        </ThemedCard>
                    ) : (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                            {technicians.map((technician) => (
                                <TechnicianRosterCard
                                    key={technician.id}
                                    technician={technician}
                                    slots={slots}
                                    slotAssignments={slotAssignments}
                                    selected={selectedTechnicianId === technician.id}
                                    onPress={() => setSelectedTechnicianId(selectedTechnicianId === technician.id ? '' : technician.id)}
                                />
                            ))}
                        </View>
                    )}
                </View>

                {!!selectedTechnician && (
                    <TechnicianScheduleDetail
                        technician={selectedTechnician}
                        groupedSlots={selectedTechnicianGroupedSlots}
                    />
                )}

                {slots.length === 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                        {['Unscheduled Requests', 'Technician Availability', 'Today', 'This Week'].map((title) => (
                            <ThemedCard key={title} style={{ flexBasis: 250, flexGrow: 1, minHeight: 130 }}>
                                <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>{title}</Text>
                                <Text style={{ color: theme.colors.mutedText, marginTop: 8, lineHeight: 20 }}>
                                    Scheduled slots will appear here after Dispatch schedules service requests.
                                </Text>
                            </ThemedCard>
                        ))}
                    </View>
                ) : (
                    <View style={{ gap: 16 }}>
                        {groupedSlots.map((group) => (
                            <View key={group.dateKey} style={{ gap: 10 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>{group.label}</Text>
                                    <Text
                                        style={{
                                            backgroundColor: theme.colors.secondaryButton,
                                            borderRadius: 999,
                                            color: theme.colors.secondaryButtonText,
                                            fontSize: 12,
                                            fontWeight: '900',
                                            overflow: 'hidden',
                                            paddingHorizontal: 10,
                                            paddingVertical: 6,
                                        }}
                                    >
                                        {group.slots.length}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                                    {group.slots.map((slot) => {
                                        const technician = techniciansById[slot.technician_company_user_id];
                                        const crew = getScheduleCrewForSlot(slotAssignments, slot.id);
                                        const technicianLabel = technician
                                            ? getTechnicianName(technician)
                                            : slot.technician_company_user_id
                                                ? 'Technician not found'
                                                : 'No technician assigned';

                                        return (
                                            <ThemedCard key={slot.id} style={{ flexBasis: 260, flexGrow: 1, minHeight: 150 }}>
                                                <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900', marginBottom: 6 }}>
                                                    {formatLabel(slot.priority)}
                                                </Text>
                                                <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }} numberOfLines={1}>
                                                    {technicianLabel}
                                                </Text>
                                                {!!technician?.email && (
                                                    <Text style={{ color: theme.colors.mutedText, marginTop: 2, fontWeight: '800' }} numberOfLines={1}>
                                                        {technician.email}
                                                    </Text>
                                                )}
                                                <Text style={{ color: theme.colors.mutedText, marginTop: 6, fontWeight: '800' }}>
                                                    {formatDateTime(slot.start_at)} - {formatTime(slot.end_at)}
                                                </Text>
                                                <Text style={{ color: theme.colors.mutedText, marginTop: 4, fontWeight: '800' }}>
                                                    {formatLabel(slot.status)} / {slot.estimated_duration_minutes || 0} min
                                                </Text>
                                                <Text style={{ color: theme.colors.mutedText, marginTop: 4, fontWeight: '800' }}>
                                                    Request {slot.service_request_id ? shortId(slot.service_request_id) : 'not linked'} / Job {slot.job_id ? shortId(slot.job_id) : 'not created'}
                                                </Text>
                                                <View style={{ borderTopColor: theme.colors.border, borderTopWidth: 1, gap: 6, marginTop: 12, paddingTop: 10 }}>
                                                    <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                                                        Job Crew · {crew.length || 1}
                                                    </Text>
                                                    {(crew.length > 0 ? crew : [{
                                                        id: `legacy-${slot.id}`,
                                                        company_id: slot.company_id,
                                                        schedule_slot_id: slot.id,
                                                        company_user_id: slot.technician_company_user_id,
                                                        role_on_schedule: 'lead' as const,
                                                        status: 'assigned',
                                                        display_name: technicianLabel,
                                                        email: technician?.email || null,
                                                    }]).map((assignment) => (
                                                        <View key={assignment.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                                <Text style={{ color: theme.colors.text, fontWeight: '900' }} numberOfLines={1}>
                                                                    {assignment.display_name}
                                                                </Text>
                                                                <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '800' }}>
                                                                    {getCompanyScheduleCrewRoleLabel(assignment.role_on_schedule)}
                                                                </Text>
                                                            </View>
                                                            {assignment.role_on_schedule !== 'lead' && (
                                                                <Pressable
                                                                    accessibilityRole="button"
                                                                    disabled={savingScheduleItemId === slot.id}
                                                                    onPress={() => handleRemoveCrewAssignment(slot, assignment)}
                                                                    style={({ pressed }) => ({
                                                                        borderColor: theme.colors.border,
                                                                        borderRadius: 999,
                                                                        borderWidth: 1,
                                                                        opacity: pressed || savingScheduleItemId === slot.id ? 0.6 : 1,
                                                                        paddingHorizontal: 10,
                                                                        paddingVertical: 6,
                                                                    })}
                                                                >
                                                                    <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '900' }}>Remove</Text>
                                                                </Pressable>
                                                            )}
                                                        </View>
                                                    ))}
                                                </View>
                                                <ThemedButton
                                                    title={crewEditorSlotId === slot.id ? 'Close Crew' : 'Manage Crew'}
                                                    variant="secondary"
                                                    onPress={() => setCrewEditorSlotId((current) => current === slot.id ? '' : slot.id)}
                                                    style={{ marginTop: 12 }}
                                                />
                                                {crewEditorSlotId === slot.id && (
                                                    <ScheduleCrewEditor
                                                        crew={crew}
                                                        technicians={technicians}
                                                        selectedCompanyUserId={crewMemberBySlotId[slot.id] || ''}
                                                        selectedRole={crewRoleBySlotId[slot.id] || 'technician'}
                                                        saving={savingScheduleItemId === slot.id}
                                                        onSelectCompanyUser={(companyUserId) => setCrewMemberBySlotId((current) => ({ ...current, [slot.id]: companyUserId }))}
                                                        onSelectRole={(role) => setCrewRoleBySlotId((current) => ({ ...current, [slot.id]: role }))}
                                                        onSave={() => handleSaveCrewAssignment(slot)}
                                                    />
                                                )}
                                                {!technician && (
                                                    <Text style={{ color: theme.colors.mutedText, marginTop: 4, fontWeight: '800' }}>
                                                        Slot {shortId(slot.id)} / Tech ID {slot.technician_company_user_id ? shortId(slot.technician_company_user_id) : 'none'}
                                                    </Text>
                                                )}
                                            </ThemedCard>
                                        );
                                    })}
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

function MeetingComposer({
    form,
    technicians,
    saving,
    onChange,
    onToggleAttendee,
    onSave,
}: {
    form: MeetingForm;
    technicians: ScheduleTechnician[];
    saving: boolean;
    onChange: (updates: Partial<MeetingForm>) => void;
    onToggleAttendee: (companyUserId: string) => void;
    onSave: () => void;
}) {
    const { theme } = useTheme();
    const inputStyle = {
        backgroundColor: theme.colors.background,
        borderColor: theme.colors.border,
        borderRadius: 12,
        borderWidth: 1,
        color: theme.colors.text,
        fontSize: 16,
        fontWeight: '800' as const,
        minHeight: 50,
        paddingHorizontal: 14,
        paddingVertical: 12,
    };

    return (
        <ThemedCard style={{ marginBottom: 16 }}>
            <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>Add Team Meeting</Text>
            <Text style={{ color: theme.colors.mutedText, fontWeight: '800', lineHeight: 21, marginTop: 5 }}>
                This creates one shared calendar item for everyone selected. It does not create a customer job.
            </Text>
            <View style={{ gap: 10, marginTop: 14 }}>
                <DictationTextInput
                    accessibilityLabel="Meeting title"
                    editable={!saving}
                    onChangeText={(title) => onChange({ title })}
                    placeholder="Meeting title, call, or topic"
                    placeholderTextColor={theme.colors.mutedText}
                    style={inputStyle}
                    value={form.title}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <DictationTextInput
                        accessibilityLabel="Meeting date"
                        editable={!saving}
                        inputMode="numeric"
                        onChangeText={(date) => onChange({ date })}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor={theme.colors.mutedText}
                        style={[inputStyle, { flexBasis: 180, flexGrow: 1 }]}
                        value={form.date}
                    />
                    <DictationTextInput
                        accessibilityLabel="Meeting start time"
                        editable={!saving}
                        inputMode="numeric"
                        onChangeText={(startTime) => onChange({ startTime })}
                        placeholder="HH:MM"
                        placeholderTextColor={theme.colors.mutedText}
                        style={[inputStyle, { flexBasis: 150, flexGrow: 1 }]}
                        value={form.startTime}
                    />
                    <DictationTextInput
                        accessibilityLabel="Meeting duration in minutes"
                        editable={!saving}
                        inputMode="numeric"
                        onChangeText={(durationMinutes) => onChange({ durationMinutes })}
                        placeholder="Minutes"
                        placeholderTextColor={theme.colors.mutedText}
                        style={[inputStyle, { flexBasis: 140, flexGrow: 1 }]}
                        value={form.durationMinutes}
                    />
                </View>
                <DictationTextInput
                    accessibilityLabel="Meeting notes"
                    editable={!saving}
                    multiline
                    onChangeText={(notes) => onChange({ notes })}
                    placeholder="Optional agenda or notes"
                    placeholderTextColor={theme.colors.mutedText}
                    style={[inputStyle, { minHeight: 90, textAlignVertical: 'top' }]}
                    value={form.notes}
                />
            </View>

            <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900', marginTop: 16 }}>Attendees</Text>
            <Text style={{ color: theme.colors.mutedText, fontWeight: '800', marginTop: 3 }}>
                Selected: {form.attendeeIds.length}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {technicians.map((technician) => {
                    const selected = form.attendeeIds.includes(technician.id);

                    return (
                        <Pressable
                            key={technician.id}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected, disabled: saving }}
                            disabled={saving}
                            onPress={() => onToggleAttendee(technician.id)}
                            style={({ pressed }) => ({
                                backgroundColor: selected ? theme.colors.secondaryButton : theme.colors.background,
                                borderColor: selected ? theme.colors.primary : theme.colors.border,
                                borderRadius: 12,
                                borderWidth: 2,
                                flexBasis: 210,
                                flexGrow: 1,
                                opacity: pressed || saving ? 0.65 : 1,
                                padding: 12,
                            })}
                        >
                            <Text style={{ color: theme.colors.text, fontWeight: '900' }} numberOfLines={1}>
                                {selected ? '✓ ' : ''}{getTechnicianName(technician)}
                            </Text>
                            <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '800', marginTop: 2 }} numberOfLines={1}>
                                {formatLabel(technician.role)}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
            <ThemedButton
                title={saving ? 'Adding Meeting...' : 'Add Meeting to Schedule'}
                disabled={saving}
                onPress={onSave}
                style={{ marginTop: 16 }}
            />
        </ThemedCard>
    );
}

function MeetingCard({
    meeting,
    saving,
    onComplete,
}: {
    meeting: CompanyScheduleMeeting;
    saving: boolean;
    onComplete: () => void;
}) {
    const { theme } = useTheme();
    const completed = normalizeStatus(meeting.status) === 'completed';

    return (
        <ThemedCard style={{ flexBasis: 280, flexGrow: 1, minHeight: 190 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: '900', flex: 1 }}>
                    TEAM MEETING
                </Text>
                <Text style={chipStyle(theme.colors.secondaryButton, theme.colors.border, theme.colors.secondaryButtonText)}>
                    {formatLabel(meeting.status)}
                </Text>
            </View>
            <Text style={{ color: theme.colors.text, fontSize: 19, fontWeight: '900', marginTop: 8 }}>
                {meeting.title}
            </Text>
            <Text style={{ color: theme.colors.mutedText, fontWeight: '800', marginTop: 6 }}>
                {formatDateTime(meeting.start_at)} - {formatTime(meeting.end_at)}
            </Text>
            <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 10 }}>
                {meeting.attendees.map((attendee) => attendee.display_name).join(', ')}
            </Text>
            {!!meeting.notes && (
                <Text style={{ color: theme.colors.mutedText, fontWeight: '800', lineHeight: 20, marginTop: 6 }}>
                    {meeting.notes}
                </Text>
            )}
            {!completed && (
                <ThemedButton
                    title={saving ? 'Completing...' : 'Mark Meeting Complete'}
                    disabled={saving}
                    onPress={onComplete}
                    style={{ marginTop: 14 }}
                />
            )}
        </ThemedCard>
    );
}

function ScheduleCrewEditor({
    crew,
    technicians,
    selectedCompanyUserId,
    selectedRole,
    saving,
    onSelectCompanyUser,
    onSelectRole,
    onSave,
}: {
    crew: CompanyScheduleSlotAssignment[];
    technicians: ScheduleTechnician[];
    selectedCompanyUserId: string;
    selectedRole: CompanyScheduleCrewRole;
    saving: boolean;
    onSelectCompanyUser: (companyUserId: string) => void;
    onSelectRole: (role: CompanyScheduleCrewRole) => void;
    onSave: () => void;
}) {
    const { theme } = useTheme();
    const assignedIds = new Set(crew.map((assignment) => assignment.company_user_id));

    return (
        <View style={{ borderColor: theme.colors.border, borderRadius: 12, borderWidth: 1, gap: 10, marginTop: 10, padding: 10 }}>
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Choose team member</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {technicians.map((technician) => {
                    const selected = selectedCompanyUserId === technician.id;
                    const assigned = assignedIds.has(technician.id);

                    return (
                        <Pressable
                            key={technician.id}
                            disabled={saving}
                            onPress={() => onSelectCompanyUser(technician.id)}
                            style={({ pressed }) => ({
                                backgroundColor: selected ? theme.colors.secondaryButton : theme.colors.background,
                                borderColor: selected ? theme.colors.primary : theme.colors.border,
                                borderRadius: 10,
                                borderWidth: 1,
                                opacity: pressed || saving ? 0.6 : 1,
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                            })}
                        >
                            <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '900' }}>
                                {getTechnicianName(technician)}{assigned ? ' · assigned' : ''}
                            </Text>
                        </Pressable>
                    );
                })}
            </View>
            <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Role on this job</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {SCHEDULE_CREW_ROLES.map((role) => (
                    <Pressable
                        key={role}
                        disabled={saving}
                        onPress={() => onSelectRole(role)}
                        style={({ pressed }) => ({
                            backgroundColor: selectedRole === role ? theme.colors.secondaryButton : theme.colors.background,
                            borderColor: selectedRole === role ? theme.colors.primary : theme.colors.border,
                            borderRadius: 10,
                            borderWidth: 1,
                            opacity: pressed || saving ? 0.6 : 1,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                        })}
                    >
                        <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '900' }}>
                            {getCompanyScheduleCrewRoleLabel(role)}
                        </Text>
                    </Pressable>
                ))}
            </View>
            <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '800', lineHeight: 18 }}>
                The lead controls the shared customer workflow. Other crew members receive the job on their TechOS schedule.
            </Text>
            <ThemedButton title={saving ? 'Saving...' : 'Save Crew Assignment'} disabled={saving} onPress={onSave} />
        </View>
    );
}

function TechnicianRosterCard({
    technician,
    slots,
    slotAssignments,
    selected,
    onPress,
}: {
    technician: ScheduleTechnician;
    slots: ScheduleSlot[];
    slotAssignments: CompanyScheduleSlotAssignment[];
    selected: boolean;
    onPress: () => void;
}) {
    const { theme } = useTheme();
    const technicianSlots = slots.filter((slot) => (
        slot.technician_company_user_id === technician.id ||
        getScheduleCrewForSlot(slotAssignments, slot.id).some((assignment) => assignment.company_user_id === technician.id)
    ));
    const todayJobsCount = technicianSlots.filter((slot) => isToday(slot.start_at)).length;
    const nextSlot = getNextSlot(technicianSlots);

    return (
        <ThemedCard
            onPress={onPress}
            style={{
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                flexBasis: 250,
                flexGrow: 1,
                minHeight: 148,
            }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                    style={{
                        alignItems: 'center',
                        backgroundColor: theme.colors.secondaryButton,
                        borderRadius: 999,
                        height: 48,
                        justifyContent: 'center',
                        width: 48,
                    }}
                >
                    <Text style={{ color: theme.colors.secondaryButtonText, fontSize: 16, fontWeight: '900' }}>
                        {getInitials(getTechnicianName(technician))}
                    </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900' }} numberOfLines={1}>
                        {getTechnicianName(technician)}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontWeight: '800', marginTop: 2 }} numberOfLines={1}>
                        {technician.email || 'Email not configured'}
                    </Text>
                </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                <Text style={chipStyle(theme.colors.background, theme.colors.border, theme.colors.mutedText)}>
                    {formatLabel(technician.role)}
                </Text>
                <Text style={chipStyle(theme.colors.background, theme.colors.border, theme.colors.mutedText)}>
                    {formatLabel(technician.status)}
                </Text>
            </View>
            <Text style={{ color: theme.colors.mutedText, fontWeight: '800', marginTop: 10 }}>
                Today: {todayJobsCount} job{todayJobsCount === 1 ? '' : 's'}
            </Text>
            <Text style={{ color: theme.colors.mutedText, fontWeight: '800', marginTop: 4 }} numberOfLines={1}>
                Next: {nextSlot ? formatDateTime(nextSlot.start_at) : 'No upcoming job'}
            </Text>
        </ThemedCard>
    );
}

function TechnicianScheduleDetail({
    technician,
    groupedSlots,
}: {
    technician: ScheduleTechnician;
    groupedSlots: { dateKey: string; label: string; slots: ScheduleSlot[] }[];
}) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <View
                    style={{
                        alignItems: 'center',
                        backgroundColor: theme.colors.secondaryButton,
                        borderRadius: 999,
                        height: 56,
                        justifyContent: 'center',
                        width: 56,
                    }}
                >
                    <Text style={{ color: theme.colors.secondaryButtonText, fontSize: 18, fontWeight: '900' }}>
                        {getInitials(getTechnicianName(technician))}
                    </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }} numberOfLines={1}>
                        {getTechnicianName(technician)}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontWeight: '800', marginTop: 2 }} numberOfLines={1}>
                        {technician.email || 'Email not configured'}
                    </Text>
                </View>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <View style={{ flexBasis: 300, flexGrow: 1 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                        Technician Profile
                    </Text>
                    <ProfileLine label="Photo" value="Avatar placeholder only" />
                    <ProfileLine label="Bio" value="Not configured yet" />
                    <ProfileLine label="Years experience" value="Not configured yet" />
                    <ProfileLine label="Specialties" value="Not configured yet" />
                    <ProfileLine label="Languages" value="Not configured yet" />
                    <ProfileLine label="Rating/reviews" value="Coming later" />
                </View>

                <View style={{ flexBasis: 360, flexGrow: 2 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                        Schedule History
                    </Text>
                    {groupedSlots.length === 0 ? (
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '800', marginTop: 8 }}>
                            No scheduled work in the current schedule window.
                        </Text>
                    ) : (
                        <View style={{ gap: 10, marginTop: 8 }}>
                            {groupedSlots.map((group) => (
                                <View key={group.dateKey} style={{ gap: 6 }}>
                                    <Text style={{ color: theme.colors.text, fontWeight: '900' }}>
                                        {group.label}
                                    </Text>
                                    {group.slots.map((slot) => (
                                        <View
                                            key={slot.id}
                                            style={{
                                                backgroundColor: theme.colors.background,
                                                borderColor: theme.colors.border,
                                                borderRadius: 10,
                                                borderWidth: 1,
                                                padding: 10,
                                            }}
                                        >
                                            <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>
                                                {formatTime(slot.start_at)} - {formatTime(slot.end_at)} / {formatLabel(slot.status)}
                                            </Text>
                                            <Text style={{ color: theme.colors.mutedText, fontWeight: '800', marginTop: 2 }}>
                                                Request {slot.service_request_id ? shortId(slot.service_request_id) : 'not linked'} / {formatLabel(slot.priority)}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            </View>
        </ThemedCard>
    );
}

function ProfileLine({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <View style={{ marginTop: 8 }}>
            <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '900' }}>{label}</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '800', marginTop: 2 }}>{value}</Text>
        </View>
    );
}

async function resolveScheduleCompanyAccess(userId: string, requestedCompanyId: string) {
    const isPlatformAdmin = await loadSchedulePlatformAdminStatus(userId);

    if (isPlatformAdmin && requestedCompanyId) {
        return {
            company_id: requestedCompanyId,
            role: 'platform_admin',
            status: 'active',
        };
    }

    let query = supabase
        .from('company_users')
        .select('company_id, role, status')
        .eq('auth_user_id', userId)
        .order('created_at', { ascending: true })
        .limit(25);

    if (requestedCompanyId) {
        query = query.eq('company_id', requestedCompanyId);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(error.message);
    }

    return (
        ((data || []) as ScheduleAccess[]).find((companyUser) => {
            const role = normalizeStatus(companyUser.role);
            const status = normalizeStatus(companyUser.status);

            return status === 'active' && ['owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor'].includes(role);
        }) || null
    );
}

async function loadSchedulePlatformAdminStatus(userId: string) {
    const rpcResult = await supabase.rpc('homeos_is_platform_admin');

    if (!rpcResult.error) {
        return rpcResult.data === true;
    }

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

function firstParam(value?: string | string[]) {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
}

function normalizeStatus(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function buildTechnicianLookup(data: unknown) {
    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

            return {
                id: readStringField(record, 'id') || '',
                full_name: readStringField(record, 'full_name'),
                email: readStringField(record, 'email'),
                auth_user_id: readStringField(record, 'auth_user_id'),
                role: readStringField(record, 'role'),
                status: readStringField(record, 'status'),
            };
        })
        .filter((technician) => technician.id && normalizeStatus(technician.status) === 'active')
        .reduce<Record<string, ScheduleTechnician>>((accumulator, technician) => {
            accumulator[technician.id] = {
                id: technician.id,
                full_name: technician.full_name,
                email: technician.email,
                auth_user_id: technician.auth_user_id,
                role: technician.role,
                status: technician.status,
            };
            return accumulator;
        }, {});
}

function readStringField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value : null;
}

function formatLabel(value?: string | null) {
    return String(value || 'unknown')
        .trim()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function formatDateTime(value?: string | null) {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

function getScheduleWindow() {
    const now = new Date();

    return {
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000),
    };
}

function createDefaultMeetingForm(): MeetingForm {
    const start = new Date();
    start.setMinutes(start.getMinutes() + 30);
    start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);

    return {
        title: '',
        notes: '',
        date: formatLocalDateInput(start),
        startTime: formatLocalTimeInput(start),
        durationMinutes: '60',
        attendeeIds: [],
    };
}

function parseLocalScheduleDateTime(dateValue: string, timeValue: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || !/^\d{2}:\d{2}$/.test(timeValue)) return null;

    const [year, month, day] = dateValue.split('-').map(Number);
    const [hours, minutes] = timeValue.split(':').map(Number);
    const date = new Date(year, month - 1, day, hours, minutes, 0, 0);

    if (
        Number.isNaN(date.getTime()) ||
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hours ||
        date.getMinutes() !== minutes
    ) {
        return null;
    }

    return date;
}

function formatLocalDateInput(date: Date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

function formatLocalTimeInput(date: Date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function groupScheduleSlotsByDate(slots: ScheduleSlot[]) {
    const groups = slots.reduce<Record<string, { dateKey: string; label: string; slots: ScheduleSlot[] }>>((accumulator, slot) => {
        const date = slot.start_at ? new Date(slot.start_at) : null;
        const dateKey = date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : 'unscheduled';
        const label = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'Unscheduled';

        if (!accumulator[dateKey]) {
            accumulator[dateKey] = { dateKey, label, slots: [] };
        }

        accumulator[dateKey].slots.push(slot);
        return accumulator;
    }, {});

    return Object.values(groups);
}

function formatTime(value?: string | null) {
    if (!value) return 'Not available';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleTimeString();
}

function isToday(value?: string | null) {
    if (!value) return false;
    const date = new Date(value);
    const today = new Date();

    return (
        !Number.isNaN(date.getTime()) &&
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
    );
}

function getNextSlot(slots: ScheduleSlot[]) {
    const nowMs = Date.now();

    return slots
        .filter((slot) => {
            const startMs = slot.start_at ? new Date(slot.start_at).getTime() : Number.NaN;
            return !Number.isNaN(startMs) && startMs >= nowMs;
        })
        .sort((a, b) => new Date(a.start_at || '').getTime() - new Date(b.start_at || '').getTime())[0] || null;
}

function shortId(value: string) {
    return value.replace(/-/g, '').slice(0, 8).toUpperCase();
}

function getTechnicianName(technician?: ScheduleTechnician) {
    if (!technician) return 'No technician assigned';

    return technician.full_name || technician.email || `Technician ${shortId(technician.auth_user_id || technician.id)}`;
}

function getInitials(value: string) {
    const initials = value
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');

    return initials || 'T';
}

function chipStyle(backgroundColor: string, borderColor: string, color: string) {
    return {
        backgroundColor,
        borderColor,
        borderRadius: 999,
        borderWidth: 1,
        color,
        fontSize: 12,
        fontWeight: '900' as const,
        overflow: 'hidden' as const,
        paddingHorizontal: 10,
        paddingVertical: 5,
    };
}
