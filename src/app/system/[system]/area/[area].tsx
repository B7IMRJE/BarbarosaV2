import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getSystemLabel } from '../../../../lib/homeSystems';
import { useTheme } from '../../../../theme/useTheme';

export default function AreaScreen() {
    const { theme } = useTheme();
    const { system, area } = useLocalSearchParams<{
        system: string;
        area: string;
    }>();

    const systemName = system ? String(system) : 'System';
    const systemLabel = getSystemLabel(systemName);
    const areaName = area ? String(area) : 'Area';

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
            <View
                style={{
                    width: '100%',
                    maxWidth: 900,
                }}
            >
                <Text
                    onPress={() => router.back()}
                    style={{
                        marginTop: 20,
                        marginBottom: 20,
                        fontSize: 18,
                        color: theme.colors.text,
                        fontWeight: '900',
                    }}
                >
                    ← Back
                </Text>

                <Text
                    style={{
                        fontSize: 34,
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginBottom: 6,
                    }}
                >
                    {areaName}
                </Text>

                <Text
                    style={{
                        fontSize: 16,
                        color: theme.colors.mutedText,
                        marginBottom: 25,
                    }}
                >
                    {systemLabel}
                </Text>

                <View
                    style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.radii.card,
                        padding: 24,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        marginBottom: 20,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 22,
                            fontWeight: '900',
                            color: theme.colors.text,
                            marginBottom: 10,
                        }}
                    >
                        No information has been added here yet.
                    </Text>

                    <Text
                        style={{
                            fontSize: 15,
                            color: theme.colors.mutedText,
                            lineHeight: 22,
                        }}
                    >
                        Add items for this area when you are ready.
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={() => router.push('/item/create' as any)}
                    style={{
                        backgroundColor: theme.colors.primary,
                        paddingVertical: 18,
                        borderRadius: theme.radii.button,
                        alignItems: 'center',
                        marginBottom: 24,
                    }}
                >
                    <Text
                        style={{
                            color: theme.colors.primaryText,
                            fontSize: 18,
                            fontWeight: '900',
                        }}
                    >
                        + Add Item
                    </Text>
                </TouchableOpacity>

                <View
                    style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.radii.card,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        marginBottom: 16,
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
                        Documents
                    </Text>

                    <Text
                        style={{
                            color: theme.colors.mutedText,
                        }}
                    >
                        No documents uploaded.
                    </Text>
                </View>

                <View
                    style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: theme.radii.card,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
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
                        Photos
                    </Text>

                    <Text
                        style={{
                            color: theme.colors.mutedText,
                        }}
                    >
                        No photos uploaded.
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
}
