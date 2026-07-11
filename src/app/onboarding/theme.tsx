import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { themeOptions, type HomeOSTheme } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function OnboardingThemeScreen() {
    const { scaleFont, scaleIcon, setThemeName, theme, themeName } = useTheme();
    const params = useLocalSearchParams<{ next?: string | string[] }>();
    const nextRoute = useMemo(() => resolveSafeNext(firstParam(params.next)), [params.next]);

    function continueSetup() {
        router.replace(buildBaseHomeWizardRoute(nextRoute) as never);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{
                alignItems: 'center',
                padding: scaleIcon(20),
                paddingBottom: scaleIcon(40),
            }}
        >
            <View style={{ width: '100%', maxWidth: 980 }}>
                <Text
                    style={{
                        color: theme.colors.text,
                        fontSize: scaleFont(34),
                        fontWeight: '900',
                        marginTop: scaleIcon(24),
                    }}
                >
                    Choose Your HomeOS Look
                </Text>

                <Text
                    style={{
                        color: theme.colors.mutedText,
                        fontSize: scaleFont(16),
                        fontWeight: '700',
                        lineHeight: scaleFont(23),
                        marginTop: scaleIcon(8),
                        marginBottom: scaleIcon(18),
                    }}
                >
                    Pick the theme that feels best on this device. You can change it later from Profile.
                </Text>

                <View style={themeGridStyle}>
                    {themeOptions.map((option) => {
                        const selected = option.name === themeName;

                        return (
                            <ThemedCard
                                key={option.name}
                                onPress={() => {
                                    void setThemeName(option.name);
                                }}
                                style={{
                                    flexGrow: 1,
                                    flexBasis: 280,
                                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                                    borderWidth: selected ? 2 : 1,
                                }}
                            >
                                <View style={{ gap: scaleIcon(12) }}>
                                    <View style={cardHeaderStyle}>
                                        <View style={{ flex: 1, minWidth: scaleIcon(180) }}>
                                            <Text
                                                style={{
                                                    color: theme.colors.text,
                                                    fontSize: scaleFont(18),
                                                    fontWeight: '900',
                                                }}
                                            >
                                                {option.label}
                                            </Text>
                                            <Text
                                                style={{
                                                    color: selected ? theme.colors.primary : theme.colors.mutedText,
                                                    fontSize: scaleFont(13),
                                                    fontWeight: '900',
                                                    marginTop: scaleIcon(6),
                                                }}
                                            >
                                                {selected ? 'Selected' : 'Tap to preview'}
                                            </Text>
                                        </View>

                                        <View
                                            style={{
                                                alignItems: 'center',
                                                backgroundColor: selected
                                                    ? theme.colors.primary
                                                    : theme.colors.secondaryButton,
                                                borderColor: selected
                                                    ? theme.colors.primary
                                                    : theme.colors.border,
                                                borderRadius: 999,
                                                borderWidth: 1,
                                                height: scaleIcon(34),
                                                justifyContent: 'center',
                                                width: scaleIcon(34),
                                            }}
                                        >
                                            <Text
                                                style={{
                                                    color: selected
                                                        ? theme.colors.primaryText
                                                        : theme.colors.mutedText,
                                                    fontSize: scaleFont(16),
                                                    fontWeight: '900',
                                                }}
                                            >
                                                {selected ? '✓' : ''}
                                            </Text>
                                        </View>
                                    </View>

                                    <ThemeSwatches option={option} />
                                    <ThemeMiniPreview option={option} />
                                </View>
                            </ThemedCard>
                        );
                    })}
                </View>

                <View style={actionRowStyle}>
                    <ThemedButton
                        title="Continue"
                        onPress={continueSetup}
                        style={{ minWidth: scaleIcon(160), paddingVertical: scaleIcon(14) }}
                    />
                    <ThemedButton
                        title="Skip for Now"
                        variant="secondary"
                        onPress={continueSetup}
                        style={{ minWidth: scaleIcon(160), paddingVertical: scaleIcon(14) }}
                    />
                </View>
            </View>
        </ScrollView>
    );
}

function firstParam(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function resolveSafeNext(value: string | undefined) {
    if (!value) return null;

    try {
        const parsed = new URL(value, 'https://app.local');

        if (parsed.pathname === '/customer-invite' && parsed.searchParams.get('code')?.trim()) {
            return `${parsed.pathname}${parsed.search}`;
        }
    } catch {
        return null;
    }

    return null;
}

function buildBaseHomeWizardRoute(nextRoute: string | null) {
    if (!nextRoute) return '/onboarding/base-home-wizard';

    return `/onboarding/base-home-wizard?next=${encodeURIComponent(nextRoute)}`;
}

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
                        backgroundColor: color,
                        borderColor: option.colors.border,
                        borderRadius: 999,
                        borderWidth: 1,
                        height: scaleIcon(22),
                        width: scaleIcon(22),
                    }}
                />
            ))}
        </View>
    );
}

function ThemeMiniPreview({ option }: { option: HomeOSTheme }) {
    const { scaleFont, scaleIcon } = useTheme();

    return (
        <View
            style={{
                backgroundColor: option.colors.background,
                borderColor: option.colors.border,
                borderRadius: option.radii.card,
                borderWidth: 1,
                gap: scaleIcon(10),
                padding: scaleIcon(12),
            }}
        >
            <View
                style={{
                    backgroundColor: option.colors.surface,
                    borderColor: option.colors.border,
                    borderRadius: Math.max(10, option.radii.card - 8),
                    borderWidth: 1,
                    gap: scaleIcon(10),
                    padding: scaleIcon(12),
                }}
            >
                <View
                    style={{
                        backgroundColor: option.colors.text,
                        borderRadius: 999,
                        height: scaleIcon(10),
                        width: '58%',
                    }}
                />
                <View
                    style={{
                        backgroundColor: option.colors.mutedText,
                        borderRadius: 999,
                        height: scaleIcon(8),
                        opacity: 0.65,
                        width: '82%',
                    }}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8) }}>
                    <View
                        style={{
                            alignItems: 'center',
                            backgroundColor: option.colors.primary,
                            borderRadius: option.radii.button,
                            height: scaleIcon(30),
                            justifyContent: 'center',
                            minWidth: scaleIcon(72),
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
                            alignItems: 'center',
                            backgroundColor: option.colors.secondaryButton,
                            borderColor: option.colors.border,
                            borderRadius: option.radii.button,
                            borderWidth: 1,
                            height: scaleIcon(30),
                            justifyContent: 'center',
                            minWidth: scaleIcon(72),
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
        </View>
    );
}

const themeGridStyle = {
    alignItems: 'stretch' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 14,
};

const cardHeaderStyle = {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
};

const actionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 20,
};
