import AsyncStorage from '@react-native-async-storage/async-storage';

export const SESSION_SECURITY_KEYS = {
    autoLogoutMinutes: 'homeos:session-security:auto-logout-minutes',
    lastActivityAt: 'homeos:session-security:last-activity-at',
    staySignedIn: 'homeos:session-security:stay-signed-in',
} as const;

export type AutoLogoutMinutes = 15 | 30 | 60 | 240 | 1440;

export type SessionSecuritySettings = {
    staySignedIn: boolean;
    autoLogoutMinutes: AutoLogoutMinutes | null;
};

export const AUTO_LOGOUT_OPTIONS: Array<{
    label: string;
    minutes: AutoLogoutMinutes | null;
}> = [
    { label: 'Off', minutes: null },
    { label: '15 minutes', minutes: 15 },
    { label: '30 minutes', minutes: 30 },
    { label: '1 hour', minutes: 60 },
    { label: '4 hours', minutes: 240 },
    { label: '24 hours', minutes: 1440 },
];

export async function getSessionSecuritySettings(): Promise<SessionSecuritySettings> {
    const [storedStaySignedIn, storedAutoLogoutMinutes] = await Promise.all([
        AsyncStorage.getItem(SESSION_SECURITY_KEYS.staySignedIn),
        AsyncStorage.getItem(SESSION_SECURITY_KEYS.autoLogoutMinutes),
    ]);

    return {
        staySignedIn: storedStaySignedIn === null ? true : storedStaySignedIn === 'true',
        autoLogoutMinutes: parseAutoLogoutMinutes(storedAutoLogoutMinutes),
    };
}

export async function setStaySignedIn(value: boolean) {
    await AsyncStorage.setItem(SESSION_SECURITY_KEYS.staySignedIn, String(value));

    if (value) {
        await setAutoLogoutMinutes(null);
    }
}

export async function setAutoLogoutMinutes(minutes: AutoLogoutMinutes | null) {
    if (minutes === null) {
        await AsyncStorage.removeItem(SESSION_SECURITY_KEYS.autoLogoutMinutes);
        await AsyncStorage.setItem(SESSION_SECURITY_KEYS.staySignedIn, 'true');
        return;
    }

    await AsyncStorage.setItem(SESSION_SECURITY_KEYS.autoLogoutMinutes, String(minutes));
    await AsyncStorage.setItem(SESSION_SECURITY_KEYS.staySignedIn, 'false');
}

export async function recordSessionActivity(now = Date.now()) {
    await AsyncStorage.setItem(SESSION_SECURITY_KEYS.lastActivityAt, String(now));
}

export async function clearSessionActivity() {
    await AsyncStorage.removeItem(SESSION_SECURITY_KEYS.lastActivityAt);
}

export async function hasSessionTimedOut(now = Date.now()) {
    const settings = await getSessionSecuritySettings();

    if (settings.autoLogoutMinutes === null) {
        return false;
    }

    const storedLastActivityAt = await AsyncStorage.getItem(SESSION_SECURITY_KEYS.lastActivityAt);
    const lastActivityAt = Number(storedLastActivityAt);

    if (!storedLastActivityAt || !Number.isFinite(lastActivityAt)) {
        await recordSessionActivity(now);
        return false;
    }

    const timeoutMs = settings.autoLogoutMinutes * 60 * 1000;

    return now - lastActivityAt > timeoutMs;
}

function parseAutoLogoutMinutes(value: string | null): AutoLogoutMinutes | null {
    const minutes = Number(value);

    if (minutes === 15 || minutes === 30 || minutes === 60 || minutes === 240 || minutes === 1440) {
        return minutes;
    }

    return null;
}
