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

    useEffect(() => {
        loadProfile();
    }, []);

    async function loadProfile() {
        const { data: sessionData } = await supabase.auth.getSession();

        const userId = sessionData.session?.user.id;

        if (!userId) {
            router.replace('/auth/login' as any);
            return;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, role, is_platform_admin')
            .eq('id', userId)
            .single();

        if (!profile || !isSuperAdminProfile(profile)) {
            Alert.alert('Access denied', 'This area is for SUPER_ADMIN only.');
            router.replace('/' as any);
            return;
        }

        setName(profile.full_name || 'SUPER_ADMIN');
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        router.replace('/auth/login' as any);
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
                    onPress={() => Alert.alert('Next', 'Create Company screen comes next.')}
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
                            onPress={() => Alert.alert(card, 'This module will connect to real data next.')}
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
