import {
    AudioModule,
    RecordingPresets,
    setAudioModeAsync,
    useAudioRecorder,
} from 'expo-audio';
import {
    createContext,
    type PropsWithChildren,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    Alert,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { buildDictationAudioMetadata, readDictationErrorMessage } from '../../lib/dictation';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

const MAX_RECORDING_MILLISECONDS = 60_000;
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const TRANSCRIPTION_TIMEOUT_MILLISECONDS = 45_000;

type DictationPhase = 'idle' | 'recording' | 'transcribing';

type StartDictationInput = {
    fieldId: string;
    fieldLabel: string;
    onTranscript: (transcript: string) => void;
};

type DictationContextValue = {
    activeFieldId: string;
    phase: DictationPhase;
    toggleDictation: (input: StartDictationInput) => Promise<void>;
};

type DictationNotice = {
    title: string;
    message: string;
};

const DictationContext = createContext<DictationContextValue | null>(null);

export default function DictationProvider({ children }: PropsWithChildren) {
    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const { theme } = useTheme();
    const [activeFieldId, setActiveFieldId] = useState('');
    const [phase, setPhase] = useState<DictationPhase>('idle');
    const [notice, setNotice] = useState<DictationNotice | null>(null);
    const activeRequestRef = useRef<StartDictationInput | null>(null);
    const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearStopTimer = useCallback(() => {
        if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
        stopTimerRef.current = null;
    }, []);

    const reset = useCallback(() => {
        clearStopTimer();
        activeRequestRef.current = null;
        setActiveFieldId('');
        setPhase('idle');
    }, [clearStopTimer]);

    const showFailure = useCallback((title: string, message: string) => {
        if (Platform.OS === 'web') {
            setNotice({ title, message });
            return;
        }

        Alert.alert(title, message);
    }, []);

    const stopAndTranscribe = useCallback(async () => {
        const activeRequest = activeRequestRef.current;
        if (!activeRequest) return;

        clearStopTimer();
        setPhase('transcribing');

        try {
            await recorder.stop();
            const uri = recorder.uri;

            if (!uri) throw new Error('The recording did not produce an audio file.');

            const audioResponse = await fetch(uri);
            const audioBlob = await audioResponse.blob();
            const audioMetadata = buildDictationAudioMetadata(audioBlob.type, uri, Platform.OS);

            if (!audioBlob.size) throw new Error('The recording was empty.');
            if (audioBlob.size > MAX_AUDIO_BYTES) {
                throw new Error('That recording is too large. Please try a shorter note.');
            }

            const {
                data: { session },
                error: sessionError,
            } = await supabase.auth.getSession();

            if (sessionError || !session) throw new Error('Please sign in again before using dictation.');

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MILLISECONDS);
            let response: Response;

            try {
                response = await fetch(`${supabaseUrl}/functions/v1/transcribe-dictation`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                        apikey: supabaseAnonKey,
                        'Content-Type': audioMetadata.contentType,
                        'X-HomeOS-Audio-Filename': audioMetadata.filename,
                    },
                    body: audioBlob,
                    signal: controller.signal,
                });
            } finally {
                clearTimeout(timeout);
            }

            const data = await readResponseJson(response);

            if (!response.ok) {
                throw new Error(readDictationErrorMessage(data, 'HomeOS could not transcribe that recording.'));
            }

            const transcript = readTranscript(data);
            if (!transcript) throw new Error('No speech was detected. Please try again and speak clearly.');

            activeRequest.onTranscript(transcript);
        } catch (error) {
            showFailure('Dictation unavailable', formatDictationFailure(error));
        } finally {
            reset();
            try {
                await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
            } catch {
                // The field is still usable when the platform cannot reset audio mode.
            }
        }
    }, [clearStopTimer, recorder, reset, showFailure]);

    const toggleDictation = useCallback(async (input: StartDictationInput) => {
        if (phase === 'transcribing') return;

        if (phase === 'recording') {
            if (activeFieldId !== input.fieldId) {
                showFailure('Dictation already recording', 'Finish the current recording before starting another field.');
                return;
            }

            await stopAndTranscribe();
            return;
        }

        try {
            setNotice(null);

            if (!isSecureWebContext()) {
                showFailure('Microphone unavailable', 'Web dictation requires a secure HTTPS connection. You can still type in this field.');
                return;
            }

            const permission = await AudioModule.requestRecordingPermissionsAsync();

            if (!permission.granted) {
                showFailure(
                    'Microphone permission needed',
                    'Allow microphone access in device settings to use dictation. You can still type in every field.',
                );
                return;
            }

            await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
            await recorder.prepareToRecordAsync();
            activeRequestRef.current = input;
            setActiveFieldId(input.fieldId);
            setPhase('recording');
            recorder.record();
            stopTimerRef.current = setTimeout(() => void stopAndTranscribe(), MAX_RECORDING_MILLISECONDS);
        } catch (error) {
            reset();
            showFailure('Microphone unavailable', formatDictationFailure(error));
        }
    }, [activeFieldId, phase, recorder, reset, showFailure, stopAndTranscribe]);

    useEffect(() => () => clearStopTimer(), [clearStopTimer]);

    const value = useMemo<DictationContextValue>(() => ({
        activeFieldId,
        phase,
        toggleDictation,
    }), [activeFieldId, phase, toggleDictation]);

    return (
        <DictationContext.Provider value={value}>
            {children}
            {Platform.OS === 'web' && notice ? (
                <View
                    accessibilityLiveRegion="assertive"
                    accessibilityRole="alert"
                    aria-atomic
                    aria-live="assertive"
                    style={[
                        styles.notice,
                        {
                            backgroundColor: theme.colors.dangerBackground,
                            borderColor: theme.colors.danger,
                        },
                    ]}
                >
                    <View style={styles.noticeCopy}>
                        <Text style={[styles.noticeTitle, { color: theme.colors.danger }]}>{notice.title}</Text>
                        <Text style={[styles.noticeMessage, { color: theme.colors.text }]}>{notice.message}</Text>
                    </View>
                    <Pressable
                        accessibilityLabel="Dismiss dictation message"
                        accessibilityRole="button"
                        onPress={() => setNotice(null)}
                        style={styles.dismissButton}
                    >
                        <Text style={[styles.dismissText, { color: theme.colors.text }]}>Close</Text>
                    </Pressable>
                </View>
            ) : null}
        </DictationContext.Provider>
    );
}

