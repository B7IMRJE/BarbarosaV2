import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
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
    loadActiveHomeIdentity,
    updateHomeIdentity,
    type HomeIdentity,
    type PropertyType,
    type VerifiedAddress,
} from '../../lib/homeIdentity';
import { useTheme } from '../../theme/useTheme';

type FieldName = 'homeName' | 'address' | 'propertyType';
type FormErrors = Partial<Record<FieldName, string>>;

export default function EditHomeIdentityScreen() {
    const { theme } = useTheme();
    const [identity, setIdentity] = useState<HomeIdentity | null>(null);
    const [homeName, setHomeName] = useState('');
    const [propertyType, setPropertyType] = useState<PropertyType>('HOUSE');
    const [verifiedAddress, setVerifiedAddress] = useState<VerifiedAddress | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadHome();
    }, []);

    async function loadHome() {
        setLoading(true);
        setMessage('');

        try {
            const activeIdentity = await loadActiveHomeIdentity();
            setIdentity(activeIdentity);
            setHomeName(activeIdentity?.name || '');
            setPropertyType(normalizePropertyType(activeIdentity?.propertyType));
            setVerifiedAddress(activeIdentity?.address || null);

            if (!activeIdentity) {
                setMessage('No active home was found for this account.');
            }
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not load your home information.');
        } finally {
            setLoading(false);
        }
    }

    async function saveHome() {
        if (saving || !identity) return;

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
        setSaving(true);

        try {
            await updateHomeIdentity(identity.propertyId, {
                name: trimmedHomeName,
                propertyType,
                address: verifiedAddress,
            });

            router.replace('/' as any);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'We could not update your home right now. Please try again.');
        } finally {
            setSaving(false);
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
                    <TouchableOpacity
                        onPress={() => router.back()}
                        disabled={saving}
                        activeOpacity={0.82}
                        style={backButtonStyle}
                    >
                        <Text style={[backTextStyle, { color: theme.colors.text }]}>Back</Text>
                    </TouchableOpacity>

                    <Text style={[titleStyle, { color: theme.colors.text }]}>Edit Home Information</Text>
                    <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                        Update your home name, verified address, and property type.
                    </Text>

                    {loading ? (
                        <ThemedCard>
                            <View style={loadingRowStyle}>
                                <ActivityIndicator size="small" />
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    Loading home information...
                                </Text>
                            </View>
                        </ThemedCard>
                    ) : (
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
                                editable={!saving}
                                error={errors.homeName}
                            />

                            <VerifiedAddressPicker
                                disabled={saving}
                                initialAddress={identity?.address || null}
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
                                            disabled={saving}
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
                                title={saving ? 'Saving...' : 'Save Home'}
                                disabled={saving || !identity || !verifiedAddress}
                                onPress={saveHome}
                                style={{ marginTop: 18 }}
                            />
                        </ThemedCard>
                    )}

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

function normalizePropertyType(value?: string | null): PropertyType {
    const match = PROPERTY_TYPE_OPTIONS.find((option) => option.value === value);

    return match?.value || 'OTHER';
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

const backButtonStyle = {
    marginTop: 20,
    marginBottom: 20,
    alignSelf: 'flex-start' as const,
};

const backTextStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

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

const loadingRowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};
