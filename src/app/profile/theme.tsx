import { router } from 'expo-router';
import Slider from '@react-native-community/slider';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import VisualColorPicker from '../../components/theme/VisualColorPicker';
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

const glassThemePacks = [
    { name: 'Deep Ocean', description: 'Cool blue glass with bright aqua edges.', background: '#020F20', panel: '#103A59', primary: '#075E68', secondary: '#074B7A', accent: '#38B7C7' },
    { name: 'Emerald Night', description: 'Rich green glass with soft mint reflections.', background: '#041A18', panel: '#16473E', primary: '#075748', secondary: '#173F4A', accent: '#5BC69A' },
    { name: 'Aurora', description: 'Blue-violet glass with a luminous cyan accent.', background: '#0A1026', panel: '#2A315F', primary: '#374A8A', secondary: '#24345D', accent: '#60D7E8' },
    { name: 'Smoked Copper', description: 'Warm architectural glass with copper edges.', background: '#17110F', panel: '#50382E', primary: '#6E422F', secondary: '#293B48', accent: '#D4915E' },
    { name: 'Black Gold', description: 'Dark dramatic glass with restrained gold light.', background: '#090D0C', panel: '#27322D', primary: '#26312D', secondary: '#111820', accent: '#D3B253' },
    { name: 'Arctic', description: 'Crisp steel-blue glass with an icy glow.', background: '#071722', panel: '#315469', primary: '#276579', secondary: '#24465F', accent: '#8BE5F0' },
] as const;

type AppearanceControlKey =
    | 'interface'
    | 'background'
    | 'container'
    | 'tileColors'
    | 'depth'
    | 'sizes';

