import { Text, View } from 'react-native';
import { BUILD_DISPLAY } from '../lib/appVersion';
import { useTheme } from '../theme/useTheme';

export default function HomeHeader() {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View
            style={{
                marginBottom: scaleIcon(14),
                alignItems: 'flex-end',
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
    );
}
