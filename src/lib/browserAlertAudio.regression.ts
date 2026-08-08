import { playBrowserAlertSound, type BrowserAlertAudio } from './browserAlertAudio';

void runBrowserAlertAudioRegressions();

export async function runBrowserAlertAudioRegressions() {
    await successfulPlaybackRestartsTheSound();
    await rejectedPlaybackDoesNotEscape();
    await synchronousPlaybackFailureDoesNotEscape();
    await missingAudioIsIgnored();
}

async function successfulPlaybackRestartsTheSound() {
    let played = false;
    const audio: BrowserAlertAudio = {
        currentTime: 12,
        play: async () => {
            played = true;
        },
    };

    const result = await playBrowserAlertSound(audio);

    assert(result, 'Successful browser alert playback should report success.');
    assert(played, 'Successful browser alert playback should call play.');
    assert(audio.currentTime === 0, 'Browser alert playback should restart the sound from the beginning.');
}

async function rejectedPlaybackDoesNotEscape() {
    const audio: BrowserAlertAudio = {
        currentTime: 0,
        play: () => Promise.reject(new Error('Autoplay blocked.')),
    };

    assert(
        await playBrowserAlertSound(audio) === false,
        'A rejected browser play promise should be contained.'
    );
}

async function synchronousPlaybackFailureDoesNotEscape() {
    const audio: BrowserAlertAudio = {
        currentTime: 0,
        play: () => {
            throw new Error('Audio format unsupported.');
        },
    };

    assert(
        await playBrowserAlertSound(audio) === false,
        'A synchronous browser play failure should be contained.'
    );
}

async function missingAudioIsIgnored() {
    assert(
        await playBrowserAlertSound(null) === false,
        'A missing browser audio element should be ignored.'
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
