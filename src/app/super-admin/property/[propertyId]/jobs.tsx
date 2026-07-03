import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import AdminNavBar from '../../../../components/AdminNavBar';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import { useTheme } from '../../../../theme/useTheme';

export default function SuperAdminPropertyJobsScreen() {
    const { theme } = useTheme();
    const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
    const propertyDashboardRoute = `/super-admin/property/${propertyId || ''}` as Href;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900, minWidth: 0 }}>
                <AdminNavBar backFallback={propertyDashboardRoute} />

                <Text style={[titleStyle, { color: theme.colors.text }]}>Property Jobs</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Property ID: {propertyId || 'Unavailable'}
                </Text>

                <ThemedCard>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Jobs Coming Soon</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        Super Admin job history for this property has not been built yet.
                    </Text>
                    <ThemedButton
                        title="Back to Property Dashboard"
                        onPress={() => router.replace(propertyDashboardRoute)}
                        variant="secondary"
                        style={{ marginTop: 16 }}
                    />
                </ThemedCard>
            </View>
        </ScrollView>
    );
}

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const subtitleStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 24,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};
