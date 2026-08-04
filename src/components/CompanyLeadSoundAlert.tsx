import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { useEffect, useRef } from 'react';
import {
    getCompanyLeadAlertKind,
    type CompanyLeadCounts,
} from '../lib/companyLeadAlerts';

type CompanyLeadSoundAlertProps = {
    companyId?: string | null;
    counts?: CompanyLeadCounts | null;
};

type PreviousLeadSnapshot = {
    companyId: string;
    counts: CompanyLeadCounts;
};

export default function CompanyLeadSoundAlert({ companyId, counts }: CompanyLeadSoundAlertProps) {
    const normalizedCompanyId = String(companyId || '').trim();
    const previousSnapshotRef = useRef<PreviousLeadSnapshot | null>(null);
    const leadPlayer = useAudioPlayer(require('../../assets/audio/incoming-lead.wav'));
    const emergencyPlayer = useAudioPlayer(require('../../assets/audio/incoming-emergency.wav'));

    useEffect(() => {
        void setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: false,
        }).catch(() => undefined);
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
            ? emergencyPlayer
            : alertKind === 'lead'
                ? leadPlayer
                : null;

        if (!player) return;

        void player.seekTo(0)
            .then(() => player.play())
            .catch(() => undefined);
    }, [counts, emergencyPlayer, leadPlayer, normalizedCompanyId]);

    return null;
}
