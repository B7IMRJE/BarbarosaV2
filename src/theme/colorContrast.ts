export const MINIMUM_BODY_TEXT_CONTRAST = 4.5;

type RgbaColor = {
    red: number;
    green: number;
    blue: number;
    alpha: number;
};

export function getThemeContrastRatio(
    foreground: string,
    background: string,
    backdrop = '#FFFFFF'
) {
    const opaqueBackdrop = resolveOpaqueColor(backdrop, opaqueWhite());
    const opaqueBackground = resolveOpaqueColor(background, opaqueBackdrop);
    const opaqueForeground = resolveOpaqueColor(foreground, opaqueBackground);
    const foregroundLuminance = relativeLuminance(opaqueForeground);
    const backgroundLuminance = relativeLuminance(opaqueBackground);
    const lighter = Math.max(foregroundLuminance, backgroundLuminance);
    const darker = Math.min(foregroundLuminance, backgroundLuminance);

    return (lighter + 0.05) / (darker + 0.05);
}

export function chooseReadableThemeText(
    background: string,
    lightText = '#F5FBFF',
    darkText = '#071B33',
    backdrop = '#FFFFFF'
) {
    const candidates = [lightText, darkText, '#FFFFFF', '#000000'];

    return candidates.reduce((best, candidate) =>
        getThemeContrastRatio(candidate, background, backdrop)
            > getThemeContrastRatio(best, background, backdrop)
            ? candidate
            : best
    );
}

export function compositeThemeColors(
    foreground: string,
    background: string,
    backdrop = '#FFFFFF'
) {
    const opaqueBackdrop = resolveOpaqueColor(backdrop, opaqueWhite());
    const opaqueBackground = resolveOpaqueColor(background, opaqueBackdrop);
    const opaqueForeground = resolveOpaqueColor(foreground, opaqueBackground);

    return rgbToHex(opaqueForeground);
}

function resolveOpaqueColor(value: string, backdrop: RgbaColor) {
    const color = parseThemeColor(value) || backdrop;
    return compositeColor(color, backdrop);
}

function parseThemeColor(value: string): RgbaColor | null {
    const normalized = String(value || '').trim();
    const hexMatch = normalized.match(/^#([0-9A-F]{6})$/i);

    if (hexMatch) {
        return {
            red: Number.parseInt(hexMatch[1].slice(0, 2), 16),
            green: Number.parseInt(hexMatch[1].slice(2, 4), 16),
            blue: Number.parseInt(hexMatch[1].slice(4, 6), 16),
            alpha: 1,
        };
    }

    const rgbMatch = normalized.match(
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*)?\)$/i
    );

    if (!rgbMatch) return null;

    return {
        red: clamp(Number(rgbMatch[1]), 0, 255),
        green: clamp(Number(rgbMatch[2]), 0, 255),
        blue: clamp(Number(rgbMatch[3]), 0, 255),
        alpha: clamp(rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]), 0, 1),
    };
}

function compositeColor(foreground: RgbaColor, background: RgbaColor): RgbaColor {
    const alpha = foreground.alpha + background.alpha * (1 - foreground.alpha);

    if (alpha <= 0) return { red: 0, green: 0, blue: 0, alpha: 1 };

    return {
        red: (foreground.red * foreground.alpha + background.red * background.alpha * (1 - foreground.alpha)) / alpha,
        green: (foreground.green * foreground.alpha + background.green * background.alpha * (1 - foreground.alpha)) / alpha,
        blue: (foreground.blue * foreground.alpha + background.blue * background.alpha * (1 - foreground.alpha)) / alpha,
        alpha,
    };
}

function relativeLuminance(color: RgbaColor) {
    const channel = (value: number) => {
        const normalized = clamp(value, 0, 255) / 255;
        return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    };

    return 0.2126 * channel(color.red)
        + 0.7152 * channel(color.green)
        + 0.0722 * channel(color.blue);
}

function rgbToHex(color: RgbaColor) {
    const channel = (value: number) => Math.round(clamp(value, 0, 255))
        .toString(16)
        .padStart(2, '0');

    return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}`.toUpperCase();
}

function opaqueWhite(): RgbaColor {
    return { red: 255, green: 255, blue: 255, alpha: 1 };
}

function clamp(value: number, minimum: number, maximum: number) {
    return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
