import { router } from 'expo-router';
import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { DEFAULT_APPEARANCE_PREFERENCES, DEFAULT_THEME_NAME, appearanceSizeOptions, themeOptions, type AppearanceSizeName, type HomeOSTheme, type HomeOSThemeName } from '../../theme';
import { useTheme } from '../../theme/useTheme';

const glassColorPresets = [
    { name: 'Orbital', primary: '#075748', secondary: '#043F69', accent: '#2FA5B3' },
    { name: 'Ocean', primary: '#075E68', secondary: '#074B7A', accent: '#38B7C7' },
    { name: 'Forest', primary: '#175B3B', secondary: '#294F64', accent: '#72B58C' },
    { name: 'Navy Gold', primary: '#31566F', secondary: '#071F38', accent: '#C9A84C' },
    { name: 'Copper Steel', primary: '#7A4C2F', secondary: '#2F526B', accent: '#C48756' },
    { name: 'Black Gold', primary: '#26312D', secondary: '#111820', accent: '#C8A84A' },
] as const;

function ThemeSwatches({ option }: { option: HomeOSTheme }) {
    const { scaleIcon } = useTheme();
    const swatches = [
        option.colors.background,
        option.colors.surface,
        option.colors.primary,
        option.colors.status.good.background,
        option.colors.status.notInspected.background,
        option.colors.status.needsAttention.background,
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
                        backgroundColor: option.colors.status.notInspected.background,
                        borderWidth: 1,
                        borderColor: option.colors.status.notInspected.border,
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
        setAppearance,
        setFontSize,
        setGlassDepth,
        setIconSize,
        theme,
        themeName,
        setThemeName,
    } = useTheme();
    const [selectedThemeName, setSelectedThemeName] =
        useState<HomeOSThemeName>(themeName);
    const [isSavingTheme, setIsSavingTheme] = useState(false);
    const [themeSaveMessage, setThemeSaveMessage] = useState<{
        kind: 'success' | 'error';
        text: string;
    } | null>(null);
    const isDefaultTheme = selectedThemeName === DEFAULT_THEME_NAME;
    const hasUnsavedTheme = selectedThemeName !== themeName;
    const isDefaultAppearance =
        appearance.fontSize === DEFAULT_APPEARANCE_PREFERENCES.fontSize &&
        appearance.iconSize === DEFAULT_APPEARANCE_PREFERENCES.iconSize &&
        appearance.glassDepth === DEFAULT_APPEARANCE_PREFERENCES.glassDepth;
    const colorValues = [
        appearance.glassPrimary,
        appearance.glassSecondary,
        appearance.glassAccent,
    ];
    const [backgroundIntensityPreview, setBackgroundIntensityPreview] = useState(
        appearance.backgroundIntensity
    );

    useEffect(() => {
        setBackgroundIntensityPreview(appearance.backgroundIntensity);
    }, [appearance.backgroundIntensity]);

    useEffect(() => {
        if (!isSavingTheme) {
            setSelectedThemeName(themeName);
        }
    }, [isSavingTheme, themeName]);

    async function saveSelectedTheme() {
        if (!hasUnsavedTheme || isSavingTheme) return;

        setIsSavingTheme(true);
        setThemeSaveMessage(null);

        try {
            await setThemeName(selectedThemeName);
            setThemeSaveMessage({
                kind: 'success',
                text: 'Theme saved to your HomeOS account.',
            });
        } catch (error) {
            setThemeSaveMessage({
                kind: 'error',
                text:
                    error instanceof Error
                        ? error.message
                        : 'HomeOS could not save your theme. Please try again.',
            });
        } finally {
            setIsSavingTheme(false);
        }
    }

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
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Background
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 6 }}>
                        Choose the HomeOS background color, then adjust how strong or dark it appears.
                    </Text>
                    <View
                        style={{
                            backgroundColor: appearance.backgroundColor,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radii.card,
                            borderWidth: 1,
                            height: 76,
                            marginTop: 14,
                            opacity: Math.max(0.08, backgroundIntensityPreview / 100),
                        }}
                    />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
                        <View style={{ flex: 1, minWidth: 180 }}>
                            <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '900', marginBottom: 6 }}>
                                BACKGROUND COLOR
                            </Text>
                            <TextInput
                                accessibilityLabel="HomeOS background color"
                                autoCapitalize="characters"
                                defaultValue={appearance.backgroundColor}
                                onEndEditing={(event) => {
                                    const value = event.nativeEvent.text.trim().toUpperCase();
                                    if (!/^#[0-9A-F]{6}$/.test(value)) return;
                                    void setAppearance({ ...appearance, backgroundColor: value });
                                }}
                                style={{
                                    minHeight: 48,
                                    borderWidth: 1,
                                    borderColor: theme.colors.border,
                                    borderRadius: theme.radii.button,
                                    backgroundColor: 'rgba(3, 24, 42, 0.58)',
                                    color: theme.colors.text,
                                    paddingHorizontal: 14,
                                    fontSize: 15,
                                    fontWeight: '900',
                                }}
                            />
                        </View>
                        <View style={{ flex: 2, minWidth: 240 }}>
                            <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '900', marginBottom: 6 }}>
                                INTENSITY / OPACITY — {Math.round(backgroundIntensityPreview)}%
                            </Text>
                            <Slider
                                accessibilityLabel="HomeOS background intensity"
                                minimumValue={1}
                                maximumValue={100}
                                step={1}
                                value={backgroundIntensityPreview}
                                minimumTrackTintColor={theme.colors.primary}
                                maximumTrackTintColor="rgba(174, 205, 229, 0.35)"
                                thumbTintColor={theme.colors.primary}
                                onValueChange={setBackgroundIntensityPreview}
                                onSlidingComplete={(value) => {
                                    void setAppearance({
                                        ...appearance,
                                        backgroundIntensity: Math.round(value),
                                    });
                                }}
                                style={{ height: 48, width: '100%' }}
                            />
                        </View>
                    </View>
                </ThemedCard>
                <ThemedCard style={{ marginBottom: 18 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Glass Colors
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 6 }}>
                        Choose a coordinated glass palette or enter your own colors. These colors belong only to your HomeOS.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                        {glassColorPresets.map((preset) => {
                            const selected =
                                appearance.glassPrimary === preset.primary &&
                                appearance.glassSecondary === preset.secondary &&
                                appearance.glassAccent === preset.accent;
                            return (
                                <ThemedCard
                                    key={preset.name}
                                    onPress={() => void setAppearance({
                                        ...appearance,
                                        glassPrimary: preset.primary,
                                        glassSecondary: preset.secondary,
                                        glassAccent: preset.accent,
                                    })}
                                    style={{
                                        flexBasis: 140,
                                        flexGrow: 1,
                                        padding: 14,
                                        borderColor: selected ? preset.accent : theme.colors.border,
                                        borderWidth: selected ? 2 : 1,
                                    }}
                                >
                                    <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 15 }}>
                                        {preset.name}
                                    </Text>
                                    <View style={{ flexDirection: 'row', gap: 7, marginTop: 10 }}>
                                        {[preset.primary, preset.secondary, preset.accent].map((color) => (
                                            <View
                                                key={color}
                                                style={{
                                                    width: 28,
                                                    height: 28,
                                                    borderRadius: 999,
                                                    backgroundColor: color,
                                                    borderWidth: 1,
                                                    borderColor: 'rgba(255,255,255,0.7)',
                                                }}
                                            />
                                        ))}
                                    </View>
                                </ThemedCard>
                            );
                        })}
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                        {(['Primary', 'Secondary', 'Accent'] as const).map((label, index) => (
                            <View key={label} style={{ flex: 1, minWidth: 170 }}>
                                <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '900', marginBottom: 6 }}>
                                    {label.toUpperCase()}
                                </Text>
                                <TextInput
                                    accessibilityLabel={`${label} glass color`}
                                    autoCapitalize="characters"
                                    defaultValue={colorValues[index]}
                                    onEndEditing={(event) => {
                                        const value = event.nativeEvent.text.trim().toUpperCase();
                                        if (!/^#[0-9A-F]{6}$/.test(value)) return;
                                        const key = (['glassPrimary', 'glassSecondary', 'glassAccent'] as const)[index];
                                        void setAppearance({ ...appearance, [key]: value });
                                    }}
                                    style={{
                                        minHeight: 48,
                                        borderWidth: 1,
                                        borderColor: theme.colors.border,
                                        borderRadius: theme.radii.button,
                                        backgroundColor: 'rgba(3, 24, 42, 0.58)',
                                        color: theme.colors.text,
                                        paddingHorizontal: 14,
                                        fontSize: 15,
                                        fontWeight: '900',
                                    }}
                                />
                            </View>
                        ))}
                    </View>
                </ThemedCard>
                <ThemedCard style={{ marginBottom: 18 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Glass Depth
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 6 }}>
                        Choose from 1 for nearly flat to 100 for fully raised glass. This is your personal HomeOS setting.
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                        <TextInput
                            accessibilityLabel="HomeOS glass depth"
                            keyboardType="number-pad"
                            value={String(appearance.glassDepth)}
                            onChangeText={(value) => {
                                const next = Number.parseInt(value, 10);
                                if (Number.isFinite(next)) void setGlassDepth(next);
                            }}
                            style={{
                                width: 110,
                                minHeight: 52,
                                borderWidth: 2,
                                borderColor: theme.colors.primary,
                                borderRadius: theme.radii.button,
                                backgroundColor: theme.colors.surface,
                                color: theme.colors.text,
                                fontSize: 18,
                                fontWeight: '900',
                                paddingHorizontal: 16,
                                textAlign: 'center',
                            }}
                        />
                        <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '900' }}>
                            {appearance.glassDepth}% depth
                        </Text>
                    </View>
                </ThemedCard>
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
                        const isSelected = option.name === selectedThemeName;
                        const isSaved = option.name === themeName;

                        return (
                            <ThemedCard
                                key={option.name}
                                onPress={() => {
                                    setSelectedThemeName(option.name);
                                    setThemeSaveMessage(null);
                                }}
                                style={{
                                    flexGrow: 1,
                                    flexBasis: 290,
                                    backgroundColor: option.colors.surfaceAlt,
                                    borderColor: isSelected
                                        ? option.colors.primary
                                        : option.colors.border,
                                    borderTopColor: option.colors.surface,
                                    borderBottomColor: option.colors.primary,
                                    borderWidth: 2,
                                    borderBottomWidth: isSelected ? 8 : 6,
                                    boxShadow: `0 ${isSelected ? 10 : 7}px ${isSelected ? 20 : 14}px rgba(7, 27, 51, ${isSelected ? 0.24 : 0.16}), inset 0 2px 0 rgba(255, 255, 255, 0.88)`,
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
                                                    color: option.colors.text,
                                                    fontSize: 18,
                                                    fontWeight: '900',
                                                }}
                                            >
                                                {option.label}
                                            </Text>
                                            <Text
                                                style={{
                                                    color: isSelected
                                                        ? option.colors.primary
                                                        : option.colors.mutedText,
                                                    marginTop: 6,
                                                    fontWeight: '900',
                                                }}
                                            >
                                                {isSaved
                                                    ? 'Saved for your account'
                                                    : isSelected
                                                      ? 'Selected, ready to save'
                                                      : 'Tap to select'}
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
                                                    ? option.colors.primary
                                                    : option.colors.secondaryButton,
                                                borderWidth: 1,
                                                borderColor: isSelected
                                                    ? option.colors.primary
                                                    : option.colors.border,
                                            }}
                                        >
                                            <Text
                                                style={{
                                                    color: isSelected
                                                        ? option.colors.primaryText
                                                        : option.colors.mutedText,
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

                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 12,
                        marginTop: 18,
                    }}
                >
                    <ThemedButton
                        title={isSavingTheme ? 'Saving Theme...' : 'Save Theme'}
                        disabled={!hasUnsavedTheme || isSavingTheme}
                        onPress={() => {
                            void saveSelectedTheme();
                        }}
                        style={{ flexGrow: 1, minWidth: 180 }}
                    />

                    <ThemedButton
                        title="Select HomeOS Classic"
                        variant="secondary"
                        disabled={isDefaultTheme || isSavingTheme}
                        onPress={() => {
                            setSelectedThemeName(DEFAULT_THEME_NAME);
                            setThemeSaveMessage(null);
                        }}
                        style={{ flexGrow: 1, minWidth: 180 }}
                    />
                </View>

                {themeSaveMessage ? (
                    <View
                        style={{
                            backgroundColor:
                                themeSaveMessage.kind === 'success'
                                    ? theme.colors.status.good.background
                                    : theme.colors.status.emergency.background,
                            borderColor:
                                themeSaveMessage.kind === 'success'
                                    ? theme.colors.status.good.border
                                    : theme.colors.status.emergency.border,
                            borderRadius: theme.radii.card,
                            borderWidth: 1,
                            marginTop: 12,
                            padding: 14,
                        }}
                    >
                        <Text
                            style={{
                                color: theme.colors.text,
                                fontWeight: '900',
                            }}
                        >
                            {themeSaveMessage.text}
                        </Text>
                    </View>
                ) : null}

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
