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
import VerifiedAddressPicker from '../../components/address/VerifiedAddressPicker';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    PROPERTY_TYPE_OPTIONS,
    createFirstHomeIdentity,
    type PropertyType,
    type VerifiedAddress,
} from '../../lib/homeIdentity';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type FieldName = 'homeName' | 'address' | 'propertyType';
type FormErrors = Partial<Record<FieldName, string>>;

export default function CreateHomeOnboardingScreen() {
    const { theme } = useTheme();
    const [homeName, setHomeName] = useState('');
    const [propertyType, setPropertyType] = useState<PropertyType>('HOUSE');
    const [verifiedAddress, setVerifiedAddress] = useState<VerifiedAddress | null>(null);
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
        const nextErrors = validateHomeForm({
            homeName: trimmedHomeName,
            address: verifiedAddress,
            propertyType,
        });

        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            setMessage('');
            return;
        }

        if (!verifiedAddress) return;

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

        try {
            await createFirstHomeIdentity({
                name: trimmedHomeName,
                propertyType,
                address: verifiedAddress,
            });

            router.replace('/' as any);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'We could not create your home right now. Please try again.');
        } finally {
            setSubmitting(false);
        }
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

                        <VerifiedAddressPicker
                            disabled={submitting}
                            onAddressConfirmed={(address) => {
                                setVerifiedAddress(address);
                                if (address) clearFieldError('address');
                            }}
                        />
                        {!!errors.address && (
                            <Text style={[fieldErrorStyle, { color: theme.colors.danger }]}>
                                {errors.address}
                            </Text>
                        )}

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
                            disabled={submitting || !verifiedAddress}
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

function validateHomeForm({
    homeName,
    address,
    propertyType,
}: {
    homeName: string;
    address: VerifiedAddress | null;
    propertyType: string;
}) {
    const nextErrors: FormErrors = {};

    if (!homeName) {
        nextErrors.homeName = 'Enter a home nickname or display name.';
    }

    if (!address) {
        nextErrors.address = 'Choose and confirm your verified home address.';
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

const propertyTypeGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 4,
};

const propertyTypeButtonStyle = {
    flexGrow: 1,
    minWidth: 150,
    paddingHorizontal: 14,
    paddingVertical: 14,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};
