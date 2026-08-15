export type AuthUserVerificationResult =
    | { status: 'authenticated'; userId: string }
    | { status: 'unauthenticated' }
    | { status: 'service-unavailable'; message: string };

type AuthUserLike = {
    id?: string | null;
} | null;

type AuthErrorLike = {
    code?: unknown;
    error_code?: unknown;
    message?: unknown;
    name?: unknown;
    status?: unknown;
    statusCode?: unknown;
} | null;

const UNAUTHENTICATED_AUTH_ERROR_CODES = [
    'auth_session_missing',
    'bad_jwt',
    'invalid_jwt',
    'jwt_expired',
    'refresh_token_already_used',
    'refresh_token_not_found',
    'session_not_found',
    'user_banned',
    'user_not_found',
];

const UNAUTHENTICATED_AUTH_ERROR_MESSAGES = [
    'auth session missing',
    'invalid jwt',
    'invalid token',
    'jwt expired',
    'refresh token',
    'session not found',
    'user not found',
];

export function resolveAuthUserVerification(
    user: AuthUserLike,
    error: AuthErrorLike
): AuthUserVerificationResult {
    const userId = String(user?.id || '').trim();

    if (userId && !error) {
        return { status: 'authenticated', userId };
    }

    if (!error) {
        return { status: 'unauthenticated' };
    }

    const code = String(error.code || error.error_code || '').trim().toLowerCase();
    const name = String(error.name || '').trim().toLowerCase();
    const message = String(error.message || '').trim();
    const normalizedMessage = message.toLowerCase();
    const status = Number(error.status ?? error.statusCode);

    if (
        name === 'authsessionmissingerror' ||
        status === 401 ||
        status === 403 ||
        UNAUTHENTICATED_AUTH_ERROR_CODES.some((candidate) => code.includes(candidate)) ||
        UNAUTHENTICATED_AUTH_ERROR_MESSAGES.some((candidate) => normalizedMessage.includes(candidate))
    ) {
        return { status: 'unauthenticated' };
    }

    return {
        status: 'service-unavailable',
        message,
    };
}
