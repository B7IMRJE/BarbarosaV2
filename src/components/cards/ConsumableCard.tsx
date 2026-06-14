import { Pressable, Text, View } from 'react-native';
import { type HomeOSTheme } from '../../theme';
import { useTheme } from '../../theme/useTheme';

type ConsumableCardProps = {
    title: string;
    status: string;
    daysRemaining: number;
    onPress?: () => void;
};

export default function ConsumableCard({
    title,
    status,
    daysRemaining,
    onPress,
}: ConsumableCardProps) {
    const { theme } = useTheme();

    let statusText = 'Good';
    let statusStyle = theme.colors.status.good;

    if (daysRemaining <= 30) {
        statusText = 'Due Soon';
        statusStyle = theme.colors.status.notInspected;
    }

    if (daysRemaining <= 0) {
        statusText = 'Action Required';
        statusStyle = theme.colors.status.emergency;
    }

    return (
        <Pressable
            onPress={onPress}
            style={{
                backgroundColor: theme.colors.surface,
                padding: 20,
                borderRadius: theme.radii.card,
                marginBottom: 15,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderLeftWidth: 8,
                borderLeftColor: statusStyle.border,
            }}
        >
            <Text
                style={{
                    fontSize: 22,
                    fontWeight: 'bold',
                    marginBottom: 10,
                    color: theme.colors.text,
                }}
            >
                {title}
            </Text>

            <Text
                style={{
                    fontSize: 16,
                    marginBottom: 6,
                    color: theme.colors.text,
                }}
            >
                {status}
            </Text>

            <Text
                style={{
                    fontSize: 15,
                    color: theme.colors.text,
                    fontWeight: 'bold',
                    marginBottom: 15,
                }}
            >
                {statusText}
            </Text>

            <View
                style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 8,
                }}
            >
                <View
                    style={chipStyle(theme, 'primary')}
                >
                    <Text style={{ color: theme.colors.primaryText }}>
                        Completed
                    </Text>
                </View>

                <View
                    style={chipStyle(theme, 'secondary')}
                >
                    <Text style={{ color: theme.colors.secondaryButtonText }}>
                        Snooze
                    </Text>
                </View>

                <View
                    style={chipStyle(theme, 'muted')}
                >
                    <Text style={{ color: theme.colors.mutedText }}>
                        Ignore
                    </Text>
                </View>

                <View
                    style={chipStyle(theme, 'status')}
                >
                    <Text style={{ color: theme.colors.text }}>
                        Service
                    </Text>
                </View>
            </View>
        </Pressable>
    );
}

function chipStyle(theme: HomeOSTheme, variant: 'primary' | 'secondary' | 'muted' | 'status') {
    const backgroundColor =
        variant === 'primary'
            ? theme.colors.primary
            : variant === 'secondary'
                ? theme.colors.secondaryButton
                : variant === 'status'
                    ? theme.colors.status.good.background
                    : theme.colors.surfaceAlt;

    const borderColor =
        variant === 'primary'
            ? theme.colors.primary
            : variant === 'status'
                ? theme.colors.status.good.border
                : theme.colors.border;

    return {
        backgroundColor,
        borderColor,
        borderWidth: 1,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: theme.radii.button,
    };
}
