import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

export default function WaterServiceScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();

    useEffect(() => {
        router.replace('/system/plumbing' as never);
    }, []);

    return (
        <View
            style={{
                flex: 1,
                alignItems: 'center',
                justifyContent: 'center',
                gap: scaleIcon(12),
                padding: scaleIcon(20),
                backgroundColor: theme.colors.background,
            }}
        >
            <ActivityIndicator />
            <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(16), fontWeight: '900' }}>
                Opening Water Service...
            </Text>
        </View>
    );
}
