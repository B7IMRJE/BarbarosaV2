import AsyncStorage from '@react-native-async-storage/async-storage';

const INVITATION_PASSWORD_SETUP_KEY = 'homeos_invitation_password_setup_pending_v1';

export async function markInvitationPasswordSetupPending() {
    await AsyncStorage.setItem(INVITATION_PASSWORD_SETUP_KEY, 'true');
}

export async function clearInvitationPasswordSetupPending() {
    await AsyncStorage.removeItem(INVITATION_PASSWORD_SETUP_KEY);
}

export async function isInvitationPasswordSetupPending() {
    return (await AsyncStorage.getItem(INVITATION_PASSWORD_SETUP_KEY)) === 'true';
}
