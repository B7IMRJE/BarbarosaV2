import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
    Alert,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const EMAIL_RATE_LIMIT_MESSAGE = 'Too many confirmation emails were requested. Please wait before trying again.';
const HOMEOWNER_PROFILE_ROLE = 'HOMEOWNER';
const WORK_PROFILE_ROLE = 'WORK';
const COMPANY_INVITE_ROUTE = '/company-invite';
const CUSTOMER_INVITE_ROUTE = '/customer-invite';
const FIRST_HOME_ONBOARDING_ROUTE = '/onboarding/create-home';

export default function RegisterScreen() {
    const params = useLocalSearchParams<{
        next?: string | string[];
        mode?: string | string[];
        email?: string | string[];
    }>();
    const nextRoute = resolveSafeNext(firstParam(params.next));
    const workAccountMode = isWorkAccountFlow(firstParam(params.mode), nextRoute);
    const confirmNextRoute = nextRoute || (workAccountMode ? COMPANY_INVITE_ROUTE : null);
    const invitedEmail = normalizeEmail(firstParam(params.email));
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState(invitedEmail);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [confirmationEmail, setConfirmationEmail] = useState('');
    const [message, setMessage] = useState('');

    async function handleRegister() {
        const cleanName = fullName.trim();
        const cleanPhone = phone.trim();
        const cleanEmail = email.trim().toLowerCase();

        if (!cleanName || !cleanEmail || !password) {
            Alert.alert('Missing information', 'Please enter name, email, and password.');
            return;
        }

        if (password !== confirmPassword) {
            Alert.alert('Passwords do not match', 'Enter the same password in both password fields.');
            return;
        }

        if (workAccountMode && invitedEmail && cleanEmail !== invitedEmail) {
            setMessage(`This invite is for ${invitedEmail}. Sign in with that email or ask for a new invite.`);
            return;
        }

        setLoading(true);
        setMessage('');

        const profileRole = workAccountMode ? WORK_PROFILE_ROLE : HOMEOWNER_PROFILE_ROLE;

        const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
                emailRedirectTo: buildConfirmRedirect(confirmNextRoute),
                data: {
                    full_name: cleanName,
                    phone: cleanPhone,
                    role: profileRole,
                },
            },
        });

        if (error) {
            setLoading(false);
            if (isEmailRateLimitError(error)) {
                setMessage(EMAIL_RATE_LIMIT_MESSAGE);
                return;
            }

            if (workAccountMode && isExistingAccountError(error)) {
                setMessage('An account may already exist. Sign in or use Forgot Password.');
                return;
            }

            Alert.alert('Create account failed', 'We could not create your account right now. Please check your information and try again.');
            return;
        }

        if (workAccountMode && maybeExistingAccount(data.user)) {
            setLoading(false);
            setMessage('An account may already exist. Sign in or use Forgot Password.');
            return;
        }

        if (data.user) {
            await supabase.from('profiles').upsert(
                buildProfileUpsertPayload(data.user.id, cleanEmail, cleanName, cleanPhone, profileRole, workAccountMode)
            );
        }

        setLoading(false);

        if (data.session) {
            router.replace((nextRoute || (workAccountMode ? COMPANY_INVITE_ROUTE : FIRST_HOME_ONBOARDING_ROUTE)) as any);
            return;
        }

        if (data.user) {
            setConfirmationEmail(cleanEmail);
            setMessage(
                workAccountMode
                    ? 'Work account created. A confirmation email was sent. Confirm your email, then sign in to accept the company invitation.'
                    : 'Account created. A confirmation email was sent. Confirm your email before logging in with your original password. Check spam or junk if you do not see it.'
            );
            return;
        }

        setMessage('We could not confirm your account was created. Please try again.');
    }

    async function resendConfirmation() {
        if (!confirmationEmail || resending) return;

        setResending(true);
        setMessage('');

        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: confirmationEmail,
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

        setMessage('Confirmation email sent. Check your inbox, spam, or junk folder before logging in with your original password.');
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 500 }}>
                <Text style={titleStyle}>{workAccountMode ? 'Create Work Account' : 'Create Account'}</Text>

                {confirmationEmail ? (
                    <>
                        <View style={messageBoxStyle}>
                            <Text style={messageTextStyle}>{message}</Text>
                        </View>

                        <TouchableOpacity
                            onPress={() =>
                                router.replace({
                                    pathname: '/auth/login',
                                    params: buildAuthNavParams(nextRoute, workAccountMode, confirmationEmail || email),
                                } as any)
                            }
                            disabled={resending}
                            style={buttonStyle}
                        >
                            <Text style={buttonTextStyle}>Go to Login</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={resendConfirmation}
                            disabled={resending}
                            style={secondaryButtonStyle}
                        >
                            <Text style={secondaryButtonTextStyle}>
                                {resending ? 'Sending...' : 'Resend Confirmation Email'}
                            </Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <Text style={subtitleStyle}>
                            {workAccountMode
                                ? 'Create your work login. Your company access is added after you accept the invitation.'
                                : 'Create your HomeOS account.'}
                        </Text>

                        <TextInput
                            placeholder="Full Name"
                            value={fullName}
                            onChangeText={setFullName}
                            autoCapitalize="words"
                            autoCorrect={false}
                            autoComplete="off"
                            textContentType="none"
                            importantForAutofill="no"
                            style={inputStyle}
                        />

                        <TextInput
                            placeholder="Phone"
                            value={phone}
                            onChangeText={setPhone}
                            keyboardType="phone-pad"
                            autoCorrect={false}
                            autoComplete="off"
                            textContentType="none"
                            importantForAutofill="no"
                            style={inputStyle}
                        />

                        <TextInput
                            placeholder="Email"
                            value={email}
                            onChangeText={setEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            autoCorrect={false}
                            autoComplete="off"
                            textContentType="none"
                            importantForAutofill="no"
                            style={inputStyle}
                        />

                        <TextInput
                            placeholder="Password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="new-password"
                            textContentType="newPassword"
                            importantForAutofill="no"
                            style={inputStyle}
                        />

                        <TextInput
                            placeholder="Confirm Password"
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            secureTextEntry
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="off"
                            textContentType="none"
                            importantForAutofill="no"
                            style={inputStyle}
                        />

                        {!!message && (
                            <View style={messageBoxStyle}>
                                <Text style={messageTextStyle}>{message}</Text>
                            </View>
                        )}

                        <TouchableOpacity
                            onPress={handleRegister}
                            disabled={loading}
                            style={buttonStyle}
                        >
                            <Text style={buttonTextStyle}>
                                {loading ? 'Creating...' : workAccountMode ? 'Create Work Account' : 'Create Account'}
                            </Text>
                        </TouchableOpacity>
                    </>
                )}

                <Text
                    onPress={() =>
                        router.push({
                            pathname: '/auth/login',
                            params: buildAuthNavParams(nextRoute, workAccountMode, email),
                        } as any)
                    }
                    style={linkStyle}
                >
                    {workAccountMode ? 'Already have a work account? Login' : 'Already have an account? Login'}
                </Text>

                {workAccountMode && (
                    <Text
                        onPress={() => router.push('/auth/forgot-password' as any)}
                        style={linkStyle}
                    >
                        Forgot Password?
                    </Text>
                )}
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

function isWorkAccountFlow(mode: string | undefined, nextRoute: string | null) {
    const normalizedMode = String(mode || '').trim().toLowerCase();

    return normalizedMode === 'work' || nextRoute?.startsWith(COMPANY_INVITE_ROUTE) === true;
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

type ProfileUpsertPayload = {
    id: string;
    email: string;
    full_name?: string;
    phone?: string;
    role: string;
};

function buildProfileUpsertPayload(
    userId: string,
    email: string,
    fullName: string,
    phone: string,
    role: string,
    workAccountMode: boolean
): ProfileUpsertPayload {
    const profilePayload: ProfileUpsertPayload = {
        id: userId,
        email,
        role,
    };
    const cleanFullName = fullName.trim();
    const cleanPhone = phone.trim();

    if (cleanFullName) profilePayload.full_name = cleanFullName;
    if (!workAccountMode && cleanPhone) profilePayload.phone = cleanPhone;

    return profilePayload;
}

function buildConfirmRedirect(nextRoute: string | null) {
    const origin = getAppOrigin();
    if (!origin) return undefined;

    const nextQuery = nextRoute ? `?next=${encodeURIComponent(nextRoute)}` : '';

    return `${origin}/auth/confirm${nextQuery}`;
}

function getAppOrigin() {
    const globalWithLocation = globalThis as unknown as {
        location?: { origin?: string };
        window?: { location?: { origin?: string } };
    };
    const origin = globalWithLocation.window?.location?.origin || globalWithLocation.location?.origin || null;

    return typeof origin === 'string' && origin.trim() ? origin : null;
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

function isExistingAccountError(error: unknown) {
    const code = String(
        (error as { code?: unknown; error_code?: unknown })?.code ??
        (error as { error_code?: unknown })?.error_code ??
        ''
    ).toLowerCase();
    const message = String((error as { message?: unknown })?.message ?? '').toLowerCase();

    return (
        code.includes('user_already_exists') ||
        code.includes('email_exists') ||
        message.includes('already registered') ||
        message.includes('already exists') ||
        message.includes('user already')
    );
}

function maybeExistingAccount(user: unknown) {
    if (!user || typeof user !== 'object') return false;

    const identities = (user as { identities?: unknown }).identities;

    return Array.isArray(identities) && identities.length === 0;
}

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
    color: '#071B33',
    marginTop: 40,
};

const subtitleStyle = {
    color: '#637083',
    marginTop: 8,
    marginBottom: 24,
};

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
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const secondaryButtonTextStyle = {
    color: '#071B33',
    fontSize: 16,
    fontWeight: '900' as const,
};

const linkStyle = {
    marginTop: 20,
    color: '#0B5FFF',
    fontWeight: '900' as const,
    textAlign: 'center' as const,
};

const messageBoxStyle = {
    marginTop: 20,
    marginBottom: 14,
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
