import {
    readHomeOSThemeFromUserMetadata,
    resolvePersistedHomeOSTheme,
} from './homeThemePersistence';

runHomeThemePersistenceRegressions();

export function runHomeThemePersistenceRegressions() {
    accountThemeSurvivesAChangedBrowserOrigin();
    localThemeMigratesWhenAccountPreferenceIsMissing();
    invalidAccountMetadataCannotSelectAnUnknownTheme();
}

function accountThemeSurvivesAChangedBrowserOrigin() {
    const accountTheme = readHomeOSThemeFromUserMetadata({ homeos_theme: 'forest' });
    const resolved = resolvePersistedHomeOSTheme({
        accountTheme,
        localTheme: null,
    });

    assert(resolved === 'forest', 'The signed-in account theme must survive a browser-origin change.');
}

function localThemeMigratesWhenAccountPreferenceIsMissing() {
    const resolved = resolvePersistedHomeOSTheme({
        accountTheme: null,
        localTheme: 'ocean',
    });

    assert(resolved === 'ocean', 'A valid local theme must remain selected during account migration.');
}

function invalidAccountMetadataCannotSelectAnUnknownTheme() {
    const accountTheme = readHomeOSThemeFromUserMetadata({
        homeos_theme: 'unsupported-theme',
    });
    const resolved = resolvePersistedHomeOSTheme({
        accountTheme,
        localTheme: 'pastel',
    });

    assert(accountTheme === null, 'Unknown account theme values must be rejected.');
    assert(resolved === 'pastel', 'A valid local theme must win when account metadata is invalid.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
