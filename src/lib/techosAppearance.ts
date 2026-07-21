export type TechOSDashboardVisualKey =
    | 'jobs'
    | 'schedule'
    | 'history'
    | 'estimates'
    | 'sales'
    | 'messages'
    | 'time-clock'
    | 'van-inventory';

export type TechOSJobDetailVisualKey =
    | 'customer'
    | 'request'
    | 'status'
    | 'workflow'
    | 'note'
    | 'estimate'
    | 'finish';

export type TechOSVisualVariant = {
    accentColor: string;
    backgroundColor: string;
    borderColor: string;
};

export type TechOSThemeId =
    | 'professional'
    | 'bravoBlackGold'
    | 'fieldBlue'
    | 'darkOperations'
    | 'highContrast'
    | 'soft';

export type TechOSThemePaletteId = TechOSThemeId | 'companyBrand';

export type CompanyTechOSBrand = {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
};

export type TechOSThemePalette = {
    id: TechOSThemePaletteId;
    label: string;
    description: string;
    screenBackgroundColor: string;
    panelBackgroundColor: string;
    panelBorderColor: string;
    textColor: string;
    mutedTextColor: string;
    activeBorderColor: string;
    dashboard: Record<TechOSDashboardVisualKey, TechOSVisualVariant>;
    jobDetail: Record<TechOSJobDetailVisualKey, TechOSVisualVariant>;
};

export const DEFAULT_TECHOS_THEME_ID: TechOSThemeId = 'professional';
const TECHOS_THEME_STORAGE_KEY_PREFIX = 'techos_appearance_theme_';

const softDashboard = {
    jobs: variant('#2563EB', 'rgba(37, 99, 235, 0.08)', 'rgba(37, 99, 235, 0.30)'),
    schedule: variant('#7C3AED', 'rgba(124, 58, 237, 0.08)', 'rgba(124, 58, 237, 0.30)'),
    history: variant('#64748B', 'rgba(100, 116, 139, 0.09)', 'rgba(100, 116, 139, 0.32)'),
    estimates: variant('#B7791F', 'rgba(183, 121, 31, 0.10)', 'rgba(183, 121, 31, 0.34)'),
    sales: variant('#15803D', 'rgba(21, 128, 61, 0.08)', 'rgba(21, 128, 61, 0.30)'),
    messages: variant('#0F766E', 'rgba(15, 118, 110, 0.08)', 'rgba(15, 118, 110, 0.30)'),
    'time-clock': variant('#C2410C', 'rgba(194, 65, 12, 0.08)', 'rgba(194, 65, 12, 0.30)'),
    'van-inventory': variant('#4F46E5', 'rgba(79, 70, 229, 0.08)', 'rgba(79, 70, 229, 0.30)'),
};

const softJobDetail = {
    customer: variant('#2563EB', 'rgba(37, 99, 235, 0.07)', 'rgba(37, 99, 235, 0.28)'),
    request: variant('#B7791F', 'rgba(183, 121, 31, 0.09)', 'rgba(183, 121, 31, 0.30)'),
    status: variant('#7C3AED', 'rgba(124, 58, 237, 0.07)', 'rgba(124, 58, 237, 0.28)'),
    workflow: variant('#0F766E', 'rgba(15, 118, 110, 0.07)', 'rgba(15, 118, 110, 0.28)'),
    note: variant('#64748B', 'rgba(100, 116, 139, 0.08)', 'rgba(100, 116, 139, 0.30)'),
    estimate: variant('#B7791F', 'rgba(183, 121, 31, 0.10)', 'rgba(183, 121, 31, 0.34)'),
    finish: variant('#B91C1C', 'rgba(185, 28, 28, 0.07)', 'rgba(185, 28, 28, 0.28)'),
};

