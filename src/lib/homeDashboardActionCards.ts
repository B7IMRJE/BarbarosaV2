import type { HomeOSTheme } from '../theme';

export type HomeDashboardActionCardPalette = {
    backgroundColor: string;
    borderColor: string;
};

export type HomeDashboardActionCardPalettes = {
    emergency: HomeDashboardActionCardPalette;
    maintenance: HomeDashboardActionCardPalette;
    connections: HomeDashboardActionCardPalette;
    requestService: HomeDashboardActionCardPalette;
};

export function resolveHomeDashboardActionCardPalettes(
    theme: HomeOSTheme
): HomeDashboardActionCardPalettes {
    return {
        emergency: {
            backgroundColor: theme.colors.status.activeEmergency.background,
            borderColor: theme.colors.status.activeEmergency.border,
        },
        maintenance: {
            backgroundColor: theme.colors.status.notInspected.background,
            borderColor: theme.colors.status.notInspected.border,
        },
        connections: {
            backgroundColor: theme.colors.surfaceAlt,
            borderColor: theme.colors.primary,
        },
        requestService: {
            backgroundColor: theme.colors.status.good.background,
            borderColor: theme.colors.status.good.border,
        },
    };
}
