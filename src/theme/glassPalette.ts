import type { HomeOSTheme } from './themes';

export type GlassTone = 'emerald' | 'teal' | 'blue' | 'steel';

export type GlassToneColors = {
    background: string;
    border: string;
    edge: string;
    glow: string;
    iconBackground: string;
};

export type GlassPalette = {
    id: string;
    label: string;
    screen: string;
    text: string;
    mutedText: string;
    tones: Record<GlassTone, GlassToneColors>;
};

export const orbitalGlassPalette: GlassPalette = {
    id: 'orbital-green-blue',
    label: 'Orbital Green + Blue',
    screen: '#03182A',
    text: '#F5FBFF',
    mutedText: '#AFC2D2',
    tones: {
        emerald: {
            background: 'rgba(7, 87, 72, 0.78)',
            border: 'rgba(121, 235, 177, 0.76)',
            edge: '#53B98D',
            glow: 'rgba(54, 211, 153, 0.24)',
            iconBackground: 'rgba(15, 92, 77, 0.72)',
        },
        teal: {
            background: 'rgba(4, 83, 102, 0.78)',
            border: 'rgba(94, 219, 224, 0.72)',
            edge: '#2FA5B3',
            glow: 'rgba(45, 212, 191, 0.22)',
            iconBackground: 'rgba(7, 83, 97, 0.72)',
        },
        blue: {
            background: 'rgba(4, 63, 105, 0.8)',
            border: 'rgba(104, 202, 246, 0.74)',
            edge: '#2788B7',
            glow: 'rgba(56, 189, 248, 0.24)',
            iconBackground: 'rgba(8, 67, 108, 0.74)',
        },
        steel: {
            background: 'rgba(30, 65, 96, 0.78)',
            border: 'rgba(174, 205, 229, 0.68)',
            edge: '#5C86A5',
            glow: 'rgba(148, 197, 230, 0.18)',
            iconBackground: 'rgba(38, 73, 103, 0.72)',
        },
    },
};

export function glassToneForIndex(index: number): GlassTone {
    return (['emerald', 'blue', 'teal', 'steel'] as const)[Math.abs(index) % 4];
}

export function createCompanyGlassPalette(input: {
    id: string;
    label: string;
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
    panel?: string | null;
    panelOpacity?: number | null;
}): GlassPalette {
    const primary = validHex(input.primary) || '#075748';
    const secondary = validHex(input.secondary) || '#043F69';
    const accent = validHex(input.accent) || '#2FA5B3';
    const panel = validHex(input.panel);
    const panelOpacity = Math.max(1, Math.min(100, Number(input.panelOpacity) || 78)) / 100;
    const supporting = isNearWhite(secondary)
        ? mixHex(primary, accent, 0.2)
        : secondary;
    const companyPanel = panel || mixHex(primary, supporting, 0.28);

    return {
        ...orbitalGlassPalette,
        id: input.id,
        label: input.label,
        tones: {
            emerald: colorTone(primary, '#53B98D'),
            teal: colorTone(accent, '#2FA5B3'),
            blue: colorTone(supporting, '#2788B7'),
            steel: colorTone(companyPanel, primary, panelOpacity),
        },
    };
}