export const techOSThemes: Record<TechOSThemeId, TechOSThemePalette> = {
    professional: {
        id: 'professional',
        label: 'Professional',
        description: 'Neutral surfaces with navy and slate accents.',
        screenBackgroundColor: '#F6F8FB',
        panelBackgroundColor: '#FFFFFF',
        panelBorderColor: '#D9E2EC',
        textColor: '#102033',
        mutedTextColor: '#5F6E7D',
        activeBorderColor: '#0F2F57',
        dashboard: {
            jobs: variant('#0F2F57', '#FFFFFF', '#B9C7D8'),
            schedule: variant('#475569', '#F8FAFC', '#CBD5E1'),
            history: variant('#64748B', '#F8FAFC', '#D5DCE6'),
            estimates: variant('#8A641A', '#FFFCF4', '#E6D7AE'),
            sales: variant('#246B4B', '#F7FBF8', '#BFD9CC'),
            messages: variant('#1C6A70', '#F6FBFC', '#B9D9DC'),
            'time-clock': variant('#8A4F1D', '#FFFBF7', '#E4C7A9'),
            'van-inventory': variant('#35405E', '#F8FAFC', '#C9D1E2'),
        },
        jobDetail: {
            customer: variant('#0F2F57', '#FFFFFF', '#B9C7D8'),
            request: variant('#8A641A', '#FFFCF4', '#E6D7AE'),
            status: variant('#475569', '#F8FAFC', '#CBD5E1'),
            workflow: variant('#246B4B', '#F7FBF8', '#BFD9CC'),
            note: variant('#64748B', '#F8FAFC', '#D5DCE6'),
            estimate: variant('#8A641A', '#FFFCF4', '#E6D7AE'),
            finish: variant('#9F2A2A', '#FFF7F7', '#E8B9B9'),
        },
    },
    bravoBlackGold: {
        id: 'bravoBlackGold',
        label: 'Bravo Black & Gold',
        description: 'Charcoal panels with Bravo gold accents.',
        screenBackgroundColor: '#111111',
        panelBackgroundColor: '#191919',
        panelBorderColor: '#3D3320',
        textColor: '#FFF8E8',
        mutedTextColor: '#D6C7A4',
        activeBorderColor: '#D8A735',
        dashboard: darkPalette('#D8A735', '#2F2A20'),
        jobDetail: darkJobPalette('#D8A735', '#2F2A20'),
    },
    fieldBlue: {
        id: 'fieldBlue',
        label: 'Field Blue',
        description: 'Blue and slate palette for field work.',
        screenBackgroundColor: '#EEF5FA',
        panelBackgroundColor: '#F8FBFD',
        panelBorderColor: '#BCD0E1',
        textColor: '#0B2438',
        mutedTextColor: '#536B80',
        activeBorderColor: '#1267A7',
        dashboard: {
            jobs: variant('#1267A7', '#F3F9FD', '#A7CBE4'),
            schedule: variant('#285A7E', '#F3F8FC', '#B7CDDE'),
            history: variant('#66788A', '#F7FAFC', '#D0DAE4'),
            estimates: variant('#8A641A', '#FFFCF4', '#E6D7AE'),
            sales: variant('#23735A', '#F3FAF7', '#B8DCCF'),
            messages: variant('#087A8F', '#F2FAFC', '#A7D7DF'),
            'time-clock': variant('#8A5A20', '#FFFAF3', '#E2CAA8'),
            'van-inventory': variant('#334D8F', '#F4F7FD', '#BAC8E7'),
        },
        jobDetail: {
            customer: variant('#1267A7', '#F3F9FD', '#A7CBE4'),
            request: variant('#8A641A', '#FFFCF4', '#E6D7AE'),
            status: variant('#285A7E', '#F3F8FC', '#B7CDDE'),
            workflow: variant('#23735A', '#F3FAF7', '#B8DCCF'),
            note: variant('#66788A', '#F7FAFC', '#D0DAE4'),
            estimate: variant('#8A641A', '#FFFCF4', '#E6D7AE'),
            finish: variant('#A13232', '#FFF6F6', '#E7BBBB'),
        },
    },
    darkOperations: {
        id: 'darkOperations',
        label: 'Dark Operations',
        description: 'Dark operational panels with clear separation.',
        screenBackgroundColor: '#0C1118',
        panelBackgroundColor: '#151C26',
        panelBorderColor: '#2C3745',
        textColor: '#F5F7FA',
        mutedTextColor: '#A9B4C2',
        activeBorderColor: '#7DB7FF',
        dashboard: darkPalette('#7DB7FF', '#182538'),
        jobDetail: darkJobPalette('#7DB7FF', '#182538'),
    },
    highContrast: {
        id: 'highContrast',
        label: 'High Contrast',
        description: 'Stronger borders and contrast for bright conditions.',
        screenBackgroundColor: '#FFFFFF',
        panelBackgroundColor: '#FFFFFF',
        panelBorderColor: '#111827',
        textColor: '#000000',
        mutedTextColor: '#1F2937',
        activeBorderColor: '#000000',
        dashboard: {
            jobs: variant('#000000', '#FFFFFF', '#000000'),
            schedule: variant('#1D4ED8', '#FFFFFF', '#1D4ED8'),
            history: variant('#374151', '#FFFFFF', '#374151'),
            estimates: variant('#92400E', '#FFFFFF', '#92400E'),
            sales: variant('#166534', '#FFFFFF', '#166534'),
            messages: variant('#0F766E', '#FFFFFF', '#0F766E'),
            'time-clock': variant('#C2410C', '#FFFFFF', '#C2410C'),
            'van-inventory': variant('#4338CA', '#FFFFFF', '#4338CA'),
        },
        jobDetail: {
            customer: variant('#000000', '#FFFFFF', '#000000'),
            request: variant('#92400E', '#FFFFFF', '#92400E'),
            status: variant('#1D4ED8', '#FFFFFF', '#1D4ED8'),
            workflow: variant('#166534', '#FFFFFF', '#166534'),
            note: variant('#374151', '#FFFFFF', '#374151'),
            estimate: variant('#92400E', '#FFFFFF', '#92400E'),
            finish: variant('#991B1B', '#FFFFFF', '#991B1B'),
        },
    },
    soft: {
        id: 'soft',
        label: 'Soft',
        description: 'The softer pastel TechOS palette.',
        screenBackgroundColor: '#F8FAFC',
        panelBackgroundColor: '#FFFFFF',
        panelBorderColor: '#E3E8EF',
        textColor: '#071B33',
        mutedTextColor: '#637083',
        activeBorderColor: '#071B33',
        dashboard: softDashboard,
        jobDetail: softJobDetail,
    },
};

