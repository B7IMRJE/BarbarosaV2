import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { themeOptions } from '../../theme';
import { useTheme } from '../../theme/useTheme';

export default function ThemeScreen() {
    const { theme, themeName, setThemeName } = useTheme();

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 700, marginTop: 50 }}>
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
                    Choose how HomeOS looks on this device.
                </Text>

                <View style={{ gap: 14 }}>
                    {themeOptions.map((option) => {
                        const isSelected = option.name === themeName;

                        return (
                            <ThemedCard
                                key={option.name}
                                onPress={() => setThemeName(option.name)}
                                style={{
                                    borderColor: isSelected
                                        ? theme.colors.primary
                                        : theme.colors.border,
                                    borderWidth: isSelected ? 2 : 1,
                                }}
                            >
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                    }}
                                >
                                    <View>
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
                                                color: theme.colors.mutedText,
                                                marginTop: 6,
                                                fontWeight: '800',
                                            }}
                                        >
                                            {isSelected ? 'Selected' : 'Tap to apply'}
                                        </Text>
                                    </View>

                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            gap: 6,
                                        }}
                                    >
                                        <View
                                            style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: 999,
                                                backgroundColor: option.colors.background,
                                                borderWidth: 1,
                                                borderColor: option.colors.border,
                                            }}
                                        />
                                        <View
                                            style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: 999,
                                                backgroundColor: option.colors.primary,
                                            }}
                                        />
                                        <View
                                            style={{
                                                width: 24,
                                                height: 24,
                                                borderRadius: 999,
                                                backgroundColor: option.colors.status.good.background,
                                                borderWidth: 1,
                                                borderColor: option.colors.status.good.border,
                                            }}
                                        />
                                    </View>
                                </View>
                            </ThemedCard>
                        );
                    })}
                </View>

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
