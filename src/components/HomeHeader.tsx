import { router } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { BUILD_DISPLAY } from '../lib/appVersion';
import { useTheme } from '../theme/useTheme';

export default function HomeHeader() {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View
            style={{
                marginTop: scaleIcon(20),
                marginBottom: scaleIcon(20),
                gap: scaleIcon(6),
            }}
        >
            <View
                style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: scaleIcon(20),
                    alignItems: 'center',
                }}
            >
                <TouchableOpacity onPress={() => router.push('/')}>
                    <Text
                        style={{
                            fontSize: scaleFont(18),
                            fontWeight: '900',
                            color: theme.colors.text,
                        }}
                    >
                        Home
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.back()}>
                    <Text
                        style={{
                            fontSize: scaleFont(18),
                            fontWeight: '900',
                            color: theme.colors.text,
                        }}
                    >
                        Back
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
                        fontSize: scaleFont(11),
                        fontWeight: '700',
                        lineHeight: scaleFont(15),
                        textAlign: 'right',
                    }}
                >
                    {BUILD_DISPLAY}
                </Text>
            </View>
        </View>
    );
}
