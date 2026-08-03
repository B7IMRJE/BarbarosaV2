import type { HomeOSTheme } from '../theme/themes';
import { resolveGlassHomeTheme } from '../theme/glassPalette';
import {
    chooseReadableThemeText,
    getThemeContrastRatio,
    MINIMUM_BODY_TEXT_CONTRAST,
} from '../theme/colorContrast';

export type CompanyWorkspaceBrand = {
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
};

type CompanyWorkspaceThemeOptions = {
    appearanceStyle?: 'classic' | 'glass';
};

export function resolveCompanyWorkspaceTheme(
    baseTheme: HomeOSTheme,
    company: CompanyWorkspaceBrand | null,
    options: CompanyWorkspaceThemeOptions = {}
): HomeOSTheme {
    if (!company) {
        return options.appearanceStyle === 'glass'
            ? isResolvedGlassTheme(baseTheme)
                ? baseTheme
                : resolveGlassHomeTheme(baseTheme)
            : baseTheme;
    }

    const primary = safeBrandColor(company.primary_color, baseTheme.colors.primary);
    const secondary = safeBrandColor(company.secondary_color, primary);
    const accent = safeBrandColor(company.accent_color, baseTheme.colors.primary);

    if (options.appearanceStyle === 'glass') {
        return resolveGlassHomeTheme(baseTheme, {
            primary,
            secondary,
            accent,
            background: isResolvedGlassTheme(baseTheme)
                ? baseTheme.colors.background
                : undefined,
            panel: mixWorkspaceColor(primary, secondary, 0.32),
            panelOpacity: 82,
        });
    }

    const background = mixWorkspaceColor(secondary, '#FFFFFF', 0.9);
    const surface = mixWorkspaceColor(secondary, '#FFFFFF', 0.78);
    const surfaceAlt = mixWorkspaceColor(primary, '#FFFFFF', 0.82);
    const text = readableWorkspaceColor(surface);
    const mutedText = readableMutedWorkspaceColor(text, surface);
    const border = mixWorkspaceColor(accent, '#FFFFFF', 0.34);

    return {
        ...baseTheme,
        colors: {
            ...baseTheme.colors,
            background,
            surface,
            surfaceAlt,
            text,
            mutedText,
            border,
            primary,
            primaryText: readableWorkspaceColor(primary),
            secondaryButton: surfaceAlt,
            secondaryButtonText: readableWorkspaceColor(surfaceAlt),
            iconBackground: surfaceAlt,
            progressTrack: mixWorkspaceColor(surface, secondary, 0.18),
            progressFill: accent,
            link: accent,
        },
    };
}

function safeBrandColor(value: string | null | undefined, fallback: string) {
    const color = String(value || '').trim();
    return /^#[0-9A-F]{6}$/i.test(color) ? color.toUpperCase() : fallback;
}

function mixWorkspaceColor(first: string, second: string, secondWeight: number) {
    const safeFirst = safeBrandColor(first, '#075748').slice(1);
    const safeSecond = safeBrandColor(second, '#075748').slice(1);
    const weight = Math.max(0, Math.min(1, secondWeight));
    const channel = (offset: number) => Math.round(
        parseInt(safeFirst.slice(offset, offset + 2), 16) * (1 - weight)
        + parseInt(safeSecond.slice(offset, offset + 2), 16) * weight
    ).toString(16).padStart(2, '0');

    return `#${channel(0)}${channel(2)}${channel(4)}`.toUpperCase();
}

function readableWorkspaceColor(color: string) {
    return chooseReadableThemeText(safeBrandColor(color, '#075748'));
}

function readableMutedWorkspaceColor(text: string, surface: string) {
    let mutedText = mixWorkspaceColor(text, surface, 0.42);

    for (let attempt = 0; attempt < 8; attempt += 1) {
        if (getThemeContrastRatio(mutedText, surface) >= MINIMUM_BODY_TEXT_CONTRAST) {
            return mutedText;
        }

        mutedText = mixWorkspaceColor(mutedText, text, 0.14);
    }

    return text;
}

function isResolvedGlassTheme(theme: HomeOSTheme) {
    return /^rgba?\(/i.test(theme.colors.surface)
        || /^rgba?\(/i.test(theme.colors.surfaceAlt);
}
