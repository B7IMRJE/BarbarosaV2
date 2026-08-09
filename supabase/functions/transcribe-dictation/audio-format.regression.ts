import {
    isSupportedAudioContentType,
    normalizeContentType,
    safeFilename,
} from './index';

function assertEqual(actual: unknown, expected: unknown, message: string) {
    if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

assertEqual(normalizeContentType('audio/mp4;codecs=mp4a.40.2'), 'audio/mp4', 'Safari MIME parameters should be normalized');
assertEqual(safeFilename('homeos-dictation.webm', 'audio/mp4'), 'homeos-dictation.mp4', 'Safari MP4 content must override a conflicting WebM filename');
assertEqual(safeFilename('homeos-dictation.mp4', 'audio/webm'), 'homeos-dictation.webm', 'Chrome WebM content must override a conflicting MP4 filename');
assertEqual(safeFilename('../customer-name.webm', 'audio/mp4'), 'customer-name.mp4', 'Client filenames must be sanitized before upload');
assertEqual(isSupportedAudioContentType('audio/mp4'), true, 'Safari MP4 should be accepted');
assertEqual(isSupportedAudioContentType('audio/webm'), true, 'Chrome WebM should be accepted');
assertEqual(isSupportedAudioContentType('audio/ogg'), false, 'Undocumented OGG input should be rejected');
assertEqual(isSupportedAudioContentType('audio/flac'), false, 'Undocumented FLAC input should be rejected');

console.log('transcribe dictation audio format regression: ok');
