import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { DEFAULT_THEME_NAME, themeOptions, type HomeOSTheme } from '../../theme';
import { useTheme } from '../../theme/useTheme';

function ThemeSwatches({ option }: { option: HomeOSTheme }) {
    const swatches = [
        option.colors.background,
        option.colors.surface,
        option.colors.primary,
        option.colors.status.good.background,
        option.colors.status.notInspected.background,
        option.colors.status.needsAttention.background,
        option.colors.status.emergency.background,
    ];

    return (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {swatches.map((color, index) => (
                <View
                    key={`${option.name}-${color}-${index}`}
                    style={{
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        backgroundColor: color,
                        borderWidth: 1,
                        borderColor: option.colors.border,
                    }}
                />
            ))}
        </View>
    );
}

function ThemePreview({ option }: { option: HomeOSTheme }) {
    return (
        <View
            style={{
                marginTop: 14,
                borderRadius: option.radii.card,
                borderWidth: 1,
                borderColor: option.colors.border,
                backgroundColor: option.colors.background,
                padding: 12,
                gap: 10,
            }}
        >
            <View
                style={{
                    borderRadius: Math.max(10, option.radii.card - 8),
                    backgroundColor: option.colors.surface,
                    borderWidth: 1,
                    borderColor: option.colors.border,
                    padding: 12,
                    gap: 10,
                }}
            >
                <View
                    style={{
                        height: 10,
                        width: '58%',
                        borderRadius: 999,
                        backgroundColor: option.colors.text,
                    }}
                />
                <View
                    style={{
                        height: 8,
                        width: '82%',
                        borderRadius: 999,
                        backgroundColor: option.colors.mutedText,
                        opacity: 0.65,
                    }}
                />
                <View
                    style={{
                        flexDirection: 'row',
                        gap: 8,
                        flexWrap: 'wrap',
                    }}
                >
                    <View
                        style={{
                            minWidth: 72,
                            height: 30,
                            borderRadius: option.radii.button,
                            backgroundColor: option.colors.primary,
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingHorizontal: 10,
                        }}
                    >
                        <Text
                            style={{
                                color: option.colors.primaryText,
                                fontSize: 11,
                                fontWeight: '900',
                            }}
                        >
                            Button
                        </Text>
                    </View>
                    <View
                        style={{
                            minWidth: 72,
                            height: 30,
                            borderRadius: option.radii.button,
                            backgroundColor: option.colors.secondaryButton,
                            borderWidth: 1,
                            borderColor: option.colors.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingHorizontal: 10,
                        }}
                    >
                        <Text
                            style={{
                                color: option.colors.secondaryButtonText,
                                fontSize: 11,
                                fontWeight: '900',
                            }}
                        >
                            Action
                        </Text>
                    </View>
                </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
                <View
                    style={{
                        flex: 1,
                        height: 18,
                        borderRadius: 999,
                        backgroundColor: option.colors.status.good.background,
                        borderWidth: 1,
                        borderColor: option.colors.status.good.border,
                    }}
                />
                <View
                    style={{
                        flex: 1,
                        height: 18,
                        borderRadius: 999,
                        backgroundColor: option.colors.status.needsAttention.background,
                        borderWidth: 1,
                        borderColor: option.colors.status.needsAttention.border,
                    }}
                />
                <View
                    style={{
                        flex: 1,
                        height: 18,
                        borderRadius: 999,
                        backgroundColor: option.colors.status.emergency.background,
                        borderWidth: 1,
                        borderColor: option.colors.status.emergency.border,
                    }}
                />
            </View>
        </View>
    );
}

