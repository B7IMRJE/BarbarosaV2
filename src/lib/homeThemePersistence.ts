import {
    DEFAULT_THEME_NAME,
    isHomeOSThemeName,
    type HomeOSThemeName,
} from '../theme/themes';

export const HOMEOS_THEME_USER_METADATA_KEY = 'homeos_theme';

export function readHomeOSThemeFromUserMetadata(
    metadata: unknown
): HomeOSThemeName | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return null;
    }

    const value = (metadata as Record<string, unknown>)[HOMEOS_THEME_USER_METADATA_KEY];
    const candidate = typeof value === 'string' ? value : null;

    return isHomeOSThemeName(candidate) ? candidate : null;
}

export function resolvePersistedHomeOSTheme({
    accountTheme,
    localTheme,
}: {
    accountTheme: unknown;
    localTheme: unknown;
}): HomeOSThemeName {
    const accountCandidate = typeof accountTheme === 'string' ? accountTheme : null;
    const localCandidate = typeof localTheme === 'string' ? localTheme : null;

    if (isHomeOSThemeName(accountCandidate)) return accountCandidate;
    if (isHomeOSThemeName(localCandidate)) return localCandidate;

    return DEFAULT_THEME_NAME;
}
