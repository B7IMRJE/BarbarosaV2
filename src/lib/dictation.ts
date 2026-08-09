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
