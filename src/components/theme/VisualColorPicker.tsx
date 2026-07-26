import { createElement } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';

const suggestedColors = [
    '#03182A',
    '#043F69',
    '#075748',
    '#075E68',
    '#2F526B',
    '#31566F',
    '#2FA5B3',
    '#38B7C7',
    '#72B58C',
    '#C9A84C',
    '#C48756',
    '#E8F4F8',
];

export default function VisualColorPicker({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (color: string) => void;
}) {
    const { theme } = useTheme();

    return (
        <View style={{ flex: 1, minWidth: 220 }}>
            <Text
                style={{
                    color: theme.colors.mutedText,
                    fontSize: 12,
                    fontWeight: '900',
                    marginBottom: 8,
                }}
            >
                {label.toUpperCase()}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                {Platform.OS === 'web' &&
                    createElement('input', {
                        'aria-label': label,
                        type: 'color',
                        value,
                        onChange: (event: { target: { value: string } }) =>
                            onChange(event.target.value.toUpperCase()),
                        style: {
                            appearance: 'none',
                            background: 'transparent',
                            border: 0,
                            cursor: 'pointer',
                            height: 52,
                            padding: 0,
                            width: 72,
                        },
                    })}

                {suggestedColors.map((color) => {
                    const selected = color === value.toUpperCase();
                    return (
                        <TouchableOpacity
                            key={color}
                            accessibilityLabel={`Choose ${color}`}
                            accessibilityRole="button"
                            onPress={() => onChange(color)}
                            style={{
                                backgroundColor: color,
                                borderColor: selected ? '#FFFFFF' : 'rgba(255,255,255,0.44)',
                                borderRadius: 999,
                                borderWidth: selected ? 3 : 1,
                                boxShadow: selected ? '0 0 0 2px rgba(56,183,199,0.8)' : undefined,
                                height: 34,
                                width: 34,
                            }}
                        />
                    );
                })}
            </View>
        </View>
    );
}
