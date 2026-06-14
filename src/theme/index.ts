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

type ThemeContextValue = {
    themeName: HomeOSThemeName;
    theme: HomeOSTheme;
    setThemeName: (themeName: HomeOSThemeName) => Promise<void>;
    isThemeLoaded: boolean;
};

export const ThemeContext = createContext<ThemeContextValue>({
    themeName: DEFAULT_THEME_NAME,
    theme: homeOSThemes[DEFAULT_THEME_NAME],
    setThemeName: async () => undefined,
    isThemeLoaded: false,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [themeName, setThemeNameState] =
        useState<HomeOSThemeName>(DEFAULT_THEME_NAME);
    const [isThemeLoaded, setIsThemeLoaded] = useState(false);

    useEffect(() => {
        loadStoredTheme();
    }, []);

    async function loadStoredTheme() {
        try {
            const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY);

            if (isHomeOSThemeName(storedTheme)) {
                setThemeNameState(storedTheme);
            }
        } finally {
            setIsThemeLoaded(true);
        }
    }

    async function setThemeName(nextThemeName: HomeOSThemeName) {
        setThemeNameState(nextThemeName);
        await AsyncStorage.setItem(THEME_STORAGE_KEY, nextThemeName);
    }

    const value = useMemo(
        () => ({
            themeName,
            theme: homeOSThemes[themeName],
            setThemeName,
            isThemeLoaded,
        }),
        [themeName, isThemeLoaded]
    );

    return createElement(ThemeContext.Provider, { value }, children);
}

export type { HomeOSTheme, HomeOSThemeName };
export { DEFAULT_THEME_NAME, homeOSThemes, themeOptions } from './themes';
