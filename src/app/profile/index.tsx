import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

export default function ProfileScreen() {
    const { theme } = useTheme();
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('Loading profile...');

    useEffect(() => {
        loadUser();
    }, []);

    async function loadUser() {
        const { data } = await supabase.auth.getUser();

        if (!data.user) {
            setMessage('Not logged in.');
            return;
        }

        setEmail(data.user.email || '');
        setMessage('Logged in');
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        router.replace('/auth/login' as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 500, marginTop: 50 }}>
                <Text
                    onPress={() => router.push('/' as any)}
                    style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginBottom: 20,
                    }}
                >
                    ← Back
                </Text>

                <Text
                    style={{
                        fontSize: 34,
                        fontWeight: '900',
                        color: theme.colors.text,
                    }}
                >
                    Profile
                </Text>

                <Text style={{ color: theme.colors.mutedText, marginTop: 8, marginBottom: 24 }}>
                    Account settings.
                </Text>

                <ThemedCard style={{ marginBottom: 18 }}>
                    <Text style={[labelStyle, { color: theme.colors.mutedText }]}>Status</Text>
                    <Text style={[valueStyle, { color: theme.colors.text }]}>{message}</Text>

                    <Text style={[labelStyle, { color: theme.colors.mutedText }]}>Email</Text>
                    <Text style={[valueStyle, { color: theme.colors.text }]}>{email || 'No email found'}</Text>
                </ThemedCard>

                <ThemedButton
                    title="Theme"
                    onPress={() => router.push('/profile/theme' as any)}
                    style={{ marginBottom: 14 }}
                />

                <ThemedButton
                    title="Data Ownership"
                    variant="secondary"
                    onPress={() => router.push('/data' as any)}
                    style={{ marginBottom: 14 }}
                />

                <ThemedButton
                    title="Company Invitations"
                    variant="secondary"
                    onPress={() => router.push('/onboarding/company-invitations' as any)}
                    style={{ marginBottom: 14 }}
                />

                <ThemedButton
                    title="Session Security"
                    variant="secondary"
                    onPress={() => router.push('/profile/security' as any)}
                    style={{ marginBottom: 14 }}
                />

                <ThemedButton
                    title="Change Password"
                    onPress={() => router.push('/profile/change-password' as any)}
                    style={{ marginBottom: 14 }}
                />

                <TouchableOpacity
                    onPress={handleLogout}
                    style={[
                        logoutButtonStyle,
                        {
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                        },
                    ]}
                >
                    <Text style={[logoutTextStyle, { color: theme.colors.danger }]}>Logout</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const labelStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginTop: 8,
};

const valueStyle = {
    fontSize: 16,
    fontWeight: '800' as const,
    marginTop: 4,
};

const logoutButtonStyle = {
    padding: 18,
    borderRadius: 18,
    alignItems: 'center' as const,
    borderWidth: 1,
};

const logoutTextStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
};
