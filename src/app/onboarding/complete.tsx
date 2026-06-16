import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { useTheme } from '../../theme/useTheme';

export default function OnboardingCompleteScreen() {
    const { theme } = useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <ThemedCard>
                    <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>Onboarding</Text>
                    <Text style={[titleStyle, { color: theme.colors.text }]}>HomeOS setup is ready.</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        The next phase will connect invitation acceptance to first-home ownership. For now, you can
                        return to HomeOS and continue using the current homeowner flow.
                    </Text>

                    <ThemedButton
                        title="Go to HomeOS"
                        onPress={() => router.replace('/' as any)}
                        style={{ marginTop: 20 }}
                    />
                </ThemedCard>
            </View>
        </ScrollView>
    );
}

const eyebrowStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const titleStyle = {
    fontSize: 30,
    fontWeight: '900' as const,
    lineHeight: 36,
    marginTop: 8,
};

const bodyTextStyle = {
    fontSize: 16,
    fontWeight: '800' as const,
    lineHeight: 24,
    marginTop: 12,
};
