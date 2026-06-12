import { router } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';

export default function HomeHeader() {
    return (
        <View
            style={{
                flexDirection: 'row',
                gap: 20,
                alignItems: 'center',
                marginTop: 20,
                marginBottom: 20,
            }}
        >
            <TouchableOpacity onPress={() => router.push('/')}>
                <Text
                    style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: '#071B33',
                    }}
                >
                    🏠 Home
                </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.back()}>
                <Text
                    style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: '#071B33',
                    }}
                >
                    ← Back
                </Text>
            </TouchableOpacity>
        </View>
    );
}