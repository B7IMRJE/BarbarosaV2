import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    buildCompanyInviteAuthConfirmRedirect,
    getPendingCompanyInviteState,
    readInviteCodeFromNextPath,
    replacePendingCompanyInviteFromNextPath,
} from '../../lib/companyInviteState';
import { resolveLoggedInUserRoute } from '../../lib/onboarding';
import { supabase } from '../../lib/supabase';

const EMAIL_RATE_LIMIT_MESSAGE = 'Too many confirmation emails were requested. Please wait before trying again.';
const HOMEOS_SERVICE_ERROR_MESSAGE = 'Could not reach HomeOS services. Check connection and try again.';
const COMPANY_INVITE_ROUTE = '/company-invite';
const CUSTOMER_INVITE_ROUTE = '/customer-invite';

export default function LoginScreen() {
    const params = useLocalSearchParams<{
        next?: string | string[];
        mode?: string | string[];
        email?: string | string[];
    }>();
    const requestedNextRoute = resolveSafeNext(firstParam(params.next));
    const pendingInvite = getPendingCompanyInviteState();
    const pendingNextRoute = pendingInvite && readInviteCodeFromNextPath(pendingInvite.nextPath)
        ? pendingInvite.nextPath
        : null;
    const pendingCompanyNextRoute = pendingNextRoute?.startsWith(COMPANY_INVITE_ROUTE) ? pendingNextRoute : null;
    const workModeParam = firstParam(params.mode);
    const nextRoute = requestedNextRoute || (isExplicitWorkMode(workModeParam) ? pendingCompanyNextRoute : null);
    const workAccountMode = isWorkAccountFlow(workModeParam, nextRoute);
    const confirmNextRoute = readInviteCodeFromNextPath(nextRoute) ? nextRoute : null;
    const invitedEmail = normalizeEmail(firstParam(params.email));
    const [email, setEmail] = useState(invitedEmail);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [message, setMessage] = useState('');
    const [unconfirmedEmail, setUnconfirmedEmail] = useState('');

    useEffect(() => {
        if (!confirmNextRoute) return;

        if (invitedEmail) {
            setEmail(invitedEmail);
        }
        replacePendingCompanyInviteFromNextPath(confirmNextRoute, invitedEmail);
        setUnconfirmedEmail('');
    }, [confirmNextRoute, invitedEmail]);

    async function handleLogin() {
        if (!email.trim() || !password) {
            setMessage('Enter your email and password.');
            return;
        }

        setLoading(true);
        setMessage('Logging in...');

        const cleanEmail = email.trim().toLowerCase();

        if (workAccountMode && invitedEmail && cleanEmail !== invitedEmail) {
            setLoading(false);
            setMessage(`This invite is for ${invitedEmail}. Sign in with that email or ask for a new invite.`);
            return;
        }

        setUnconfirmedEmail('');

        let data: { user: { id: string } | null } = { user: null };
        let error: unknown = null;

        try {
            const result = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password,
            });
            data = { user: result.data.user ? { id: result.data.user.id } : null };
            error = result.error;
        } catch (authError) {
            setLoading(false);
            setMessage(normalizeServiceErrorMessage(getErrorMessage(authError)));
            return;
        }

        if (error) {
            setLoading(false);
            const errorCode = classifyAuthError(error);

            if (errorCode === 'email_not_confirmed') {
                setUnconfirmedEmail(cleanEmail);
                setMessage(unconfirmedEmailMessage(confirmNextRoute, workAccountMode));
                return;
            }

            if (errorCode === 'invalid_credentials') {
                setMessage('Incorrect email or password.');
                return;
            }

            setMessage('Login failed. Please try again.');
            return;
        }

        if (!data.user) {
            setLoading(false);
            setMessage('Login failed: no user returned.');
            return;
        }

        if (isInviteRoute(nextRoute)) {
            setLoading(false);
            router.replace(nextRoute as any);
            return;
        }

        const routeDecision = await resolveLoggedInUserRoute(data.user.id);

        setLoading(false);

        if (routeDecision.reason === 'service-unavailable') {
            setMessage(routeDecision.message || HOMEOS_SERVICE_ERROR_MESSAGE);
            return;
        }

        if (routeDecision.message) {
            setMessage(routeDecision.message);
            setTimeout(() => {
                router.replace((nextRoute || routeDecision.route) as any);
            }, 900);
            return;
        }

        router.replace((nextRoute || routeDecision.route) as any);
    }

    async function resendConfirmation() {
        if (!unconfirmedEmail || resending) return;

        setResending(true);
        setMessage('');

        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: unconfirmedEmail,
            options: {
                emailRedirectTo: buildConfirmRedirect(confirmNextRoute),
            },
        });

        setResending(false);

        if (error) {
            if (isEmailRateLimitError(error)) {
                setMessage(EMAIL_RATE_LIMIT_MESSAGE);
                return;
            }

            setMessage('We could not resend the confirmation email right now. Please try again in a few minutes.');
            return;
        }

        setMessage(confirmationResentMessage(confirmNextRoute, workAccountMode));
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 500, marginTop: 60 }}>
                <Text style={{ fontSize: 34, fontWeight: '900', color: '#071B33' }}>
                    {workAccountMode ? 'Work Account Login' : 'HomeOS Login'}
                </Text>

                <Text style={{ color: '#637083', marginTop: 8, marginBottom: 24 }}>
                    {workAccountMode ? 'Sign in with the invited email to accept your company invitation.' : 'Login to your HomeOS account.'}
                </Text>

                <TextInput
                    placeholder="Email"
                    value={email}
                    onChangeText={(value) => {
                        setEmail(value);
                        if (unconfirmedEmail) setUnconfirmedEmail('');
                    }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    style={inputStyle}
                />

                <TextInput
                    placeholder="Password"
                    value={password}
                    onChangeText={(value) => {
                        setPassword(value);
                        if (unconfirmedEmail) setUnconfirmedEmail('');
                    }}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                    style={inputStyle}
                />

                <TouchableOpacity
                    onPress={handleLogin}
                    disabled={loading || resending}
                    style={buttonStyle}
                >
                    <Text style={buttonTextStyle}>
                        {loading ? 'Logging in...' : 'Login'}
                    </Text>
                </TouchableOpacity>

                {!!message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                {!!unconfirmedEmail && (
                    <TouchableOpacity
                        onPress={resendConfirmation}
                        disabled={resending || loading}
                        style={secondaryButtonStyle}
                    >
                        <Text style={secondaryButtonTextStyle}>
                            {resending ? 'Sending...' : 'Resend Confirmation Email'}
                        </Text>
                    </TouchableOpacity>
                )}

                <Text
                    onPress={() =>
                        router.push({
                            pathname: '/auth/register',
                            params: buildAuthNavParams(nextRoute, workAccountMode, email),
                        } as any)
                    }
                    style={linkStyle}
                >
                    {workAccountMode ? 'Create Work Account' : 'Create Account'}
                </Text>

                <Text
                    onPress={() => router.push('/auth/forgot-password' as any)}
                    style={linkStyle}
                >
                    Forgot Password?
                </Text>
            </View>
        </ScrollView>
    );
}

