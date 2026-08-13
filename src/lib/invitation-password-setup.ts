import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    shouldRequireInvitationPasswordSetup,
} from './invitation-password-setup-core';
import { supabase } from './supabase';

export * from './invitation-password-setup-core';

const INVITATION_PASSWORD_SETUP_KEY = 'homeos_invitation_password_setup_pending_v1';

export async function markInvitationPasswordSetupPending() {
    await AsyncStorage.setItem(INVITATION_PASSWORD_SETUP_KEY, JSON.stringify({
        pending: true,
        startedAt: new Date().toISOString(),
    }));
}

export async function clearInvitationPasswordSetupPending() {
    try {
        await AsyncStorage.removeItem(INVITATION_PASSWORD_SETUP_KEY);
    } catch {
        // This marker is only a UX guard. Storage failures must never trap a user in setup.
    }
}

export async function isInvitationPasswordSetupPending() {
    return (await readInvitationPasswordSetupPending()).pending;
}

async function readInvitationPasswordSetupPending(): Promise<{
    pending: boolean;
    startedAt: string | null;
}> {
    try {
        const stored = await AsyncStorage.getItem(INVITATION_PASSWORD_SETUP_KEY);
        if (stored === 'true') return { pending: true, startedAt: null };
        if (!stored) return { pending: false, startedAt: null };

        const parsed = JSON.parse(stored) as { pending?: unknown; startedAt?: unknown };
        return {
            pending: parsed.pending === true,
            startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
        };
    } catch {
        return { pending: false, startedAt: null };
    }
}

export async function requiresInvitationPasswordSetup(options: { assumePending?: boolean } = {}) {
    const pendingState = await readInvitationPasswordSetupPending();
    if (!pendingState.pending && !options.assumePending) return false;

    const [{ data: userData }, assuranceResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const required = shouldRequireInvitationPasswordSetup({
        pending: pendingState.pending || options.assumePending === true,
        pendingStartedAt: pendingState.startedAt || (options.assumePending ? new Date().toISOString() : null),
        userMetadata: userData.user?.user_metadata,
        authenticationMethods: assuranceResult.data?.currentAuthenticationMethods,
    });

    if (!required) await clearInvitationPasswordSetupPending();

    return required;
}