const appearanceControlCards: Array<{
    key: AppearanceControlKey;
    title: string;
    description: string;
}> = [
    { key: 'interface', title: 'Interface Style', description: 'Switch between glass and classic.' },
    { key: 'background', title: 'Background', description: 'Set the page color and intensity.' },
    { key: 'container', title: 'Glass Containers', description: 'Tune panel color and opacity.' },
    { key: 'tileColors', title: 'Glass Tile Colors', description: 'Choose card colors and accents.' },
    { key: 'depth', title: 'Glass Depth', description: 'Control lift, glow, and shadows.' },
    { key: 'sizes', title: 'Size Preferences', description: 'Adjust fonts and icon sizing.' },
];

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
    const [isResettingAppearance, setIsResettingAppearance] = useState(false);
    const [expandedControl, setExpandedControl] = useState<AppearanceControlKey | null>(null);
    const [themeSaveMessage, setThemeSaveMessage] = useState<{
        kind: 'success' | 'error';
        text: string;
    } | null>(null);
    const isDefaultTheme = selectedThemeName === DEFAULT_THEME_NAME;
    const isDefaultAppearance =
        appearance.appearanceStyle === DEFAULT_APPEARANCE_PREFERENCES.appearanceStyle &&
        appearance.fontSize === DEFAULT_APPEARANCE_PREFERENCES.fontSize &&
        appearance.iconSize === DEFAULT_APPEARANCE_PREFERENCES.iconSize &&
        appearance.glassDepth === DEFAULT_APPEARANCE_PREFERENCES.glassDepth &&
        appearance.glassPrimary === DEFAULT_APPEARANCE_PREFERENCES.glassPrimary &&
        appearance.glassSecondary === DEFAULT_APPEARANCE_PREFERENCES.glassSecondary &&
        appearance.glassAccent === DEFAULT_APPEARANCE_PREFERENCES.glassAccent &&
        appearance.backgroundColor === DEFAULT_APPEARANCE_PREFERENCES.backgroundColor &&
        appearance.backgroundIntensity === DEFAULT_APPEARANCE_PREFERENCES.backgroundIntensity &&
        appearance.glassPanelColor === DEFAULT_APPEARANCE_PREFERENCES.glassPanelColor &&
        appearance.glassPanelOpacity === DEFAULT_APPEARANCE_PREFERENCES.glassPanelOpacity;
    const colorValues = [
        appearance.glassPrimary,
        appearance.glassSecondary,
        appearance.glassAccent,
    ];
    const [backgroundIntensityPreview, setBackgroundIntensityPreview] = useState(
        appearance.backgroundIntensity
    );
    const [glassPanelOpacityPreview, setGlassPanelOpacityPreview] = useState(
        appearance.glassPanelOpacity
    );

    useEffect(() => {
        setBackgroundIntensityPreview(appearance.backgroundIntensity);
    }, [appearance.backgroundIntensity]);

    useEffect(() => {
        setGlassPanelOpacityPreview(appearance.glassPanelOpacity);
    }, [appearance.glassPanelOpacity]);

    useEffect(() => {
        if (!isSavingTheme) {
            setSelectedThemeName(themeName);
        }
    }, [isSavingTheme, themeName]);

    async function selectAndSaveTheme(nextThemeName: HomeOSThemeName) {
        if (isSavingTheme) return;

        setSelectedThemeName(nextThemeName);

        if (nextThemeName === themeName && appearance.appearanceStyle === 'classic') {
            setThemeSaveMessage({
                kind: 'success',
                text: 'This classic theme is already active.',
            });
            return;
        }

        setIsSavingTheme(true);
        setThemeSaveMessage(null);

        try {
            if (nextThemeName !== themeName) {
                await setThemeName(nextThemeName);
            }
            await setAppearance({
                ...DEFAULT_APPEARANCE_PREFERENCES,
                appearanceStyle: 'classic',
                fontSize: appearance.fontSize,
                iconSize: appearance.iconSize,
            });
            setThemeSaveMessage({
                kind: 'success',
                text: 'Complete classic theme applied and saved automatically.',
            });
        } catch (error) {
            setSelectedThemeName(themeName);
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

    async function resetCompleteAppearance() {
        if (isResettingAppearance) return;

        setIsResettingAppearance(true);
        setThemeSaveMessage(null);

        try {
            await resetAppearance();

            if (themeName !== DEFAULT_THEME_NAME) {
                await setThemeName(DEFAULT_THEME_NAME);
            }

            setSelectedThemeName(DEFAULT_THEME_NAME);
            setThemeSaveMessage({
                kind: 'success',
                text: 'HomeOS appearance was reset to the default colors, opacity, depth, and sizes.',
            });
        } catch (error) {
            setThemeSaveMessage({
                kind: 'error',
                text:
                    error instanceof Error
                        ? error.message
                        : 'HomeOS could not reset the appearance. Please try again.',
            });
        } finally {
            setIsResettingAppearance(false);
        }
    }

    async function changeInterfaceStyle(nextStyle: 'glass' | 'classic') {
        try {
            if (themeName !== DEFAULT_THEME_NAME) {
                await setThemeName(DEFAULT_THEME_NAME);
                setSelectedThemeName(DEFAULT_THEME_NAME);
            }

            await setAppearance(nextStyle === 'classic'
                ? {
                    ...DEFAULT_APPEARANCE_PREFERENCES,
                    appearanceStyle: 'classic',
                    fontSize: appearance.fontSize,
                    iconSize: appearance.iconSize,
                }
                : {
                    ...DEFAULT_APPEARANCE_PREFERENCES,
                    appearanceStyle: 'glass',
                    fontSize: appearance.fontSize,
                    iconSize: appearance.iconSize,
                });
            setThemeSaveMessage({
                kind: 'success',
                text:
                    nextStyle === 'classic'
                        ? 'Complete HomeOS Classic appearance is active.'
                        : 'Complete default HomeOS Glass appearance is active.',
            });
        } catch {
            setThemeSaveMessage({
                kind: 'error',
                text: 'HomeOS could not switch interface styles. Please try again.',
            });
        }
    }

    async function applyGlassThemePack(pack: (typeof glassThemePacks)[number]) {
        try {
            if (themeName !== DEFAULT_THEME_NAME) {
                await setThemeName(DEFAULT_THEME_NAME);
                setSelectedThemeName(DEFAULT_THEME_NAME);
            }
            await setAppearance({
                ...DEFAULT_APPEARANCE_PREFERENCES,
                appearanceStyle: 'glass',
                fontSize: appearance.fontSize,
                iconSize: appearance.iconSize,
                backgroundColor: pack.background,
                glassPanelColor: pack.panel,
                glassPrimary: pack.primary,
                glassSecondary: pack.secondary,
                glassAccent: pack.accent,
            });
            setThemeSaveMessage({
                kind: 'success',
                text: `${pack.name} glass pack applied.`,
            });
        } catch {
            setThemeSaveMessage({
                kind: 'error',
                text: 'HomeOS could not apply this glass pack. Please try again.',
            });
        }
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1120, marginTop: 32 }}>
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
                            Current Appearance
                        </Text>
                        <Text
                            style={{
                                color: theme.colors.text,
                                fontSize: 18,
                                fontWeight: '900',
                                marginTop: 4,
                            }}
                        >
                            {appearance.appearanceStyle === 'glass'
                                ? 'HomeOS Glass'
                                : `${themeOptions.find((option) => option.name === themeName)?.label || themeName} Classic`}
                        </Text>
                        <ThemedButton
                            title={isResettingAppearance ? 'Resetting...' : 'Reset Appearance'}
                            variant="secondary"
                            disabled={
                                isResettingAppearance ||
                                (isDefaultAppearance && themeName === DEFAULT_THEME_NAME)
                            }
                            onPress={() => {
                                void resetCompleteAppearance();
                            }}
                            style={{ marginTop: 12, minWidth: 190 }}
                        />
                    </View>
                </View>

                <ThemedCard style={{ marginBottom: 18 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 24, fontWeight: '900' }}>
                        Customize HomeOS
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 6 }}>
                        Open only the controls you want to change. Everything else stays neatly tucked away.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
                        {appearanceControlCards.map((control) => {
                            const expanded = expandedControl === control.key;

                            return (
                                <ThemedCard
                                    key={control.key}
                                    onPress={() => setExpandedControl(expanded ? null : control.key)}
                                    style={{
                                        flexBasis: 250,
                                        flexGrow: 1,
                                        minHeight: 126,
                                        justifyContent: 'space-between',
                                        borderColor: expanded ? theme.colors.primary : theme.colors.border,
                                        borderWidth: expanded ? 2 : 1,
                                    }}
                                >
                                    <View>
                                        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                                            {control.title}
                                        </Text>
                                        <Text style={{ color: theme.colors.mutedText, fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 6 }}>
                                            {control.description}
                                        </Text>
                                    </View>
                                    <Text style={{ color: theme.colors.link, fontSize: 13, fontWeight: '900', marginTop: 12 }}>
                                        {expanded ? 'Close controls ↑' : 'Open controls ↓'}
                                    </Text>
                                </ThemedCard>
                            );
                        })}
                    </View>

                {expandedControl === 'interface' ? (
                <ThemedCard style={{ marginTop: 16 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>
                        Interface Style
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 6 }}>
                        Choose the original flatter HomeOS appearance or the futuristic layered glass appearance. Theme packs work with both.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
                        {([
                            {
                                key: 'glass' as const,
                                title: 'Glass',
                                body: 'Reflective colored tiles, layered panels, glow, and adjustable depth.',
                            },
                            {
                                key: 'classic' as const,
                                title: 'Classic',
                                body: 'The original clean theme colors with flatter cards and simpler buttons.',
                            },
                        ]).map((option) => {
                            const selected = appearance.appearanceStyle === option.key;
                            return (
                                <ThemedCard
                                    key={option.key}
                                    onPress={() => void changeInterfaceStyle(option.key)}
                                    style={{
                                        flexBasis: 280,
                                        flexGrow: 1,
                                        borderColor: selected
                                            ? theme.colors.primary
                                            : theme.colors.border,
                                        borderWidth: selected ? 2 : 1,
                                    }}
                                >
                                    <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                                        {selected ? '✓ ' : ''}{option.title}
                                    </Text>
                                    <Text style={{ color: theme.colors.mutedText, fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 6 }}>
                                        {option.body}
                                    </Text>
                                </ThemedCard>
                            );
                        })}
                    </View>
                </ThemedCard>
                ) : null}
                {expandedControl === 'background' ? (
                <ThemedCard style={{ marginTop: 16 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Background
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 6 }}>
                        Choose the HomeOS background color, then adjust how strong or dark it appears.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
                        <VisualColorPicker
                            label="Page background color"
                            value={appearance.backgroundColor}
                            onChange={(backgroundColor) =>
                                void setAppearance({ ...appearance, backgroundColor })
                            }
                        />
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
                ) : null}
                {expandedControl === 'container' ? (
                <ThemedCard style={{ marginTop: 16 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Glass Container Color
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 6 }}>
                        This controls the large background panels that hold navigation, buttons, or groups of tiles. It does not change each individual tile.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
                        <VisualColorPicker
                            label="Container glass color"
                            value={appearance.glassPanelColor}
                            onChange={(glassPanelColor) =>
                                void setAppearance({ ...appearance, glassPanelColor })
                            }
                        />
                        <View style={{ flex: 2, minWidth: 240 }}>
                            <Text style={{ color: theme.colors.mutedText, fontSize: 12, fontWeight: '900', marginBottom: 6 }}>
                                GLASS OPACITY — {Math.round(glassPanelOpacityPreview)}%
                            </Text>
                            <Slider
                                accessibilityLabel="HomeOS glass panel opacity"
                                minimumValue={1}
                                maximumValue={100}
                                step={1}
                                value={glassPanelOpacityPreview}
                                minimumTrackTintColor={theme.colors.primary}
                                maximumTrackTintColor="rgba(174, 205, 229, 0.35)"
                                thumbTintColor={theme.colors.primary}
                                onValueChange={setGlassPanelOpacityPreview}
                                onSlidingComplete={(value) => {
                                    void setAppearance({
                                        ...appearance,
                                        glassPanelOpacity: Math.round(value),
                                    });
                                }}
                                style={{ height: 48, width: '100%' }}
                            />
                        </View>
                    </View>
                </ThemedCard>
                ) : null}
                {expandedControl === 'tileColors' ? (
                <ThemedCard style={{ marginTop: 16 }}>
                    <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900' }}>
                        Individual Glass Tile Colors
                    </Text>
                    <Text style={{ color: theme.colors.mutedText, fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 6 }}>
                        These colors control the individual cards and tiles inside the larger glass containers.
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
                        {(['Primary', 'Secondary', 'Accent'] as const).map((label, index) => {
                            const key = (['glassPrimary', 'glassSecondary', 'glassAccent'] as const)[index];
                            return (
                                <VisualColorPicker
                                    key={label}
                                    label={`${label} tile color`}
                                    value={colorValues[index]}
                                    onChange={(value) => void setAppearance({ ...appearance, [key]: value })}
                                />
                            );
                        })}
                    </View>
                </ThemedCard>
                ) : null}
                {expandedControl === 'depth' ? (
                <ThemedCard style={{ marginTop: 16 }}>
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
                ) : null}
                {expandedControl === 'sizes' ? (
                <ThemedCard style={{ marginTop: 16 }}>
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
                ) : null}
                </ThemedCard>

                <Text
                    style={{
                        color: theme.colors.text,
                        fontSize: 24,
                        fontWeight: '900',
                        marginBottom: 6,
                    }}
                >
                    Glass Theme Packs
                </Text>
                <Text
                    style={{
                        color: theme.colors.mutedText,
                        fontSize: 14,
                        fontWeight: '700',
                        lineHeight: 20,
                        marginBottom: 12,
                    }}
                >
                    One tap applies a complete glass palette. You can fine-tune it later from Customize HomeOS.
                </Text>
                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 14,
                        alignItems: 'stretch',
                        marginBottom: 24,
                    }}
                >
                    {glassThemePacks.map((pack) => {
                        const selected =
                            appearance.appearanceStyle === 'glass' &&
                            appearance.backgroundColor === pack.background &&
                            appearance.glassPanelColor === pack.panel &&
                            appearance.glassPrimary === pack.primary &&
                            appearance.glassSecondary === pack.secondary &&
                            appearance.glassAccent === pack.accent;

                        return (
                            <ThemedCard
                                key={pack.name}
                                onPress={() => void applyGlassThemePack(pack)}
                                style={{
                                    flexBasis: 290,
                                    flexGrow: 1,
                                    minHeight: 176,
                                    justifyContent: 'space-between',
                                    borderColor: selected ? pack.accent : theme.colors.border,
                                    borderWidth: selected ? 2 : 1,
                                    backgroundColor: `${pack.panel}E6`,
                                }}
                            >
                                <View>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                                        <Text style={{ color: '#F5FBFF', fontSize: 19, fontWeight: '900' }}>
                                            {pack.name}
                                        </Text>
                                        <Text style={{ color: pack.accent, fontSize: 18, fontWeight: '900' }}>
                                            {selected ? '✓' : '○'}
                                        </Text>
                                    </View>
                                    <Text style={{ color: '#C7D8E5', fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 7 }}>
                                        {pack.description}
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 9, marginTop: 18 }}>
                                    {[pack.background, pack.panel, pack.primary, pack.secondary, pack.accent].map((color) => (
                                        <View
                                            key={color}
                                            style={{
                                                width: 30,
                                                height: 30,
                                                borderRadius: 999,
                                                backgroundColor: color,
                                                borderWidth: 1,
                                                borderColor: 'rgba(255,255,255,0.72)',
                                            }}
                                        />
                                    ))}
                                </View>
                            </ThemedCard>
                        );
                    })}
                </View>

                <Text
                    style={{
                        color: theme.colors.text,
                        fontSize: 24,
                        fontWeight: '900',
                        marginBottom: 12,
                    }}
                >
                    Classic Theme Packs
                </Text>
                <Text
                    style={{
                        color: theme.colors.mutedText,
                        fontSize: 14,
                        fontWeight: '700',
                        lineHeight: 20,
                        marginBottom: 12,
                    }}
                >
                    Selecting one applies the complete flat classic appearance and removes glass customization.
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
                                    void selectAndSaveTheme(option.name);
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
                                                      ? 'Applying and saving...'
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
                        title={
                            appearance.appearanceStyle === 'glass'
                                ? 'Use Classic Style'
                                : 'Use Glass Style'
                        }
                        variant="secondary"
                        onPress={() => {
                            void changeInterfaceStyle(
                                appearance.appearanceStyle === 'glass'
                                    ? 'classic'
                                    : 'glass'
                            );
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
