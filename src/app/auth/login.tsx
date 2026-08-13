import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import PasswordField from '../../components/auth/password-field';
import {
    buildCompanyInviteAuthConfirmRedirect,
    clearPendingCompanyInviteState,
    getPendingCompanyInviteState,
    readInviteCodeFromNextPath,
    replacePendingCompanyInviteFromNextPath,
} from '../../lib/companyInviteState';
import { isCustomerInvitePending } from '../../lib/customerInviteStatus';
import { resolveLoggedInUserRoute, WORKSPACE_ACCESS_ERROR_MESSAGE } from '../../lib/onboarding';
import {
    clearInvitationPasswordSetupPending,
    markInvitationPasswordSetupPending,
} from '../../lib/invitation-password-setup';
import {
    classifyLoginError,
    safeLoginErrorMessage,
    SESSION_START_ERROR_MESSAGE,
    SHARED_LOGIN_ACTION,
    SHARED_LOGIN_HEADING,
    SHARED_LOGIN_SUPPORTING_TEXT,
} from '../../lib/loginFlow';
import { safeInvitationLoginErrorMessage } from '../../lib/invitationLogin';
import { supabase } from '../../lib/supabase';
import ThemedButton from '../../components/theme/ThemedButton';

const EMAIL_RATE_LIMIT_MESSAGE = 'Too many confirmation emails were requested. Please wait before trying again.';
const COMPANY_INVITE_ROUTE = '/company-invite';
const CUSTOMER_INVITE_ROUTE = '/customer-invite';

