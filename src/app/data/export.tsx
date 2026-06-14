import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { useTheme } from '../../theme/useTheme';

export default function ExportHomeDataScreen() {
    const { theme } = useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: 34, fontWeight: '900' }}>
                    Export My Home Data
                </Text>
                <Text style={{ color: theme.colors.mutedText, fontSize: 16, lineHeight: 22, marginTop: 8, marginBottom: 20 }}>
                    Your data belongs to you. Export before deleting.
                </Text>

                <ThemedCard style={{ marginBottom: 16 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Planned export contents
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, lineHeight: 22, marginTop: 10 }}>
                        Profile details, home items, item file records, emergency records, maintenance records, and future homeowner-owned records.
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, lineHeight: 22, marginTop: 10 }}>
                        Photos and documents will be included in a later server-side export package.
                    </Text>
                </ThemedCard>

                <ThemedButton title="Export Coming Soon" disabled />
            </View>
        </ScrollView>
    );
}
