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
import { Alert, Platform } from 'react-native';
import { readDictationErrorMessage } from '../../lib/dictation';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../lib/supabase';

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

const DictationContext = createContext<DictationContextValue | null>(null);

export default function DictationProvider({ children }: PropsWithChildren) {
    const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
    const [activeFieldId, setActiveFieldId] = useState('');
    const [phase, setPhase] = useState<DictationPhase>('idle');
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
                        'Content-Type': audioBlob.type || recordingContentType(uri),
                        'X-HomeOS-Audio-Filename': recordingFilename(uri),
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
            Alert.alert('Dictation unavailable', formatDictationFailure(error));
        } finally {
            reset();
            try {
                await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
            } catch {
                // The field is still usable when the platform cannot reset audio mode.
            }
        }
    }, [clearStopTimer, recorder, reset]);

    const toggleDictation = useCallback(async (input: StartDictationInput) => {
        if (phase === 'transcribing') return;

        if (phase === 'recording') {
            if (activeFieldId !== input.fieldId) {
                Alert.alert('Dictation already recording', 'Finish the current recording before starting another field.');
                return;
            }

            await stopAndTranscribe();
            return;
        }

        try {
            if (!isSecureWebContext()) {
                Alert.alert('Microphone unavailable', 'Web dictation requires a secure HTTPS connection. You can still type in this field.');
                return;
            }

            const permission = await AudioModule.requestRecordingPermissionsAsync();

            if (!permission.granted) {
                Alert.alert(
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
            Alert.alert('Microphone unavailable', formatDictationFailure(error));
        }
    }, [activeFieldId, phase, recorder, reset, stopAndTranscribe]);

    useEffect(() => () => clearStopTimer(), [clearStopTimer]);

    const value = useMemo<DictationContextValue>(() => ({
        activeFieldId,
        phase,
        toggleDictation,
    }), [activeFieldId, phase, toggleDictation]);

    return <DictationContext.Provider value={value}>{children}</DictationContext.Provider>;
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

function recordingFilename(uri: string) {
    const filename = uri.split(/[/?#]/).filter(Boolean).pop() || '';

    return /\.(m4a|mp4|mp3|wav|webm|ogg)$/i.test(filename) ? filename : `homeos-dictation.${Platform.OS === 'web' ? 'webm' : 'm4a'}`;
}

function recordingContentType(uri: string) {
    const extension = recordingFilename(uri).split('.').pop()?.toLowerCase();

    if (extension === 'webm') return 'audio/webm';
    if (extension === 'wav') return 'audio/wav';
    if (extension === 'ogg') return 'audio/ogg';
    if (extension === 'mp3') return 'audio/mpeg';

    return 'audio/mp4';
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
