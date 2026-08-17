import SignaturePad, { isDrawnSignature } from '../../components/signature-pad';
import {
    createEstimatePresentationMediaUrl,
    formatPresentationJoinCode,
    joinEstimatePresentation,
    refreshJoinedEstimatePresentation,
    signJoinedEstimatePresentation,
    type EstimatePresentationMedia,
    type JoinedEstimatePresentation,
} from '../../lib/estimatePresentation';
import {
    describeRepipeCustomerSelection,
    isRepipePresentationService,
    repipeHomeownerGuideSections,
} from '../../lib/repipeHomeownerContent';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function HomeownerPresentationScreen() {
    const { session } = useLocalSearchParams<{ session?: string | string[] }>();
    const sharedSecret = firstParam(session);
    const attemptedSharedSecretRef = useRef('');
    const [joinCode, setJoinCode] = useState('');
    const [joining, setJoining] = useState(false);
    const [presentation, setPresentation] = useState<JoinedEstimatePresentation | null>(null);
    const [message, setMessage] = useState('Enter the code shown by your service professional.');
    const [signerName, setSignerName] = useState('');
    const [signature, setSignature] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
    const joinEvent = useEffectEvent(join);

    useEffect(() => {
        if (!sharedSecret || attemptedSharedSecretRef.current === sharedSecret) return;

        attemptedSharedSecretRef.current = sharedSecret;
        void joinEvent(sharedSecret, true);
    }, [sharedSecret]);

    useEffect(() => {
        if (!presentation?.viewerToken || presentation.status !== 'active') return;

        const interval = setInterval(() => {
            void refreshJoinedEstimatePresentation(presentation.viewerToken)
                .then((next) => {
                    setPresentation(next);
                    if (next.status === 'signed') setMessage('Signature received. This presentation is complete.');
                })
                .catch((error) => {
                    setPresentation(null);
                    setPhotoUrls({});
                    setMessage(readError(error, 'This presentation ended, expired, or was revoked.'));
                });
        }, 5000);

        return () => clearInterval(interval);
    }, [presentation?.status, presentation?.viewerToken]);

    useEffect(() => {
        if (!presentation?.viewerToken) return;

        let active = true;
        const load = async () => {
            const entries = await Promise.all(presentation.payload.media.map(async (media) => {
                try {
                    const url = await createEstimatePresentationMediaUrl(presentation.viewerToken, media.id);
                    return [media.id, url] as const;
                } catch {
                    return null;
                }
            }));

            if (!active) return;
            setPhotoUrls(entries.reduce<Record<string, string>>((urls, entry) => {
                if (entry) urls[entry[0]] = entry[1];
                return urls;
            }, {}));
        };

        void load();
        return () => { active = false; };
    }, [presentation?.payload.media, presentation?.payloadVersion, presentation?.viewerToken]);

    async function join(secret: string, fromLink = false) {
        if (joining) return;

        setJoining(true);
        setMessage('Opening the secure homeowner presentation…');
        try {
            const joined = await joinEstimatePresentation(secret);
            setPresentation(joined);
            setMessage('Connected. This screen contains only the presentation selected for you.');
            if (fromLink && typeof window !== 'undefined') {
                window.history.replaceState({}, '', '/presentation');
            }
        } catch (error) {
            setPresentation(null);
            setMessage(readError(error, 'The code is invalid, expired, or revoked.'));
        } finally {
            setJoining(false);
        }
    }

    async function submitSignature() {
        if (!presentation || submitting) return;
        if (!signerName.trim()) {
            setMessage('Enter the homeowner name before signing.');
            return;
        }
        if (!isDrawnSignature(signature)) {
            setMessage('Draw a complete signature before submitting.');
            return;
        }

        setSubmitting(true);
        setMessage('Submitting the signed presentation…');
        try {
            const result = await signJoinedEstimatePresentation({
                viewerToken: presentation.viewerToken,
                signerName,
                signature,
            });
            setPresentation({
                ...presentation,
                status: 'signed',
                signedAt: typeof result.signed_at === 'string' ? result.signed_at : new Date().toISOString(),
            });
            setMessage('Signature received. The timestamped record returned to the estimate audit trail.');
        } catch (error) {
            setMessage(readError(error, 'The signature could not be submitted. Ask staff to confirm the session is still open.'));
        } finally {
            setSubmitting(false);
        }
    }

    if (!presentation) {
        return (
            <View style={pageStyle}>
                <View style={joinCardStyle}>
                    <Text style={eyebrowStyle}>HOMEOWNER PRESENTATION</Text>
                    <Text style={titleStyle}>Open your estimate</Text>
                    <Text style={bodyStyle}>
                        This is a short-lived, read-only presentation. It never opens a staff account, HomeOS, TechOS, private notes, or other customer records.
                    </Text>
                    <Text style={labelStyle}>Presentation code</Text>
                    <TextInput
                        accessibilityLabel="Presentation code"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        editable={!joining}
                        onChangeText={(value) => setJoinCode(formatPresentationJoinCode(value))}
                        onSubmitEditing={() => void join(joinCode)}
                        placeholder="AB12-CD34"
                        placeholderTextColor="#668394"
                        style={codeInputStyle}
                        value={joinCode}
                    />
                    <TouchableOpacity
                        accessibilityRole="button"
                        disabled={joining || joinCode.replace('-', '').length !== 8}
                        onPress={() => void join(joinCode)}
                        style={[primaryButtonStyle, (joining || joinCode.replace('-', '').length !== 8) && disabledStyle]}
                    >
                        {joining ? <ActivityIndicator color="#062431" /> : <Text style={primaryButtonTextStyle}>Open Presentation</Text>}
                    </TouchableOpacity>
                    <Text accessibilityLiveRegion="polite" style={messageStyle}>{message}</Text>
                </View>
            </View>
        );
    }

    const signed = presentation.status === 'signed';
    const payload = presentation.payload;
    const repipePresentation = isRepipePresentationService(payload.serviceType);

    return (
        <ScrollView style={pageStyle} contentContainerStyle={contentStyle}>
            <View style={presentationHeaderStyle}>
                <Text style={eyebrowStyle}>SECURE HOMEOWNER PRESENTATION</Text>
                <Text style={titleStyle}>{payload.companyName}</Text>
                <Text style={bodyStyle}>Only the estimate content selected by staff is visible on this screen.</Text>
                <View style={statusRowStyle}>
                    <Text style={statusPillStyle}>{signed ? 'Signed ✓' : 'Live session'}</Text>
                    {payload.estimate?.quoteNumber ? <Text style={quoteStyle}>{payload.estimate.quoteNumber}</Text> : null}
                </View>
            </View>

            {payload.media.length > 0 && (
                <View style={sectionStyle}>
                    <Text style={sectionTitleStyle}>Selected Presentation Photos</Text>
                    <View style={photoGridStyle}>
                        {payload.media.map((media) => (
                            <PresentationPhoto key={media.id} media={media} url={photoUrls[media.id]} />
                        ))}
                    </View>
                </View>
            )}

            {repipePresentation && (
                <View style={sectionStyle}>
                    <Text style={sectionTitleStyle}>Understanding Your Repipe</Text>
                    <Text style={bodyStyle}>
                        The written selections below control what is included for this home. This explanation does not add unselected work, products, warranties, testing, or credentials.
                    </Text>
                    <View style={repipeGuideGridStyle}>
                        {repipeHomeownerGuideSections.map((section) => (
                            <View key={section.id} style={repipeGuideCardStyle}>
                                <Text style={repipeGuideTitleStyle}>{section.title}</Text>
                                <Text style={repipeGuideBodyStyle}>{section.body}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            <View style={sectionStyle}>
                <Text style={sectionTitleStyle}>Estimate Options</Text>
                <View style={optionGridStyle}>
                    {payload.options.map((option) => (
                        <View key={option.id} style={optionCardStyle}>
                            <View style={optionTitleRowStyle}>
                                <Text style={optionTitleStyle}>{option.title}</Text>
                                {option.recommended && <Text style={recommendedStyle}>Recommended</Text>}
                            </View>
                            {payload.includeEstimateSummary && (
                                <Text style={priceStyle}>{formatMoney(option.totalAmount)}</Text>
                            )}
                            {!!option.shortSummary && <Text style={optionSummaryStyle}>{option.shortSummary}</Text>}
                            {!!option.homeownerExplanation && <Text style={optionBodyStyle}>{option.homeownerExplanation}</Text>}
                            {option.customerSelections.length > 0 && (
                                <View style={includedStyle}>
                                    <Text style={includedTitleStyle}>What&apos;s included</Text>
                                    {option.customerSelections.map((selection, index) => {
                                        const description = repipePresentation ? describeRepipeCustomerSelection(selection) : '';

                                        return (
                                            <View key={`${selection}-${index}`} style={includedItemStyle}>
                                                <Text style={includedTextStyle}>✓ {selection.replace(/^Included:\s*/i, '')}</Text>
                                                {!!description && <Text style={includedDescriptionStyle}>{description}</Text>}
                                            </View>
                                        );
                                    })}
                                </View>
                            )}
                        </View>
                    ))}
                </View>
            </View>

            {payload.signatureRequested && (
                <View style={signatureSectionStyle}>
                    <Text style={sectionTitleStyle}>Homeowner Signature</Text>
                    <Text style={bodyStyle}>
                        Review the selected estimate content above. Signing records this presented snapshot and timestamp; it does not expose or approve unseen work.
                    </Text>
                    {signed ? (
                        <View style={signedCardStyle}>
                            <Text style={signedTitleStyle}>Signature received ✓</Text>
                            <Text style={bodyStyle}>{presentation.signedAt ? new Date(presentation.signedAt).toLocaleString() : 'Recorded now'}</Text>
                        </View>
                    ) : (
                        <>
                            <Text style={labelStyle}>Homeowner name</Text>
                            <TextInput
                                accessibilityLabel="Homeowner name"
                                autoComplete="name"
                                onChangeText={setSignerName}
                                placeholder="Full name"
                                placeholderTextColor="#668394"
                                style={nameInputStyle}
                                value={signerName}
                            />
                            <SignaturePad label="Approval signature" value={signature} onChange={setSignature} disabled={submitting} />
                            <TouchableOpacity
                                accessibilityRole="button"
                                disabled={submitting}
                                onPress={() => void submitSignature()}
                                style={[primaryButtonStyle, submitting && disabledStyle]}
                            >
                                {submitting ? <ActivityIndicator color="#062431" /> : <Text style={primaryButtonTextStyle}>Submit Signature</Text>}
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            )}

            <Text accessibilityLiveRegion="polite" style={messageStyle}>{message}</Text>
            <Text style={privacyFooterStyle}>Session expires automatically. Staff can update, end, or revoke it at any time.</Text>
        </ScrollView>
    );
}

function PresentationPhoto({ media, url }: { media: EstimatePresentationMedia; url?: string }) {
    return (
        <View style={photoCardStyle}>
            {url ? (
                <Image accessibilityLabel={media.title} resizeMode="contain" source={{ uri: url }} style={photoStyle} />
            ) : (
                <View style={[photoStyle, photoLoadingStyle]}><ActivityIndicator color="#56C9B1" /></View>
            )}
            <Text style={photoTitleStyle}>{media.title || media.productName}</Text>
        </View>
    );
}

function firstParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

function formatMoney(value: number) {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function readError(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

const pageStyle = { flex: 1, backgroundColor: '#061C29' } as const;
const contentStyle = { padding: 18, paddingBottom: 56, gap: 20, alignItems: 'center' } as const;
const joinCardStyle = { width: '92%', maxWidth: 620, margin: 'auto', padding: 24, borderRadius: 22, backgroundColor: '#0D2A39', borderWidth: 1, borderColor: '#254B5B', gap: 14 } as const;
const presentationHeaderStyle = { width: '100%', maxWidth: 1180, padding: 24, borderRadius: 22, backgroundColor: '#0D2A39', borderWidth: 1, borderColor: '#254B5B', gap: 8 } as const;
const eyebrowStyle = { color: '#56C9B1', fontSize: 13, fontWeight: '900', letterSpacing: 1 } as const;
const titleStyle = { color: '#F4FBFD', fontSize: 34, lineHeight: 40, fontWeight: '900' } as const;
const bodyStyle = { color: '#BCD1DB', fontSize: 17, lineHeight: 25, fontWeight: '600' } as const;
const labelStyle = { color: '#DCEBF0', fontSize: 16, fontWeight: '800', marginTop: 6 } as const;
const codeInputStyle = { minHeight: 58, borderRadius: 14, borderWidth: 1, borderColor: '#4C7282', backgroundColor: '#071F2D', color: '#FFFFFF', paddingHorizontal: 16, fontSize: 28, letterSpacing: 4, fontWeight: '900', textAlign: 'center' } as const;
const nameInputStyle = { minHeight: 54, borderRadius: 12, borderWidth: 1, borderColor: '#4C7282', backgroundColor: '#071F2D', color: '#FFFFFF', paddingHorizontal: 14, fontSize: 18 } as const;
const primaryButtonStyle = { minHeight: 54, borderRadius: 14, backgroundColor: '#56C9B1', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 } as const;
const primaryButtonTextStyle = { color: '#062431', fontSize: 17, fontWeight: '900' } as const;
const disabledStyle = { opacity: 0.45 } as const;
const messageStyle = { color: '#A9CBD8', fontSize: 15, lineHeight: 22, fontWeight: '700' } as const;
const statusRowStyle = { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 8 } as const;
const statusPillStyle = { color: '#062431', backgroundColor: '#56C9B1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, fontSize: 14, fontWeight: '900' } as const;
const quoteStyle = { color: '#DCEBF0', fontSize: 18, fontWeight: '900' } as const;
const sectionStyle = { width: '100%', maxWidth: 1180, gap: 14 } as const;
const sectionTitleStyle = { color: '#F4FBFD', fontSize: 25, lineHeight: 31, fontWeight: '900' } as const;
const repipeGuideGridStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 14 } as const;
const repipeGuideCardStyle = { flexGrow: 1, flexBasis: 250, minWidth: 230, padding: 18, borderRadius: 18, backgroundColor: '#0D2A39', borderWidth: 1, borderColor: '#2B5665' } as const;
const repipeGuideTitleStyle = { color: '#64D8C2', fontSize: 19, lineHeight: 25, fontWeight: '900' } as const;
const repipeGuideBodyStyle = { color: '#C8DCE3', fontSize: 16, lineHeight: 24, fontWeight: '600', marginTop: 7 } as const;
const photoGridStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 14 } as const;
const photoCardStyle = { width: 250, maxWidth: '100%', flexGrow: 1, minWidth: 220, borderRadius: 18, overflow: 'hidden', backgroundColor: '#0D2A39', borderWidth: 1, borderColor: '#254B5B' } as const;
const photoStyle = { width: '100%', height: 220, backgroundColor: '#FFFFFF' } as const;
const photoLoadingStyle = { alignItems: 'center', justifyContent: 'center', backgroundColor: '#102F3D' } as const;
const photoTitleStyle = { color: '#E5F2F5', fontSize: 15, fontWeight: '800', padding: 12 } as const;
const optionGridStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 16 } as const;
const optionCardStyle = { flexGrow: 1, flexBasis: 420, minWidth: 280, borderRadius: 20, backgroundColor: '#F7FBFC', padding: 20, gap: 10 } as const;
const optionTitleRowStyle = { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 } as const;
const optionTitleStyle = { color: '#0A2838', fontSize: 25, lineHeight: 31, fontWeight: '900', flex: 1 } as const;
const recommendedStyle = { color: '#0B493E', backgroundColor: '#C7F4E6', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: '900' } as const;
const priceStyle = { color: '#0A4F63', fontSize: 30, fontWeight: '900' } as const;
const optionSummaryStyle = { color: '#315665', fontSize: 16, lineHeight: 23, fontWeight: '800' } as const;
const optionBodyStyle = { color: '#3E5E6A', fontSize: 16, lineHeight: 24 } as const;
const includedStyle = { gap: 6, padding: 14, borderRadius: 14, backgroundColor: '#EAF5F4' } as const;
const includedTitleStyle = { color: '#0A403C', fontSize: 17, fontWeight: '900' } as const;
const includedItemStyle = { gap: 3, paddingVertical: 3 } as const;
const includedTextStyle = { color: '#1E5551', fontSize: 15, lineHeight: 22, fontWeight: '700' } as const;
const includedDescriptionStyle = { color: '#486E6B', fontSize: 14, lineHeight: 20, fontWeight: '600', paddingLeft: 18 } as const;
const signatureSectionStyle = { width: '100%', maxWidth: 780, padding: 22, borderRadius: 20, backgroundColor: '#0D2A39', borderWidth: 1, borderColor: '#254B5B', gap: 14 } as const;
const signedCardStyle = { padding: 18, borderRadius: 14, backgroundColor: '#123D3B', gap: 6 } as const;
const signedTitleStyle = { color: '#65E6B2', fontSize: 22, fontWeight: '900' } as const;
const privacyFooterStyle = { color: '#86A6B3', fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 760 } as const;
