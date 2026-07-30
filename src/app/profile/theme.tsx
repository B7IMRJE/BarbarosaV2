import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { appearanceSizeOptions, type AppearanceSizeName } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function ThemeScreen() {
    const { appearance, scaleFont, scaleIcon, setFontSize, setIconSize, theme } =
        useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{
                alignItems: 'center',
                padding: scaleIcon(20),
                paddingBottom: scaleIcon(48),
            }}
        >
            <View style={{ width: '100%', maxWidth: 860 }}>
                <ThemedButton
                    title="Back"
                    variant="secondary"
                    onPress={() => router.back()}
                    style={{ alignSelf: 'flex-start' }}
                />

                <Text
                    style={{
                        color: theme.colors.text,
                        fontSize: scaleFont(34),
                        fontWeight: '900',
                        marginTop: scaleIcon(18),
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
                        marginBottom: scaleIcon(18),
                    }}
                >
                    HomeOS Classic is the single supported appearance. TechOS settings
                    are separate and have not changed.
                </Text>

                <ThemedCard>
                    <Text
                        style={{
                            color: theme.colors.text,
                            fontSize: scaleFont(22),
                            fontWeight: '900',
                        }}
                    >
                        ✓ HomeOS Classic
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
                        Classic colors and surfaces are applied across every HomeOS page.
                    </Text>
                </ThemedCard>

                <SizeSelector
                    title="Font Size"
                    value={appearance.fontSize}
                    onChange={setFontSize}
                />
                <SizeSelector
                    title="Icon Size"
                    value={appearance.iconSize}
                    onChange={setIconSize}
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
        <View style={{ marginTop: scaleIcon(22) }}>
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
