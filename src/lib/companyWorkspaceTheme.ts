import type { HomeOSTheme } from '../theme/themes';

export type CompanyWorkspaceBrand = {
    primary_color?: string | null;
    secondary_color?: string | null;
    accent_color?: string | null;
};

export function resolveCompanyWorkspaceTheme(
    baseTheme: HomeOSTheme,
    company: CompanyWorkspaceBrand | null
): HomeOSTheme {
    if (!company) return baseTheme;

    const primary = safeBrandColor(company.primary_color, baseTheme.colors.primary);
    const secondary = safeBrandColor(company.secondary_color, primary);
    const accent = safeBrandColor(company.accent_color, baseTheme.colors.primary);
    const surfaceAlt = mixWorkspaceColor(baseTheme.colors.surface, secondary, 0.08);
    const border = mixWorkspaceColor(baseTheme.colors.border, accent, 0.32);

    return {
        ...baseTheme,
        colors: {
            ...baseTheme.colors,
            surfaceAlt,
            border,
            primary,
            primaryText: readableWorkspaceColor(primary),
            secondaryButton: surfaceAlt,
            secondaryButtonText: readableWorkspaceColor(surfaceAlt),
            iconBackground: surfaceAlt,
            progressTrack: mixWorkspaceColor(baseTheme.colors.surface, secondary, 0.12),
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
    const value = safeBrandColor(color, '#075748').slice(1);
    const red = parseInt(value.slice(0, 2), 16);
    const green = parseInt(value.slice(2, 4), 16);
    const blue = parseInt(value.slice(4, 6), 16);
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    return luma < 145 ? '#FFFFFF' : '#071B33';
}
