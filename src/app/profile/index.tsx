import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import PendingCustomerInvitesCard from '../../components/PendingCustomerInvitesCard';
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
    const { scaleFont, scaleIcon, theme, themeName } = useTheme();

    function scaleStyle<T extends Record<string, any>>(style: T): T {
        const scaledStyle: Record<string, any> = { ...style };

        Object.entries(style).forEach(([key, value]) => {
            if (typeof value !== 'number') return;

            if (key === 'fontSize' || key === 'lineHeight') {
                scaledStyle[key] = scaleFont(value);
            }

            if (
                key === 'padding' ||
                key === 'paddingBottom' ||
                key === 'paddingVertical' ||
                key === 'paddingHorizontal' ||
                key === 'marginTop' ||
                key === 'marginBottom' ||
                key === 'gap' ||
                key === 'minWidth' ||
                key === 'minHeight' ||
                key === 'width' ||
                key === 'height' ||
                key === 'borderRadius'
            ) {
                scaledStyle[key] = scaleIcon(value);
            }
        });

        return scaledStyle as T;
    }
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
            contentContainerStyle={{ padding: scaleIcon(24), alignItems: 'center', paddingBottom: 44 }}
        >
            <View style={{ width: '100%', maxWidth: 900, marginTop: scaleIcon(50) }}>
                <Text
                    onPress={() => router.push('/' as any)}
                    style={{
                        fontSize: scaleFont(18),
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginBottom: scaleIcon(20),
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
                        gap: scaleIcon(16),
                        marginBottom: scaleIcon(20),
                    }}
                >
                    <View style={{ flex: 1, minWidth: scaleIcon(260) }}>
                        <Text
                            style={{
                                fontSize: scaleFont(34),
                                fontWeight: '900',
                                color: theme.colors.text,
                            }}
                        >
                            Profile
                        </Text>

                        <Text
                            style={{
                                color: theme.colors.mutedText,
                                marginTop: scaleIcon(8),
                                fontSize: scaleFont(16),
                                lineHeight: scaleFont(22),
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
                            padding: scaleIcon(14),
                            minWidth: scaleIcon(220),
                        }}
                    >
                        <Text style={[scaleStyle(eyebrowStyle), { color: theme.colors.mutedText }]}>
                            Current Theme
                        </Text>
                        <Text
                            style={{
                                color: theme.colors.text,
                                fontSize: scaleFont(18),
                                fontWeight: '900',
                                marginTop: scaleIcon(4),
                            }}
                        >
                            {currentThemeLabel}
                        </Text>
                    </View>
                </View>

                <ThemedCard style={{ marginBottom: scaleIcon(18) }}>
                    <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>
                        Account
                    </Text>

                    <View style={scaleStyle(accountGridStyle)}>
                        <View
                            style={[
                                scaleStyle(accountInfoBoxStyle),
                                {
                                    backgroundColor: theme.colors.surfaceAlt,
                                    borderColor: theme.colors.border,
                                    borderRadius: theme.radii.button,
                                },
                            ]}
                        >
                            <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>
                                Status
                            </Text>
                            <Text style={[scaleStyle(valueStyle), { color: theme.colors.text }]}>
                                {message}
                            </Text>
                        </View>

                        <View
                            style={[
                                scaleStyle(accountInfoBoxStyle),
                                {
                                    backgroundColor: theme.colors.surfaceAlt,
                                    borderColor: theme.colors.border,
                                    borderRadius: theme.radii.button,
                                },
                            ]}
                        >
                            <Text style={[scaleStyle(labelStyle), { color: theme.colors.mutedText }]}>
                                Email
                            </Text>
                            <Text style={[scaleStyle(valueStyle), { color: theme.colors.text }]}>
                                {email || 'No email found'}
                            </Text>
                        </View>
                    </View>
                </ThemedCard>

                <PendingCustomerInvitesCard compact />

                <Text
                    style={{
                        color: theme.colors.text,
                        fontSize: scaleFont(22),
                        fontWeight: '900',
                        marginBottom: scaleIcon(12),
                    }}
                >
                    Settings
                </Text>

                <View style={scaleStyle(settingsGridStyle)}>
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
                        title="Reset / Start Fresh"
                        body="Restart the HomeOS setup flow or prepare a safe home reset when a profile was created wrong."
                        route="/data/reset-home"
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
                        scaleStyle(logoutButtonStyle),
                        {
                            backgroundColor: theme.colors.dangerBackground,
                            borderColor: theme.colors.danger,
                            borderRadius: theme.radii.button,
                        },
                    ]}
                >
                    <Text style={[scaleStyle(logoutTextStyle), { color: theme.colors.danger }]}>
                        Logout
                    </Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

function SettingsCard({ title, body, route, badge }: SettingsCardProps) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <ThemedCard
            onPress={() => router.push(route as any)}
            style={{
                flexGrow: 1,
                flexBasis: 260,
                minHeight: scaleIcon(160),
            }}
        >
            <View style={{ flex: 1, justifyContent: 'space-between', gap: scaleIcon(14) }}>
                <View>
                    <View
                        style={{
                            flexDirection: 'row',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: scaleIcon(12),
                        }}
                    >
                        <Text
                            style={{
                                color: theme.colors.text,
                                fontSize: scaleFont(19),
                                fontWeight: '900',
                                flex: 1,
                            }}
                        >
                            {title}
                        </Text>

                        <Text
                            style={{
                                color: theme.colors.mutedText,
                                fontSize: scaleFont(20),
                                fontWeight: '900',
                            }}
                        >{'>'}</Text>
                    </View>

                    <Text
                        style={{
                            color: theme.colors.mutedText,
                            fontSize: scaleFont(15),
                            lineHeight: scaleFont(21),
                            marginTop: scaleIcon(8),
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
                            paddingHorizontal: scaleIcon(12),
                            paddingVertical: scaleIcon(8),
                        }}
                    >
                        <Text
                            style={{
                                color: theme.colors.secondaryButtonText,
                                fontSize: scaleFont(13),
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
