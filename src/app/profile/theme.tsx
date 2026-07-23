import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { DEFAULT_APPEARANCE_PREFERENCES, DEFAULT_THEME_NAME, appearanceSizeOptions, themeOptions, type AppearanceSizeName, type HomeOSTheme } from '../../theme';
import { useTheme } from '../../theme/useTheme';

function ThemeSwatches({ option }: { option: HomeOSTheme }) {
    const { scaleIcon } = useTheme();
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(6) }}>
            {swatches.map((color, index) => (
                <View
                    key={`${option.name}-${color}-${index}`}
                    style={{
                        width: scaleIcon(22),
                        height: scaleIcon(22),
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
    const { scaleFont, scaleIcon } = useTheme();
    return (
        <View
            style={{
                marginTop: scaleIcon(14),
                borderRadius: option.radii.card,
                borderWidth: 1,
                borderColor: option.colors.border,
                backgroundColor: option.colors.background,
                padding: scaleIcon(12),
                gap: scaleIcon(10),
            }}
        >
            <View
                style={{
                    borderRadius: Math.max(10, option.radii.card - 8),
                    backgroundColor: option.colors.surface,
                    borderWidth: 1,
                    borderColor: option.colors.border,
                    padding: scaleIcon(12),
                    gap: scaleIcon(10),
                }}
            >
                <View
                    style={{
                        height: scaleIcon(10),
                        width: '58%',
                        borderRadius: scaleIcon(999),
                        backgroundColor: option.colors.text,
                    }}
                />
                <View
                    style={{
                        height: scaleIcon(8),
                        width: '82%',
                        borderRadius: scaleIcon(999),
                        backgroundColor: option.colors.mutedText,
                        opacity: 0.65,
                    }}
                />
                <View
                    style={{
                        flexDirection: 'row',
                        gap: scaleIcon(8),
                        flexWrap: 'wrap',
                    }}
                >
                    <View
                        style={{
                            minWidth: scaleIcon(72),
                            height: scaleIcon(30),
                            borderRadius: option.radii.button,
                            backgroundColor: option.colors.primary,
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingHorizontal: scaleIcon(10),
                        }}
                    >
                        <Text
                            style={{
                                color: option.colors.primaryText,
                                fontSize: scaleFont(11),
                                fontWeight: '900',
                            }}
                        >
                            Button
                        </Text>
                    </View>
                    <View
                        style={{
                            minWidth: scaleIcon(72),
                            height: scaleIcon(30),
                            borderRadius: option.radii.button,
                            backgroundColor: option.colors.secondaryButton,
                            borderWidth: 1,
                            borderColor: option.colors.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingHorizontal: scaleIcon(10),
                        }}
                    >
                        <Text
                            style={{
                                color: option.colors.secondaryButtonText,
                                fontSize: scaleFont(11),
                                fontWeight: '900',
                            }}
                        >
                            Action
                        </Text>
                    </View>
                </View>
            </View>

            <View style={{ flexDirection: 'row', gap: scaleIcon(8) }}>
                <View
                    style={{
                        flex: 1,
                        height: scaleIcon(18),
                        borderRadius: scaleIcon(999),
                        backgroundColor: option.colors.status.good.background,
                        borderWidth: 1,
                        borderColor: option.colors.status.good.border,
                    }}
                />
                <View
                    style={{
                        flex: 1,
                        height: scaleIcon(18),
                        borderRadius: scaleIcon(999),
                        backgroundColor: option.colors.status.needsAttention.background,
                        borderWidth: 1,
                        borderColor: option.colors.status.needsAttention.border,
                    }}
                />
                <View
                    style={{
                        flex: 1,
                        height: scaleIcon(18),
                        borderRadius: scaleIcon(999),
                        backgroundColor: option.colors.status.emergency.background,
                        borderWidth: 1,
                        borderColor: option.colors.status.emergency.border,
                    }}
                />
            </View>
        </View>
    );
}

type AppearanceSizeSelectorProps = {
    title: string;
    body: string;
    value: AppearanceSizeName;
    onChange: (value: AppearanceSizeName) => Promise<void>;
};

function AppearanceSizeSelector({
    title,
    body,
    value,
    onChange,
}: AppearanceSizeSelectorProps) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View style={{ marginTop: scaleIcon(18) }}>
            <Text
                style={{
                    color: theme.colors.text,
                    fontSize: scaleFont(18),
                    fontWeight: '900',
                }}
            >
                {title}
            </Text>
            <Text
                style={{
                    color: theme.colors.mutedText,
                    fontSize: scaleFont(14),
                    lineHeight: scaleFont(20),
                    marginTop: scaleIcon(4),
                    marginBottom: scaleIcon(12),
                    fontWeight: '700',
                }}
            >
                {body}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
                {appearanceSizeOptions.map((option) => {
                    const selected = option.name === value;

                    return (
                        <ThemedCard
                            key={option.name}
                            onPress={() => {
                                void onChange(option.name);
                            }}
                            style={{
                                flexGrow: 1,
                                flexBasis: 130,
                                padding: scaleIcon(14),
                                borderColor: selected
                                    ? theme.colors.primary
                                    : theme.colors.border,
                                borderWidth: selected ? 2 : 1,
                                backgroundColor: selected
                                    ? theme.colors.secondaryButton
                                    : theme.colors.surface,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.colors.text,
                                    fontSize: scaleFont(16),
                                    fontWeight: '900',
                                }}
                            >
                                {option.label}
                            </Text>
                            <Text
                                style={{
                                    color: selected
                                        ? theme.colors.primary
                                        : theme.colors.mutedText,
                                    fontSize: scaleFont(13),
                                    fontWeight: '900',
                                    marginTop: scaleIcon(6),
                                }}
                            >
                                {Math.round(option.scale * 100)}%
                            </Text>
                        </ThemedCard>
                    );
                })}
            </View>
        </View>
    );
}

function AppearancePreview() {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View
            style={{
                marginTop: scaleIcon(14),
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.border,
                borderWidth: 1,
                borderRadius: theme.radii.card,
                padding: scaleIcon(14),
                flexDirection: 'row',
                alignItems: 'center',
                gap: scaleIcon(14),
                flexWrap: 'wrap',
            }}
        >
            <View
                style={{
                    width: scaleIcon(48),
                    height: scaleIcon(48),
                    borderRadius: theme.radii.pill,
                    backgroundColor: theme.colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Text
                    style={{
                        color: theme.colors.primaryText,
                        fontSize: scaleFont(18),
                        fontWeight: '900',
                    }}
                >
                    Aa
                </Text>
            </View>

            <View style={{ flex: 1, minWidth: scaleIcon(220) }}>
                <Text
                    style={{
                        color: theme.colors.text,
                        fontSize: scaleFont(20),
                        fontWeight: '900',
                    }}
                >
                    Preview size
                </Text>
                <Text
                    style={{
                        color: theme.colors.mutedText,
                        fontSize: scaleFont(14),
                        lineHeight: scaleFont(20),
                        marginTop: scaleIcon(4),
                        fontWeight: '700',
                    }}
                >
                    Font and icon sizes are saved on this device.
                </Text>
            </View>
        </View>
    );
}
export default function ThemeScreen() {
        const {
        appearance,
        resetAppearance,
        setFontSize,
        setIconSize,
        theme,
        themeName,
        setThemeName,
    } = useTheme();
    const isDefaultTheme = themeName === DEFAULT_THEME_NAME;
    const isDefaultAppearance =
        appearance.fontSize === DEFAULT_APPEARANCE_PREFERENCES.fontSize &&
        appearance.iconSize === DEFAULT_APPEARANCE_PREFERENCES.iconSize;

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
                            Choose how HomeOS looks. Your selection follows your
                            signed-in HomeOS account on every device.
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
                <ThemedCard style={{ marginBottom: 18 }}>
                    <View
                        style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 14,
                            flexWrap: 'wrap',
                        }}
                    >
                        <View style={{ flex: 1, minWidth: 260 }}>
                            <Text
                                style={{
                                    color: theme.colors.text,
                                    fontSize: 24,
                                    fontWeight: '900',
                                }}
                            >
                                Size Preferences
                            </Text>
                            <Text
                                style={{
                                    color: theme.colors.mutedText,
                                    fontSize: 15,
                                    lineHeight: 21,
                                    marginTop: 6,
                                    fontWeight: '700',
                                }}
                            >
                                Adjust HomeOS font and icon sizes for this device.
                            </Text>
                        </View>

                        <ThemedButton
                            title="Reset Sizes"
                            variant="secondary"
                            disabled={isDefaultAppearance}
                            onPress={() => {
                                void resetAppearance();
                            }}
                            style={{ minWidth: 150 }}
                        />
                    </View>

                    <AppearancePreview />

                    <AppearanceSizeSelector
                        title="Font Size"
                        body="Controls text size in screens that use HomeOS appearance scaling."
                        value={appearance.fontSize}
                        onChange={setFontSize}
                    />

                    <AppearanceSizeSelector
                        title="Icon Size"
                        body="Controls icon and visual marker size in screens that use HomeOS appearance scaling."
                        value={appearance.iconSize}
                        onChange={setIconSize}
                    />
                </ThemedCard>

                <Text
                    style={{
                        color: theme.colors.text,
                        fontSize: 24,
                        fontWeight: '900',
                        marginBottom: 12,
                    }}
                >
                    Theme Packs
                </Text>

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
                                                {isSelected ? 'Selected for your account' : 'Tap to apply'}
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