export const techOSThemeOptions = Object.values(techOSThemes);

export const TECHOS_DASHBOARD_VISUAL_VARIANTS = techOSThemes.soft.dashboard;
export const TECHOS_JOB_DETAIL_VISUAL_VARIANTS = techOSThemes.soft.jobDetail;

export function isTechOSThemeId(value: unknown): value is TechOSThemeId {
    return typeof value === 'string' && value in techOSThemes;
}

export function resolveTechOSTheme(value?: string | null): TechOSThemePalette {
    return isTechOSThemeId(value) ? techOSThemes[value] : techOSThemes[DEFAULT_TECHOS_THEME_ID];
}

export function resolveCompanyTechOSTheme(brand?: CompanyTechOSBrand | null): TechOSThemePalette {
    const fallback = techOSThemes[DEFAULT_TECHOS_THEME_ID];
    const primaryColor = normalizeHexColor(brand?.primaryColor) || fallback.activeBorderColor;
    const secondaryColor = normalizeHexColor(brand?.secondaryColor) || fallback.panelBackgroundColor;
    const accentColor = normalizeHexColor(brand?.accentColor) || primaryColor;
    const panelBackgroundColor = secondaryColor;
    const screenBackgroundColor = mixHexColors(secondaryColor, primaryColor, isDarkColor(secondaryColor) ? 0.18 : 0.08);
    const panelBorderColor = mixHexColors(secondaryColor, primaryColor, isDarkColor(secondaryColor) ? 0.52 : 0.30);
    const textColor = getReadableTextColor(panelBackgroundColor);
    const mutedTextColor = mixHexColors(textColor, panelBackgroundColor, isDarkColor(panelBackgroundColor) ? 0.36 : 0.42);
    const blendColor = mixHexColors(primaryColor, accentColor, 0.5);

    return {
        id: 'companyBrand',
        label: 'Company Brand',
        description: 'Managed by the company brand profile.',
        screenBackgroundColor,
        panelBackgroundColor,
        panelBorderColor,
        textColor,
        mutedTextColor,
        activeBorderColor: accentColor,
        dashboard: {
            jobs: companyVariant(primaryColor, panelBackgroundColor),
            schedule: companyVariant(accentColor, panelBackgroundColor),
            history: companyVariant(blendColor, panelBackgroundColor),
            estimates: companyVariant(accentColor, panelBackgroundColor),
            sales: companyVariant(primaryColor, panelBackgroundColor),
            messages: companyVariant(blendColor, panelBackgroundColor),
            'time-clock': companyVariant(accentColor, panelBackgroundColor),
            'van-inventory': companyVariant(primaryColor, panelBackgroundColor),
        },
        jobDetail: {
            customer: companyVariant(primaryColor, panelBackgroundColor),
            request: companyVariant(accentColor, panelBackgroundColor),
            status: companyVariant(blendColor, panelBackgroundColor),
            workflow: companyVariant(primaryColor, panelBackgroundColor),
            note: companyVariant(blendColor, panelBackgroundColor),
            estimate: companyVariant(accentColor, panelBackgroundColor),
            finish: companyVariant('#B91C1C', panelBackgroundColor),
        },
    };
}