export function resolveGlassHomeTheme(
    source: HomeOSTheme,
    custom?: {
        primary?: string;
        secondary?: string;
        accent?: string;
        background?: string;
        backgroundIntensity?: number;
        panel?: string;
        panelOpacity?: number;
    }
): HomeOSTheme {
    const palette = createCompanyGlassPalette({
        id: `home-${source.name}`,
        label: source.label,
        primary: custom?.primary || source.colors.primary,
        secondary: custom?.secondary,
        accent: custom?.accent,
    });
    const accent = usableAccent(custom?.accent || source.colors.primary)
        ? (custom?.accent || source.colors.primary)
        : palette.tones.blue.edge;
    const backgroundIntensity = Math.max(
        1,
        Math.min(100, Number(custom?.backgroundIntensity) || 100)
    ) / 100;
    const background = mixHex(
        validHex(custom?.background) || orbitalGlassPalette.screen,
        '#01070D',
        1 - backgroundIntensity
    );
    const panelOpacity = Math.max(1, Math.min(100, Number(custom?.panelOpacity) || 78)) / 100;
    const panelColor = validHex(custom?.panel) || '#1E4160';
    const panelBackground = withAlpha(panelColor, panelOpacity);

    return {
        ...source,
        label: `${source.label} Glass`,
        colors: {
            ...source.colors,
            background,
            surface: withAlpha(mixHex(panelColor, '#03182A', 0.2), Math.min(0.98, panelOpacity + 0.12)),
            surfaceAlt: panelBackground,
            text: orbitalGlassPalette.text,
            mutedText: orbitalGlassPalette.mutedText,
            border: 'rgba(174, 205, 229, 0.48)',
            primary: accent,
            primaryText: '#FFFFFF',
            secondaryButton: palette.tones.steel.background,
            secondaryButtonText: orbitalGlassPalette.text,
            iconBackground: palette.tones.teal.iconBackground,
            progressTrack: 'rgba(174, 205, 229, 0.2)',
            progressFill: accent,
            overlay: '#010A12',
            link: '#74D8FF',
            danger: '#C45B5B',
            dangerBackground: 'rgba(113, 37, 45, 0.72)',
            status: {
                unknown: { background: palette.tones.steel.background, border: palette.tones.steel.border },
                good: { background: palette.tones.emerald.background, border: palette.tones.emerald.border },
                notInspected: { background: palette.tones.blue.background, border: palette.tones.blue.border },
                needsAttention: { background: 'rgba(125, 77, 17, 0.76)', border: 'rgba(246, 188, 92, 0.72)' },
                emergency: { background: 'rgba(113, 37, 45, 0.72)', border: 'rgba(239, 128, 128, 0.72)' },
                activeEmergency: { background: 'rgba(133, 31, 42, 0.82)', border: 'rgba(255, 121, 121, 0.82)' },
            },
        },
        radii: {
            card: 18,
            button: 14,
            pill: 999,
        },
    };
}

function usableAccent(value: string) {
    const normalized = String(value || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(normalized) && normalized !== '#ffffff' && normalized !== '#ffff00';
}

function isNearWhite(value: string) {
    const color = validHex(value);
    if (!color) return false;

    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);

    return red >= 224 && green >= 224 && blue >= 224;
}

function colorTone(color: string, fallbackEdge: string, opacity = 0.82): GlassToneColors {
    return {
        background: withAlpha(mixHex(color, '#03182A', 0.32), opacity),
        border: withAlpha(mixHex(color, '#FFFFFF', 0.58), 0.76),
        edge: validHex(color) || fallbackEdge,
        glow: withAlpha(color, 0.24),
        iconBackground: withAlpha(mixHex(color, '#03182A', 0.18), 0.76),
    };
}

function validHex(value?: string | null) {
    const normalized = String(value || '').trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : '';
}

function withAlpha(hex: string, alpha: number) {
    const color = validHex(hex) || '#03182A';
    const red = Number.parseInt(color.slice(1, 3), 16);
    const green = Number.parseInt(color.slice(3, 5), 16);
    const blue = Number.parseInt(color.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function mixHex(first: string, second: string, ratio: number) {
    const a = validHex(first) || '#03182A';
    const b = validHex(second) || '#03182A';
    const channel = (start: number) => Math.round(
        Number.parseInt(a.slice(start, start + 2), 16) * (1 - ratio) +
        Number.parseInt(b.slice(start, start + 2), 16) * ratio
    ).toString(16).padStart(2, '0');
    return `#${channel(1)}${channel(3)}${channel(5)}`.toUpperCase();
}
