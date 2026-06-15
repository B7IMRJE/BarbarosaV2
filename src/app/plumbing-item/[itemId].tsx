import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { useTheme } from '../../theme/useTheme';

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
    const { theme } = useTheme();
    const { itemId } = useLocalSearchParams<{ itemId: string }>();
    const item = itemData[String(itemId)] || {
        name: String(itemId || 'Plumbing Item'),
        status: 'Missing Information',
        location: 'Unknown',
        about: 'This plumbing item has not been fully documented yet.',
    };

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <Text
                    onPress={() => router.back()}
                    style={{
                        marginTop: 20,
                        marginBottom: 20,
                        fontSize: 18,
                        fontWeight: '900',
                        color: theme.colors.text,
                    }}
                >
                    Back
                </Text>

                <Text style={{ fontSize: 34, fontWeight: '900', color: theme.colors.text }}>
                    {item.name}
                </Text>

                <Text style={{ marginTop: 8, color: theme.colors.mutedText, marginBottom: 20 }}>
                    Location: {item.location}
                </Text>

                <View style={gridStyle}>
                    <ThemedCard style={gridCardStyle}>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Status</Text>
                        <Text style={[statusStyle, { color: theme.colors.mutedText }]}>{item.status}</Text>
                    </ThemedCard>

                    <ThemedCard style={gridCardStyle}>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Photo</Text>
                        <View
                            style={{
                                height: 220,
                                backgroundColor: theme.colors.surfaceAlt,
                                borderRadius: theme.radii.button,
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginTop: 12,
                            }}
                        >
                            <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>
                                No photo uploaded
                            </Text>
                        </View>
                    </ThemedCard>

                    <ThemedCard style={gridCardStyle}>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>About</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{item.about}</Text>
                    </ThemedCard>

                    <ThemedCard style={gridCardStyle}>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Information</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Brand: Unknown</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Model: Unknown</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Serial: Unknown</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Install Date: Unknown</Text>
                    </ThemedCard>
                </View>

                <View style={buttonGridStyle}>
                    <ThemedButton title="Upload Information" style={buttonStyle} />
                    <ThemedButton title="Request Service" style={buttonStyle} />
                </View>
            </View>
        </ScrollView>
    );
}

const gridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 14,
    marginBottom: 14,
};

const gridCardStyle = {
    width: '48%' as const,
    minWidth: 220,
    flexGrow: 1,
};

const sectionTitleStyle = {
    fontSize: 20,
    fontWeight: '900' as const,
};

const statusStyle = {
    marginTop: 8,
    fontWeight: '900' as const,
    fontSize: 18,
};

const bodyTextStyle = {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
};

const buttonGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const buttonStyle = {
    width: '48%' as const,
    minWidth: 180,
    flexGrow: 1,
};
