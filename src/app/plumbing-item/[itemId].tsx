import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

const itemData: Record<
    string,
    {
        name: string;
        status: string;
        location: string;
        about: string;
    }
> = {
    'kitchen-faucet': {
        name: 'Kitchen Faucet',
        status: 'Not Inspected',
        location: 'Kitchen Sink Area',
        about: 'Controls hot and cold water at the kitchen sink.',
    },
    'hot-angle-stop': {
        name: 'Hot Angle Stop',
        status: 'Not Inspected',
        location: 'Kitchen Sink Area',
        about: 'Shuts off hot water to the kitchen faucet.',
    },
    'cold-angle-stop': {
        name: 'Cold Angle Stop',
        status: 'Not Inspected',
        location: 'Kitchen Sink Area',
        about: 'Shuts off cold water to the kitchen faucet.',
    },
    'garbage-disposal': {
        name: 'Garbage Disposal',
        status: 'Not Inspected',
        location: 'Kitchen Sink Area',
        about: 'Grinds food waste before it enters the drain system.',
    },
};

export default function PlumbingItemScreen() {
    const { itemId } = useLocalSearchParams<{ itemId: string }>();
    const item = itemData[String(itemId)] || {
        name: String(itemId || 'Plumbing Item'),
        status: 'Missing Information',
        location: 'Unknown',
        about: 'This plumbing item has not been fully documented yet.',
    };

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 800 }}>
                <Text
                    onPress={() => router.back()}
                    style={{
                        marginTop: 20,
                        marginBottom: 20,
                        fontSize: 18,
                        fontWeight: '900',
                        color: '#071B33',
                    }}
                >
                    ← Back
                </Text>

                <Text style={{ fontSize: 34, fontWeight: '900', color: '#071B33' }}>
                    {item.name}
                </Text>

                <Text style={{ marginTop: 8, color: '#637083', marginBottom: 20 }}>
                    Location: {item.location}
                </Text>

                <View style={cardStyle}>
                    <Text style={sectionTitleStyle}>Status</Text>
                    <Text style={statusStyle}>{item.status}</Text>
                </View>

                <View style={cardStyle}>
                    <Text style={sectionTitleStyle}>Photo</Text>
                    <View
                        style={{
                            height: 220,
                            backgroundColor: '#E3E8EF',
                            borderRadius: 18,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: 12,
                        }}
                    >
                        <Text style={{ color: '#637083', fontWeight: '800' }}>
                            No photo uploaded
                        </Text>
                    </View>
                </View>

                <View style={cardStyle}>
                    <Text style={sectionTitleStyle}>About</Text>
                    <Text style={bodyTextStyle}>{item.about}</Text>
                </View>

                <View style={cardStyle}>
                    <Text style={sectionTitleStyle}>Information</Text>
                    <Text style={bodyTextStyle}>Brand: Unknown</Text>
                    <Text style={bodyTextStyle}>Model: Unknown</Text>
                    <Text style={bodyTextStyle}>Serial: Unknown</Text>
                    <Text style={bodyTextStyle}>Install Date: Unknown</Text>
                </View>

                <TouchableOpacity style={buttonStyle}>
                    <Text style={buttonTextStyle}>Upload Information</Text>
                </TouchableOpacity>

                <TouchableOpacity style={buttonStyle}>
                    <Text style={buttonTextStyle}>Request Service</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const cardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const sectionTitleStyle = {
    fontSize: 20,
    fontWeight: '900' as const,
    color: '#071B33',
};

const statusStyle = {
    marginTop: 8,
    color: '#B7791F',
    fontWeight: '900' as const,
    fontSize: 18,
};

const bodyTextStyle = {
    marginTop: 8,
    color: '#637083',
    fontSize: 16,
    lineHeight: 22,
};

const buttonStyle = {
    backgroundColor: '#071B33',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center' as const,
    marginBottom: 12,
};

const buttonTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
};