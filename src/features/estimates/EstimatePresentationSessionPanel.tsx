import QRCode from 'react-native-qrcode-svg';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import {
    buildEstimatePresentationLink,
    createEstimatePresentationSession,
    endEstimatePresentationSession,
    loadEstimatePresentationMediaCandidates,
    loadEstimatePresentationStaffStatus,
    updateEstimatePresentationSession,
    type CreatedEstimatePresentationSession,
    type EstimatePresentationMediaCandidate,
    type EstimatePresentationStaffStatus,
} from '../../lib/estimatePresentation';

type PresentableChoice = {
    id: string;
    title: string;
    pricingResult: { totalAmount: number };
};

type Props = {
    estimateSessionId: string;
    choices: PresentableChoice[];
    preferredChoiceId?: string | null;
};

export default function EstimatePresentationSessionPanel({
    estimateSessionId,
    choices,
    preferredChoiceId,
}: Props) {
    const [expanded, setExpanded] = useState(false);
    const [selectedChoiceIds, setSelectedChoiceIds] = useState<string[]>([]);
    const [mediaCandidates, setMediaCandidates] = useState<EstimatePresentationMediaCandidate[]>([]);
    const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
    const [includeEstimateSummary, setIncludeEstimateSummary] = useState(true);
    const [signatureRequested, setSignatureRequested] = useState(true);
    const [createdSession, setCreatedSession] = useState<CreatedEstimatePresentationSession | null>(null);
    const [staffStatus, setStaffStatus] = useState<EstimatePresentationStaffStatus | null>(null);
    const [working, setWorking] = useState(false);
    const [message, setMessage] = useState('Choose exactly what the homeowner may see on the iPad.');
    const activeSessionId = createdSession?.id || (staffStatus?.status === 'active' ? staffStatus.id : '');
    const shareLink = useMemo(() => createdSession?.shareToken
        ? buildEstimatePresentationLink(createdSession.shareToken)
        : '', [createdSession?.shareToken]);

    useEffect(() => {
        const preferred = choices.find((choice) => choice.id === preferredChoiceId)?.id || choices[0]?.id || '';
        setSelectedChoiceIds((current) => current.filter((id) => choices.some((choice) => choice.id === id)).length > 0
            ? current.filter((id) => choices.some((choice) => choice.id === id))
            : preferred ? [preferred] : []);
    }, [choices, preferredChoiceId]);

    useEffect(() => {
        let active = true;
        void loadEstimatePresentationStaffStatus(estimateSessionId)
            .then((status) => {
                if (!active) return;
                setStaffStatus(status);
                if (status?.publicPayload) {
                    setSelectedChoiceIds(status.publicPayload.options.map((option) => option.id));
                    setSelectedMediaIds(status.publicPayload.media.map((media) => media.id));
                    setIncludeEstimateSummary(status.publicPayload.includeEstimateSummary);
                    setSignatureRequested(status.publicPayload.signatureRequested);
                }
            })
            .catch((error) => active && setMessage(readError(error, 'Presentation status could not be loaded.')));

        return () => { active = false; };
    }, [estimateSessionId]);

    useEffect(() => {
        if (!expanded || (!activeSessionId && !createdSession)) return;

        const interval = setInterval(() => {
            void loadEstimatePresentationStaffStatus(estimateSessionId)
                .then(setStaffStatus)
                .catch(() => undefined);
        }, 5000);

        return () => clearInterval(interval);
    }, [activeSessionId, createdSession, estimateSessionId, expanded]);

    useEffect(() => {
        if (!expanded || selectedChoiceIds.length === 0) {
            setMediaCandidates([]);
            setSelectedMediaIds([]);
            return;
        }

        let active = true;
        void loadEstimatePresentationMediaCandidates(estimateSessionId, selectedChoiceIds)
            .then((media) => {
                if (!active) return;
                setMediaCandidates(media);
                setSelectedMediaIds((current) => current.filter((id) => media.some((candidate) => candidate.id === id)));
            })
            .catch((error) => active && setMessage(readError(error, 'Approved photo choices could not be loaded.')));

        return () => { active = false; };
    }, [estimateSessionId, expanded, selectedChoiceIds]);

    async function createSession() {
        if (working || selectedChoiceIds.length === 0) return;

        setWorking(true);
        setMessage('Creating the short-lived iPad presentation…');
        try {
            const created = await createEstimatePresentationSession({
                estimateSessionId,
                selectedChoiceIds,
                mediaIds: selectedMediaIds,
                includeEstimateSummary,
                signatureRequested,
                expiresMinutes: 30,
            });
            setCreatedSession(created);
            const status = await loadEstimatePresentationStaffStatus(estimateSessionId);
            setStaffStatus(status);
            setMessage('Presentation ready. Scan the QR code or enter the short code on the iPad.');
        } catch (error) {
            setMessage(readError(error, 'The presentation session could not be created.'));
        } finally {
            setWorking(false);
        }
    }

    async function updateSession() {
        if (!activeSessionId || working || selectedChoiceIds.length === 0) return;

        setWorking(true);
        setMessage('Updating the live iPad presentation…');
        try {
            await updateEstimatePresentationSession({
                presentationSessionId: activeSessionId,
                selectedChoiceIds,
                mediaIds: selectedMediaIds,
                includeEstimateSummary,
                signatureRequested,
            });
            const status = await loadEstimatePresentationStaffStatus(estimateSessionId);
            setStaffStatus(status);
            setMessage('The live presentation was updated. The iPad refreshes automatically.');
        } catch (error) {
            setMessage(readError(error, 'The live presentation could not be updated.'));
        } finally {
            setWorking(false);
        }
    }

    async function endSession(action: 'ended' | 'revoked') {
        const sessionId = createdSession?.id || staffStatus?.id;
        if (!sessionId || working) return;

        setWorking(true);
        setMessage(action === 'revoked' ? 'Revoking iPad access…' : 'Ending the iPad presentation…');
        try {
            await endEstimatePresentationSession(sessionId, action);
            setCreatedSession(null);
            const status = await loadEstimatePresentationStaffStatus(estimateSessionId);
            setStaffStatus(status);
            setMessage(action === 'revoked'
                ? 'Access revoked. The prior code, link, and viewer token no longer work.'
                : 'Presentation ended. The iPad can no longer open this estimate.');
        } catch (error) {
            setMessage(readError(error, 'The presentation session could not be closed.'));
        } finally {
            setWorking(false);
        }
    }

    function toggleChoice(id: string) {
        if (activeSessionId && staffStatus?.status === 'signed') return;
        setSelectedChoiceIds((current) => current.includes(id)
            ? current.filter((value) => value !== id)
            : [...current, id]);
    }

    function toggleMedia(id: string) {
        setSelectedMediaIds((current) => current.includes(id)
            ? current.filter((value) => value !== id)
            : [...current, id]);
    }

    async function copyLink() {
        if (!shareLink) return;
        try {
            const clipboard = typeof navigator === 'undefined' ? null : navigator.clipboard;
            if (!clipboard?.writeText) throw new Error('Clipboard unavailable');
            await clipboard.writeText(shareLink);
            setMessage('Secure presentation link copied.');
        } catch {
            setMessage('Use the QR code or short code. Link copying is unavailable on this device.');
        }
    }

    const signed = staffStatus?.status === 'signed';

    return (
        <View style={panelStyle}>
            <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setExpanded(!expanded)}
                style={headingButtonStyle}
            >
                <View style={{ flex: 1 }}>
                    <Text style={eyebrowStyle}>SECURE IPAD SESSION</Text>
                    <Text style={titleStyle}>Send selected presentation to homeowner</Text>
                    <Text style={descriptionStyle}>No account mirroring. Only checked options, approved photos, estimate summary, and signature request are sent.</Text>
                </View>
                <Text style={expandTextStyle}>{expanded ? 'Hide' : 'Open'}</Text>
            </TouchableOpacity>

            {expanded && (
                <View style={contentStyle}>
                    <Text style={sectionTitleStyle}>1. Estimate options</Text>
                    {choices.map((choice) => (
                        <ToggleRow
                            key={choice.id}
                            label={choice.title}
                            detail={formatMoney(choice.pricingResult.totalAmount)}
                            selected={selectedChoiceIds.includes(choice.id)}
                            onPress={() => toggleChoice(choice.id)}
                        />
                    ))}

                    <Text style={sectionTitleStyle}>2. Approved presentation photos</Text>
                    {mediaCandidates.length > 0 ? mediaCandidates.map((media) => (
                        <ToggleRow
                            key={media.id}
                            label={media.title}
                            detail={media.productName}
                            selected={selectedMediaIds.includes(media.id)}
                            onPress={() => toggleMedia(media.id)}
                        />
                    )) : (
                        <Text style={helpStyle}>No homeowner-visible product photos are attached to the selected options. Private or staff-only media is never offered here.</Text>
                    )}

                    <Text style={sectionTitleStyle}>3. What the iPad may show</Text>
                    <ToggleRow
                        label="Estimate summary and customer selling price"
                        detail="Never includes internal cost, margin, or private notes."
                        selected={includeEstimateSummary}
                        onPress={() => setIncludeEstimateSummary(!includeEstimateSummary)}
                    />
                    <ToggleRow
                        label="Homeowner signature request"
                        detail="Returns the exact presented snapshot, signer, and timestamp to the estimate audit trail."
                        selected={signatureRequested}
                        onPress={() => setSignatureRequested(!signatureRequested)}
                    />

                    {signed && (
                        <View style={signedStyle}>
                            <Text style={signedTitleStyle}>Signature received ✓</Text>
                            <Text style={helpStyle}>{staffStatus?.signerName || 'Homeowner'} · {formatDate(staffStatus?.signedAt)}</Text>
                        </View>
                    )}

                    {createdSession && createdSession.status === 'active' && (
                        <View style={shareStyle}>
                            <View style={qrStyle}>
                                <QRCode value={shareLink} size={168} backgroundColor="#FFFFFF" color="#071E33" />
                            </View>
                            <View style={{ flex: 1, minWidth: 220, gap: 8 }}>
                                <Text style={shareLabelStyle}>Short-lived code</Text>
                                <Text selectable style={codeStyle}>{createdSession.joinCode}</Text>
                                <Text style={helpStyle}>Expires {formatDate(createdSession.expiresAt)}. The QR link contains a stronger one-time share secret.</Text>
                                <TouchableOpacity onPress={() => void copyLink()} style={secondaryButtonStyle}>
                                    <Text style={secondaryButtonTextStyle}>Copy secure link</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {staffStatus?.status === 'active' && !createdSession && (
                        <View style={noticeStyle}>
                            <Text style={noticeTitleStyle}>An iPad session is already active</Text>
                            <Text style={helpStyle}>For security, its secret code is not stored in readable form. You may update it here, or revoke it and create a fresh code.</Text>
                        </View>
                    )}

                    <View style={actionRowStyle}>
                        {!activeSessionId && !signed && (
                            <TouchableOpacity
                                disabled={working || selectedChoiceIds.length === 0}
                                onPress={() => void createSession()}
                                style={[primaryButtonStyle, (working || selectedChoiceIds.length === 0) && disabledStyle]}
                            >
                                {working ? <ActivityIndicator color="#062431" /> : <Text style={primaryButtonTextStyle}>Create 30-Minute Session</Text>}
                            </TouchableOpacity>
                        )}
                        {!!activeSessionId && !signed && (
                            <TouchableOpacity disabled={working} onPress={() => void updateSession()} style={[primaryButtonStyle, working && disabledStyle]}>
                                <Text style={primaryButtonTextStyle}>Update Live Session</Text>
                            </TouchableOpacity>
                        )}
                        {!!activeSessionId && (
                            <TouchableOpacity disabled={working} onPress={() => void endSession('ended')} style={secondaryButtonStyle}>
                                <Text style={secondaryButtonTextStyle}>End Session</Text>
                            </TouchableOpacity>
                        )}
                        {(activeSessionId || signed) && (
                            <TouchableOpacity disabled={working} onPress={() => void endSession('revoked')} style={dangerButtonStyle}>
                                <Text style={dangerButtonTextStyle}>Revoke Access</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text accessibilityLiveRegion="polite" style={messageStyle}>{message}</Text>
                </View>
            )}
        </View>
    );
}

function ToggleRow({ label, detail, selected, onPress }: {
    label: string;
    detail: string;
    selected: boolean;
    onPress: () => void;
}) {
    return (
        <TouchableOpacity
            accessibilityRole="checkbox"
            accessibilityState={{ checked: selected }}
            onPress={onPress}
            style={selected ? toggleSelectedStyle : toggleStyle}
        >
            <View style={selected ? checkSelectedStyle : checkStyle}><Text style={checkTextStyle}>{selected ? '✓' : ''}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={toggleLabelStyle}>{label}</Text>
                <Text style={toggleDetailStyle}>{detail}</Text>
            </View>
        </TouchableOpacity>
    );
}

function formatMoney(value: number) {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value?: string | null) {
    if (!value) return 'Not yet';

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function readError(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

const panelStyle = { borderRadius: 18, borderWidth: 1, borderColor: '#2E6572', backgroundColor: '#0B2937', overflow: 'hidden' } as const;
const headingButtonStyle = { minHeight: 72, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 } as const;
const eyebrowStyle = { color: '#56C9B1', fontSize: 12, fontWeight: '900', letterSpacing: 0.8 } as const;
const titleStyle = { color: '#F1FAFC', fontSize: 21, lineHeight: 27, fontWeight: '900', marginTop: 3 } as const;
const descriptionStyle = { color: '#AFC9D4', fontSize: 14, lineHeight: 20, fontWeight: '600', marginTop: 4 } as const;
const expandTextStyle = { color: '#56C9B1', fontSize: 15, fontWeight: '900' } as const;
const contentStyle = { padding: 18, paddingTop: 0, gap: 11 } as const;
const sectionTitleStyle = { color: '#DCECF1', fontSize: 17, fontWeight: '900', marginTop: 8 } as const;
const toggleStyle = { minHeight: 58, padding: 12, borderRadius: 13, borderWidth: 1, borderColor: '#365D6B', backgroundColor: '#0D3242', flexDirection: 'row', alignItems: 'center', gap: 11 } as const;
const toggleSelectedStyle = { ...toggleStyle, borderColor: '#56C9B1', backgroundColor: '#113E45' } as const;
const checkStyle = { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: '#668895', alignItems: 'center', justifyContent: 'center' } as const;
const checkSelectedStyle = { ...checkStyle, backgroundColor: '#56C9B1', borderColor: '#56C9B1' } as const;
const checkTextStyle = { color: '#062431', fontSize: 18, fontWeight: '900' } as const;
const toggleLabelStyle = { color: '#F3FAFC', fontSize: 16, lineHeight: 21, fontWeight: '800' } as const;
const toggleDetailStyle = { color: '#A9C3CD', fontSize: 13, lineHeight: 18, marginTop: 2 } as const;
const helpStyle = { color: '#AAC4CE', fontSize: 13, lineHeight: 19 } as const;
const shareStyle = { padding: 16, borderRadius: 16, backgroundColor: '#123847', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 18 } as const;
const qrStyle = { padding: 10, borderRadius: 14, backgroundColor: '#FFFFFF' } as const;
const shareLabelStyle = { color: '#AFC8D2', fontSize: 13, fontWeight: '800' } as const;
const codeStyle = { color: '#FFFFFF', fontSize: 34, letterSpacing: 4, fontWeight: '900' } as const;
const actionRowStyle = { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 } as const;
const primaryButtonStyle = { minHeight: 50, borderRadius: 12, backgroundColor: '#56C9B1', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' } as const;
const primaryButtonTextStyle = { color: '#062431', fontSize: 15, fontWeight: '900' } as const;
const secondaryButtonStyle = { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: '#5D8998', paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' } as const;
const secondaryButtonTextStyle = { color: '#DFF4F8', fontSize: 14, fontWeight: '900' } as const;
const dangerButtonStyle = { ...secondaryButtonStyle, borderColor: '#D97878' } as const;
const dangerButtonTextStyle = { color: '#FFD1D1', fontSize: 14, fontWeight: '900' } as const;
const disabledStyle = { opacity: 0.45 } as const;
const messageStyle = { color: '#9EC5D3', fontSize: 13, lineHeight: 19, fontWeight: '700' } as const;
const signedStyle = { padding: 14, borderRadius: 13, backgroundColor: '#163F3C', gap: 4 } as const;
const signedTitleStyle = { color: '#62E2AF', fontSize: 18, fontWeight: '900' } as const;
const noticeStyle = { padding: 14, borderRadius: 13, backgroundColor: '#3A3520', gap: 4 } as const;
const noticeTitleStyle = { color: '#FFE08A', fontSize: 16, fontWeight: '900' } as const;
