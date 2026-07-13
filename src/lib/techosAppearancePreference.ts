import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    DEFAULT_TECHOS_THEME_ID,
    isTechOSThemeId,
    techOSThemeStorageKey,
    type TechOSThemeId,
} from './techosAppearance';

export async function loadTechOSThemePreference(userId?: string | null): Promise<TechOSThemeId> {
    const cleanUserId = String(userId || '').trim();

    if (!cleanUserId) return DEFAULT_TECHOS_THEME_ID;

    const storedThemeId = await AsyncStorage.getItem(techOSThemeStorageKey(cleanUserId));

    return isTechOSThemeId(storedThemeId) ? storedThemeId : DEFAULT_TECHOS_THEME_ID;
}

export async function saveTechOSThemePreference(userId: string, themeId: TechOSThemeId) {
    const cleanUserId = userId.trim();

    if (!cleanUserId) return;

    await AsyncStorage.setItem(techOSThemeStorageKey(cleanUserId), themeId);
}