export default function ThemeScreen() {
        const { theme, themeName, setThemeName } = useTheme();
    const isDefaultTheme = themeName === DEFAULT_THEME_NAME;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 980, marginTop: 50 }}>
                <Text
                    onPress={() => router.push('/profile' as any)}
                    style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginBottom: 20,
                    }}
                >
                    Back
                </Text>

                <View
                    style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 16,
                        flexWrap: 'wrap',
                    }}
                >
                    <View style={{ flex: 1, minWidth: 260 }}>
                        <Text
                            style={{
                                fontSize: 34,
                                fontWeight: '900',
                                color: theme.colors.text,
                            }}
                        >
                            Theme
                        </Text>

                        <Text
                            style={{
                                color: theme.colors.mutedText,
                                marginTop: 8,
                                marginBottom: 24,
                                fontSize: 16,
                                lineHeight: 22,
                            }}
                        >
                            Choose how HomeOS looks on this device. Your selection
                            is saved locally, so each device can have its own look.
                        </Text>
                    </View>

                    <View
                        style={{
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            borderWidth: 1,
                            borderRadius: theme.radii.card,
                            padding: 14,
                            minWidth: 210,
                        }}
                    >
                        <Text
                            style={{
                                color: theme.colors.mutedText,
                                fontSize: 12,
                                fontWeight: '900',
                                textTransform: 'uppercase',
                                letterSpacing: 0.8,
                            }}
                        >
                            Current Theme
                        </Text>
                        <Text
                            style={{
                                color: theme.colors.text,
                                fontSize: 18,
                                fontWeight: '900',
                                marginTop: 4,
                            }}
                        >
                            {themeOptions.find((option) => option.name === themeName)?.label ||
                                themeName}
                        </Text>
                    </View>
                </View>

                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 14,
                        alignItems: 'stretch',
                    }}
                >
                    {themeOptions.map((option) => {
                        const isSelected = option.name === themeName;

                        return (
                            <ThemedCard
                                key={option.name}
                                onPress={() => setThemeName(option.name)}
                                style={{
                                    flexGrow: 1,
                                    flexBasis: 290,
                                    borderColor: isSelected
                                        ? theme.colors.primary
                                        : theme.colors.border,
                                    borderWidth: isSelected ? 2 : 1,
                                }}
                            >
                                <View style={{ gap: 12 }}>
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'flex-start',
                                            justifyContent: 'space-between',
                                            gap: 12,
                                        }}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text
                                                style={{
                                                    color: theme.colors.text,
                                                    fontSize: 18,
                                                    fontWeight: '900',
                                                }}
                                            >
                                                {option.label}
                                            </Text>
                                            <Text
                                                style={{
                                                    color: isSelected
                                                        ? theme.colors.primary
                                                        : theme.colors.mutedText,
                                                    marginTop: 6,
                                                    fontWeight: '900',
                                                }}
                                            >
                                                {isSelected ? 'Selected on this device' : 'Tap to apply'}
                                            </Text>
                                        </View>

                                        <View
                                            style={{
                                                width: 34,
                                                height: 34,
                                                borderRadius: 999,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                backgroundColor: isSelected
                                                    ? theme.colors.primary
                                                    : theme.colors.secondaryButton,
                                                borderWidth: 1,
                                                borderColor: isSelected
                                                    ? theme.colors.primary
                                                    : theme.colors.border,
                                            }}
                                        >
                                            <Text
                                                style={{
                                                    color: isSelected
                                                        ? theme.colors.primaryText
                                                        : theme.colors.mutedText,
                                                    fontWeight: '900',
                                                    fontSize: 16,
                                                }}
                                            >
                                                {isSelected ? '✓' : ''}
                                            </Text>
                                        </View>
                                    </View>

                                    <ThemeSwatches option={option} />
                                    <ThemePreview option={option} />
                                </View>
                            </ThemedCard>
                        );
                    })}
                </View>

                <ThemedButton
                    title="Reset To HomeOS Classic"
                    variant="secondary"
                    disabled={isDefaultTheme}
                    onPress={() => setThemeName(DEFAULT_THEME_NAME)}
                    style={{ marginTop: 18 }}
                />

                <ThemedButton
                    title="Back To Profile"
                    variant="secondary"
                    onPress={() => router.push('/profile' as any)}
                    style={{ marginTop: 18 }}
                />
            </View>
        </ScrollView>
    );
}
