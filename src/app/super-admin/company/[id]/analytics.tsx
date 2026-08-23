import { Stack } from 'expo-router';
import CompanyAnalyticsScreen from '../../../../features/company-management/CompanyAnalyticsScreen';

export default function CompanyAnalyticsRoute() {
    return (
        <>
            <Stack.Screen options={{ title: 'Analytics' }} />
            <CompanyAnalyticsScreen />
        </>
    );
}
