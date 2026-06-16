import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { useTheme } from '../../theme/useTheme';

export default function CreateHomeOnboardingScreen() {
    const { theme } = useTheme();
    const [homeName, setHomeName] = useState('');
    const [streetAddress, setStreetAddress] = useState('');
    const [city, setCity] = useState('');
    const [stateName, setStateName] = useState('');
    const [zip, setZip] = useState('');
    const [propertyType, setPropertyType] = useState('Residential');
    const [message, setMessage] = useState('');

    function showComingSoon() {
        setMessage(
            'Home creation requires the server-side ownership function so the property and membership are created together.'
        );
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={[titleStyle, { color: theme.colors.text }]}>Create First Home</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Add the basic home profile. Ownership will be connected by the server-side onboarding function.
                </Text>

                <ThemedCard>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Home Details</Text>

                    <ThemedInput
                        label="Home Name"
                        placeholder="Main Home"
                        value={homeName}
                        onChangeText={setHomeName}
                    />

                    <ThemedInput
                        label="Street Address"
                        placeholder="Street address"
                        value={streetAddress}
                        onChangeText={setStreetAddress}
                    />

                    <ThemedInput
                        label="City"
                        placeholder="City"
                        value={city}
                        onChangeText={setCity}
                    />

                    <View style={rowStyle}>
                        <View style={rowItemStyle}>
                            <ThemedInput
                                label="State"
                                placeholder="State"
                                value={stateName}
                                onChangeText={setStateName}
                            />
                        </View>
                        <View style={rowItemStyle}>
                            <ThemedInput
                                label="ZIP"
                                placeholder="ZIP"
                                value={zip}
                                onChangeText={setZip}
                                keyboardType="number-pad"
                            />
                        </View>
                    </View>

                    <ThemedInput
                        label="Property Type"
                        placeholder="Residential"
                        value={propertyType}
                        onChangeText={setPropertyType}
                    />

                    <ThemedButton
                        title="Create Home Coming Soon"
                        onPress={showComingSoon}
                        style={{ marginTop: 6 }}
                    />

                    <ThemedButton
                        title="Back to Invitation"
                        variant="secondary"
                        onPress={() => router.push('/onboarding/invite' as any)}
                        style={{ marginTop: 12 }}
                    />
                </ThemedCard>

                {!!message && (
                    <ThemedCard style={{ marginTop: 16 }}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}

function ThemedInput({
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType,
}: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    keyboardType?: 'default' | 'number-pad';
}) {
    const { theme } = useTheme();

    return (
        <View style={inputGroupStyle}>
            <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>{label}</Text>
            <TextInput
                placeholder={placeholder}
                placeholderTextColor={theme.colors.mutedText}
                value={value}
                onChangeText={onChangeText}
                keyboardType={keyboardType}
                style={{
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: theme.radii.button,
                    color: theme.colors.text,
                    fontSize: 16,
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                }}
            />
        </View>
    );
}

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const subtitleStyle = {
    fontSize: 17,
    lineHeight: 24,
    marginTop: 8,
    marginBottom: 24,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 18,
};

const inputGroupStyle = {
    marginBottom: 14,
};

const fieldLabelStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const rowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
};

const rowItemStyle = {
    flexGrow: 1,
    flexBasis: 220,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};
