import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTheme } from '../../../../../../theme/useTheme';

export default function ClientHomeOsProviderRedirectScreen() {
    const { theme } = useTheme();
    const { id, propertyId } = useLocalSearchParams<{
        id: string;
        propertyId: string;
    }>();
    const companyId = String(id || '');
    const clientPropertyId = String(propertyId || '');

    useEffect(() => {
        if (!companyId || !clientPropertyId) return;

        router.replace({
            pathname: '/',
            params: {
                providerMode: '1',
                companyId,
                propertyId: clientPropertyId,
                returnTo: `/super-admin/company/${companyId}/client/${clientPropertyId}`,
            },
        } as never);
    }, [companyId, clientPropertyId]);

    return (
        <View style={[wrapStyle, { backgroundColor: theme.colors.background }]}>
            <ActivityIndicator size="large" />
            <Text style={[messageStyle, { color: theme.colors.mutedText }]}>
                Opening client HomeOS in provider mode...
            </Text>
        </View>
    );
}

const wrapStyle = {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 24,
};

const messageStyle = {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '800' as const,
    textAlign: 'center' as const,
};
