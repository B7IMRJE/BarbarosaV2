import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import GlassCard from '../../components/glass/GlassCard';
import ThemedButton from '../../components/theme/ThemedButton';
import { loadCurrentUserPlatformAdmin } from '../../lib/roles';
import { supabase } from '../../lib/supabase';
import { glassToneForIndex, orbitalGlassPalette } from '../../theme/glassPalette';

type ProfileRow = { id: string; full_name: string | null; role: string | null };
type MembershipRow = { user_id: string; property_id: string; role: string | null; status: string | null };

export default function PlatformHomeOSUsersScreen() {
    const [profiles, setProfiles] = useState<ProfileRow[]>([]);
    const [memberships, setMemberships] = useState<MembershipRow[]>([]);
    const [search, setSearch] = useState('');
    const [message, setMessage] = useState('Loading HomeOS users...');

    useEffect(() => {
        void loadUsers();
    }, []);

    async function loadUsers() {
        if (!await loadCurrentUserPlatformAdmin()) {
            setMessage('Platform administrator access is required.');
            return;
        }

        const [profileResult, membershipResult] = await Promise.all([
            supabase.from('profiles').select('id, full_name, role').order('full_name', { ascending: true }),
            supabase.from('property_memberships').select('user_id, property_id, role, status').order('created_at', { ascending: true }),
        ]);

        if (profileResult.error || membershipResult.error) {
            setMessage(profileResult.error?.message || membershipResult.error?.message || 'Could not load HomeOS users.');
            return;
        }

        setProfiles((profileResult.data || []) as ProfileRow[]);
        setMemberships((membershipResult.data || []) as MembershipRow[]);
        setMessage('');
    }

    const homeownerProfiles = useMemo(() => {
        const membershipByUser = new Map<string, MembershipRow[]>();
        memberships.forEach((membership) => {
            membershipByUser.set(membership.user_id, [...(membershipByUser.get(membership.user_id) || []), membership]);
        });
        const query = search.trim().toLowerCase();

        return profiles
            .map((profile) => ({ profile, memberships: membershipByUser.get(profile.id) || [] }))
            .filter(({ profile, memberships: rows }) => {
                const isHomeOSUser = rows.length > 0 || String(profile.role || '').toUpperCase() === 'HOMEOWNER';
                const matches = !query || `${profile.full_name || ''} ${profile.id}`.toLowerCase().includes(query);
                return isHomeOSUser && matches;
            });
    }, [memberships, profiles, search]);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: orbitalGlassPalette.screen }}
            contentContainerStyle={{ alignItems: 'center', padding: 20, paddingBottom: 48 }}
        >
            <View style={{ width: '100%', maxWidth: 1100 }}>
                <AdminNavBar backFallback="/super-admin" />
                <Text style={{ color: orbitalGlassPalette.text, fontSize: 34, fontWeight: '900', marginTop: 20 }}>
                    HomeOS Users
                </Text>
                <Text style={{ color: orbitalGlassPalette.mutedText, fontSize: 16, lineHeight: 23, marginTop: 8, marginBottom: 20 }}>
                    Platform-wide homeowner accounts and their active home memberships. This directory is visible only to the platform administrator.
                </Text>

                <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Search homeowner name or account ID"
                    placeholderTextColor={orbitalGlassPalette.mutedText}
                    style={{
                        backgroundColor: 'rgba(16, 49, 75, 0.9)',
                        borderColor: 'rgba(174, 205, 229, 0.48)',
                        borderRadius: 14,
                        borderWidth: 1,
                        color: orbitalGlassPalette.text,
                        fontSize: 16,
                        marginBottom: 18,
                        padding: 15,
                    }}
                />

                {!!message && <Text style={{ color: orbitalGlassPalette.mutedText, marginBottom: 16, fontWeight: '800' }}>{message}</Text>}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                    {homeownerProfiles.map(({ profile, memberships: rows }, index) => (
                        <GlassCard key={profile.id} tone={glassToneForIndex(index)} style={{ flexGrow: 1, minWidth: 260, width: '31%', padding: 18 }}>
                            <Text style={{ color: orbitalGlassPalette.text, fontSize: 19, fontWeight: '900' }}>
                                {profile.full_name || 'HomeOS User'}
                            </Text>
                            <Text style={{ color: orbitalGlassPalette.mutedText, fontSize: 12, marginTop: 5 }}>
                                {profile.id}
                            </Text>
                            <Text style={{ color: orbitalGlassPalette.text, fontSize: 13, fontWeight: '800', marginTop: 14 }}>
                                {rows.length} home membership{rows.length === 1 ? '' : 's'}
                            </Text>
                            {rows.slice(0, 3).map((membership) => (
                                <Text key={`${membership.property_id}-${membership.role}`} style={{ color: orbitalGlassPalette.mutedText, fontSize: 12, marginTop: 5 }}>
                                    {membership.role || 'Member'} · {membership.status || 'Unknown'} · {membership.property_id}
                                </Text>
                            ))}
                        </GlassCard>
                    ))}
                </View>

                {!message && homeownerProfiles.length === 0 && (
                    <GlassCard tone="steel" style={{ padding: 20 }}>
                        <Text style={{ color: orbitalGlassPalette.text, fontWeight: '900' }}>No matching HomeOS users.</Text>
                    </GlassCard>
                )}

                <ThemedButton title="Back to Platform Administration" variant="glass" onPress={() => router.push('/super-admin' as any)} style={{ marginTop: 24 }} />
            </View>
        </ScrollView>
    );
}
