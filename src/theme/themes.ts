export type HomeOSThemeName = 'classic' | 'pastel' | 'ocean' | 'forest' | 'dark';

export type HomeOSTheme = {
    name: HomeOSThemeName;
    label: string;
    colors: {
        background: string;
        surface: string;
        surfaceAlt: string;
        text: string;
        mutedText: string;
        border: string;
        primary: string;
        primaryText: string;
        secondaryButton: string;
        secondaryButtonText: string;
        danger: string;
        dangerBackground: string;
        iconBackground: string;
        progressTrack: string;
        progressFill: string;
        overlay: string;
        link: string;
        status: {
            unknown: { background: string; border: string };
            good: { background: string; border: string };
            notInspected: { background: string; border: string };
            needsAttention: { background: string; border: string };
            emergency: { background: string; border: string };
            activeEmergency: { background: string; border: string };
        };
    };
    radii: {
        card: number;
        button: number;
        pill: number;
    };
};

export const DEFAULT_THEME_NAME: HomeOSThemeName = 'classic';

export const homeOSThemes: Record<HomeOSThemeName, HomeOSTheme> = {
    classic: {
        name: 'classic',
        label: 'HomeOS Classic',
        colors: {
            background: '#F3F6FA',
            surface: '#FFFFFF',
            surfaceAlt: '#E7ECF3',
            text: '#071B33',
            mutedText: '#637083',
            border: '#E3E8EF',
            primary: '#071B33',
            primaryText: '#FFFFFF',
            secondaryButton: '#E7ECF3',
            secondaryButtonText: '#071B33',
            danger: '#B00020',
            dangerBackground: '#FFF1F3',
            iconBackground: '#E7ECF3',
            progressTrack: '#E7ECF3',
            progressFill: '#9AA6B2',
            overlay: '#000000',
            link: '#0B5FFF',
            status: {
                unknown: { background: '#FFFFFF', border: '#E3E8EF' },
                good: { background: '#EAF8EF', border: '#BFE8CC' },
                notInspected: { background: '#FFF8DB', border: '#F4E6A0' },
                needsAttention: { background: '#FFF0DD', border: '#F2C28F' },
                emergency: { background: '#FFEAEA', border: '#F1B8B8' },
                activeEmergency: { background: '#FFD6D6', border: '#E25C5C' },
            },
        },
        radii: {
            card: 22,
            button: 18,
            pill: 999,
        },
    },
    pastel: {
        name: 'pastel',
        label: 'Pastel',
        colors: {
            background: '#FFF7FB',
            surface: '#FFFFFF',
            surfaceAlt: '#F7EAF3',
            text: '#30223A',
            mutedText: '#786A84',
            border: '#ECDCE8',
            primary: '#6E4D8B',
            primaryText: '#FFFFFF',
            secondaryButton: '#F2E7F7',
            secondaryButtonText: '#30223A',
            danger: '#B4234D',
            dangerBackground: '#FFF0F4',
            iconBackground: '#F4E7F8',
            progressTrack: '#F2E7F7',
            progressFill: '#C9A8DD',
            overlay: '#17121C',
            link: '#7C3AED',
            status: {
                unknown: { background: '#FFFFFF', border: '#ECDCE8' },
                good: { background: '#ECFAF0', border: '#C7EFD2' },
                notInspected: { background: '#FFF9DE', border: '#F3E6A2' },
                needsAttention: { background: '#FFF0E5', border: '#F2C9A5' },
                emergency: { background: '#FFEAF0', border: '#F0B5C4' },
                activeEmergency: { background: '#FFD7E2', border: '#E66A89' },
            },
        },
        radii: {
            card: 22,
            button: 18,
            pill: 999,
        },
    },
    ocean: {
        name: 'ocean',
        label: 'Ocean',
        colors: {
            background: '#EEF8FB',
            surface: '#FFFFFF',
            surfaceAlt: '#DDF0F7',
            text: '#062B3A',
            mutedText: '#54717C',
            border: '#CCE2EB',
            primary: '#075E73',
            primaryText: '#FFFFFF',
            secondaryButton: '#DDF0F7',
            secondaryButtonText: '#062B3A',
            danger: '#B42318',
            dangerBackground: '#FFF0EF',
            iconBackground: '#DDF0F7',
            progressTrack: '#DDF0F7',
            progressFill: '#63AFC3',
            overlay: '#03171F',
            link: '#037DA0',
            status: {
                unknown: { background: '#FFFFFF', border: '#CCE2EB' },
                good: { background: '#E7F8F0', border: '#BFEAD2' },
                notInspected: { background: '#FFF8DB', border: '#F1E19A' },
                needsAttention: { background: '#FFF0DD', border: '#EBC08F' },
                emergency: { background: '#FFE9E6', border: '#EEB2AA' },
                activeEmergency: { background: '#FFD4CC', border: '#E96A5B' },
            },
        },
        radii: {
            card: 22,
            button: 18,
            pill: 999,
        },
    },
    forest: {
        name: 'forest',
        label: 'Forest',
        colors: {
            background: '#F1F7F0',
            surface: '#FFFFFF',
            surfaceAlt: '#E2EEDC',
            text: '#17331F',
            mutedText: '#627464',
            border: '#D6E4D0',
            primary: '#234F2F',
            primaryText: '#FFFFFF',
            secondaryButton: '#E2EEDC',
            secondaryButtonText: '#17331F',
            danger: '#B42318',
            dangerBackground: '#FFF0EF',
            iconBackground: '#E2EEDC',
            progressTrack: '#E2EEDC',
            progressFill: '#84A977',
            overlay: '#08150C',
            link: '#2E7D32',
            status: {
                unknown: { background: '#FFFFFF', border: '#D6E4D0' },
                good: { background: '#E5F7E8', border: '#B8E2BF' },
                notInspected: { background: '#FFF8DB', border: '#EBDFA0' },
                needsAttention: { background: '#FFF0DD', border: '#E9C08D' },
                emergency: { background: '#FFE9E6', border: '#EEB2AA' },
                activeEmergency: { background: '#FFD4CC', border: '#E96A5B' },
            },
        },
        radii: {
            card: 22,
            button: 18,
            pill: 999,
        },
    },
    dark: {
        name: 'dark',
        label: 'Dark',
        colors: {
            background: '#0C1118',
            surface: '#151C26',
            surfaceAlt: '#222C38',
            text: '#F5F7FA',
            mutedText: '#A9B4C2',
            border: '#2C3745',
            primary: '#F5F7FA',
            primaryText: '#07111F',
            secondaryButton: '#222C38',
            secondaryButtonText: '#F5F7FA',
            danger: '#FF8A8A',
            dangerBackground: '#3B1820',
            iconBackground: '#222C38',
            progressTrack: '#222C38',
            progressFill: '#7D8B9A',
            overlay: '#000000',
            link: '#8AB4FF',
            status: {
                unknown: { background: '#151C26', border: '#2C3745' },
                good: { background: '#163224', border: '#2E6B45' },
                notInspected: { background: '#383219', border: '#71642A' },
                needsAttention: { background: '#432B18', border: '#8A5A2B' },
                emergency: { background: '#3B1820', border: '#7F3442' },
                activeEmergency: { background: '#561C22', border: '#D45C68' },
            },
        },
        radii: {
            card: 22,
            button: 18,
            pill: 999,
        },
    },
};

export const themeOptions = Object.values(homeOSThemes);

export function isHomeOSThemeName(value: string | null): value is HomeOSThemeName {
    return !!value && value in homeOSThemes;
}
