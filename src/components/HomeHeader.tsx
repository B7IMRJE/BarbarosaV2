import { router } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../theme/useTheme';

export default function HomeHeader() {
    const { theme } = useTheme();

    return (
        <View
            style={{
                flexDirection: 'row',
                gap: 20,
                alignItems: 'center',
                marginTop: 20,
                marginBottom: 20,
            }}
        >
            <TouchableOpacity onPress={() => router.push('/')}>
                <Text
                    style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: theme.colors.text,
                    }}
                >
                    🏠 Home
                </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()}>
                <Text
                    style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: theme.colors.text,
                    }}
                >
                    ← Back
                </Text>
            </TouchableOpacity>
        </View>
    );
}
