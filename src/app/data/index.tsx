import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedCard from '../../components/theme/ThemedCard';
import { useTheme } from '../../theme/useTheme';

const actions = [
    {
        title: 'Export My Home Data',
        body: 'Prepare a copy of your profile, home items, files, emergency records, and maintenance records.',
        route: '/data/export',
    },
    {
        title: 'Download Documents & Photos',
        body: 'Back up your home documents and photos before making major data changes.',
        route: '/data/files',
    },
    {
        title: 'Delete My Home Data',
        body: 'Plan to remove homeowner home data while keeping the account shell available.',
        route: '/data/delete-home',
    },
    {
        title: 'Delete My Account',
        body: 'Plan full account deletion after exporting anything you want to keep.',
        route: '/data/delete-account',
    },
];

export default function DataOwnershipCenterScreen() {
    const { theme } = useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center', paddingBottom: 40 }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ color: theme.colors.text, fontSize: 34, fontWeight: '900' }}>
                    Data Ownership Center
                </Text>
                <Text style={{ color: theme.colors.mutedText, fontSize: 16, lineHeight: 22, marginTop: 8, marginBottom: 20 }}>
                    Your data belongs to you. Export before deleting.
                </Text>

                <View style={{ gap: 12 }}>
                    {actions.map((action) => (
                        <ThemedCard
                            key={action.title}
                            onPress={() => router.push(action.route as any)}
                        >
                            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                                {action.title}
                            </Text>
                            <Text style={{ color: theme.colors.mutedText, lineHeight: 20, marginTop: 8 }}>
                                {action.body}
                            </Text>
                        </ThemedCard>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
