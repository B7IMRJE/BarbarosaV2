import DictationTextInput from '@/components/input/DictationTextInput';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
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
    MAJOR_HOME_UPGRADE_OPTIONS,
    PROPERTY_TYPE_OPTIONS,
    loadActiveHomeIdentity,
    updateHomeIdentity,
    type HomeIdentity,
    type MajorHomeUpgradeType,
    type PropertyType,
    type VerifiedAddress,
} from '../../lib/homeIdentity';
import {
    HOME_STORY_COUNT_OPTIONS,
    type HomeStoryCount,
} from '../../lib/homePropertyAccess';
import { useTheme } from '../../theme/useTheme';

type FieldName = 'homeName' | 'address' | 'propertyType' | 'storyCount' | 'gateCode' | 'yearBuilt' | 'squareFootage' | 'apn';
type FormErrors = Partial<Record<FieldName, string>>;

export default function EditHomeIdentityScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();

    function scaleStyle<T extends Record<string, any>>(style: T): T {
        const scaledStyle: Record<string, any> = { ...style };

        Object.entries(style).forEach(([key, value]) => {
            if (typeof value !== 'number') return;

            if (key === 'fontSize' || key === 'lineHeight') {
                scaledStyle[key] = scaleFont(value);
            }

            if (
                key === 'padding' ||
                key === 'paddingBottom' ||
                key === 'paddingVertical' ||
                key === 'paddingHorizontal' ||
                key === 'marginTop' ||
                key === 'marginBottom' ||
                key === 'gap' ||
                key === 'minWidth' ||
                key === 'width' ||
                key === 'height' ||
                key === 'borderRadius'
            ) {
                scaledStyle[key] = scaleIcon(value);
            }
        });

        return scaledStyle as T;
    }
    const [identity, setIdentity] = useState<HomeIdentity | null>(null);
    const [homeName, setHomeName] = useState('');
    const [propertyType, setPropertyType] = useState<PropertyType>('HOUSE');
    const [storyCount, setStoryCount] = useState<HomeStoryCount | ''>('');
    const [gateCode, setGateCode] = useState('');
    const [verifiedAddress, setVerifiedAddress] = useState<VerifiedAddress | null>(null);
    const [yearBuilt, setYearBuilt] = useState('');
    const [squareFootage, setSquareFootage] = useState('');
    const [apn, setApn] = useState('');
    const [majorUpgradeTypes, setMajorUpgradeTypes] = useState<MajorHomeUpgradeType[]>([]);
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
            setStoryCount(activeIdentity?.storyCount || '');
            setGateCode(activeIdentity?.gateCode || '');
            setVerifiedAddress(activeIdentity?.address || null);
            setYearBuilt(activeIdentity?.yearBuilt ? String(activeIdentity.yearBuilt) : '');
            setSquareFootage(activeIdentity?.squareFootage ? String(activeIdentity.squareFootage) : '');
            setApn(activeIdentity?.apn || '');
            setMajorUpgradeTypes(activeIdentity?.majorUpgradeTypes || []);

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
            storyCount,
            gateCode,
            yearBuilt,
            squareFootage,
            apn,
        });

        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            setMessage('');
            return;
        }

        if (!verifiedAddress || !storyCount) return;

        setErrors({});
        setMessage('');
        setSaving(true);

        try {
            await updateHomeIdentity(identity.propertyId, {
                name: trimmedHomeName,
                propertyType,
                address: verifiedAddress,
                storyCount,
                gateCode,
                yearBuilt: parseOptionalWholeNumber(yearBuilt),
                squareFootage: parseOptionalWholeNumber(squareFootage),
                apn: apn.trim() || null,
                majorUpgradeTypes,
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
                contentContainerStyle={{ padding: scaleIcon(20), paddingBottom: scaleIcon(40), alignItems: 'center' }}
            >
                <View style={{ width: '100%', maxWidth: 900 }}>
                    <TouchableOpacity
                        onPress={() => router.back()}
                        disabled={saving}
                        activeOpacity={0.82}
                        style={scaleStyle(backButtonStyle)}
                    >
                        <Text style={[scaleStyle(backTextStyle), { color: theme.colors.text }]}>Back</Text>
                    </TouchableOpacity>

                    <Text style={[scaleStyle(titleStyle), { color: theme.colors.text }]}>Edit Home Information</Text>
                    <Text style={[scaleStyle(subtitleStyle), { color: theme.colors.mutedText }]}>
                        Keep your Home Identity and optional homeowner-provided property facts together.
                    </Text>

                    {loading ? (
                        <ThemedCard>
                            <View style={scaleStyle(loadingRowStyle)}>
                                <ActivityIndicator size="small" />
                                <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>
                                    Loading home information...
                                </Text>
                            </View>
                        </ThemedCard>
                    ) : (
                        <ThemedCard>
                            <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Home Details</Text>

                            <ThemedInput
                                label="Home nickname or display name"
                                placeholder="Example: Bravo’s Home"
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
                                <Text style={[scaleStyle(fieldErrorStyle), { color: theme.colors.danger }]}>
                                    {errors.address}
                                </Text>
                            )}

                            <Text style={[scaleStyle(fieldLabelStyle), { color: theme.colors.text }]}>Property type</Text>
                            <View style={scaleStyle(propertyTypeGridStyle)}>
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
                                            style={scaleStyle(propertyTypeButtonStyle)}
                                        />
                                    );
                                })}
                            </View>
                            {!!errors.propertyType && (
                                <Text style={[scaleStyle(fieldErrorStyle), { color: theme.colors.danger }]}>
                                    {errors.propertyType}
                                </Text>
                            )}

                            <Text style={[scaleStyle(fieldLabelStyle), { color: theme.colors.text, marginTop: scaleIcon(18) }]}>Building stories</Text>
                            <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText, marginBottom: scaleIcon(10) }]}>
                                This helps providers plan access, crew needs, time, and material movement.
                            </Text>
                            <View style={scaleStyle(propertyTypeGridStyle)}>
                                {HOME_STORY_COUNT_OPTIONS.map((option) => {
                                    const selected = storyCount === option.value;

                                    return (
                                        <ThemedButton
                                            key={option.value}
                                            title={option.label}
                                            variant={selected ? 'primary' : 'secondary'}
                                            disabled={saving}
                                            onPress={() => {
                                                setStoryCount(option.value);
                                                clearFieldError('storyCount');
                                            }}
                                            style={scaleStyle(propertyTypeButtonStyle)}
                                        />
                                    );
                                })}
                            </View>
                            {!!errors.storyCount && (
                                <Text style={[scaleStyle(fieldErrorStyle), { color: theme.colors.danger }]}>
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
                                editable={!saving}
                                error={errors.gateCode}
                            />
                            <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText, marginTop: -scaleIcon(6), marginBottom: scaleIcon(14) }]}>
                                Hidden by default and available only in an authorized HomeOS or provider context.
                            </Text>

                            <View style={[scaleStyle(profileFactsStyle), { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                                <Text style={[scaleStyle(sectionTitleStyle), { color: theme.colors.text }]}>Home Profile</Text>
                                <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText, marginBottom: scaleIcon(16) }]}>
                                    These facts are optional and homeowner-provided. HomeOS does not publicly verify them. No deed image or ownership document is requested, and automated property lookup is not enabled.
                                </Text>

                                <ThemedInput
                                    label="Year built (optional)"
                                    placeholder="Example: 1987"
                                    value={yearBuilt}
                                    onChangeText={(value) => {
                                        setYearBuilt(value.replace(/\D/g, '').slice(0, 4));
                                        clearFieldError('yearBuilt');
                                    }}
                                    keyboardType="number-pad"
                                    editable={!saving}
                                    error={errors.yearBuilt}
                                />

                                <ThemedInput
                                    label="Square footage (optional)"
                                    placeholder="Example: 1850"
                                    value={squareFootage}
                                    onChangeText={(value) => {
                                        setSquareFootage(value.replace(/\D/g, '').slice(0, 7));
                                        clearFieldError('squareFootage');
                                    }}
                                    keyboardType="number-pad"
                                    editable={!saving}
                                    error={errors.squareFootage}
                                />

                                <ThemedInput
                                    label="Assessor parcel number / APN (optional)"
                                    placeholder="Only add this if you choose"
                                    value={apn}
                                    onChangeText={(value) => {
                                        setApn(value.slice(0, 100));
                                        clearFieldError('apn');
                                    }}
                                    dictationEnabled={false}
                                    editable={!saving}
                                    error={errors.apn}
                                />

                                <Text style={[scaleStyle(fieldLabelStyle), { color: theme.colors.text }]}>Major upgrades or additions (optional)</Text>
                                <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText, marginBottom: scaleIcon(10) }]}>
                                    Select what the homeowner reports. Add dates and durable records in Construction History.
                                </Text>
                                <View style={scaleStyle(propertyTypeGridStyle)}>
                                    {MAJOR_HOME_UPGRADE_OPTIONS.map((option) => {
                                        const selected = majorUpgradeTypes.includes(option.value);

                                        return (
                                            <ThemedButton
                                                key={option.value}
                                                title={option.label}
                                                variant={selected ? 'primary' : 'secondary'}
                                                disabled={saving}
                                                onPress={() => setMajorUpgradeTypes((current) => selected
                                                    ? current.filter((value) => value !== option.value)
                                                    : [...current, option.value]
                                                )}
                                                style={scaleStyle(propertyTypeButtonStyle)}
                                            />
                                        );
                                    })}
                                </View>
                            </View>

                            <ThemedButton
                                title={saving ? 'Saving...' : 'Save Home'}
                                disabled={saving || !identity || !verifiedAddress}
                                onPress={saveHome}
                                style={{ marginTop: scaleIcon(18) }}
                            />
                        </ThemedCard>
                    )}

                    {!!message && (
                        <ThemedCard style={{ marginTop: scaleIcon(16) }}>
                            <Text style={[scaleStyle(bodyTextStyle), { color: theme.colors.mutedText }]}>{message}</Text>
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
    storyCount,
    gateCode,
    yearBuilt,
    squareFootage,
    apn,
}: {
    homeName: string;
    address: VerifiedAddress | null;
    propertyType: string;
    storyCount: string;
    gateCode: string;
    yearBuilt: string;
    squareFootage: string;
    apn: string;
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

    const year = parseOptionalWholeNumber(yearBuilt);
    const nextYear = new Date().getFullYear() + 1;
    if (yearBuilt.trim() && (year === null || year < 1600 || year > nextYear)) {
        nextErrors.yearBuilt = `Enter a year from 1600 to ${nextYear}, or leave it blank.`;
    }

    const footage = parseOptionalWholeNumber(squareFootage);
    if (squareFootage.trim() && (footage === null || footage < 1 || footage > 1_000_000)) {
        nextErrors.squareFootage = 'Enter square footage from 1 to 1,000,000, or leave it blank.';
    }

    if (apn.trim().length > 100) nextErrors.apn = 'Keep the APN under 100 characters.';

    return nextErrors;
}

function parseOptionalWholeNumber(value: string) {
    if (!value.trim()) return null;

    const number = Number(value);

    return Number.isInteger(number) ? number : null;
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
    const { scaleFont, scaleIcon, theme } = useTheme();

    const scaledInputGroupStyle = {
        ...inputGroupStyle,
        marginBottom: scaleIcon(14),
    };
    const scaledFieldLabelStyle = {
        ...fieldLabelStyle,
        fontSize: scaleFont(15),
        marginBottom: scaleIcon(8),
    };
    const scaledFieldErrorStyle = {
        ...fieldErrorStyle,
        fontSize: scaleFont(13),
        marginTop: scaleIcon(6),
    };

    return (
        <View style={scaledInputGroupStyle}>
            <Text style={[scaledFieldLabelStyle, { color: theme.colors.text }]}>{label}</Text>
            <DictationTextInput
                dictationEnabled={dictationEnabled}
                placeholder={placeholder}
                placeholderTextColor={theme.colors.mutedText}
                value={value}
                onChangeText={onChangeText}
                keyboardType={keyboardType}
                autoCapitalize={autoCapitalize}
                editable={editable}
                secureTextEntry={secureTextEntry}
                autoCorrect={autoCorrect}
                style={{
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: theme.radii.button,
                    color: theme.colors.text,
                    fontSize: scaleFont(16),
                    opacity: editable ? 1 : 0.65,
                    paddingHorizontal: scaleIcon(16),
                    paddingVertical: scaleIcon(16),
                }}
            />
            {!!error && <Text style={[scaledFieldErrorStyle, { color: theme.colors.danger }]}>{error}</Text>}
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

const profileFactsStyle = {
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 18,
    marginBottom: 18,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};
