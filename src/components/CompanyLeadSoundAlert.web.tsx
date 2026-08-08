import { Asset } from 'expo-asset';
import { useEffect, useRef } from 'react';
import {
    getCompanyLeadAlertKind,
    type CompanyLeadCounts,
} from '../lib/companyLeadAlerts';
import {
    playBrowserAlertSound,
    type BrowserAlertAudio,
} from '../lib/browserAlertAudio';

type CompanyLeadSoundAlertProps = {
    companyId?: string | null;
    counts?: CompanyLeadCounts | null;
};

type PreviousLeadSnapshot = {
    companyId: string;
    counts: CompanyLeadCounts;
};

type ManagedBrowserAudio = BrowserAlertAudio & {
    load?: () => void;
    pause?: () => void;
    preload?: string;
};

type BrowserAudioConstructor = new (source?: string) => ManagedBrowserAudio;

export default function CompanyLeadSoundAlert({ companyId, counts }: CompanyLeadSoundAlertProps) {
    const normalizedCompanyId = String(companyId || '').trim();
    const previousSnapshotRef = useRef<PreviousLeadSnapshot | null>(null);
    const leadPlayerRef = useRef<ManagedBrowserAudio | null>(null);
    const emergencyPlayerRef = useRef<ManagedBrowserAudio | null>(null);

    useEffect(() => {
        leadPlayerRef.current = createBrowserAudio(require('../../assets/audio/incoming-lead.wav'));
        emergencyPlayerRef.current = createBrowserAudio(require('../../assets/audio/incoming-emergency.wav'));

        return () => {
            releaseBrowserAudio(leadPlayerRef.current);
            releaseBrowserAudio(emergencyPlayerRef.current);
            leadPlayerRef.current = null;
            emergencyPlayerRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!normalizedCompanyId || !counts) {
            previousSnapshotRef.current = null;
            return;
        }

        const previousSnapshot = previousSnapshotRef.current;

        previousSnapshotRef.current = {
            companyId: normalizedCompanyId,
            counts,
        };

        if (!previousSnapshot || previousSnapshot.companyId !== normalizedCompanyId) return;

        const alertKind = getCompanyLeadAlertKind(previousSnapshot.counts, counts);
        const player = alertKind === 'emergency'
            ? emergencyPlayerRef.current
            : alertKind === 'lead'
                ? leadPlayerRef.current
                : null;

        void playBrowserAlertSound(player);
    }, [counts, normalizedCompanyId]);

    return null;
}

function createBrowserAudio(sourceModule: number): ManagedBrowserAudio | null {
    const AudioConstructor = (globalThis as typeof globalThis & {
        Audio?: BrowserAudioConstructor;
    }).Audio;

    if (!AudioConstructor) return null;

    try {
        const player = new AudioConstructor(Asset.fromModule(sourceModule).uri);

        player.preload = 'auto';
        player.load?.();

        return player;
    } catch {
        return null;
    }
}

function releaseBrowserAudio(player: ManagedBrowserAudio | null) {
    try {
        player?.pause?.();
    } catch {
        // Browser audio cleanup must never interrupt Dispatch unmounting.
    }
}
