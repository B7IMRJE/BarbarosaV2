import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ThemedCard from '../../components/theme/ThemedCard';
import { supabase } from '../../lib/supabase';
import { themeOptions } from '../../theme';
import { useTheme } from '../../theme/useTheme';

type SettingsCardProps = {
    title: string;
    body: string;
    route: string;
    badge?: string;
};

export default function ProfileScreen() {
    const { theme, themeName } = useTheme();
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('Loading profile...');

    const currentThemeLabel =
        themeOptions.find((option) => option.name === themeName)?.label || themeName;

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
            contentContainerStyle={{ padding: 24, alignItems: 'center', paddingBottom: 44 }}
        >
            <View style={{ width: '100%', maxWidth: 900, marginTop: 50 }}>
                <Text
                    onPress={() => router.push('/' as any)}
                    style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginBottom: 20,
                    }}
                >
                    Back
                </Text>

                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 16,
                        marginBottom: 20,
                    }}
                >
                    <View style={{ flex: 1, minWidth: 260 }}>
                        <Text
                            style={{
                                fontSize: 34,
                                fontWeight: '900',
                                color: theme.colors.text,
                            }}
                        >
                            Profile
                        </Text>

                        <Text
                            style={{
                                color: theme.colors.mutedText,
                                marginTop: 8,
                                fontSize: 16,
                                lineHeight: 22,
                            }}
                        >
                            Account, appearance, security, and data controls.
                        </Text>
                    </View>

                    <View
                        style={{
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            borderWidth: 1,
                            borderRadius: theme.radii.card,
                            padding: 14,
                            minWidth: 220,
                        }}
                    >
                        <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>
                            Current Theme
                        </Text>
                        <Text
                            style={{
                                color: theme.colors.text,
                                fontSize: 18,
                                fontWeight: '900',
                                marginTop: 4,
                            }}
                        >
                            {currentThemeLabel}
                        </Text>
                    </View>
                </View>

                <ThemedCard style={{ marginBottom: 18 }}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                        Account
                    </Text>

                    <View style={accountGridStyle}>
                        <View
                            style={[
                                accountInfoBoxStyle,
                                {
                                    backgroundColor: theme.colors.surfaceAlt,
                                    borderColor: theme.colors.border,
                                    borderRadius: theme.radii.button,
                                },
                            ]}
                        >
                            <Text style={[labelStyle, { color: theme.colors.mutedText }]}>
                                Status
                            </Text>
                            <Text style={[valueStyle, { color: theme.colors.text }]}>
                                {message}
                            </Text>
                        </View>

                        <View
                            style={[
                                accountInfoBoxStyle,
                                {
                                    backgroundColor: theme.colors.surfaceAlt,
                                    borderColor: theme.colors.border,
                                    borderRadius: theme.radii.button,
                                },
                            ]}
                        >
                            <Text style={[labelStyle, { color: theme.colors.mutedText }]}>
                                Email
                            </Text>
                            <Text style={[valueStyle, { color: theme.colors.text }]}>
                                {email || 'No email found'}
                            </Text>
                        </View>
                    </View>
                </ThemedCard>

                <Text
                    style={{
                        color: theme.colors.text,
                        fontSize: 22,
                        fontWeight: '900',
                        marginBottom: 12,
                    }}
                >
                    Settings
                </Text>

                <View style={settingsGridStyle}>
                    <SettingsCard
                        title="Appearance & Theme"
                        body="Choose from HomeOS Classic, dark themes, high contrast, and custom color packs."
                        badge={currentThemeLabel}
                        route="/profile/theme"
                    />

                    <SettingsCard
                        title="Data Ownership"
                        body="Export, download, and future delete controls for homeowner-owned records."
                        route="/data"
                    />

                    <SettingsCard
                        title="Company Invitations"
                        body="Review company access invitations connected to your signed-in account."
                        route="/onboarding/company-invitations"
                    />

                    <SettingsCard
                        title="Session Security"
                        body="Control stay-signed-in behavior, auto logout, and future security options."
                        route="/profile/security"
                    />

                    <SettingsCard
                        title="Change Password"
                        body="Update your login password for this HomeOS account."
                        route="/profile/change-password"
                    />
                </View>

                <TouchableOpacity
                    onPress={handleLogout}
                    style={[
                        logoutButtonStyle,
                        {
                            backgroundColor: theme.colors.dangerBackground,
                            borderColor: theme.colors.danger,
                            borderRadius: theme.radii.button,
                        },
                    ]}
                >
                    <Text style={[logoutTextStyle, { color: theme.colors.danger }]}>
                        Logout
                    </Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

function SettingsCard({ title, body, route, badge }: SettingsCardProps) {
    const { theme } = useTheme();

    return (
        <ThemedCard
            onPress={() => router.push(route as any)}
            style={{
                flexGrow: 1,
                flexBasis: 260,
                minHeight: 160,
            }}
        >
            <View style={{ flex: 1, justifyContent: 'space-between', gap: 14 }}>
                <View>
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 12,
                        }}
                    >
                        <Text
                            style={{
                                color: theme.colors.text,
                                fontSize: 19,
                                fontWeight: '900',
                                flex: 1,
                            }}
                        >
                            {title}
                        </Text>

                        <Text
                            style={{
                                color: theme.colors.mutedText,
                                fontSize: 20,
                                fontWeight: '900',
                            }}
                        >{'>'}</Text>
                    </View>

                    <Text
                        style={{
                            color: theme.colors.mutedText,
                            fontSize: 15,
                            lineHeight: 21,
                            marginTop: 8,
                            fontWeight: '700',
                        }}
                    >
                        {body}
                    </Text>
                </View>

                {!!badge && (
                    <View
                        style={{
                            alignSelf: 'flex-start',
                            backgroundColor: theme.colors.secondaryButton,
                            borderColor: theme.colors.border,
                            borderWidth: 1,
                            borderRadius: theme.radii.pill,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                        }}
                    >
                        <Text
                            style={{
                                color: theme.colors.secondaryButtonText,
                                fontSize: 13,
                                fontWeight: '900',
                            }}
                        >
                            {badge}
                        </Text>
                    </View>
                )}
            </View>
        </ThemedCard>
    );
}

const eyebrowStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 12,
};

const accountGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const accountInfoBoxStyle = {
    flexGrow: 1,
    flexBasis: 240,
    borderWidth: 1,
    padding: 14,
};

const labelStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const valueStyle = {
    fontSize: 16,
    fontWeight: '800' as const,
    marginTop: 4,
};

const settingsGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 14,
    marginBottom: 18,
};

const logoutButtonStyle = {
    padding: 18,
    alignItems: 'center' as const,
    borderWidth: 1,
    marginTop: 2,
};

const logoutTextStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
};
