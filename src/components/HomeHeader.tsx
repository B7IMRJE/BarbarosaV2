import { router } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { BUILD_DISPLAY } from '../lib/appVersion';
import { useTheme } from '../theme/useTheme';

export default function HomeHeader() {
    const { theme } = useTheme();

    return (
        <View
            style={{
                marginTop: 20,
                marginBottom: 20,
                gap: 6,
            }}
        >
            <View
                style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 20,
                    alignItems: 'center',
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

            <View
                style={{
                    alignSelf: 'flex-end',
                    maxWidth: '100%',
                }}
            >
                <Text
                    style={{
                        color: theme.colors.mutedText,
                        fontSize: 11,
                        fontWeight: '700',
                        lineHeight: 15,
                        textAlign: 'right',
                    }}
                >
                    {BUILD_DISPLAY}
                </Text>
            </View>
        </View>
    );
}
