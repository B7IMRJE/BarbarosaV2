import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    DEFAULT_APPEARANCE_PREFERENCES,
    themeOptions,
} from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function OnboardingThemeScreen() {
    const {
        appearance,
        scaleFont,
        scaleIcon,
        setAppearance,
        setThemeName,
        theme,
        themeName,
    } =
        useTheme();
    const params = useLocalSearchParams<{ next?: string | string[] }>();
    const nextRoute = useMemo(() => resolveSafeNext(firstParam(params.next)), [params.next]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    async function chooseTheme(nextThemeName: (typeof themeOptions)[number]['name']) {
        if (isSaving) return;
        setIsSaving(true);
        setSaveError(null);
        try {
            const option = themeOptions.find((candidate) => candidate.name === nextThemeName);
            await setThemeName(nextThemeName);
            if (option && appearance.appearanceStyle === 'glass') {
                await setAppearance({
                    ...appearance,
                    glassPrimary: option.colors.primary,
                    glassSecondary: option.colors.secondaryButton,
                    glassAccent: option.colors.progressFill,
                });
            }
        } catch (error) {
            setSaveError(
                error instanceof Error
                    ? error.message
                    : 'HomeOS could not save your theme. Please try again.'
            );
        } finally {
            setIsSaving(false);
        }
    }

    async function chooseStyle(appearanceStyle: 'glass' | 'classic') {
        await setAppearance({
            ...DEFAULT_APPEARANCE_PREFERENCES,
            appearanceStyle,
            fontSize: appearance.fontSize,
            iconSize: appearance.iconSize,
        });
    }

    function continueSetup() {
        if (isSaving) return;
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
            <View style={{ width: '100%', maxWidth: 760 }}>
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
                    Choose a style and color pack. You can change it later from Profile.
                </Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(12) }}>
                    {(['glass', 'classic'] as const).map((appearanceStyle) => {
                        const selected = appearance.appearanceStyle === appearanceStyle;
                        return (
                            <ThemedCard
                                key={appearanceStyle}
                                onPress={() => void chooseStyle(appearanceStyle)}
                                style={{
                                    flexGrow: 1,
                                    flexBasis: 220,
                                    borderColor: selected
                                        ? theme.colors.primary
                                        : theme.colors.border,
                                    borderWidth: selected ? 2 : 1,
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.colors.text,
                                        fontSize: scaleFont(18),
                                        fontWeight: '900',
                                        textTransform: 'capitalize',
                                    }}
                                >
                                    {selected ? '✓ ' : ''}
                                    {appearanceStyle}
                                </Text>
                            </ThemedCard>
                        );
                    })}
                </View>

                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: scaleIcon(12),
                        marginTop: scaleIcon(16),
                    }}
                >
                    {themeOptions.map((option) => {
                        const selected = option.name === themeName;
                        return (
                            <ThemedCard
                                key={option.name}
                                onPress={() => void chooseTheme(option.name)}
                                style={{
                                    backgroundColor: option.colors.background,
                                    flexGrow: 1,
                                    flexBasis: 260,
                                    borderColor: selected
                                        ? option.colors.primary
                                        : option.colors.border,
                                    borderWidth: selected ? 3 : 1,
                                }}
                            >
                                <Text
                                    style={{
                                        color: option.colors.text,
                                        fontSize: scaleFont(18),
                                        fontWeight: '900',
                                    }}
                                >
                                    {option.label}
                                </Text>
                                <Text
                                    style={{
                                        color: selected
                                            ? option.colors.primary
                                            : option.colors.mutedText,
                                        fontSize: scaleFont(13),
                                        fontWeight: '900',
                                        marginTop: scaleIcon(6),
                                    }}
                                >
                                    {selected ? 'Selected' : 'Tap to apply'}
                                </Text>
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        gap: scaleIcon(6),
                                        marginTop: scaleIcon(12),
                                    }}
                                >
                                    {[
                                        option.colors.primary,
                                        option.colors.surface,
                                        option.colors.progressFill,
                                    ].map((color, index) => (
                                        <View
                                            key={`${option.name}-${index}`}
                                            style={{
                                                width: scaleIcon(24),
                                                height: scaleIcon(24),
                                                borderRadius: 999,
                                                backgroundColor: color,
                                                borderColor: option.colors.border,
                                                borderWidth: 1,
                                            }}
                                        />
                                    ))}
                                </View>
                            </ThemedCard>
                        );
                    })}
                </View>

                {saveError ? (
                    <Text
                        style={{
                            color: theme.colors.danger,
                            fontSize: scaleFont(14),
                            fontWeight: '800',
                            marginTop: scaleIcon(14),
                        }}
                    >
                        {saveError}
                    </Text>
                ) : null}

                <ThemedButton
                    title={isSaving ? 'Saving Theme...' : 'Continue'}
                    disabled={isSaving}
                    onPress={continueSetup}
                    style={{ marginTop: scaleIcon(18), minWidth: scaleIcon(180) }}
                />
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
