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
import { resolveGlassHomeTheme } from './glassPalette';
import {
    HOMEOS_THEME_USER_METADATA_KEY,
    isHomeOSThemeSaveConfirmed,
    readHomeOSThemeFromUserMetadata,
    resolvePersistedHomeOSTheme,
} from '../lib/homeThemePersistence';

const LEGACY_THEME_STORAGE_KEY = 'homeos:selected-theme';
const LEGACY_APPEARANCE_STORAGE_KEY = 'homeos:appearance-preferences';
const THEME_STORAGE_KEY_PREFIX = 'homeos_theme_';
const APPEARANCE_STORAGE_KEY_PREFIX = 'homeos_appearance_';

export type AppearanceSizeName = 'small' | 'compact' | 'standard' | 'large' | 'extraLarge';
export type AppearanceStyleName = 'glass' | 'classic';

export type AppearancePreferences = {
    appearanceStyle: AppearanceStyleName;
    fontSize: AppearanceSizeName;
    iconSize: AppearanceSizeName;
    glassDepth: number;
    glassPrimary: string;
    glassSecondary: string;
    glassAccent: string;
    backgroundColor: string;
    backgroundIntensity: number;
    glassPanelColor: string;
    glassPanelOpacity: number;
};

export const DEFAULT_APPEARANCE_PREFERENCES: AppearancePreferences = {
    appearanceStyle: 'classic',
    fontSize: 'standard',
    iconSize: 'standard',
    glassDepth: 10,
    glassPrimary: '#075748',
    glassSecondary: '#043F69',
    glassAccent: '#2FA5B3',
    backgroundColor: '#03182A',
    backgroundIntensity: 100,
    glassPanelColor: '#1E4160',
    glassPanelOpacity: 78,
};

export const appearanceSizeOptions: {
    name: AppearanceSizeName;
    label: string;
    scale: number;
}[] = [
    { name: 'small', label: 'Small', scale: 0.8 },
    { name: 'compact', label: 'Compact', scale: 0.9 },
    { name: 'standard', label: 'Standard', scale: 1 },
    { name: 'large', label: 'Large', scale: 1.1 },
    { name: 'extraLarge', label: 'Extra Large', scale: 1.2 },
];

type ThemeContextValue = {
    themeName: HomeOSThemeName;
    theme: HomeOSTheme;
    setThemeName: (themeName: HomeOSThemeName) => Promise<void>;
    appearance: AppearancePreferences;
    setAppearance: (appearance: AppearancePreferences) => Promise<void>;
    setFontSize: (fontSize: AppearanceSizeName) => Promise<void>;
    setIconSize: (iconSize: AppearanceSizeName) => Promise<void>;
    setGlassDepth: (glassDepth: number) => Promise<void>;
    resetAppearance: () => Promise<void>;
    fontScale: number;
    iconScale: number;
    scaleFont: (size: number) => number;
    scaleIcon: (size: number) => number;
    isThemeLoaded: boolean;
};

function isAppearanceSizeName(value: unknown): value is AppearanceSizeName {
    return (
        value === 'small' ||
        value === 'compact' ||
        value === 'standard' ||
        value === 'large' ||
        value === 'extraLarge'
    );
}

function isAppearanceStyleName(value: unknown): value is AppearanceStyleName {
    return value === 'glass' || value === 'classic';
}

