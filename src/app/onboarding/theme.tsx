import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    DEFAULT_APPEARANCE_PREFERENCES,
    DEFAULT_THEME_NAME,
} from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function OnboardingThemeScreen() {
    const { appearance, scaleFont, scaleIcon, setAppearance, setThemeName, theme } =
        useTheme();
    const params = useLocalSearchParams<{ next?: string | string[] }>();
    const nextRoute = useMemo(() => resolveSafeNext(firstParam(params.next)), [params.next]);
    const [isPreparing, setIsPreparing] = useState(true);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        async function prepareClassic() {
            try {
                await setThemeName(DEFAULT_THEME_NAME);
                await setAppearance({
                    ...DEFAULT_APPEARANCE_PREFERENCES,
                    appearanceStyle: 'classic',
                    fontSize: appearance.fontSize,
                    iconSize: appearance.iconSize,
                });
            } catch (error) {
                if (active) {
                    setSaveError(
                        error instanceof Error
                            ? error.message
                            : 'HomeOS could not prepare its appearance. Please try again.'
                    );
                }
            } finally {
                if (active) setIsPreparing(false);
            }
        }

        void prepareClassic();
        return () => {
            active = false;
        };
    }, []);

    function continueSetup() {
        if (isPreparing) return;
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
                    HomeOS Classic
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
                    HomeOS now uses one clean, consistent appearance on every screen.
                </Text>

                <ThemedCard>
                    <Text
                        style={{
                            color: theme.colors.text,
                            fontSize: scaleFont(22),
                            fontWeight: '900',
                        }}
                    >
                        ✓ Classic appearance
                    </Text>
                    <Text
                        style={{
                            color: theme.colors.mutedText,
                            fontSize: scaleFont(14),
                            fontWeight: '700',
                            lineHeight: scaleFont(21),
                            marginTop: scaleIcon(8),
                        }}
                    >
                        Reliable colors, readable cards, and the same status meanings
                        throughout HomeOS.
                    </Text>
                </ThemedCard>

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
                    title={isPreparing ? 'Preparing HomeOS...' : 'Continue'}
                    disabled={isPreparing}
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
