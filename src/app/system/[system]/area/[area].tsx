import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import { getSystemLabel } from '../../../../lib/homeSystems';
import { getSystemDefaults } from '../../../../lib/systemDefaults';
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
    const defaults = getSystemDefaults(systemName);

    function createSuggestedItem(category: string, name?: string) {
        router.push({
            pathname: '/item/create',
            params: {
                system: systemName,
                area: areaName,
                category,
                name: name || '',
            },
        } as any);
    }

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
                    Back
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

                <ThemedCard style={{ marginBottom: 20 }}>
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
                        Add items for this area when you are ready. Suggestions below are based on {systemLabel}.
                    </Text>
                </ThemedCard>

                <ThemedButton
                    title="+ Add Item"
                    onPress={() => createSuggestedItem('Equipment')}
                    style={{ marginBottom: 24 }}
                />

                <SuggestionSection
                    title="Suggested Fixtures"
                    items={defaults.fixtures}
                    onPress={(name) => createSuggestedItem('Fixture', name)}
                />

                <SuggestionSection
                    title="Suggested Equipment"
                    items={defaults.equipment}
                    onPress={(name) => createSuggestedItem('Equipment', name)}
                />

                <ThemedCard style={{ marginBottom: 16 }}>
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
                </ThemedCard>

                <ThemedCard>
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
                </ThemedCard>
            </View>
        </ScrollView>
    );
}

function SuggestionSection({
    title,
    items,
    onPress,
}: {
    title: string;
    items: string[];
    onPress: (name: string) => void;
}) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={{ marginBottom: 16 }}>
            <Text style={{ color: theme.colors.text, fontSize: 20, fontWeight: '900', marginBottom: 10 }}>
                {title}
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {items.map((item) => (
                    <TouchableOpacity
                        key={item}
                        onPress={() => onPress(item)}
                        style={{
                            backgroundColor: theme.colors.surfaceAlt,
                            borderColor: theme.colors.border,
                            borderWidth: 1,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: theme.radii.pill,
                            flexGrow: 1,
                        }}
                    >
                        <Text style={{ color: theme.colors.text, fontWeight: '900', textAlign: 'center' }}>
                            {item}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </ThemedCard>
    );
}
