import DictationTextInput from '@/components/input/DictationTextInput';
import { router, useLocalSearchParams, usePathname } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
    type TextInputProps,
} from 'react-native';
import VerifiedAddressPicker from '../../components/address/VerifiedAddressPicker';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    PROPERTY_TYPE_OPTIONS,
    createAdditionalHomeIdentity,
    createFirstHomeIdentity,
    type PropertyType,
    type VerifiedAddress,
} from '../../lib/homeIdentity';
import {
    HOME_STORY_COUNT_OPTIONS,
    type HomeStoryCount,
} from '../../lib/homePropertyAccess';
import { syncMyProfile } from '../../lib/profileSync';
import { selectActiveProperty } from '../../lib/activeProperty';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type FieldName = 'homeName' | 'address' | 'propertyType' | 'storyCount' | 'gateCode';
type FormErrors = Partial<Record<FieldName, string>>;

export default function CreateHomeOnboardingScreen() {
    const { theme } = useTheme();
    const pathname = usePathname();
    const addingProperty = pathname === '/property/add';
    const params = useLocalSearchParams<{ next?: string | string[] }>();
    const nextRoute = useMemo(() => resolveSafeNext(firstParam(params.next)), [params.next]);
    const [homeName, setHomeName] = useState('');
    const [propertyType, setPropertyType] = useState<PropertyType>('HOUSE');
    const [storyCount, setStoryCount] = useState<HomeStoryCount>('1');
    const [gateCode, setGateCode] = useState('');
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
            storyCount,
            gateCode,
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
            router.replace('/auth/login' as never);
            return;
        }

        try {
            const invitedName = String(
                user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                ''
            ).trim();
            await syncMyProfile({
                fullName: invitedName,
                role: 'HOMEOWNER',
            });

            const input = {
                name: trimmedHomeName,
                propertyType,
                address: verifiedAddress,
                storyCount,
                gateCode,
            };
            const propertyId = addingProperty
                ? await createAdditionalHomeIdentity(input)
                : await createFirstHomeIdentity(input);

            if (addingProperty) {
                await selectActiveProperty(propertyId);
                router.replace('/' as never);
            } else {
                router.replace(buildThemeRoute(nextRoute) as never);
            }
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

                    <Text style={[titleStyle, { color: theme.colors.text }]}>
                        {addingProperty ? 'Add Property' : 'Create First Home'}
                    </Text>
                    <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                        {addingProperty
                            ? 'Add another property to this HomeOS account. Each property keeps its own rooms, equipment, documents, and service history.'
                            : 'Add your home so HomeOS can finish setting up your account.'}
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

                        <Text style={[fieldLabelStyle, { color: theme.colors.text, marginTop: 18 }]}>Building stories</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText, marginBottom: 10 }]}>
                            This helps providers plan access, crew needs, time, and material movement.
                        </Text>
                        <View style={propertyTypeGridStyle}>
                            {HOME_STORY_COUNT_OPTIONS.map((option) => {
                                const selected = storyCount === option.value;

                                return (
                                    <ThemedButton
                                        key={option.value}
                                        title={option.label}
                                        variant={selected ? 'primary' : 'secondary'}
                                        disabled={submitting}
                                        onPress={() => {
                                            setStoryCount(option.value);
                                            clearFieldError('storyCount');
                                        }}
                                        style={propertyTypeButtonStyle}
                                    />
                                );
                            })}
                        </View>
                        {!!errors.storyCount && (
                            <Text style={[fieldErrorStyle, { color: theme.colors.danger }]}>
                                {errors.storyCount}
                            </Text>
                        )}

                        <ThemedInput
                            label="Gate or property access code (optional)"
                            placeholder="Enter only if access requires it"
                            value={gateCode}
                            onChangeText={(value) => {
                                setGateCode(value.slice(0, 80));
                                clearFieldError('gateCode');
                            }}
                            autoCapitalize="none"
                            autoCorrect={false}
                            secureTextEntry
                            dictationEnabled={false}
                            editable={!submitting}
                            error={errors.gateCode}
                        />
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText, marginTop: -6, marginBottom: 14 }]}>
                            Hidden by default and available only in an authorized HomeOS or provider context.
                        </Text>

                        {!verifiedAddress && (
                            <Text style={[addressHelpStyle, { color: theme.colors.mutedText }]}>
                                To enable {addingProperty ? 'Add Property' : 'Create Home'}, select an address result and then choose Use This Address.
                            </Text>
                        )}

                        <ThemedButton
                            title={submitting
                                ? (addingProperty ? 'Adding property...' : 'Creating home...')
                                : (addingProperty ? 'Add Property' : 'Create Home')}
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

function firstParam(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function resolveSafeNext(value: string | undefined) {
    if (!value) return null;

    try {
        const parsed = new URL(value, 'https://app.local');

        if (parsed.pathname === '/customer-invite') {
            return `${parsed.pathname}${parsed.search}`;
        }
    } catch {
        return null;
    }

    return null;
}

function buildThemeRoute(nextRoute: string | null) {
    if (!nextRoute) return '/onboarding/theme';

    return `/onboarding/theme?next=${encodeURIComponent(nextRoute)}`;
}

function validateHomeForm({
    homeName,
    address,
    propertyType,
    storyCount,
    gateCode,
}: {
    homeName: string;
    address: VerifiedAddress | null;
    propertyType: string;
    storyCount: string;
    gateCode: string;
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

    if (!HOME_STORY_COUNT_OPTIONS.some((option) => option.value === storyCount)) {
        nextErrors.storyCount = 'Choose the number of stories.';
    }

    if (gateCode.trim().length > 80) nextErrors.gateCode = 'Keep the access code under 80 characters.';

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
    dictationEnabled = true,
    secureTextEntry = false,
    autoCorrect,
    error,
}: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    keyboardType?: TextInputProps['keyboardType'];
    autoCapitalize?: TextInputProps['autoCapitalize'];
    editable?: boolean;
    dictationEnabled?: boolean;
    secureTextEntry?: boolean;
    autoCorrect?: boolean;
    error?: string;
}) {
    const { theme } = useTheme();

    return (
        <View style={inputGroupStyle}>
            <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>{label}</Text>
            <DictationTextInput
                dictationEnabled={dictationEnabled}
                placeholder={placeholder}
                placeholderTextColor={theme.colors.mutedText}
                value={value}
                onChangeText={onChangeText}
                keyboardType={keyboardType}
                autoCapitalize={autoCapitalize}
                autoCorrect={autoCorrect}
                editable={editable}
                secureTextEntry={secureTextEntry}
                style={{
                    backgroundColor: theme.colors.surfaceAlt,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radii.button,
                    borderWidth: 2,
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

const addressHelpStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 16,
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
