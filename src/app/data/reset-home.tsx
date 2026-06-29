import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

const confirmationText = 'RESET';

type ResetHomeResult = {
    property_id?: string | null;
    reset_status?: string | null;
    message?: string | null;
};

export default function ResetHomeSetupScreen() {
    const { theme } = useTheme();
    const [confirmation, setConfirmation] = useState('');
    const [message, setMessage] = useState('');
    const [resetting, setResetting] = useState(false);
    const [resetComplete, setResetComplete] = useState(false);
    const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const canReset = confirmation.trim().toUpperCase() === confirmationText;

    useEffect(() => {
        return () => {
            if (redirectTimeoutRef.current) {
                clearTimeout(redirectTimeoutRef.current);
            }
        };
    }, []);

    async function resetActiveHome() {
        if (!canReset || resetting || resetComplete) return;

        setResetting(true);
        setMessage('Resetting this active home...');

        const { data, error } = await supabase.rpc('reset_active_home_for_testing', {
            p_confirmation: confirmationText,
        });

        setResetting(false);

        if (error) {
            setMessage(error.message);
            return;
        }

        const result = firstResetResult(data);
        setResetComplete(true);
        setConfirmation('');
        setMessage(result?.message || 'Home reset. Starting fresh...');

        redirectTimeoutRef.current = setTimeout(() => {
            redirectTimeoutRef.current = null;
            router.replace('/onboarding/create-home' as never);
        }, 1000);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: 34, fontWeight: '900' }}>
                    Reset / Start Fresh
                </Text>
                <Text style={{ color: theme.colors.mutedText, fontSize: 16, lineHeight: 22, marginTop: 8, marginBottom: 20 }}>
                    Restart HomeOS setup safely when a home was created wrong, the customer moved, or the customer wants to rebuild the profile from the beginning.
                </Text>

                <ThemedCard style={{ marginBottom: 16 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>
                        Recommended: Start Setup Wizard Again
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 15, lineHeight: 22, marginTop: 10 }}>
                        This does not delete the existing home data yet. It takes the customer back to the setup flow so they can create or rebuild a cleaner HomeOS profile.
                    </Text>

                    <ThemedButton
                        title="Start Setup Wizard"
                        onPress={() => router.push('/onboarding/base-home-wizard' as never)}
                        style={{ marginTop: 16, alignSelf: 'flex-start' }}
                    />

                </ThemedCard>

                <ThemedCard
                    style={{
                        borderColor: theme.colors.danger,
                        backgroundColor: theme.colors.dangerBackground,
                        marginBottom: 16,
                    }}
                >
                    <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>
                        Reset This Home
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 15, lineHeight: 22, marginTop: 10 }}>
                        This removes data for this signed-in account's single active HomeOS home only. It does not delete your account, login, or profile.
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 15, lineHeight: 22, marginTop: 10 }}>
                        Use this for testing start-fresh flows. Export or download anything important first.
                    </Text>

                    <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 18, marginBottom: 8 }}>
                        Type RESET to enable the active home reset.
                    </Text>
                    <TextInput
                        value={confirmation}
                        onChangeText={(value) => {
                            setConfirmation(value);
                            if (!resetComplete) setMessage('');
                        }}
                        autoCapitalize="characters"
                        placeholder={confirmationText}
                        placeholderTextColor={theme.colors.mutedText}
                        editable={!resetting && !resetComplete}
                        style={{
                            color: theme.colors.text,
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            borderWidth: 1,
                            borderRadius: 16,
                            padding: 16,
                            fontSize: 16,
                            marginBottom: 16,
                        }}
                    />

                    <ThemedButton
                        title={resetting ? 'Resetting...' : resetComplete ? 'Home Reset' : 'Reset This Home'}
                        disabled={!canReset || resetting || resetComplete}
                        variant="danger"
                        onPress={resetActiveHome}
                    />

                    {!!message && (
                        <Text style={{ color: theme.colors.mutedText, fontSize: 14, lineHeight: 20, marginTop: 12, fontWeight: '800' }}>
                            {message}
                        </Text>
                    )}
                </ThemedCard>

                <ThemedButton
                    title="Back to Data Ownership"
                    variant="secondary"
                    onPress={() => router.push('/data' as any)}
                    style={{ alignSelf: 'flex-start' }}
                />
            </View>
        </ScrollView>
    );
}

function firstResetResult(data: unknown) {
    if (Array.isArray(data)) {
        return (data[0] || null) as ResetHomeResult | null;
    }

    return (data || null) as ResetHomeResult | null;
}
