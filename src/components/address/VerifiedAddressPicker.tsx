import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    createAddressSessionToken,
    searchAddressPredictions,
    validateAddressPrediction,
    type AddressPrediction,
} from '../../lib/addressVerification';
import {
    formatHomeAddress,
    formatSingleLineAddress,
    type VerifiedAddress,
} from '../../lib/homeIdentity';
import { useTheme } from '../../theme/useTheme';
import ThemedButton from '../theme/ThemedButton';

const MIN_SEARCH_LENGTH = 4;
const SEARCH_DEBOUNCE_MS = 400;

type VerifiedAddressPickerProps = {
    disabled?: boolean;
    initialAddress?: VerifiedAddress | null;
    onAddressConfirmed: (address: VerifiedAddress | null) => void;
};

export default function VerifiedAddressPicker({
    disabled = false,
    initialAddress = null,
    onAddressConfirmed,
}: VerifiedAddressPickerProps) {
    const { theme } = useTheme();
    const [searchText, setSearchText] = useState(formatSingleLineAddress(initialAddress));
    const [unit, setUnit] = useState(initialAddress?.addressLine2 || '');
    const [sessionToken, setSessionToken] = useState(createAddressSessionToken);
    const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
    const [selectedPrediction, setSelectedPrediction] = useState<AddressPrediction | null>(null);
    const [validatedAddress, setValidatedAddress] = useState<VerifiedAddress | null>(initialAddress);
    const [confirmedAddress, setConfirmedAddress] = useState<VerifiedAddress | null>(initialAddress);
    const [loadingPredictions, setLoadingPredictions] = useState(false);
    const [validatingAddress, setValidatingAddress] = useState(false);
    const [message, setMessage] = useState('');
    const searchRunRef = useRef(0);
    const validationRunRef = useRef(0);
    const sessionClosedRef = useRef(!!initialAddress);

    useEffect(() => {
        if (!initialAddress) return;

        setSearchText(formatSingleLineAddress(initialAddress));
        setUnit(initialAddress.addressLine2 || '');
        setValidatedAddress(initialAddress);
        setConfirmedAddress(initialAddress);
        onAddressConfirmed(initialAddress);
    }, [initialAddress]);

    useEffect(() => {
        const normalizedSearchText = searchText.trim();
        const currentSearchRun = searchRunRef.current + 1;
        searchRunRef.current = currentSearchRun;

        if (disabled || selectedPrediction?.description === normalizedSearchText) {
            setLoadingPredictions(false);
            setPredictions([]);
            return;
        }

        if (normalizedSearchText.length < MIN_SEARCH_LENGTH) {
            setLoadingPredictions(false);
            setPredictions([]);
            setMessage(normalizedSearchText ? 'Keep typing to search for your address.' : '');
            return;
        }

        setLoadingPredictions(true);
        setMessage('');

        const timer = setTimeout(async () => {
            try {
                const results = await searchAddressPredictions(normalizedSearchText, sessionToken);

                if (searchRunRef.current !== currentSearchRun) return;

                setPredictions(results);
                setMessage(results.length === 0 ? 'No matching U.S. street addresses found.' : '');
            } catch (error) {
                if (searchRunRef.current !== currentSearchRun) return;

                setPredictions([]);
                setMessage(error instanceof Error ? error.message : 'Address search is unavailable right now.');
            } finally {
                if (searchRunRef.current === currentSearchRun) {
                    setLoadingPredictions(false);
                }
            }
        }, SEARCH_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [disabled, searchText, selectedPrediction?.description, sessionToken]);

    function handleSearchTextChange(value: string) {
        setSearchText(value);
        setSelectedPrediction(null);
        setValidatedAddress(null);
        setConfirmedAddress(null);
        onAddressConfirmed(null);

        if (sessionClosedRef.current) {
            sessionClosedRef.current = false;
            setSessionToken(createAddressSessionToken());
        }
    }

    function handleUnitChange(value: string) {
        setUnit(value);

        if (confirmedAddress) {
            const nextAddress = {
                ...confirmedAddress,
                addressLine2: value.trim(),
            };

            setConfirmedAddress(nextAddress);
            onAddressConfirmed(nextAddress);
            return;
        }

        if (validatedAddress) {
            setValidatedAddress({
                ...validatedAddress,
                addressLine2: value.trim(),
            });
        }
    }

    async function selectPrediction(prediction: AddressPrediction) {
        if (disabled || validatingAddress) return;

        const validationRun = validationRunRef.current + 1;
        validationRunRef.current = validationRun;

        setSelectedPrediction(prediction);
        setSearchText(prediction.description);
        setPredictions([]);
        setValidatedAddress(null);
        setConfirmedAddress(null);
        onAddressConfirmed(null);
        setValidatingAddress(true);
        setMessage('Checking address...');

        try {
            const result = await validateAddressPrediction({
                prediction,
                sessionToken,
                addressLine2: unit.trim(),
            });

            if (validationRunRef.current !== validationRun) return;

            sessionClosedRef.current = true;

            if (!result.address) {
                setMessage(result.message || 'Choose a complete street address before continuing.');
                return;
            }

            setValidatedAddress(result.address);
            setMessage(result.message || 'Review the confirmed address below.');
        } catch (error) {
            if (validationRunRef.current !== validationRun) return;

            setMessage(error instanceof Error ? error.message : 'Address validation is unavailable right now.');
        } finally {
            if (validationRunRef.current === validationRun) {
                setValidatingAddress(false);
            }
        }
    }

    function confirmValidatedAddress() {
        if (!validatedAddress || disabled) return;

        const nextAddress = {
            ...validatedAddress,
            addressLine2: unit.trim(),
        };

        setConfirmedAddress(nextAddress);
        onAddressConfirmed(nextAddress);
        setMessage('Address confirmed.');
    }

    const addressForReview = confirmedAddress || validatedAddress;

    return (
        <View style={containerStyle}>
            <View style={inputGroupStyle}>
                <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>
                    Search for your home address
                </Text>
                <TextInput
                    placeholder="Start typing your street address"
                    placeholderTextColor={theme.colors.mutedText}
                    value={searchText}
                    onChangeText={handleSearchTextChange}
                    autoCapitalize="words"
                    autoCorrect={false}
                    editable={!disabled}
                    style={{
                        backgroundColor: theme.colors.surfaceAlt,
                        borderRadius: theme.radii.button,
                        color: theme.colors.text,
                        fontSize: 16,
                        opacity: disabled ? 0.65 : 1,
                        paddingHorizontal: 16,
                        paddingVertical: 16,
                    }}
                />
            </View>

            <View style={inputGroupStyle}>
                <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>
                    Apartment, suite, or unit number
                </Text>
                <TextInput
                    placeholder="Optional"
                    placeholderTextColor={theme.colors.mutedText}
                    value={unit}
                    onChangeText={handleUnitChange}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!disabled}
                    style={{
                        backgroundColor: theme.colors.surfaceAlt,
                        borderRadius: theme.radii.button,
                        color: theme.colors.text,
                        fontSize: 16,
                        opacity: disabled ? 0.65 : 1,
                        paddingHorizontal: 16,
                        paddingVertical: 16,
                    }}
                />
            </View>

            {loadingPredictions && (
                <View style={inlineStatusStyle}>
                    <ActivityIndicator size="small" />
                    <Text style={[helperTextStyle, { color: theme.colors.mutedText }]}>
                        Searching addresses...
                    </Text>
                </View>
            )}

            {predictions.length > 0 && (
                <View
                    style={[
                        predictionsContainerStyle,
                        {
                            backgroundColor: theme.colors.surfaceAlt,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radii.card,
                        },
                    ]}
                >
                    {predictions.map((prediction) => (
                        <TouchableOpacity
                            key={prediction.placeId}
                            onPress={() => selectPrediction(prediction)}
                            disabled={disabled || validatingAddress}
                            activeOpacity={0.82}
                            style={[
                                predictionRowStyle,
                                { borderBottomColor: theme.colors.border },
                            ]}
                        >
                            <Text style={[predictionTitleStyle, { color: theme.colors.text }]}>
                                {prediction.mainText || prediction.description}
                            </Text>
                            {!!prediction.secondaryText && (
                                <Text style={[predictionMetaStyle, { color: theme.colors.mutedText }]}>
                                    {prediction.secondaryText}
                                </Text>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {validatingAddress && (
                <View style={inlineStatusStyle}>
                    <ActivityIndicator size="small" />
                    <Text style={[helperTextStyle, { color: theme.colors.mutedText }]}>
                        Confirming address...
                    </Text>
                </View>
            )}

            {!!addressForReview && (
                <View
                    style={[
                        confirmedAddressStyle,
                        {
                            backgroundColor: theme.colors.surfaceAlt,
                            borderColor: confirmedAddress ? theme.colors.primary : theme.colors.border,
                            borderRadius: theme.radii.card,
                        },
                    ]}
                >
                    <Text style={[reviewTitleStyle, { color: theme.colors.text }]}>
                        {confirmedAddress ? 'Confirmed address' : 'Use this standardized address?'}
                    </Text>
                    {formatHomeAddress({ ...addressForReview, addressLine2: unit.trim() })
                        .split('\n')
                        .map((line) => (
                            <Text key={line} style={[reviewTextStyle, { color: theme.colors.mutedText }]}>
                                {line}
                            </Text>
                        ))}

                    {!confirmedAddress && (
                        <ThemedButton
                            title="Use This Address"
                            onPress={confirmValidatedAddress}
                            disabled={disabled || validatingAddress}
                            style={{ marginTop: 14 }}
                        />
                    )}
                </View>
            )}

            {!!message && (
                <Text
                    style={[
                        helperTextStyle,
                        {
                            color: confirmedAddress ? theme.colors.primary : theme.colors.mutedText,
                        },
                    ]}
                >
                    {message}
                </Text>
            )}
        </View>
    );
}

const containerStyle = {
    gap: 4,
};

const inputGroupStyle = {
    marginBottom: 14,
};

const fieldLabelStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const helperTextStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 6,
};

const inlineStatusStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    marginBottom: 10,
};

const predictionsContainerStyle = {
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden' as const,
};

const predictionRowStyle = {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
};

const predictionTitleStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};

const predictionMetaStyle = {
    fontSize: 13,
    fontWeight: '800' as const,
    lineHeight: 18,
    marginTop: 4,
};

const confirmedAddressStyle = {
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 10,
    padding: 16,
};

const reviewTitleStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const reviewTextStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
};
