import {
    appendDictation,
    buildDictationAudioMetadata,
    supportsDictationInput,
} from './dictation';

function assertEqual(actual: unknown, expected: unknown, message: string) {
    if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

assertEqual(appendDictation('', ' Replace faucet. '), 'Replace faucet.', 'Dictation should fill an empty field');
assertEqual(appendDictation('Remove old faucet.', 'Install customer-supplied faucet.'), 'Remove old faucet. Install customer-supplied faucet.', 'Dictation should append without replacing text');
assertEqual(appendDictation('Existing note\n', 'Test operation.'), 'Existing note\nTest operation.', 'Dictation should preserve a trailing newline');
assertEqual(supportsDictationInput({ value: '', onChangeText: () => undefined }), true, 'Controlled text should support dictation');
assertEqual(supportsDictationInput({ value: '', onChangeText: () => undefined, secureTextEntry: true }), false, 'Passwords must not support dictation');
assertEqual(supportsDictationInput({ value: '', onChangeText: () => undefined, keyboardType: 'decimal-pad' }), false, 'Prices must not support dictation');
assertEqual(supportsDictationInput({ value: '', onChangeText: () => undefined, inputMode: 'email' }), false, 'Email fields must not support dictation');
assertEqual(buildDictationAudioMetadata('audio/mp4;codecs=mp4a.40.2', 'blob:https://homeos.test/recording', 'web').contentType, 'audio/mp4', 'Safari audio should keep its actual MP4 content type');
assertEqual(buildDictationAudioMetadata('audio/mp4;codecs=mp4a.40.2', 'blob:https://homeos.test/recording', 'web').filename, 'homeos-dictation.mp4', 'Safari audio should use an MP4 filename');
assertEqual(buildDictationAudioMetadata('audio/webm;codecs=opus', 'blob:https://homeos.test/recording', 'web').filename, 'homeos-dictation.webm', 'Chrome audio should use a WebM filename');

console.log('dictation regression: ok');
