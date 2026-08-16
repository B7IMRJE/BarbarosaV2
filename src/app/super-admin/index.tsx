import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import { resolveLoggedInUserRoute, resolveSuperOSAccessRedirect } from '../../lib/onboarding';
import { supabase } from '../../lib/supabase';

const cards = [
    'Companies',
    'Catalog Factory',
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
    const { width: viewportWidth } = useWindowDimensions();
    const isPhoneLayout = viewportWidth <= 640;
    const pagePadding = isPhoneLayout ? 16 : 20;
    const [name, setName] = useState('SUPER_ADMIN');
    const [guardResolved, setGuardResolved] = useState(false);
    const [guardAllowed, setGuardAllowed] = useState(false);
    const [guardIssue, setGuardIssue] = useState<'denied' | 'service-unavailable' | null>(null);
    const [fallbackRoute, setFallbackRoute] = useState('/');

    useEffect(() => {
        void loadProfile();
    }, []);

    async function loadProfile() {
        setGuardResolved(false);
        setGuardAllowed(false);
        setGuardIssue(null);

        try {
            const userResult = await supabase.auth.getUser();
            const user = userResult.data.user;

            if (!user) {
                setFallbackRoute('/auth/login');
                setGuardIssue('denied');
                setGuardResolved(true);
                router.replace('/auth/login' as any);
                return;
            }

            if (userResult.error) {
                throw userResult.error;
            }

            const [profileQuery, routeDecision] = await Promise.all([
                supabase
                    .from('profiles')
                    .select('full_name')
                    .eq('id', user.id)
                    .maybeSingle(),
                resolveLoggedInUserRoute(user.id),
            ]);
            if (routeDecision.reason === 'service-unavailable') {
                setGuardIssue('service-unavailable');
                setGuardResolved(true);
                return;
            }

            const authorizedWorkspaceRoute = resolveSuperOSAccessRedirect(routeDecision);

            if (authorizedWorkspaceRoute) {
                setFallbackRoute(authorizedWorkspaceRoute);
                setGuardIssue('denied');
                setGuardResolved(true);
                router.replace(authorizedWorkspaceRoute as any);
                return;
            }

            setName(profileQuery.data?.full_name || 'SUPER_ADMIN');
            setGuardAllowed(true);
            setGuardResolved(true);
        } catch {
            setGuardIssue('service-unavailable');
            setGuardResolved(true);
        }
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

        if (card === 'Catalog Factory') {
            router.push('/super-admin/catalog-factory' as any);
            return;
        }

        if (card === 'Properties') {
            router.push({
                pathname: '/super-admin/companies',
                params: { selectFor: 'properties' },
            } as any);
            return;
        }

        if (card === 'Users') {
            router.push('/super-admin/homeos-users' as any);
            return;
        }

        if (card === 'Announcements') {
            router.push('/super-admin/announcements' as any);
            return;
        }

        Alert.alert(card, 'This module will connect to real data next.');
    }

    if (!guardResolved) {
        return (
            <View
                accessibilityLabel="Verifying SuperOS access"
                accessibilityRole="progressbar"
                style={{ flex: 1, backgroundColor: '#F3F6FA', alignItems: 'center', justifyContent: 'center', padding: pagePadding }}
            >
                <ActivityIndicator size="large" color="#56C9B1" />
                <Text style={{ marginTop: 16, fontSize: 20, fontWeight: '900', color: '#071B33' }}>
                    Verifying SuperOS access
                </Text>
            </View>
        );
    }

    if (!guardAllowed) {
        const serviceUnavailable = guardIssue === 'service-unavailable';

        return (
            <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                style={{ flex: 1, backgroundColor: '#F3F6FA' }}
                contentContainerStyle={{ padding: pagePadding, paddingBottom: 40, alignItems: 'center' }}
            >
                <View style={{ width: '100%', maxWidth: 900, minWidth: 0 }}>
                    <Text style={{ marginTop: 20, fontSize: isPhoneLayout ? 28 : 34, fontWeight: '900', color: '#071B33' }}>
                        {serviceUnavailable ? 'Unable to verify SuperOS access' : 'SuperOS access unavailable'}
                    </Text>

                    <Text style={{ color: '#637083', marginTop: 8, marginBottom: 24, lineHeight: 22 }}>
                        {serviceUnavailable
                            ? 'We could not load your permissions. Check your connection and try again.'
                            : 'This account does not have platform-administrator access. Open its assigned workspace instead.'}
                    </Text>

                    <TouchableOpacity
                        onPress={() => {
                            if (serviceUnavailable) {
                                void loadProfile();
                                return;
                            }

                            router.replace(fallbackRoute as any);
                        }}
                        style={{
                            backgroundColor: '#071B33',
                            padding: 16,
                            borderRadius: 16,
                            alignItems: 'center',
                        }}
                    >
                        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '900' }}>
                            {serviceUnavailable ? 'Try Again' : 'Open My Workspace'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        );
    }

    return (
        <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: pagePadding, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900, minWidth: 0 }}>
                <AdminNavBar showBack={false} />

                <Text style={{ marginTop: 20, fontSize: 16, color: '#637083', fontWeight: '700' }}>
                    Welcome, {name}
                </Text>

                <Text style={{ fontSize: isPhoneLayout ? 30 : 34, fontWeight: '900', color: '#071B33', marginTop: 6 }}>
                    SuperOS
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

                <View style={{ width: '100%', minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    {cards.map((card) => (
                        <TouchableOpacity
                            key={card}
                            onPress={() => openDashboardCard(card)}
                            style={{
                                width: isPhoneLayout ? '100%' : '48%',
                                maxWidth: '100%',
                                minWidth: 0,
                                minHeight: 100,
                                backgroundColor: '#FFFFFF',
                                borderRadius: 20,
                                padding: 16,
                                borderWidth: 1,
                                borderColor: '#E3E8EF',
                                justifyContent: 'center',
                            }}
                        >
                            <Text numberOfLines={2} style={{ fontSize: 17, fontWeight: '900', color: '#071B33', flexShrink: 1 }}>
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