export default function LoginScreen() {
    const params = useLocalSearchParams<{
        next?: string | string[];
        mode?: string | string[];
        email?: string | string[];
        invitationCode?: string | string[];
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
    const [invitationCode, setInvitationCode] = useState(
        String(firstParam(params.invitationCode) || '').replace(/\D/g, '').slice(0, 6)
    );
    const [loading, setLoading] = useState(false);
    const [invitationLoading, setInvitationLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [message, setMessage] = useState('');
    const [unconfirmedEmail, setUnconfirmedEmail] = useState('');
    const [signInFocused, setSignInFocused] = useState(false);
    const invitationRequestInFlight = useRef(false);

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

        let data: { user: { id: string } | null; hasSession: boolean } = { user: null, hasSession: false };
        let error: unknown = null;

        try {
            const result = await supabase.auth.signInWithPassword({
                email: cleanEmail,
                password,
            });
            data = {
                user: result.data.user ? { id: result.data.user.id } : null,
                hasSession: Boolean(result.data.session),
            };
            error = result.error;
        } catch (authError) {
            setLoading(false);
            setMessage(safeLoginErrorMessage(classifyLoginError(authError)));
            return;
        }

        if (error) {
            setLoading(false);
            const errorCode = classifyLoginError(error);

            if (errorCode === 'email-not-confirmed') {
                setUnconfirmedEmail(cleanEmail);
                setMessage(unconfirmedEmailMessage(confirmNextRoute, workAccountMode));
                return;
            }

            setMessage(safeLoginErrorMessage(errorCode));
            return;
        }

        if (!data.user) {
            setLoading(false);
            setMessage('Login failed: no user returned.');
            return;
        }

        if (!data.hasSession) {
            setLoading(false);
            setMessage(SESSION_START_ERROR_MESSAGE);
            return;
        }

        try {
            // A successful password sign-in proves first-time password setup is complete.
            // Clear any legacy device marker left behind by an invitation-code session.
            await clearInvitationPasswordSetupPending();
        } catch {
            // Authentication succeeded; optional device storage must not block routing.
        }

        const verifiedNextRoute = await resolvePostLoginNextRoute(nextRoute);

        if (isInviteRoute(verifiedNextRoute)) {
            setLoading(false);
            router.replace(verifiedNextRoute as any);
            return;
        }

        const routeDecision = await resolveLoggedInUserRoute(data.user.id);

        setLoading(false);

        if (routeDecision.reason === 'service-unavailable') {
            setMessage(routeDecision.message || WORKSPACE_ACCESS_ERROR_MESSAGE);
            return;
        }

        if (routeDecision.message) {
            setMessage(routeDecision.message);
            setTimeout(() => {
                router.replace((verifiedNextRoute || routeDecision.route) as any);
            }, 900);
            return;
        }

        router.replace((verifiedNextRoute || routeDecision.route) as any);
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

    async function handleInvitationCodeLogin() {
        if (invitationRequestInFlight.current) return;

        const code = invitationCode.replace(/\D/g, '');

        if (code.length !== 6) {
            setMessage('Enter the six-digit invitation login code.');
            return;
        }

        invitationRequestInFlight.current = true;
        setInvitationLoading(true);
        setMessage('Checking invitation code...');

        try {
            const { data, error } = await supabase.functions.invoke(
                'exchange-invitation-login-code',
                { body: { code } }
            );
            const result = data as {
                ok?: boolean;
                code?: string;
                access_token?: string;
                refresh_token?: string;
                next?: string;
                message?: string;
            } | null;

            if (
                error ||
                !result?.ok ||
                !result.access_token ||
                !result.refresh_token
            ) {
                const responseError = await readInvitationLoginError(error);
                setMessage(safeInvitationLoginErrorMessage(
                    result?.code || responseError.code,
                    result?.message || responseError.message
                ));
                return;
            }

            const { error: sessionError } = await supabase.auth.setSession({
                access_token: result.access_token,
                refresh_token: result.refresh_token,
            });

            if (sessionError) {
                setMessage('The invitation was verified, but your secure session could not be started. Try again.');
                return;
            }

            const nextRoute = result.next || '/';
            setMessage('Invitation verified. Create your password to protect this account.');

            try {
                await markInvitationPasswordSetupPending();
            } catch {
                // The authenticated password-setup route remains safe even when optional local storage is unavailable.
            }

            router.replace({
                pathname: '/profile/change-password',
                params: { first: '1', next: nextRoute },
            } as any);
        } catch {
            setMessage(safeInvitationLoginErrorMessage());
        } finally {
            invitationRequestInFlight.current = false;
            setInvitationLoading(false);
        }
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 500, marginTop: 60 }}>
                <Text style={{ fontSize: 34, fontWeight: '900', color: '#071B33' }}>
                    {SHARED_LOGIN_HEADING}
                </Text>

                <Text style={{ color: '#637083', marginTop: 8, marginBottom: 24 }}>
                    {SHARED_LOGIN_SUPPORTING_TEXT}
                </Text>

                <TextInput
                    accessibilityLabel="Email address"
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

                <PasswordField
                    placeholder="Password"
                    value={password}
                    onChangeText={(value) => {
                        setPassword(value);
                        if (unconfirmedEmail) setUnconfirmedEmail('');
                    }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    textContentType="password"
                    style={inputStyle}
                />

                <Pressable
                    accessibilityLabel={SHARED_LOGIN_ACTION}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: loading || resending || invitationLoading }}
                    onPress={handleLogin}
                    disabled={loading || resending || invitationLoading}
                    onFocus={() => setSignInFocused(true)}
                    onBlur={() => setSignInFocused(false)}
                    style={({ pressed }) => [
                        signInButtonStyle,
                        signInFocused && signInButtonFocusedStyle,
                        pressed && !loading && { transform: [{ translateY: 1 }], opacity: 0.92 },
                        (loading || resending || invitationLoading) && { opacity: 0.5 },
                    ]}
                >
                    <Text style={signInButtonTextStyle}>
                        {loading ? 'Signing in...' : SHARED_LOGIN_ACTION}
                    </Text>
                </Pressable>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 22 }}>
                    <View style={{ height: 1, backgroundColor: '#CBD5E1', flex: 1 }} />
                    <Text style={{ color: '#637083', fontWeight: '800' }}>or use your invitation</Text>
                    <View style={{ height: 1, backgroundColor: '#CBD5E1', flex: 1 }} />
                </View>

                <TextInput
                    accessibilityLabel="Six-digit invitation code"
                    placeholder="Six-digit invitation code"
                    value={invitationCode}
                    onChangeText={(value) => setInvitationCode(value.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    autoCorrect={false}
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    style={[inputStyle, { textAlign: 'center', letterSpacing: 8, fontSize: 22, fontWeight: '900' }]}
                />

                <ThemedButton
                    title={invitationLoading ? 'Opening Invitation...' : 'Login with Invitation Code'}
                    variant="secondary"
                    onPress={handleInvitationCodeLogin}
                    disabled={loading || resending || invitationLoading}
                    style={buttonStyle}
                />

                {!!message && (
                    <View
                        accessibilityLiveRegion="polite"
                        aria-live="polite"
                        style={messageBoxStyle}
                    >
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                {!!unconfirmedEmail && (
                    <ThemedButton
                        title={resending ? 'Sending...' : 'Resend Confirmation Email'}
                        variant="secondary"
                        onPress={resendConfirmation}
                        disabled={resending || loading}
                        style={secondaryButtonStyle}
                    />
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

async function readInvitationLoginError(error: unknown) {
    if (!error || typeof error !== 'object' || !('context' in error)) {
        return { code: '', message: '' };
    }

    const context = (error as { context?: unknown }).context;
    if (
        !context ||
        typeof context !== 'object' ||
        !('clone' in context) ||
        typeof (context as Response).clone !== 'function'
    ) {
        return { code: '', message: '' };
    }

    const response = (context as Response).clone();
    const payload = await response.json().catch(() => null) as { code?: string; message?: string } | null;
    return {
        code: String(payload?.code || '').trim(),
        message: String(payload?.message || '').trim(),
    };
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

async function resolvePostLoginNextRoute(nextRoute: string | null) {
    if (!nextRoute?.startsWith(CUSTOMER_INVITE_ROUTE)) return nextRoute;

    const inviteCode = readInviteCodeFromNextPath(nextRoute);
    if (!inviteCode) {
        clearPendingCompanyInviteState();
        return null;
    }

    const { data, error } = await supabase.rpc('get_customer_invite_by_code', {
        p_invite_code: inviteCode,
    });

    if (error) {
        return nextRoute;
    }

    const invite = firstRow<{ status?: string | null; expires_at?: string | null }>(data);

    if (isCustomerInvitePending(invite)) {
        return nextRoute;
    }

    clearPendingCompanyInviteState({ inviteCode });
    return null;
}

function firstRow<T>(data: unknown): T | null {
    if (Array.isArray(data)) return (data[0] as T | undefined) || null;
    return (data as T | null) || null;
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

const inputStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    fontSize: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const buttonStyle = {
    marginTop: 8,
};

const signInButtonStyle = {
    alignItems: 'center' as const,
    backgroundColor: '#0B5FFF',
    borderColor: '#0B5FFF',
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: 'center' as const,
    marginTop: 8,
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 13,
};

const signInButtonFocusedStyle = {
    borderColor: '#071B33',
    boxShadow: '0 0 0 3px rgba(11, 95, 255, 0.28)',
};

const signInButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
    letterSpacing: 0.15,
    textAlign: 'center' as const,
};

const secondaryButtonStyle = {
    marginTop: 14,
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
