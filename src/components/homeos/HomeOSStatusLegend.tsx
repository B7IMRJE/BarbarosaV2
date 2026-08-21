import { Text, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';

export default function HomeOSStatusLegend() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const items = [
        {
            label: 'Empty',
            description: 'No items added',
            colors: theme.colors.status.unknown,
            textColor: theme.colors.text,
        },
        {
            label: 'Good',
            description: 'Currently OK',
            colors: theme.colors.status.good,
            textColor: theme.colors.text,
        },
        {
            label: 'Needs Review',
            description: 'Check information',
            colors: theme.colors.status.notInspected,
            textColor: theme.colors.text,
        },
        {
            label: 'Critical',
            description: 'Urgent problem',
            colors: theme.colors.status.emergency,
            textColor: theme.colors.text,
        },
    ] as const;

    return (
        <View
            accessibilityRole="summary"
            accessibilityLabel="HomeOS card color legend: white empty, green good, yellow needs review, red critical"
            testID="homeos-status-legend"
            style={{ gap: scaleIcon(8) }}
        >
            <Text style={{ color: theme.colors.text, fontSize: scaleFont(15), fontWeight: '900' }}>
                Card color guide
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8) }}>
                {items.map((item) => (
                    <View
                        key={item.label}
                        style={{
                            flexGrow: 1,
                            flexBasis: scaleIcon(142),
                            minHeight: scaleIcon(58),
                            justifyContent: 'center',
                            borderWidth: 1,
                            borderColor: item.colors.border,
                            backgroundColor: item.colors.background,
                            borderRadius: scaleIcon(12),
                            paddingHorizontal: scaleIcon(10),
                            paddingVertical: scaleIcon(8),
                        }}
                    >
                        <Text style={{ color: item.textColor, fontSize: scaleFont(13), fontWeight: '900' }}>
                            {item.label}
                        </Text>
                        <Text style={{ color: item.textColor, opacity: 0.86, fontSize: scaleFont(11), fontWeight: '700' }}>
                            {item.description}
                        </Text>
                    </View>
                ))}
            </View>
        </View>
    );
}
