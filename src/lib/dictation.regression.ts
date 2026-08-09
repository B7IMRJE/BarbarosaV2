import { appendDictation, supportsDictationInput } from './dictation';

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

console.log('dictation regression: ok');
