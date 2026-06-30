import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    createContext,
    createElement,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import {
    DEFAULT_THEME_NAME,
    homeOSThemes,
    isHomeOSThemeName,
    type HomeOSTheme,
    type HomeOSThemeName,
} from './themes';

const LEGACY_THEME_STORAGE_KEY = 'homeos:selected-theme';
const LEGACY_APPEARANCE_STORAGE_KEY = 'homeos:appearance-preferences';
const THEME_STORAGE_KEY_PREFIX = 'homeos_theme_';
const APPEARANCE_STORAGE_KEY_PREFIX = 'homeos_appearance_';

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

function getThemeStorageKey(userId: string) {
    return `${THEME_STORAGE_KEY_PREFIX}${userId}`;
}

function getAppearanceStorageKey(userId: string) {
    return `${APPEARANCE_STORAGE_KEY_PREFIX}${userId}`;
}

function parseStoredAppearance(storedAppearance: string | null) {
    if (!storedAppearance) return DEFAULT_APPEARANCE_PREFERENCES;

    try {
        return sanitizeAppearancePreferences(JSON.parse(storedAppearance));
    } catch {
        return DEFAULT_APPEARANCE_PREFERENCES;
    }
}

async function clearLegacyGlobalAppearance() {
    await Promise.all([
        AsyncStorage.removeItem(LEGACY_THEME_STORAGE_KEY),
        AsyncStorage.removeItem(LEGACY_APPEARANCE_STORAGE_KEY),
    ]);
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
    const activeUserIdRef = useRef<string | null>(null);
    const loadRunRef = useRef(0);

    useEffect(() => {
        let mounted = true;

        loadCurrentUserAppearance();

        const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!mounted) return;

            void applyUserScopedAppearance(session?.user?.id || null);
        });

        return () => {
            mounted = false;
            listener.subscription.unsubscribe();
        };
    }, []);

    async function loadCurrentUserAppearance() {
        try {
            const { data } = await supabase.auth.getSession();
            await applyUserScopedAppearance(data.session?.user?.id || null);
        } catch {
            await applyUserScopedAppearance(null);
        }
    }

    async function applyUserScopedAppearance(userId: string | null) {
        const runId = loadRunRef.current + 1;
        loadRunRef.current = runId;
        activeUserIdRef.current = userId;
        setIsThemeLoaded(false);

        try {
            await clearLegacyGlobalAppearance();

            if (!userId) {
                setThemeNameState(DEFAULT_THEME_NAME);
                setAppearanceState(DEFAULT_APPEARANCE_PREFERENCES);
                return;
            }

            const [storedTheme, storedAppearance] = await Promise.all([
                AsyncStorage.getItem(getThemeStorageKey(userId)),
                AsyncStorage.getItem(getAppearanceStorageKey(userId)),
            ]);

            if (runId !== loadRunRef.current || activeUserIdRef.current !== userId) return;

            setThemeNameState(isHomeOSThemeName(storedTheme) ? storedTheme : DEFAULT_THEME_NAME);
            setAppearanceState(parseStoredAppearance(storedAppearance));
        } finally {
            if (runId === loadRunRef.current) {
                setIsThemeLoaded(true);
            }
        }
    }

    async function setThemeName(nextThemeName: HomeOSThemeName) {
        setThemeNameState(nextThemeName);

        const userId = activeUserIdRef.current;

        if (userId) {
            await AsyncStorage.setItem(getThemeStorageKey(userId), nextThemeName);
        }
    }

    async function setAppearance(nextAppearance: AppearancePreferences) {
        const sanitizedAppearance = sanitizeAppearancePreferences(nextAppearance);
        setAppearanceState(sanitizedAppearance);

        const userId = activeUserIdRef.current;

        if (userId) {
            await AsyncStorage.setItem(
                getAppearanceStorageKey(userId),
                JSON.stringify(sanitizedAppearance)
            );
        }
    }

    async function setFontSize(fontSize: AppearanceSizeName) {
        await setAppearance({ ...appearance, fontSize });
    }

    async function setIconSize(iconSize: AppearanceSizeName) {
        await setAppearance({ ...appearance, iconSize });
    }

    async function resetAppearance() {
        setAppearanceState(DEFAULT_APPEARANCE_PREFERENCES);

        const userId = activeUserIdRef.current;

        if (userId) {
            await AsyncStorage.removeItem(getAppearanceStorageKey(userId));
        }
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
