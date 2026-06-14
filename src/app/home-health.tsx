import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import SystemStatusCard from '../components/cards/SystemStatusCard';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import { homeSystems } from '../lib/homeSystems';
import { useTheme } from '../theme/useTheme';

export default function HomeScreen() {
    const { theme } = useTheme();

    return (
        <ScrollView
            style={{
                flex: 1,
                backgroundColor: theme.colors.background,
            }}
            contentContainerStyle={{
                padding: 20,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <Text
                    style={{
                        marginTop: 20,
                        fontSize: 18,
                        color: theme.colors.mutedText,
                        fontWeight: '600',
                    }}
                >
                    Welcome Home
                </Text>

                <Text
                    style={{
                        fontSize: 34,
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginTop: 6,
                    }}
                >
                    Home Health
                </Text>

                <ThemedCard
                    style={{
                        marginTop: 22,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 15,
                            color: theme.colors.mutedText,
                            fontWeight: '700',
                            marginBottom: 10,
                        }}
                    >
                        Home Health Status
                    </Text>

                    <Text
                        style={{
                            fontSize: 26,
                            fontWeight: '900',
                            color: theme.colors.text,
                            marginBottom: 14,
                        }}
                    >
                        Not enough data yet
                    </Text>

                    <View
                        style={{
                            height: 16,
                            backgroundColor: theme.colors.progressTrack,
                            borderRadius: theme.radii.pill,
                            overflow: 'hidden',
                        }}
                    >
                        <View
                            style={{
                                width: '0%',
                                height: '100%',
                                backgroundColor: theme.colors.progressFill,
                            }}
                        />
                    </View>

                    <Text
                        style={{
                            marginTop: 12,
                            fontSize: 14,
                            color: theme.colors.mutedText,
                            lineHeight: 20,
                        }}
                    >
                        Start by adding real equipment, fixtures, documents,
                        and photos from your home.
                    </Text>
                </ThemedCard>

                <Text
                    style={{
                        fontSize: 20,
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginTop: 26,
                        marginBottom: 14,
                    }}
                >
                    Health Breakdown
                </Text>

                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}
                >
                    {homeSystems.map((system) => (
                        <SystemStatusCard
                            key={system.key}
                            title={system.label}
                            icon={system.icon}
                            onPress={() => {
                                if (system.key === 'Documents') {
                                    router.push('/documents' as any);
                                    return;
                                }

                                if (system.key === 'Plumbing') {
                                    router.push('/system/plumbing' as any);
                                    return;
                                }

                                router.push({
                                    pathname: '/system/[system]',
                                    params: { system: system.key },
                                } as any);
                            }}
                            style={{
                                width: '48%',
                            }}
                        />
                    ))}
                </View>

                <ThemedCard
                    style={{
                        marginTop: 26,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 20,
                            fontWeight: '900',
                            color: theme.colors.text,
                            marginBottom: 8,
                        }}
                    >
                        Needs Attention
                    </Text>

                    <Text
                        style={{
                            fontSize: 15,
                            color: theme.colors.mutedText,
                            lineHeight: 22,
                        }}
                    >
                        No issues reported.
                    </Text>
                </ThemedCard>

                <ThemedButton
                    title="Request Professional Help"
                    onPress={() => router.push('/contact' as any)}
                    style={{
                        marginTop: 24,
                    }}
                />

                <View
                    style={{
                        flexDirection: 'row',
                        justifyContent: 'space-around',
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.radii.card,
                        paddingVertical: 16,
                        marginTop: 28,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                    }}
                >
                    <Text
                        style={{
                            fontWeight: '900',
                            color: theme.colors.text,
                        }}
                    >
                        Home
                    </Text>

                    <Text
                        onPress={() => router.push('/equipment' as any)}
                        style={{
                            fontWeight: '800',
                            color: theme.colors.mutedText,
                        }}
                    >
                        Equipment
                    </Text>

                    <Text
                        onPress={() => router.push('/documents' as any)}
                        style={{
                            fontWeight: '800',
                            color: theme.colors.mutedText,
                        }}
                    >
                        Documents
                    </Text>

                    <Text
                        onPress={() => router.push('/profile' as any)}
                        style={{
                            fontWeight: '800',
                            color: theme.colors.mutedText,
                        }}
                    >
                        Profile
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
}
