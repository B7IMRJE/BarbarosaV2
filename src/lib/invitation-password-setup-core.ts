export const INVITATION_PASSWORD_SETUP_COMPLETED_AT_KEY = 'invitation_password_setup_completed_at';

export function hasCompletedInvitationPasswordSetup(metadata: unknown) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;

    return Boolean(String(
        (metadata as Record<string, unknown>)[INVITATION_PASSWORD_SETUP_COMPLETED_AT_KEY] || ''
    ).trim());
}

export function passwordSetupCompletionCoversPendingSession(metadata: unknown, pendingStartedAt?: string | null) {
    if (!hasCompletedInvitationPasswordSetup(metadata)) return false;
    if (!pendingStartedAt) return true;

    const completedAt = String(
        (metadata as Record<string, unknown>)[INVITATION_PASSWORD_SETUP_COMPLETED_AT_KEY] || ''
    );
    const completedTime = Date.parse(completedAt);
    const pendingTime = Date.parse(pendingStartedAt);

    return Number.isFinite(completedTime)
        && Number.isFinite(pendingTime)
        && completedTime >= pendingTime;
}

export function authenticationMethodsIncludePassword(methods: unknown) {
    if (!Array.isArray(methods)) return false;

    return methods.some((method) => {
        if (typeof method === 'string') return method === 'password';
        if (!method || typeof method !== 'object' || Array.isArray(method)) return false;

        return (method as Record<string, unknown>).method === 'password';
    });
}

export function shouldRequireInvitationPasswordSetup(input: {
    pending: boolean;
    pendingStartedAt?: string | null;
    userMetadata?: unknown;
    authenticationMethods?: unknown;
}) {
    if (!input.pending) return false;
    if (passwordSetupCompletionCoversPendingSession(input.userMetadata, input.pendingStartedAt)) return false;
    if (authenticationMethodsIncludePassword(input.authenticationMethods)) return false;

    return true;
}
