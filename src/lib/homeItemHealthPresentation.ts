import {
    scoreItems,
    scoreHomeItem,
    type HealthStatus,
    type HomeHealthItem,
} from './homeHealth';
import type { HomeOSTheme } from '../theme/themes';

export type HomeItemHealthCardTone = 'critical' | 'attention' | 'good';

export type HomeItemHealthCardPresentation = {
    label: 'Critical' | 'Needs Attention' | 'Needs Review' | 'Good';
    tone: HomeItemHealthCardTone;
};

/** Presentation-only mapping that keeps HomeOS cards aligned with Home Health. */
export function resolveHomeItemHealthCardPresentation(
    item: Pick<HomeHealthItem, 'status' | 'install_state'>,
): HomeItemHealthCardPresentation {
    return presentationForHealthStatus(scoreHomeItem(item).status);
}

/** Rolls an assembly and its saved component descendants into one worst-state card. */
export function resolveHomeItemHealthRollupPresentation(
    items: readonly Pick<HomeHealthItem, 'status' | 'install_state'>[],
): HomeItemHealthCardPresentation {
    if (items.length === 0) {
        return presentationForHealthStatus('unknown');
    }

    const healthItems = items.map(({ status, install_state }) => ({ status, install_state }));
    return presentationForHealthStatus(scoreItems(healthItems).status);
}

export function resolveHomeItemHealthCardStyle(
    tone: HomeItemHealthCardTone,
    theme: HomeOSTheme,
) {
    const colors = tone === 'critical'
        ? theme.colors.status.emergency
        : tone === 'good'
            ? theme.colors.status.good
            : theme.colors.status.notInspected;

    return {
        backgroundColor: colors.background,
        borderColor: colors.border,
        borderWidth: 2,
    } as const;
}

function presentationForHealthStatus(status: HealthStatus): HomeItemHealthCardPresentation {
    if (status === 'critical') {
        return { label: 'Critical', tone: 'critical' };
    }

    if (status === 'needs_attention') {
        return { label: 'Needs Attention', tone: 'attention' };
    }

    if (status === 'good') {
        return { label: 'Good', tone: 'good' };
    }

    return { label: 'Needs Review', tone: 'attention' };
}
