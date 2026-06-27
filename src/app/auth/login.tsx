import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { resolveLoggedInUserRoute } from '../../lib/onboarding';
import { supabase } from '../../lib/supabase';

const EMAIL_RATE_LIMIT_MESSAGE = 'Too many confirmation emails were requested. Please wait before trying again.';

export default function LoginScreen() {
    const params = useLocalSearchParams<{ next?: string | string[] }>();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [message, setMessage] = useState('');
    const [unconfirmedEmail, setUnconfirmedEmail] = useState('');

    async function handleLogin() {
        if (!email.trim() || !password) {
            setMessage('Enter your email and password.');
            return;
        }

        setLoading(true);
        setMessage('Logging in...');

        const cleanEmail = email.trim().toLowerCase();
        setUnconfirmedEmail('');

        const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
        });

        if (error) {
            setLoading(false);
            const errorCode = classifyAuthError(error);

            if (errorCode === 'email_not_confirmed') {
                setUnconfirmedEmail(cleanEmail);
                setMessage('Please confirm your email before logging in. Your original password has not been changed.');
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

        const routeDecision = await resolveLoggedInUserRoute(data.user.id);
        const nextRoute = resolveSafeNext(firstParam(params.next));

        setLoading(false);

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
            <View style={{ width: '100%', maxWidth: 500, marginTop: 60 }}>
                <Text style={{ fontSize: 34, fontWeight: '900', color: '#071B33' }}>
                    HomeOS Login
                </Text>

                <Text style={{ color: '#637083', marginTop: 8, marginBottom: 24 }}>
                    Login to your HomeOS account.
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
                            params: resolveSafeNext(firstParam(params.next)) ? { next: firstParam(params.next) as string } : undefined,
                        } as any)
                    }
                    style={linkStyle}
                >
                    Create Account
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

        if (parsed.pathname === '/company-invite') {
            return `${parsed.pathname}${parsed.search}`;
        }
    } catch {
        return null;
    }

    return null;
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
