export type BrowserAlertAudio = {
    currentTime: number;
    play: () => Promise<void> | void;
};

export async function playBrowserAlertSound(audio: BrowserAlertAudio | null) {
    if (!audio) return false;

    try {
        audio.currentTime = 0;
        await audio.play();
        return true;
    } catch {
        return false;
    }
}
