import type { TextInputProps } from 'react-native';

const EXCLUDED_KEYBOARD_TYPES = new Set([
    'decimal-pad',
    'email-address',
    'name-phone-pad',
    'number-pad',
    'numeric',
    'phone-pad',
    'twitter',
    'url',
    'visible-password',
]);

const EXCLUDED_INPUT_MODES = new Set([
    'decimal',
    'email',
    'numeric',
    'search',
    'tel',
    'url',
]);

export function supportsDictationInput(props: TextInputProps, explicitlyEnabled = true) {
    if (!explicitlyEnabled || props.editable === false || props.secureTextEntry) return false;
    if (typeof props.value !== 'string' || typeof props.onChangeText !== 'function') return false;
    if (props.keyboardType && EXCLUDED_KEYBOARD_TYPES.has(props.keyboardType)) return false;
    if (props.inputMode && EXCLUDED_INPUT_MODES.has(props.inputMode)) return false;

    return true;
}

export function appendDictation(existingValue: string, transcript: string) {
    const cleanTranscript = String(transcript || '').trim();

    if (!cleanTranscript) return existingValue;

    const existing = String(existingValue || '');
    if (!existing.trim()) return cleanTranscript;

    const separator = /\s$/.test(existing) ? '' : existing.endsWith('\n') ? '' : ' ';

    return `${existing}${separator}${cleanTranscript}`;
}

export function readDictationErrorMessage(value: unknown, fallback: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;

    const record = value as Record<string, unknown>;
    const message = typeof record.message === 'string' ? record.message.trim() : '';

    return message || fallback;
}

const AUDIO_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
    'audio/m4a': 'm4a',
    'audio/mp3': 'mp3',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/mpga': 'mpga',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/x-m4a': 'm4a',
    'audio/x-wav': 'wav',
    'video/mp4': 'mp4',
};

export function buildDictationAudioMetadata(blobContentType: string, uri: string, platform: string) {
    const actualContentType = normalizeAudioContentType(blobContentType);
    const fallbackContentType = recordingContentTypeFromUri(uri, platform);
    const contentType = actualContentType || fallbackContentType;
    const extension = AUDIO_EXTENSION_BY_CONTENT_TYPE[contentType]
        || recordingExtensionFromUri(uri)
        || (platform === 'web' ? 'webm' : 'm4a');

    return {
        contentType,
        filename: `homeos-dictation.${extension}`,
    };
}

function normalizeAudioContentType(value: string) {
    return String(value || '').split(';')[0].trim().toLowerCase();
}

function recordingContentTypeFromUri(uri: string, platform: string) {
    const extension = recordingExtensionFromUri(uri);

    if (extension === 'webm') return 'audio/webm';
    if (extension === 'wav') return 'audio/wav';
    if (extension === 'mp3' || extension === 'mpeg' || extension === 'mpga') return 'audio/mpeg';
    if (extension === 'mp4') return 'audio/mp4';
    if (extension === 'm4a') return 'audio/m4a';

    return platform === 'web' ? 'audio/webm' : 'audio/mp4';
}

function recordingExtensionFromUri(uri: string) {
    const filename = String(uri || '').split(/[/?#]/).filter(Boolean).pop() || '';
    const match = /\.([a-zA-Z0-9]+)$/.exec(filename);

    return match?.[1]?.toLowerCase() || '';
}
