import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

export default function AreaScreen() {
    const { system, area } = useLocalSearchParams<{
        system: string;
        area: string;
    }>();

    const systemName = system ? String(system) : 'System';
    const areaName = area ? String(area) : 'Area';

    return (
        <ScrollView
            style={{
                flex: 1,
                backgroundColor: '#F3F6FA',
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
                        color: '#071B33',
                        fontWeight: '900',
                    }}
                >
                    ← Back
                </Text>

                <Text
                    style={{
                        fontSize: 34,
                        fontWeight: '900',
                        color: '#071B33',
                        marginBottom: 6,
                    }}
                >
                    {areaName}
                </Text>

                <Text
                    style={{
                        fontSize: 16,
                        color: '#637083',
                        marginBottom: 25,
                    }}
                >
                    {systemName}
                </Text>

                <View
                    style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 24,
                        borderWidth: 1,
                        borderColor: '#E3E8EF',
                        marginBottom: 20,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 22,
                            fontWeight: '900',
                            color: '#071B33',
                            marginBottom: 10,
                        }}
                    >
                        No information has been added here yet.
                    </Text>

                    <Text
                        style={{
                            fontSize: 15,
                            color: '#637083',
                            lineHeight: 22,
                        }}
                    >
                        Add items for this area when you are ready.
                    </Text>
                </View>

                <TouchableOpacity
                    onPress={() => router.push('/item/create' as any)}
                    style={{
                        backgroundColor: '#0B5FFF',
                        paddingVertical: 18,
                        borderRadius: 16,
                        alignItems: 'center',
                        marginBottom: 24,
                    }}
                >
                    <Text
                        style={{
                            color: '#FFFFFF',
                            fontSize: 18,
                            fontWeight: '900',
                        }}
                    >
                        + Add Item
                    </Text>
                </TouchableOpacity>

                <View
                    style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: '#E3E8EF',
                        marginBottom: 16,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 20,
                            fontWeight: '900',
                            color: '#071B33',
                            marginBottom: 8,
                        }}
                    >
                        Documents
                    </Text>

                    <Text
                        style={{
                            color: '#637083',
                        }}
                    >
                        No documents uploaded.
                    </Text>
                </View>

                <View
                    style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: '#E3E8EF',
                    }}
                >
                    <Text
                        style={{
                            fontSize: 20,
                            fontWeight: '900',
                            color: '#071B33',
                            marginBottom: 8,
                        }}
                    >
                        Photos
                    </Text>

                    <Text
                        style={{
                            color: '#637083',
                        }}
                    >
                        No photos uploaded.
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
}
