import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import GlobalTextSizeControl from '../../components/accessibility/GlobalTextSizeControl';
import {
    DEFAULT_THEME_NAME,
    appearanceSizeOptions,
    themeOptions,
    type AppearanceSizeName,
    type AppearanceStyleName,
    type HomeOSTheme,
} from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function ThemeScreen() {
    const {
        appearance,
        resetAppearance,
        scaleFont,
        scaleIcon,
        setAppearance,
        setFontSize,
        setIconSize,
        setThemeName,
        theme,
        themeName,
    } = useTheme();
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    async function chooseStyle(appearanceStyle: AppearanceStyleName) {
        setMessage(null);
        await setAppearance({ ...appearance, appearanceStyle });
    }

    async function chooseTheme(option: HomeOSTheme) {
        if (isSaving) return;
        setIsSaving(true);
        setMessage(null);

        try {
            await setThemeName(option.name);
            if (appearance.appearanceStyle === 'glass') {
                await setAppearance({
                    ...appearance,
                    glassPrimary: option.colors.primary,
                    glassSecondary: option.colors.secondaryButton,
                    glassAccent: option.colors.progressFill,
                });
            }
            setMessage(`${option.label} saved.`);
        } catch (error) {
            setMessage(
                error instanceof Error ? error.message : 'HomeOS could not save this look.'
            );
        } finally {
            setIsSaving(false);
        }
    }

    async function restoreDefault() {
        if (isSaving) return;
        setIsSaving(true);
        setMessage(null);
        try {
            await setThemeName(DEFAULT_THEME_NAME);
            await resetAppearance();
            setMessage('HomeOS default restored.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'HomeOS could not reset.');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{
                alignItems: 'center',
                gap: scaleIcon(18),
                padding: scaleIcon(20),
                paddingBottom: scaleIcon(48),
            }}
        >
            <View style={{ width: '100%', maxWidth: 980, gap: scaleIcon(18) }}>
                <ThemedButton
                    title="Back"
                    variant="secondary"
                    onPress={() => router.back()}
                    style={{ alignSelf: 'flex-start' }}
                />

                <View>
                    <Text
                        style={{
                            color: theme.colors.text,
                            fontSize: scaleFont(34),
                            fontWeight: '900',
                        }}
                    >
                        HomeOS Appearance
                    </Text>
                    <Text
                        style={{
                            color: theme.colors.mutedText,
                            fontSize: scaleFont(15),
                            fontWeight: '700',
                            lineHeight: scaleFont(22),
                            marginTop: scaleIcon(6),
                        }}
                    >
                        Choose a HomeOS look for this account. Company and TechOS themes
                        remain separate.
                    </Text>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(12) }}>
                    {([
                        {
                            name: 'glass' as const,
                            label: 'Glass',
                            note: 'Layered color, depth, and reflective cards.',
                        },
                        {
                            name: 'classic' as const,
                            label: 'Classic',
                            note: 'Clean, flatter cards with the selected color pack.',
                        },
                    ]).map((option) => {
                        const selected = appearance.appearanceStyle === option.name;
                        return (
                            <ThemedCard
                                key={option.name}
                                onPress={() => void chooseStyle(option.name)}
                                style={{
                                    flexGrow: 1,
                                    flexBasis: 260,
                                    borderColor: selected
                                        ? theme.colors.primary
                                        : theme.colors.border,
                                    borderWidth: selected ? 2 : 1,
                                }}
                            >
                                <Text
                                    style={{
                                        color: theme.colors.text,
                                        fontSize: scaleFont(19),
                                        fontWeight: '900',
                                    }}
                                >
                                    {selected ? '✓ ' : ''}
                                    {option.label}
                                </Text>
                                <Text
                                    style={{
                                        color: theme.colors.mutedText,
                                        fontSize: scaleFont(13),
                                        fontWeight: '700',
                                        lineHeight: scaleFont(19),
                                        marginTop: scaleIcon(6),
                                    }}
                                >
                                    {option.note}
                                </Text>
                            </ThemedCard>
                        );
                    })}
                </View>

                <View>
                    <Text
                        style={{
                            color: theme.colors.text,
                            fontSize: scaleFont(22),
                            fontWeight: '900',
                            marginBottom: scaleIcon(10),
                        }}
                    >
                        Color Packs
                    </Text>
                    <View
                        style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            gap: scaleIcon(12),
                        }}
                    >
                        {themeOptions.map((option) => {
                            const selected = option.name === themeName;
                            return (
                                <ThemedCard
                                    key={option.name}
                                    onPress={() => void chooseTheme(option)}
                                    style={{
                                        backgroundColor: option.colors.background,
                                        flexGrow: 1,
                                        flexBasis: 270,
                                        borderColor: selected
                                            ? option.colors.primary
                                            : option.colors.border,
                                        borderWidth: selected ? 3 : 1,
                                    }}
                                >
                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            justifyContent: 'space-between',
                                            gap: scaleIcon(12),
                                        }}
                                    >
                                        <View style={{ flex: 1 }}>
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
                                                    fontSize: scaleFont(12),
                                                    fontWeight: '900',
                                                    marginTop: scaleIcon(4),
                                                }}
                                            >
                                                {selected ? 'Selected' : 'Tap to apply'}
                                            </Text>
                                        </View>
                                        <View
                                            style={{
                                                flexDirection: 'row',
                                                gap: scaleIcon(5),
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
                                                        width: scaleIcon(22),
                                                        height: scaleIcon(22),
                                                        borderRadius: 999,
                                                        backgroundColor: color,
                                                        borderColor: option.colors.border,
                                                        borderWidth: 1,
                                                    }}
                                                />
                                            ))}
                                        </View>
                                    </View>
                                    <View
                                        style={{
                                            backgroundColor: option.colors.surface,
                                            borderColor: option.colors.border,
                                            borderRadius: option.radii.card,
                                            borderWidth: 1,
                                            gap: scaleIcon(8),
                                            marginTop: scaleIcon(14),
                                            padding: scaleIcon(12),
                                        }}
                                    >
                                        <View
                                            style={{
                                                backgroundColor: option.colors.text,
                                                borderRadius: 999,
                                                height: scaleIcon(8),
                                                width: '58%',
                                            }}
                                        />
                                        <View
                                            style={{
                                                backgroundColor: option.colors.mutedText,
                                                borderRadius: 999,
                                                height: scaleIcon(6),
                                                opacity: 0.55,
                                                width: '78%',
                                            }}
                                        />
                                        <View
                                            style={{
                                                flexDirection: 'row',
                                                gap: scaleIcon(8),
                                            }}
                                        >
                                            <View
                                                style={{
                                                    backgroundColor: option.colors.primary,
                                                    borderRadius: option.radii.button,
                                                    height: scaleIcon(26),
                                                    width: scaleIcon(74),
                                                }}
                                            />
                                            <View
                                                style={{
                                                    backgroundColor:
                                                        option.colors.secondaryButton,
                                                    borderRadius: option.radii.button,
                                                    height: scaleIcon(26),
                                                    width: scaleIcon(74),
                                                }}
                                            />
                                        </View>
                                    </View>
                                </ThemedCard>
                            );
                        })}
                    </View>
                </View>

                <SizeSelector
                    title="Font Size"
                    value={appearance.fontSize}
                    onChange={setFontSize}
                />
                <GlobalTextSizeControl embedded />
                <SizeSelector
                    title="Icon Size"
                    value={appearance.iconSize}
                    onChange={setIconSize}
                />

                {message ? (
                    <Text
                        selectable
                        style={{
                            color: theme.colors.text,
                            fontSize: scaleFont(14),
                            fontWeight: '800',
                        }}
                    >
                        {message}
                    </Text>
                ) : null}

                <ThemedButton
                    title={isSaving ? 'Saving...' : 'Restore HomeOS Default'}
                    variant="secondary"
                    disabled={isSaving}
                    onPress={() => void restoreDefault()}
                    style={{ alignSelf: 'flex-start' }}
                />
            </View>
        </ScrollView>
    );
}

function SizeSelector({
    title,
    value,
    onChange,
}: {
    title: string;
    value: AppearanceSizeName;
    onChange: (value: AppearanceSizeName) => Promise<void>;
}) {
    const { scaleFont, scaleIcon, theme } = useTheme();

    return (
        <View>
            <Text
                style={{
                    color: theme.colors.text,
                    fontSize: scaleFont(20),
                    fontWeight: '900',
                    marginBottom: scaleIcon(10),
                }}
            >
                {title}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(10) }}>
                {appearanceSizeOptions.map((option) => {
                    const selected = option.name === value;
                    return (
                        <ThemedCard
                            key={option.name}
                            onPress={() => void onChange(option.name)}
                            style={{
                                flexGrow: 1,
                                flexBasis: 150,
                                borderColor: selected
                                    ? theme.colors.primary
                                    : theme.colors.border,
                                borderWidth: selected ? 2 : 1,
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.colors.text,
                                    fontSize: scaleFont(16),
                                    fontWeight: '900',
                                }}
                            >
                                {selected ? '✓ ' : ''}
                                {option.label}
                            </Text>
                        </ThemedCard>
                    );
                })}
            </View>
        </View>
    );
}
