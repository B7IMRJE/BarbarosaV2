import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    AUTO_LOGOUT_OPTIONS,
    type AutoLogoutMinutes,
    clearSessionActivity,
    getSessionSecuritySettings,
    setAutoLogoutMinutes,
    setStaySignedIn,
} from '../../lib/sessionSecurity';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

export default function SessionSecurityScreen() {
    const { theme } = useTheme();
    const [staySignedInValue, setStaySignedInValue] = useState(true);
    const [autoLogoutMinutesValue, setAutoLogoutMinutesValue] =
        useState<AutoLogoutMinutes | null>(null);
    const [message, setMessage] = useState('Loading session security...');

    useEffect(() => {
        loadSettings();
    }, []);

    async function loadSettings() {
        const settings = await getSessionSecuritySettings();

        setStaySignedInValue(settings.staySignedIn);
        setAutoLogoutMinutesValue(settings.autoLogoutMinutes);
        setMessage('Settings saved on this device.');
    }

    async function chooseStaySignedIn() {
        await setStaySignedIn(true);
        setStaySignedInValue(true);
        setAutoLogoutMinutesValue(null);
        setMessage('HomeOS will keep you signed in on this device.');
    }

    async function chooseAutoLogout(minutes: AutoLogoutMinutes | null) {
        await setAutoLogoutMinutes(minutes);
        setAutoLogoutMinutesValue(minutes);
        setStaySignedInValue(minutes === null);
        setMessage(minutes === null ? 'Auto logout is off.' : `Auto logout set to ${labelForMinutes(minutes)}.`);
    }

    async function handleManualLogout() {
        await clearSessionActivity();
        await supabase.auth.signOut();
        router.replace('/auth/login' as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 700, marginTop: 50 }}>
                <Text
                    onPress={() => router.push('/profile' as any)}
                    style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginBottom: 20,
                    }}
                >
                    Back
                </Text>

                <Text
                    style={{
                        fontSize: 34,
                        fontWeight: '900',
                        color: theme.colors.text,
                    }}
                >
                    Session Security
                </Text>

                <Text
                    style={{
                        color: theme.colors.mutedText,
                        marginTop: 8,
                        marginBottom: 24,
                        fontSize: 16,
                        lineHeight: 22,
                    }}
                >
                    Choose how long HomeOS keeps you signed in.
                </Text>

                <ThemedCard
                    onPress={chooseStaySignedIn}
                    style={{
                        borderColor: staySignedInValue ? theme.colors.primary : theme.colors.border,
                        borderWidth: staySignedInValue ? 2 : 1,
                        marginBottom: 16,
                    }}
                >
                    <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                        Stay Signed In
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, marginTop: 6, lineHeight: 20 }}>
                        Default. HomeOS will keep your session active unless you manually log out,
                        change your password, delete your account, or Supabase ends the session.
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, marginTop: 10, fontWeight: '900' }}>
                        {staySignedInValue ? 'Selected' : 'Tap to select'}
                    </Text>
                </ThemedCard>

                <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900', marginBottom: 12 }}>
                    Auto Logout
                </Text>

                <View style={{ gap: 10 }}>
                    {AUTO_LOGOUT_OPTIONS.map((option) => {
                        const isSelected = option.minutes === autoLogoutMinutesValue;

                        return (
                            <ThemedCard
                                key={option.label}
                                onPress={() => chooseAutoLogout(option.minutes)}
                                style={{
                                    padding: 16,
                                    borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                                    borderWidth: isSelected ? 2 : 1,
                                }}
                            >
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                    }}
                                >
                                    <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>
                                        {option.label}
                                    </Text>
                                    <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>
                                        {isSelected ? 'Selected' : 'Choose'}
                                    </Text>
                                </View>
                            </ThemedCard>
                        );
                    })}
                </View>

                <ThemedCard style={{ marginTop: 18 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                        Future Security Options
                    </Text>

                    <DisabledRow title="Face ID / Touch ID Coming Soon" />
                    <DisabledRow title="Sign Out All Devices Coming Soon" />
                </ThemedCard>

                <ThemedButton
                    title="Manual Logout"
                    onPress={handleManualLogout}
                    style={{ marginTop: 18 }}
                />

                <TouchableOpacity
                    onPress={() => router.push('/profile' as any)}
                    style={[
                        secondaryButtonStyle,
                        {
                            backgroundColor: theme.colors.secondaryButton,
                            borderColor: theme.colors.border,
                        },
                    ]}
                >
                    <Text style={{ color: theme.colors.secondaryButtonText, fontWeight: '900' }}>
                        Back To Profile
                    </Text>
                </TouchableOpacity>

                <Text style={{ color: theme.colors.mutedText, marginTop: 16, lineHeight: 20 }}>
                    {message}
                </Text>
            </View>
        </ScrollView>
    );
}

function DisabledRow({ title }: { title: string }) {
    const { theme } = useTheme();

    return (
        <View
            style={{
                marginTop: 14,
                paddingTop: 14,
                borderTopWidth: 1,
                borderTopColor: theme.colors.border,
            }}
        >
            <Text style={{ color: theme.colors.mutedText, fontSize: 16, fontWeight: '900' }}>
                {title}
            </Text>
        </View>
    );
}

function labelForMinutes(minutes: AutoLogoutMinutes) {
    return AUTO_LOGOUT_OPTIONS.find((option) => option.minutes === minutes)?.label || `${minutes} minutes`;
}

const secondaryButtonStyle = {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center' as const,
    marginTop: 12,
};
