import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { useTheme } from '../../theme/useTheme';

const confirmationText = 'DELETE MY HOME DATA';

export default function DeleteHomeDataScreen() {
    const { theme } = useTheme();
    const [confirmation, setConfirmation] = useState('');
    const canContinue = confirmation === confirmationText;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: 34, fontWeight: '900' }}>
                    Delete My Home Data
                </Text>
                <Text style={{ color: theme.colors.mutedText, fontSize: 16, lineHeight: 22, marginTop: 8, marginBottom: 20 }}>
                    Your data belongs to you. Export before deleting.
                </Text>

                <ThemedCard
                    style={{
                        borderColor: theme.colors.danger,
                        backgroundColor: theme.colors.dangerBackground,
                        marginBottom: 16,
                    }}
                >
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Warning
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, lineHeight: 22, marginTop: 10 }}>
                        This future action will remove your homeowner home data, including home items, files, emergency records, and maintenance records.
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, lineHeight: 22, marginTop: 10 }}>
                        No deletion happens on this page yet.
                    </Text>
                </ThemedCard>

                <Text style={{ color: theme.colors.text, fontWeight: '900', marginBottom: 8 }}>
                    Type {confirmationText} to enable the button.
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
                    title="Delete Coming Soon"
                    disabled={!canContinue}
                    variant="danger"
                />
            </View>
        </ScrollView>
    );
}
