import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    createContext,
    createElement,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import {
    DEFAULT_THEME_NAME,
    homeOSThemes,
    isHomeOSThemeName,
    type HomeOSTheme,
    type HomeOSThemeName,
} from './themes';

const THEME_STORAGE_KEY = 'homeos:selected-theme';
const APPEARANCE_STORAGE_KEY = 'homeos:appearance-preferences';

export type AppearanceSizeName = 'compact' | 'standard' | 'large' | 'extraLarge';

export type AppearancePreferences = {
    fontSize: AppearanceSizeName;
    iconSize: AppearanceSizeName;
};

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
    fontSize: 'standard',
    iconSize: 'standard',
};

export const appearanceSizeOptions: {
    name: AppearanceSizeName;
    label: string;
    scale: number;
}[] = [
    { name: 'compact', label: 'Compact', scale: 0.92 },
    { name: 'standard', label: 'Standard', scale: 1 },
    { name: 'large', label: 'Large', scale: 1.12 },
    { name: 'extraLarge', label: 'Extra Large', scale: 1.24 },
];

type ThemeContextValue = {
    themeName: HomeOSThemeName;
    theme: HomeOSTheme;
    setThemeName: (themeName: HomeOSThemeName) => Promise<void>;
    appearance: AppearancePreferences;
    setAppearance: (appearance: AppearancePreferences) => Promise<void>;
    setFontSize: (fontSize: AppearanceSizeName) => Promise<void>;
    setIconSize: (iconSize: AppearanceSizeName) => Promise<void>;
    resetAppearance: () => Promise<void>;
    fontScale: number;
    iconScale: number;
    scaleFont: (size: number) => number;
    scaleIcon: (size: number) => number;
    isThemeLoaded: boolean;
};

function isAppearanceSizeName(value: unknown): value is AppearanceSizeName {
    return (
        value === 'compact' ||
        value === 'standard' ||
        value === 'large' ||
        value === 'extraLarge'
    );
}

function sanitizeAppearancePreferences(value: unknown): AppearancePreferences {
    if (!value || typeof value !== 'object') {
        return DEFAULT_APPEARANCE_PREFERENCES;
    }

    const candidate = value as Partial<AppearancePreferences>;

    return {
        fontSize: isAppearanceSizeName(candidate.fontSize)
            ? candidate.fontSize
            : DEFAULT_APPEARANCE_PREFERENCES.fontSize,
        iconSize: isAppearanceSizeName(candidate.iconSize)
            ? candidate.iconSize
            : DEFAULT_APPEARANCE_PREFERENCES.iconSize,
    };
}

function scaleForSize(sizeName: AppearanceSizeName) {
    return appearanceSizeOptions.find((option) => option.name === sizeName)?.scale || 1;
}

export const ThemeContext = createContext<ThemeContextValue>({
    themeName: DEFAULT_THEME_NAME,
    theme: homeOSThemes[DEFAULT_THEME_NAME],
    setThemeName: async () => undefined,
    appearance: DEFAULT_APPEARANCE_PREFERENCES,
    setAppearance: async () => undefined,
    setFontSize: async () => undefined,
    setIconSize: async () => undefined,
    resetAppearance: async () => undefined,
    fontScale: 1,
    iconScale: 1,
    scaleFont: (size) => size,
    scaleIcon: (size) => size,
    isThemeLoaded: false,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeName, setThemeNameState] =
        useState<HomeOSThemeName>(DEFAULT_THEME_NAME);
    const [appearance, setAppearanceState] = useState<AppearancePreferences>(
        DEFAULT_APPEARANCE_PREFERENCES
    );
    const [isThemeLoaded, setIsThemeLoaded] = useState(false);

    useEffect(() => {
        loadStoredAppearance();
    }, []);

    async function loadStoredAppearance() {
        try {
            const [storedTheme, storedAppearance] = await Promise.all([
                AsyncStorage.getItem(THEME_STORAGE_KEY),
                AsyncStorage.getItem(APPEARANCE_STORAGE_KEY),
            ]);

            if (isHomeOSThemeName(storedTheme)) {
                setThemeNameState(storedTheme);
            }

            if (storedAppearance) {
                setAppearanceState(
                    sanitizeAppearancePreferences(JSON.parse(storedAppearance))
                );
            }
        } finally {
            setIsThemeLoaded(true);
        }
    }

    async function setThemeName(nextThemeName: HomeOSThemeName) {
        setThemeNameState(nextThemeName);
        await AsyncStorage.setItem(THEME_STORAGE_KEY, nextThemeName);
    }

    async function setAppearance(nextAppearance: AppearancePreferences) {
        const sanitizedAppearance = sanitizeAppearancePreferences(nextAppearance);
        setAppearanceState(sanitizedAppearance);
        await AsyncStorage.setItem(
            APPEARANCE_STORAGE_KEY,
            JSON.stringify(sanitizedAppearance)
        );
    }

    async function setFontSize(fontSize: AppearanceSizeName) {
        await setAppearance({ ...appearance, fontSize });
    }

    async function setIconSize(iconSize: AppearanceSizeName) {
        await setAppearance({ ...appearance, iconSize });
    }

    async function resetAppearance() {
        setAppearanceState(DEFAULT_APPEARANCE_PREFERENCES);
        await AsyncStorage.removeItem(APPEARANCE_STORAGE_KEY);
    }

    const fontScale = scaleForSize(appearance.fontSize);
    const iconScale = scaleForSize(appearance.iconSize);

    const value = useMemo(
        () => ({
            themeName,
            theme: homeOSThemes[themeName],
            setThemeName,
            appearance,
            setAppearance,
            setFontSize,
            setIconSize,
            resetAppearance,
            fontScale,
            iconScale,
            scaleFont: (size: number) => Math.round(size * fontScale),
            scaleIcon: (size: number) => Math.round(size * iconScale),
            isThemeLoaded,
        }),
        [themeName, appearance, fontScale, iconScale, isThemeLoaded]
    );

    return createElement(ThemeContext.Provider, { value }, children);
}

export type { HomeOSTheme, HomeOSThemeName };
export { DEFAULT_THEME_NAME, homeOSThemes, themeOptions } from './themes';
