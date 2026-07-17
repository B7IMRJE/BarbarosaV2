import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import AdminNavBar from '../components/AdminNavBar';
import HomeHeader from '../components/HomeHeader';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
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
    const technicians = useMemo(() => Object.values(techniciansById), [techniciansById]);
    const groupedSlots = useMemo(() => groupScheduleSlotsByDate(slots), [slots]);
    const selectedTechnician = selectedTechnicianId ? techniciansById[selectedTechnicianId] || null : null;
    const selectedTechnicianSlots = useMemo(
        () => slots.filter((slot) => slot.technician_company_user_id === selectedTechnicianId),
        [selectedTechnicianId, slots]
    );
    const selectedTechnicianGroupedSlots = useMemo(
        () => groupScheduleSlotsByDate(selectedTechnicianSlots),
        [selectedTechnicianSlots]
    );
    const scheduleCompanyId = access?.company_id || requestedCompanyId;
    const scheduleBackFallback = scheduleCompanyId
        ? (`/super-admin/company/${scheduleCompanyId}` as Href)
        : ('/super-admin' as Href);

    useEffect(() => {
        loadScheduleBoard();
    }, [requestedCompanyId]);

    async function loadScheduleBoard() {
        setLoading(true);
        setMessage('Loading Schedule Board...');
        setAccess(null);
        setSlots([]);
        setTechniciansById({});
        setSelectedTechnicianId('');

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

        setCompanyName(company.public_name || company.dba_name || company.name || 'Company');
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
        const now = new Date();
        const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
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
                        {companyName} will schedule service requests and assigned jobs here once schedule slots are installed.
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
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        {loading ? 'Loading...' : slots.length > 0 ? 'Upcoming Schedule' : 'Schedule Status'}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 15, fontWeight: '800', lineHeight: 22, marginTop: 8 }}>
                        {message}
                    </Text>
                </ThemedCard>

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

function TechnicianRosterCard({
    technician,
    slots,
    selected,
    onPress,
}: {
    technician: ScheduleTechnician;
    slots: ScheduleSlot[];
    selected: boolean;
    onPress: () => void;
}) {
    const { theme } = useTheme();
    const technicianSlots = slots.filter((slot) => slot.technician_company_user_id === technician.id);
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
    groupedSlots: Array<{ dateKey: string; label: string; slots: ScheduleSlot[] }>;
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
