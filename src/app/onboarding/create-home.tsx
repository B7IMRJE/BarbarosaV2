import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    type TextInputProps,
} from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type PropertyType =
    | 'HOUSE'
    | 'CONDO'
    | 'TOWNHOME'
    | 'APARTMENT'
    | 'MANUFACTURED_HOME'
    | 'OTHER';

type FieldName = 'homeName' | 'streetAddress' | 'city' | 'stateName' | 'zip' | 'propertyType';

type FormErrors = Partial<Record<FieldName, string>>;

type FirstPropertyRow = {
    property_id?: string | null;
    membership_id?: string | null;
    created?: boolean | null;
};

const PROPERTY_TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
    { value: 'HOUSE', label: 'Single-family home' },
    { value: 'CONDO', label: 'Condo' },
    { value: 'TOWNHOME', label: 'Townhouse' },
    { value: 'APARTMENT', label: 'Apartment' },
    { value: 'MANUFACTURED_HOME', label: 'Manufactured home' },
    { value: 'OTHER', label: 'Other' },
];

const ZIP_CODE_PATTERN = /^\d{5}(-\d{4})?$/;

export default function CreateHomeOnboardingScreen() {
    const { theme } = useTheme();
    const [homeName, setHomeName] = useState('');
    const [streetAddress, setStreetAddress] = useState('');
    const [city, setCity] = useState('');
    const [stateName, setStateName] = useState('CA');
    const [zip, setZip] = useState('');
    const [propertyType, setPropertyType] = useState<PropertyType>('HOUSE');
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});
    const [canGoBack, setCanGoBack] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        setCanGoBack(router.canGoBack());
    }, []);

    async function createHome() {
        if (submitting) return;

        const trimmedHomeName = homeName.trim();
        const trimmedStreetAddress = streetAddress.trim();
        const trimmedCity = city.trim();
        const trimmedState = stateName.trim();
        const trimmedZip = zip.trim();

        const nextErrors = validateHomeForm({
            homeName: trimmedHomeName,
            streetAddress: trimmedStreetAddress,
            city: trimmedCity,
            stateName: trimmedState,
            zip: trimmedZip,
            propertyType,
        });

        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            setMessage('');
            return;
        }

        setErrors({});
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
            p_address: trimmedStreetAddress,
            p_city: trimmedCity,
            p_state: trimmedState,
            p_zip: trimmedZip,
            p_property_type: propertyType,
        });

        setSubmitting(false);

        if (error) {
            setMessage('We could not create your home right now. Please try again.');
            return;
        }

        const createdProperty = normalizeFirstPropertyRow(data);
        const propertyId =
            typeof createdProperty?.property_id === 'string'
                ? createdProperty.property_id.trim()
                : '';

        if (!propertyId) {
            setMessage('We could not confirm your home was created. Please try again.');
            return;
        }

        router.replace('/' as any);
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
                    <View style={headerStyle}>
                        {canGoBack && (
                            <TouchableOpacity
                                onPress={() => router.back()}
                                disabled={submitting}
                                activeOpacity={0.82}
                            >
                                <Text style={[backTextStyle, { color: theme.colors.text }]}>Back</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    <Text style={[titleStyle, { color: theme.colors.text }]}>Create First Home</Text>
                    <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                        Add your home so HomeOS can finish setting up your account.
                    </Text>

                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Home Details</Text>

                        <ThemedInput
                            label="Home nickname or display name"
                            placeholder="Main Home"
                            value={homeName}
                            onChangeText={(value) => {
                                setHomeName(value);
                                clearFieldError('homeName');
                            }}
                            autoCapitalize="words"
                            editable={!submitting}
                            error={errors.homeName}
                        />

                        <ThemedInput
                            label="Street address"
                            placeholder="Street address"
                            value={streetAddress}
                            onChangeText={(value) => {
                                setStreetAddress(value);
                                clearFieldError('streetAddress');
                            }}
                            autoCapitalize="words"
                            editable={!submitting}
                            error={errors.streetAddress}
                        />

                        <ThemedInput
                            label="City"
                            placeholder="City"
                            value={city}
                            onChangeText={(value) => {
                                setCity(value);
                                clearFieldError('city');
                            }}
                            autoCapitalize="words"
                            editable={!submitting}
                            error={errors.city}
                        />

                        <View style={rowStyle}>
                            <View style={rowItemStyle}>
                                <ThemedInput
                                    label="State"
                                    placeholder="CA"
                                    value={stateName}
                                    onChangeText={(value) => {
                                        setStateName(value);
                                        clearFieldError('stateName');
                                    }}
                                    autoCapitalize="characters"
                                    editable={!submitting}
                                    error={errors.stateName}
                                />
                            </View>
                            <View style={rowItemStyle}>
                                <ThemedInput
                                    label="ZIP code"
                                    placeholder="ZIP code"
                                    value={zip}
                                    onChangeText={(value) => {
                                        setZip(value);
                                        clearFieldError('zip');
                                    }}
                                    keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'numeric'}
                                    editable={!submitting}
                                    error={errors.zip}
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
                                        onPress={() => {
                                            setPropertyType(option.value);
                                            clearFieldError('propertyType');
                                        }}
                                        style={propertyTypeButtonStyle}
                                    />
                                );
                            })}
                        </View>
                        {!!errors.propertyType && (
                            <Text style={[fieldErrorStyle, { color: theme.colors.danger }]}>
                                {errors.propertyType}
                            </Text>
                        )}

                        <ThemedButton
                            title={submitting ? 'Creating home...' : 'Create Home'}
                            disabled={submitting}
                            onPress={createHome}
                            style={{ marginTop: 18 }}
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

    function clearFieldError(fieldName: FieldName) {
        if (!errors[fieldName]) return;

        setErrors((currentErrors) => {
            const nextErrors = { ...currentErrors };
            delete nextErrors[fieldName];
            return nextErrors;
        });
    }
}

function normalizeFirstPropertyRow(data: unknown) {
    const row = Array.isArray(data) ? data[0] : data;

    if (!row || typeof row !== 'object') {
        return null;
    }

    return row as FirstPropertyRow;
}

function validateHomeForm({
    homeName,
    streetAddress,
    city,
    stateName,
    zip,
    propertyType,
}: {
    homeName: string;
    streetAddress: string;
    city: string;
    stateName: string;
    zip: string;
    propertyType: string;
}) {
    const nextErrors: FormErrors = {};

    if (!homeName) {
        nextErrors.homeName = 'Enter a home nickname or display name.';
    }

    if (!streetAddress) {
        nextErrors.streetAddress = 'Enter the street address.';
    }

    if (!city) {
        nextErrors.city = 'Enter the city.';
    }

    if (!stateName) {
        nextErrors.stateName = 'Enter the state.';
    }

    if (!zip) {
        nextErrors.zip = 'Enter the ZIP code.';
    } else if (!ZIP_CODE_PATTERN.test(zip)) {
        nextErrors.zip = 'Enter a valid ZIP code.';
    }

    if (!PROPERTY_TYPE_OPTIONS.some((option) => option.value === propertyType)) {
        nextErrors.propertyType = 'Choose a property type.';
    }

    return nextErrors;
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

const headerStyle = {
    minHeight: 44,
    justifyContent: 'center' as const,
    marginTop: 12,
    marginBottom: 12,
};

const backTextStyle = {
    fontSize: 18,
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
