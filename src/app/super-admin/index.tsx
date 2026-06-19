import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

function isSuperAdminProfile(profile?: { role?: string | null; is_platform_admin?: boolean | null } | null) {
    return (
        String(profile?.role || '').trim().toUpperCase() === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

async function loadSuperAdminProfile(userId: string) {
    const primaryQuery = await supabase
        .from('profiles')
        .select('full_name, role, is_platform_admin')
        .eq('id', userId)
        .maybeSingle();

    if (!primaryQuery.error) {
        return primaryQuery;
    }

    const fallbackQuery = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', userId)
        .maybeSingle();

    return {
        data: fallbackQuery.data ? { ...fallbackQuery.data, is_platform_admin: null } : null,
        error: fallbackQuery.error,
    };
}

const cards = [
    'Companies',
    'Users',
    'Properties',
    'Reviews',
    'Emergencies',
    'Storage',
    'Support Tickets',
    'Analytics',
    'Themes',
    'Announcements',
];

export default function SuperAdminDashboard() {
    const [name, setName] = useState('SUPER_ADMIN');
    const [guardResolved, setGuardResolved] = useState(false);
    const [guardAllowed, setGuardAllowed] = useState(false);
    const [guardDebug, setGuardDebug] = useState<{
        userId: string | null;
        email: string | null;
        profile: unknown;
        profileError: string | null;
        decision: 'pending' | 'allow' | 'deny' | 'login';
    }>({
        userId: null,
        email: null,
        profile: null,
        profileError: null,
        decision: 'pending',
    });

    useEffect(() => {
        loadProfile();
    }, []);

    async function loadProfile() {
        const { data: sessionData } = await supabase.auth.getSession();

        const sessionUser = sessionData.session?.user || null;
        const userId = sessionUser?.id || null;

        if (!userId) {
            setGuardAllowed(false);
            setGuardResolved(true);
            setGuardDebug({
                userId: null,
                email: null,
                profile: null,
                profileError: 'No active session user.',
                decision: 'login',
            });
            return;
        }

        const { data: profile, error } = await loadSuperAdminProfile(userId);
        const allowed = !!profile && isSuperAdminProfile(profile);

        setGuardDebug({
            userId,
            email: sessionUser?.email || null,
            profile: profile ?? null,
            profileError: error?.message ?? null,
            decision: allowed ? 'allow' : 'deny',
        });
        setGuardAllowed(allowed);
        setGuardResolved(true);

        if (!allowed) {
            return;
        }

        setName(profile.full_name || 'SUPER_ADMIN');
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        router.replace('/auth/login' as any);
    }

    function openDashboardCard(card: string) {
        if (card === 'Companies') {
            router.push('/super-admin/companies' as any);
            return;
        }

        if (card === 'Properties') {
            router.push({
                pathname: '/super-admin/companies',
                params: { selectFor: 'properties' },
            } as any);
            return;
        }

        Alert.alert(card, 'This module will connect to real data next.');
    }

    if (guardResolved && !guardAllowed) {
        return (
            <ScrollView
                style={{ flex: 1, backgroundColor: '#F3F6FA' }}
                contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
            >
                <View style={{ width: '100%', maxWidth: 900 }}>
                    <Text style={{ marginTop: 20, fontSize: 34, fontWeight: '900', color: '#071B33' }}>
                        Super Admin Guard Diagnostics
                    </Text>

                    <Text style={{ color: '#637083', marginTop: 8, marginBottom: 24, lineHeight: 22 }}>
                        Access was denied. This screen shows the actual guard inputs before any redirect.
                    </Text>

                    <View
                        style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: 20,
                            padding: 18,
                            borderWidth: 1,
                            borderColor: '#E3E8EF',
                            marginBottom: 20,
                        }}
                    >
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#071B33', marginBottom: 8 }}>
                            Auth User ID
                        </Text>
                        <Text style={{ color: '#637083', lineHeight: 22 }}>
                            {guardDebug.userId || 'null'}
                        </Text>

                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#071B33', marginTop: 16, marginBottom: 8 }}>
                            Auth Email
                        </Text>
                        <Text style={{ color: '#637083', lineHeight: 22 }}>
                            {guardDebug.email || 'null'}
                        </Text>

                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#071B33', marginTop: 16, marginBottom: 8 }}>
                            Profile Query Result
                        </Text>
                        <Text style={{ color: '#637083', lineHeight: 22 }}>
                            {JSON.stringify(guardDebug.profile, null, 2) || 'null'}
                        </Text>

                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#071B33', marginTop: 16, marginBottom: 8 }}>
                            Profile Query Error
                        </Text>
                        <Text style={{ color: '#637083', lineHeight: 22 }}>
                            {guardDebug.profileError || 'none'}
                        </Text>

                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#071B33', marginTop: 16, marginBottom: 8 }}>
                            Final Decision
                        </Text>
                        <Text style={{ color: '#637083', lineHeight: 22 }}>
                            {guardDebug.decision}
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={() => router.replace('/' as any)}
                        style={{
                            backgroundColor: '#071B33',
                            padding: 16,
                            borderRadius: 16,
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }}>
                            Back Home
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        );
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <Text style={{ marginTop: 20, fontSize: 16, color: '#637083', fontWeight: '700' }}>
                    Welcome, {name}
                </Text>

                <Text style={{ fontSize: 34, fontWeight: '900', color: '#071B33', marginTop: 6 }}>
                    HomeOS SUPER_ADMIN
                </Text>

                <Text style={{ color: '#637083', marginTop: 8, marginBottom: 24 }}>
                    Platform control center.
                </Text>

                <TouchableOpacity
                    onPress={() => router.push('/super-admin/companies' as any)}
                    style={{
                        backgroundColor: '#071B33',
                        padding: 16,
                        borderRadius: 16,
                        marginTop: 12,
                        marginBottom: 20,
                        alignItems: 'center',
                    }}
                >
                    <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }}>
                        + Create Company
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={() => router.push('/profile/change-password' as any)}
                    style={{
                        backgroundColor: '#071B33',
                        padding: 16,
                        borderRadius: 16,
                        marginTop: 12,
                        alignItems: 'center',
                    }}
                >
                    <Text
                        style={{
                            color: '#FFFFFF',
                            fontSize: 16,
                            fontWeight: '900',
                        }}
                    >
                        Change Password
                    </Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    {cards.map((card) => (
                        <TouchableOpacity
                            key={card}
                            onPress={() => openDashboardCard(card)}
                            style={{
                                width: '48%',
                                minHeight: 100,
                                backgroundColor: '#FFFFFF',
                                borderRadius: 20,
                                padding: 16,
                                borderWidth: 1,
                                borderColor: '#E3E8EF',
                                justifyContent: 'center',
                            }}
                        >
                            <Text style={{ fontSize: 17, fontWeight: '900', color: '#071B33' }}>
                                {card}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <TouchableOpacity
                    onPress={handleLogout}
                    style={{
                        backgroundColor: '#FFFFFF',
                        padding: 16,
                        borderRadius: 18,
                        alignItems: 'center',
                        marginTop: 24,
                        borderWidth: 1,
                        borderColor: '#E3E8EF',
                    }}
                >
                    <Text style={{ color: '#B00020', fontSize: 16, fontWeight: '900' }}>
                        Logout
                    </Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}
