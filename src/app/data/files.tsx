import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { useTheme } from '../../theme/useTheme';

export default function DownloadHomeFilesScreen() {
    const { theme } = useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: 34, fontWeight: '900' }}>
                    Download Documents & Photos
                </Text>
                <Text style={{ color: theme.colors.mutedText, fontSize: 16, lineHeight: 22, marginTop: 8, marginBottom: 20 }}>
                    Back up your documents and photos before deleting anything.
                </Text>

                <ThemedCard style={{ marginBottom: 16 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Planned file backup
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, lineHeight: 22, marginTop: 10 }}>
                        This will collect homeowner photos and documents from item, emergency, and maintenance records.
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, lineHeight: 22, marginTop: 10 }}>
                        No files are downloaded in this front-end shell.
                    </Text>
                </ThemedCard>

                <ThemedButton title="Download Coming Soon" disabled />
            </View>
        </ScrollView>
    );
}
