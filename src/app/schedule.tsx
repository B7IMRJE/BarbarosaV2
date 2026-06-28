import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
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

export default function ScheduleBoardScreen() {
    const { companyId } = useLocalSearchParams<{ companyId?: string | string[] }>();
    const { theme } = useTheme();
    const requestedCompanyId = useMemo(() => firstParam(companyId), [companyId]);
    const [loading, setLoading] = useState(true);
    const [access, setAccess] = useState<ScheduleAccess | null>(null);
    const [message, setMessage] = useState('Loading Schedule Board...');
    const [companyName, setCompanyName] = useState('Company');

    useEffect(() => {
        loadScheduleBoard();
    }, [requestedCompanyId]);

    async function loadScheduleBoard() {
        setLoading(true);
        setMessage('Loading Schedule Board...');
        setAccess(null);

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
            await loadCompanyName(resolvedAccess.company_id);
            setMessage('Schedule Board setup is not installed yet. Review SQL 582 before scheduling jobs.');
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

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 44, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1120 }}>
                <HomeHeader />

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
                        {loading ? 'Loading...' : 'Setup Needed'}
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 15, fontWeight: '800', lineHeight: 22, marginTop: 8 }}>
                        {message}
                    </Text>
                </ThemedCard>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    {['Unscheduled Requests', 'Technician Availability', 'Today', 'This Week'].map((title) => (
                        <ThemedCard key={title} style={{ flexBasis: 250, flexGrow: 1, minHeight: 130 }}>
                            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>{title}</Text>
                            <Text style={{ color: theme.colors.mutedText, marginTop: 8, lineHeight: 20 }}>
                                Scheduling data will appear after SQL 582 is reviewed and installed.
                            </Text>
                        </ThemedCard>
                    ))}
                </View>
            </View>
        </ScrollView>
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

            return status === 'active' && ['owner', 'admin', 'manager', 'office', 'dispatcher'].includes(role);
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

function formatLabel(value?: string | null) {
    return String(value || 'unknown')
        .trim()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}
