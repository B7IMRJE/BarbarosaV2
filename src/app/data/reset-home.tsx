import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { useTheme } from '../../theme/useTheme';

const confirmationText = 'RESET';

export default function ResetHomeSetupScreen() {
    const { theme } = useTheme();
    const [confirmation, setConfirmation] = useState('');
    const [message, setMessage] = useState('');
    const canReset = confirmation.trim().toUpperCase() === confirmationText;

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
                        title="Start Setup Wizard Coming Soon"
                        onPress={() =>
                            setMessage('The safe setup wizard will be added next. For now, no home data was changed.')
                        }
                        style={{ marginTop: 16, alignSelf: 'flex-start' }}
                    />

                    {!!message && (
                        <Text style={{ color: theme.colors.mutedText, fontSize: 14, lineHeight: 20, marginTop: 12, fontWeight: '800' }}>
                            {message}
                        </Text>
                    )}
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
                        This is the dangerous reset option. Later, this will archive or remove starter items, photos, files, reminders, service history, and other home-owned records for this home only.
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 15, lineHeight: 22, marginTop: 10 }}>
                        For safety, the destructive reset is not active yet. Export or download important data before this is enabled.
                    </Text>

                    <Text style={{ color: theme.colors.text, fontWeight: '900', marginTop: 18, marginBottom: 8 }}>
                        Type RESET to enable the future reset button.
                    </Text>
                    <TextInput
                        value={confirmation}
                        onChangeText={setConfirmation}
                        autoCapitalize="characters"
                        placeholder={confirmationText}
                        placeholderTextColor={theme.colors.mutedText}
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
                        title="Reset Coming Soon"
                        disabled={!canReset}
                        variant="danger"
                    />
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