function firstParam(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function resolveSafeNext(value: string | undefined) {
    if (!value) return null;

    try {
        const parsed = new URL(value, 'https://app.local');

        if (parsed.pathname === COMPANY_INVITE_ROUTE || parsed.pathname === CUSTOMER_INVITE_ROUTE) {
            return `${parsed.pathname}${parsed.search}`;
        }
    } catch {
        return null;
    }

    return null;
}

function isExplicitWorkMode(mode: string | undefined) {
    const normalizedMode = String(mode || '').trim().toLowerCase();

    return normalizedMode === 'work';
}

function isWorkAccountFlow(mode: string | undefined, nextRoute: string | null) {
    return isExplicitWorkMode(mode) || nextRoute?.startsWith(COMPANY_INVITE_ROUTE) === true;
}

function isInviteRoute(nextRoute: string | null) {
    return (
        nextRoute?.startsWith(COMPANY_INVITE_ROUTE) === true ||
        nextRoute?.startsWith(CUSTOMER_INVITE_ROUTE) === true
    );
}

function normalizeEmail(value: string | undefined) {
    return String(value || '').trim().toLowerCase();
}

function buildAuthNavParams(nextRoute: string | null, workAccountMode: boolean, email: string) {
    const navParams: Record<string, string> = {};
    const cleanEmail = normalizeEmail(email);

    if (nextRoute) navParams.next = nextRoute;
    if (workAccountMode) navParams.mode = 'work';
    if (cleanEmail) navParams.email = cleanEmail;

    return Object.keys(navParams).length ? navParams : undefined;
}

function buildConfirmRedirect(nextRoute: string | null) {
    return buildCompanyInviteAuthConfirmRedirect(nextRoute);
}

function unconfirmedEmailMessage(nextRoute: string | null, workAccountMode: boolean) {
    if (nextRoute?.startsWith(CUSTOMER_INVITE_ROUTE)) {
        return 'Confirm your email before logging in. Your company invitation will continue after confirmation.';
    }

    if (workAccountMode) {
        return 'Confirm your work account email before logging in. Your company invite will continue after confirmation.';
    }

    return 'Please confirm your email before logging in. Your original password has not been changed.';
}

function confirmationResentMessage(nextRoute: string | null, workAccountMode: boolean) {
    if (nextRoute?.startsWith(CUSTOMER_INVITE_ROUTE)) {
        return 'Confirmation email sent. After confirming your email, your company invitation will continue automatically.';
    }

    if (workAccountMode) {
        return 'Confirmation email sent. After confirming your ManagementOS work account, your company invite will continue automatically.';
    }

    return 'Confirmation email sent. Check your inbox, spam, or junk folder before logging in with your original password.';
}

function isEmailRateLimitError(error: unknown) {
    const status = Number(
        (error as { status?: unknown; statusCode?: unknown })?.status ??
        (error as { statusCode?: unknown })?.statusCode
    );
    const code = String(
        (error as { code?: unknown; error_code?: unknown })?.code ??
        (error as { error_code?: unknown })?.error_code ??
        ''
    ).toLowerCase();
    const message = String((error as { message?: unknown })?.message ?? '').toLowerCase();

    return (
        status === 429 ||
        (code.includes('email') && (code.includes('rate_limit') || code.includes('rate-limit'))) ||
        code.includes('email_rate_limit') ||
        code.includes('over_email_send_rate_limit') ||
        code.includes('over-email-send-rate-limit') ||
        message.includes('email rate limit exceeded') ||
        message.includes('rate limit')
    );
}

function classifyAuthError(error: unknown) {
    const code =
        typeof (error as { code?: unknown }).code === 'string'
            ? (error as { code: string }).code
            : '';
    const message =
        typeof (error as { message?: unknown }).message === 'string'
            ? (error as { message: string }).message.toLowerCase()
            : '';

    if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
        return 'email_not_confirmed';
    }

    if (code === 'invalid_credentials' || message.includes('invalid login credentials')) {
        return 'invalid_credentials';
    }

    return 'other';
}

