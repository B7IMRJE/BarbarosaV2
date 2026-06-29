import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { useTheme } from '../../theme/useTheme';

export default function CreateMaintenanceRecordScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: scaleFont(34), fontWeight: '900' }}>
                    Maintenance Records Coming Soon
                </Text>
                <Text
                    style={{
                        color: theme.colors.mutedText,
                        marginTop: scaleIcon(8),
                        marginBottom: scaleIcon(20),
                        lineHeight: scaleFont(22),
                    }}
                >
                    Historical maintenance records are not enabled yet. For now, add maintenance reminders from the item that needs service.
                </Text>

                <ThemedCard style={{ marginBottom: scaleIcon(14) }}>
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(20), fontWeight: '900' }}>
                        Add reminders from an item
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, marginTop: scaleIcon(8), lineHeight: scaleFont(20) }}>
                        Open equipment, fixtures, or another HomeOS item, then use its maintenance reminder controls to add presets or custom reminders.
                    </Text>
                </ThemedCard>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
                    <ThemedButton title="Back to Maintenance Center" onPress={() => router.replace('/maintenance')} />
                    <ThemedButton title="Open Equipment" variant="secondary" onPress={() => router.push('/equipment')} />
                    <ThemedButton title="Open Home Health" variant="secondary" onPress={() => router.push('/home-health')} />
                </View>
            </View>
        </ScrollView>
    );
}