export function useDictation() {
    const context = useContext(DictationContext);

    if (!context) throw new Error('useDictation must be used within DictationProvider.');

    return context;
}

function isSecureWebContext() {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return true;

    return window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

async function readResponseJson(response: Response) {
    try {
        return await response.json() as unknown;
    } catch {
        return null;
    }
}

function readTranscript(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';

    const transcript = (value as Record<string, unknown>).transcript;

    return typeof transcript === 'string' ? transcript.trim() : '';
}

function formatDictationFailure(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || '');
    const normalized = message.toLowerCase();

    if (normalized.includes('abort')) return 'Transcription took too long. Your text was not changed; please try again.';
    if (normalized.includes('network') || normalized.includes('fetch')) {
        return 'HomeOS could not reach the transcription service. Your text was not changed; check your connection and try again.';
    }

    return message || 'Your text was not changed. Please try again or keep typing.';
}

const styles = StyleSheet.create({
    notice: {
        alignItems: 'flex-start',
        borderRadius: 14,
        borderWidth: 2,
        bottom: 20,
        boxShadow: '0 10px 28px rgba(0, 0, 0, 0.24)',
        flexDirection: 'row',
        gap: 12,
        left: 16,
        maxWidth: 520,
        padding: 16,
        position: 'absolute',
        right: 16,
        zIndex: 12_000,
    },
    noticeCopy: {
        flex: 1,
        gap: 4,
    },
    noticeTitle: {
        fontSize: 16,
        fontWeight: '900',
        lineHeight: 20,
    },
    noticeMessage: {
        fontSize: 14,
        fontWeight: '700',
        lineHeight: 20,
    },
    dismissButton: {
        minHeight: 36,
        justifyContent: 'center',
        paddingHorizontal: 6,
    },
    dismissText: {
        fontSize: 13,
        fontWeight: '900',
    },
});