function sanitizeAppearancePreferences(value: unknown): AppearancePreferences {
    if (!value || typeof value !== 'object') {
        return DEFAULT_APPEARANCE_PREFERENCES;
    }

    const candidate = value as Partial<AppearancePreferences>;
    const safeColor = (color: unknown, fallback: string) =>
        /^#[0-9A-F]{6}$/i.test(String(color || '').trim())
            ? String(color).trim().toUpperCase()
            : fallback;

    return {
        appearanceStyle: isAppearanceStyleName(candidate.appearanceStyle)
            ? candidate.appearanceStyle
            : DEFAULT_APPEARANCE_PREFERENCES.appearanceStyle,
        fontSize: isAppearanceSizeName(candidate.fontSize)
            ? candidate.fontSize
            : DEFAULT_APPEARANCE_PREFERENCES.fontSize,
        iconSize: isAppearanceSizeName(candidate.iconSize)
            ? candidate.iconSize
            : DEFAULT_APPEARANCE_PREFERENCES.iconSize,
        glassDepth: Math.max(1, Math.min(100, Number(candidate.glassDepth) || DEFAULT_APPEARANCE_PREFERENCES.glassDepth)),
        glassPrimary: safeColor(candidate.glassPrimary, DEFAULT_APPEARANCE_PREFERENCES.glassPrimary),
        glassSecondary: safeColor(candidate.glassSecondary, DEFAULT_APPEARANCE_PREFERENCES.glassSecondary),
        glassAccent: safeColor(candidate.glassAccent, DEFAULT_APPEARANCE_PREFERENCES.glassAccent),
        backgroundColor: safeColor(candidate.backgroundColor, DEFAULT_APPEARANCE_PREFERENCES.backgroundColor),
        backgroundIntensity: Math.max(
            1,
            Math.min(
                100,
                Number(candidate.backgroundIntensity) ||
                    DEFAULT_APPEARANCE_PREFERENCES.backgroundIntensity
            )
        ),
        glassPanelColor: safeColor(candidate.glassPanelColor, DEFAULT_APPEARANCE_PREFERENCES.glassPanelColor),
        glassPanelOpacity: Math.max(
            1,
            Math.min(
                100,
                Number(candidate.glassPanelOpacity) ||
                    DEFAULT_APPEARANCE_PREFERENCES.glassPanelOpacity
            )
        ),
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
    setGlassDepth: async () => undefined,
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

            void applyUserScopedAppearance(session?.user || null);
        });

        return () => {
            mounted = false;
            listener.subscription.unsubscribe();
        };
    }, []);

    async function loadCurrentUserAppearance() {
        try {
            const { data } = await supabase.auth.getSession();
            await applyUserScopedAppearance(data.session?.user || null);
        } catch {
            await applyUserScopedAppearance(null);
        }
    }

    async function applyUserScopedAppearance(
        user: { id: string; user_metadata?: Record<string, unknown> | null } | null
    ) {
        const userId = user?.id || null;
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

            const accountTheme = readHomeOSThemeFromUserMetadata(user?.user_metadata);
            const resolvedTheme = resolvePersistedHomeOSTheme({
                accountTheme,
                localTheme: storedTheme,
            });
            const parsedAppearance = parseStoredAppearance(storedAppearance);

            setThemeNameState(resolvedTheme);
            setAppearanceState(parsedAppearance);

            if (!accountTheme && isHomeOSThemeName(storedTheme)) {
                void supabase.auth.updateUser({
                    data: {
                        [HOMEOS_THEME_USER_METADATA_KEY]: storedTheme,
                    },
                });
            }
        } finally {
            if (runId === loadRunRef.current) {
                setIsThemeLoaded(true);
            }
        }
    }

    async function setThemeName(nextThemeName: HomeOSThemeName) {
        const userId = activeUserIdRef.current;

        if (!userId) {
            throw new Error('Sign in again before saving your HomeOS theme.');
        }

        const previousThemeName = themeName;
        setThemeNameState(nextThemeName);

        try {
            await AsyncStorage.setItem(getThemeStorageKey(userId), nextThemeName);
            const accountResult = await supabase.auth.updateUser({
                data: {
                    [HOMEOS_THEME_USER_METADATA_KEY]: nextThemeName,
                },
            });

            if (accountResult.error) {
                throw new Error(
                    accountResult.error.message || 'HomeOS could not save your theme.'
                );
            }

            if (
                accountResult.data.user?.id !== userId ||
                !isHomeOSThemeSaveConfirmed(
                    accountResult.data.user?.user_metadata,
                    nextThemeName
                )
            ) {
                throw new Error('HomeOS could not confirm the saved theme. Please try again.');
            }
        } catch (error) {
            setThemeNameState(previousThemeName);
            await AsyncStorage.setItem(
                getThemeStorageKey(userId),
                previousThemeName
            ).catch(() => undefined);
            throw error;
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

    async function setGlassDepth(glassDepth: number) {
        await setAppearance({
            ...appearance,
            glassDepth: Math.max(1, Math.min(100, Math.round(glassDepth))),
        });
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
            theme:
                appearance.appearanceStyle === 'classic'
                    ? homeOSThemes[themeName]
                    : resolveGlassHomeTheme(homeOSThemes[themeName], {
                          primary: appearance.glassPrimary,
                          secondary: appearance.glassSecondary,
                          accent: appearance.glassAccent,
                          background: appearance.backgroundColor,
                          backgroundIntensity: appearance.backgroundIntensity,
                          panel: appearance.glassPanelColor,
                          panelOpacity: appearance.glassPanelOpacity,
                      }),
            setThemeName,
            appearance,
            setAppearance,
            setFontSize,
            setIconSize,
            setGlassDepth,
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
