import { router } from 'expo-router';
import { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    View,
    type TextInputProps,
} from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type PropertyType = 'HOUSE' | 'CONDO' | 'TOWNHOME' | 'APARTMENT' | 'OTHER';

type FirstPropertyRow = {
    property_id?: string | null;
    membership_id?: string | null;
    created?: boolean | null;
};

const PROPERTY_TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
    { value: 'HOUSE', label: 'House' },
    { value: 'CONDO', label: 'Condo' },
    { value: 'TOWNHOME', label: 'Townhome' },
    { value: 'APARTMENT', label: 'Apartment' },
    { value: 'OTHER', label: 'Other' },
];

export default function CreateHomeOnboardingScreen() {
    const { theme } = useTheme();
    const [homeName, setHomeName] = useState('');
    const [streetAddress, setStreetAddress] = useState('');
    const [city, setCity] = useState('');
    const [stateName, setStateName] = useState('');
    const [zip, setZip] = useState('');
    const [propertyType, setPropertyType] = useState<PropertyType>('HOUSE');
    const [submitting, setSubmitting] = useState(false);
    const [nameError, setNameError] = useState('');
    const [message, setMessage] = useState('');

    async function createHome() {
        if (submitting) return;

        const trimmedHomeName = homeName.trim();
        const trimmedStreetAddress = streetAddress.trim();
        const trimmedCity = city.trim();
        const trimmedState = stateName.trim();
        const trimmedZip = zip.trim();

        if (!trimmedHomeName) {
            setNameError('Enter a home name to continue.');
            setMessage('');
            return;
        }

        setNameError('');
        setMessage('');
        setSubmitting(true);

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setSubmitting(false);
            setMessage('Please log in to create your home.');
            router.replace('/auth/login' as any);
            return;
        }

        const { data, error } = await supabase.rpc('create_homeowner_first_property', {
            p_name: trimmedHomeName,
            p_address: trimmedStreetAddress || null,
            p_city: trimmedCity || null,
            p_state: trimmedState || null,
            p_zip: trimmedZip || null,
            p_property_type: propertyType,
        });

        setSubmitting(false);

        if (error) {
            console.error('create_homeowner_first_property failed', {
                code: error.code || 'unknown',
            });
            setMessage('We could not create your home right now. Please try again.');
            return;
        }

        const createdProperty = normalizeFirstPropertyRow(data);
        const propertyId =
            typeof createdProperty?.property_id === 'string'
                ? createdProperty.property_id.trim()
                : '';

        if (!propertyId) {
            console.error('create_homeowner_first_property returned no property_id');
            setMessage('We could not confirm your home was created. Please try again.');
            return;
        }

        router.replace({
            pathname: '/onboarding/complete',
            params: {
                propertyId,
                created: createdProperty?.created === true ? 'true' : 'false',
            },
        } as any);
    }

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
            >
                <View style={{ width: '100%', maxWidth: 900 }}>
                    <HomeHeader />

                    <Text style={[titleStyle, { color: theme.colors.text }]}>Create First Home</Text>
                    <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                        Add the home you own so HomeOS can finish setting up your account.
                    </Text>

                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Home Details</Text>

                        <ThemedInput
                            label="Home name"
                            placeholder="Main Home"
                            value={homeName}
                            onChangeText={(value) => {
                                setHomeName(value);
                                if (nameError) setNameError('');
                            }}
                            autoCapitalize="words"
                            editable={!submitting}
                            error={nameError}
                        />

                        <ThemedInput
                            label="Street address"
                            placeholder="Street address"
                            value={streetAddress}
                            onChangeText={setStreetAddress}
                            autoCapitalize="words"
                            editable={!submitting}
                        />

                        <ThemedInput
                            label="City"
                            placeholder="City"
                            value={city}
                            onChangeText={setCity}
                            autoCapitalize="words"
                            editable={!submitting}
                        />

                        <View style={rowStyle}>
                            <View style={rowItemStyle}>
                                <ThemedInput
                                    label="State"
                                    placeholder="CA"
                                    value={stateName}
                                    onChangeText={setStateName}
                                    autoCapitalize="characters"
                                    editable={!submitting}
                                />
                            </View>
                            <View style={rowItemStyle}>
                                <ThemedInput
                                    label="ZIP code"
                                    placeholder="ZIP code"
                                    value={zip}
                                    onChangeText={setZip}
                                    keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                                    editable={!submitting}
                                />
                            </View>
                        </View>

                        <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>Property type</Text>
                        <View style={propertyTypeGridStyle}>
                            {PROPERTY_TYPE_OPTIONS.map((option) => {
                                const selected = propertyType === option.value;

                                return (
                                    <ThemedButton
                                        key={option.value}
                                        title={option.label}
                                        variant={selected ? 'primary' : 'secondary'}
                                        disabled={submitting}
                                        onPress={() => setPropertyType(option.value)}
                                        style={propertyTypeButtonStyle}
                                    />
                                );
                            })}
                        </View>

                        <ThemedButton
                            title={submitting ? 'Creating home...' : 'Create Home'}
                            disabled={submitting}
                            onPress={createHome}
                            style={{ marginTop: 18 }}
                        />

                        <ThemedButton
                            title="Back to Invitation"
                            variant="secondary"
                            onPress={() => router.push('/onboarding/invite' as any)}
                            style={{ marginTop: 12 }}
                        />

                        <ThemedButton
                            title="Company Invitations"
                            variant="secondary"
                            onPress={() => router.push('/onboarding/company-invitations' as any)}
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
        </KeyboardAvoidingView>
    );
}

function normalizeFirstPropertyRow(data: unknown) {
    const row = Array.isArray(data) ? data[0] : data;

    if (!row || typeof row !== 'object') {
        return null;
    }

    return row as FirstPropertyRow;
}

function ThemedInput({
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType,
    autoCapitalize,
    editable = true,
    error,
}: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    keyboardType?: TextInputProps['keyboardType'];
    autoCapitalize?: TextInputProps['autoCapitalize'];
    editable?: boolean;
    error?: string;
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
                autoCapitalize={autoCapitalize}
                editable={editable}
                style={{
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: theme.radii.button,
                    color: theme.colors.text,
                    fontSize: 16,
                    opacity: editable ? 1 : 0.65,
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                }}
            />
            {!!error && <Text style={[fieldErrorStyle, { color: theme.colors.danger }]}>{error}</Text>}
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

const fieldErrorStyle = {
    fontSize: 13,
    fontWeight: '800' as const,
    marginTop: 6,
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

const propertyTypeGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 4,
};

const propertyTypeButtonStyle = {
    flexGrow: 1,
    minWidth: 130,
    paddingHorizontal: 14,
    paddingVertical: 14,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};