function normalizeServiceErrorMessage(message?: string | null) {
    const cleanMessage = String(message || '').trim();

    if (!cleanMessage || isFetchFailureMessage(cleanMessage)) {
        return HOMEOS_SERVICE_ERROR_MESSAGE;
    }

    return cleanMessage;
}

function isFetchFailureMessage(message?: string | null) {
    const normalizedMessage = String(message || '').toLowerCase();

    return (
        normalizedMessage.includes('failed to fetch') ||
        normalizedMessage.includes('network request failed') ||
        normalizedMessage.includes('fetch failed') ||
        normalizedMessage.includes('load failed') ||
        normalizedMessage.includes('networkerror')
    );
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;

    return HOMEOS_SERVICE_ERROR_MESSAGE;
}

const inputStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const buttonStyle = {
    backgroundColor: '#071B33',
    padding: 18,
    borderRadius: 18,
    alignItems: 'center' as const,
    marginTop: 8,
};

const buttonTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
};

const secondaryButtonStyle = {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 18,
    alignItems: 'center' as const,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const secondaryButtonTextStyle = {
    color: '#071B33',
    fontSize: 16,
    fontWeight: '900' as const,
};

const linkStyle = {
    marginTop: 18,
    color: '#0B5FFF',
    fontWeight: '900' as const,
    textAlign: 'center' as const,
};

const messageBoxStyle = {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const messageTextStyle = {
    fontSize: 14,
    color: '#637083',
    lineHeight: 20,
};
