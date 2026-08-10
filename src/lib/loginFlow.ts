export const SHARED_LOGIN_HEADING = 'Welcome back';
export const SHARED_LOGIN_SUPPORTING_TEXT = 'Sign in to continue to your workspace';
export const SHARED_LOGIN_ACTION = 'Sign in';
export const AUTH_SERVICE_ERROR_MESSAGE = 'Could not reach the sign-in service. Check your connection and try again.';
export const SESSION_START_ERROR_MESSAGE = 'Your account was verified, but a secure session could not be started. Please try again.';

export type LoginErrorCategory =
    | 'email-not-confirmed'
    | 'invalid-credentials'
    | 'rate-limited'
    | 'service-unavailable'
    | 'other';

export function classifyLoginError(error: unknown): LoginErrorCategory {
    const code = readErrorText(error, 'code').toLowerCase();
    const message = readErrorText(error, 'message').toLowerCase();
    const status = readErrorNumber(error, 'status') || readErrorNumber(error, 'statusCode');

    if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
        return 'email-not-confirmed';
    }

    if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
        return 'invalid-credentials';
    }

    if (
        status === 429 ||
        code.includes('rate_limit') ||
        code.includes('rate-limit') ||
        code.includes('too_many_requests') ||
        message.includes('rate limit') ||
        message.includes('too many requests')
    ) {
        return 'rate-limited';
    }

    if (isServiceUnavailableMessage(message)) {
        return 'service-unavailable';
    }

    return 'other';
}

export function safeLoginErrorMessage(category: LoginErrorCategory) {
    if (category === 'invalid-credentials') {
        return 'Incorrect email or password.';
    }

    if (category === 'rate-limited') {
        return 'Too many sign-in attempts. Wait a few minutes, then try again.';
    }

    if (category === 'service-unavailable') {
        return AUTH_SERVICE_ERROR_MESSAGE;
    }

    return 'Sign in failed. Please try again.';
}

export function isServiceUnavailableMessage(message?: string | null) {
    const normalizedMessage = String(message || '').toLowerCase();

    return (
        normalizedMessage.includes('failed to fetch') ||
        normalizedMessage.includes('network request failed') ||
        normalizedMessage.includes('fetch failed') ||
        normalizedMessage.includes('load failed') ||
        normalizedMessage.includes('networkerror')
    );
}

function readErrorText(error: unknown, key: string) {
    if (!error || typeof error !== 'object') return '';

    const value = (error as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
}

function readErrorNumber(error: unknown, key: string) {
    if (!error || typeof error !== 'object') return 0;

    const value = Number((error as Record<string, unknown>)[key]);
    return Number.isFinite(value) ? value : 0;
}