export function resolveTechOSDashboardVariant(key: TechOSDashboardVisualKey, themeId?: string | null) {
    return resolveTechOSTheme(themeId).dashboard[key];
}

export function resolveTechOSJobDetailVariant(key: TechOSJobDetailVisualKey, themeId?: string | null) {
    return resolveTechOSTheme(themeId).jobDetail[key];
}

export function techOSThemeStorageKey(userId: string) {
    return `${TECHOS_THEME_STORAGE_KEY_PREFIX}${userId}`;
}

function variant(accentColor: string, backgroundColor: string, borderColor: string): TechOSVisualVariant {
    return { accentColor, backgroundColor, borderColor };
}

function companyVariant(accentColor: string, panelBackgroundColor: string): TechOSVisualVariant {
    const backgroundStrength = isDarkColor(panelBackgroundColor) ? 0.22 : 0.10;
    const borderStrength = isDarkColor(panelBackgroundColor) ? 0.60 : 0.38;

    return variant(
        accentColor,
        mixHexColors(panelBackgroundColor, accentColor, backgroundStrength),
        mixHexColors(panelBackgroundColor, accentColor, borderStrength)
    );
}

function normalizeHexColor(value?: string | null) {
    const color = String(value || '').trim();
    const shortMatch = color.match(/^#([0-9a-f]{3})$/i);

    if (shortMatch) {
        const [red, green, blue] = shortMatch[1].split('');
        return `#${red}${red}${green}${green}${blue}${blue}`.toUpperCase();
    }

    return /^#[0-9a-f]{6}$/i.test(color) ? color.toUpperCase() : '';
}

function mixHexColors(baseColor: string, overlayColor: string, overlayWeight: number) {
    const base = parseHexColor(baseColor);
    const overlay = parseHexColor(overlayColor);
    const weight = Math.max(0, Math.min(1, overlayWeight));
    const mixed = base.map((channel, index) => Math.round(channel * (1 - weight) + overlay[index] * weight));

    return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function parseHexColor(color: string) {
    const normalized = normalizeHexColor(color) || '#000000';

    return [
        Number.parseInt(normalized.slice(1, 3), 16),
        Number.parseInt(normalized.slice(3, 5), 16),
        Number.parseInt(normalized.slice(5, 7), 16),
    ];
}

function getReadableTextColor(backgroundColor: string) {
    return isDarkColor(backgroundColor) ? '#FFFFFF' : '#102033';
}

function isDarkColor(color: string) {
    const [red, green, blue] = parseHexColor(color).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

    return luminance < 0.36;
}

function darkPalette(primaryAccent: string, baseBackground: string): Record<TechOSDashboardVisualKey, TechOSVisualVariant> {
    return {
        jobs: variant(primaryAccent, baseBackground, 'rgba(216, 167, 53, 0.58)'),
        schedule: variant('#8BB7FF', '#172235', 'rgba(139, 183, 255, 0.46)'),
        history: variant('#A8B3C2', '#1D2430', 'rgba(168, 179, 194, 0.42)'),
        estimates: variant('#F0C65A', '#282314', 'rgba(240, 198, 90, 0.54)'),
        sales: variant('#7DD59B', '#17291E', 'rgba(125, 213, 155, 0.42)'),
        messages: variant('#70D6D0', '#152927', 'rgba(112, 214, 208, 0.42)'),
        'time-clock': variant('#F4A261', '#2A1F17', 'rgba(244, 162, 97, 0.44)'),
        'van-inventory': variant('#A5B4FC', '#1D2134', 'rgba(165, 180, 252, 0.44)'),
    };
}

function darkJobPalette(primaryAccent: string, baseBackground: string): Record<TechOSJobDetailVisualKey, TechOSVisualVariant> {
    return {
        customer: variant(primaryAccent, baseBackground, 'rgba(216, 167, 53, 0.58)'),
        request: variant('#F0C65A', '#282314', 'rgba(240, 198, 90, 0.54)'),
        status: variant('#8BB7FF', '#172235', 'rgba(139, 183, 255, 0.46)'),
        workflow: variant('#7DD59B', '#17291E', 'rgba(125, 213, 155, 0.42)'),
        note: variant('#A8B3C2', '#1D2430', 'rgba(168, 179, 194, 0.42)'),
        estimate: variant('#F0C65A', '#282314', 'rgba(240, 198, 90, 0.54)'),
        finish: variant('#FF8A8A', '#321A1D', 'rgba(255, 138, 138, 0.46)'),
    };
}
