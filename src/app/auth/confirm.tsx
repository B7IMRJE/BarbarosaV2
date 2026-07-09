import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import {
    buildCompanyInviteAuthConfirmRedirect,
    getPendingCompanyInviteState,
    readInviteCodeFromNextPath,
    replacePendingCompanyInviteFromNextPath,
} from '../../lib/companyInviteState';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type EmailOtpType = 'signup' | 'invite' | 'magiclink' | 'email';

const COMPANY_INVITE_ROUTE = '/company-invite';
const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
    'signup',
    'invite',
    'magiclink',
    'email',
]);

export default function AuthConfirmScreen() {
    const { theme } = useTheme();
    const params = useLocalSearchParams<{
        code?: string | string[];
        token_hash?: string | string[];
        tokenHash?: string | string[];
        type?: string | string[];
        next?: string | string[];
        error?: string | string[];
        error_code?: string | string[];
        error_description?: string | string[];
    }>();
    const pendingInvite = getPendingCompanyInviteState();
    const urlNextRoute = resolveSafeNext(firstParam(params.next));
    const pendingNextRoute = pendingInvite && readInviteCodeFromNextPath(pendingInvite.nextPath)
        ? pendingInvite.nextPath
        : null;
    const nextRoute = urlNextRoute || pendingNextRoute;
    const pendingInviteEmail = pendingInvite?.nextPath === nextRoute ? pendingInvite.invitedEmail : null;
    const isCompanyInviteConfirmation = !!nextRoute;
    const [message, setMessage] = useState(
        isCompanyInviteConfirmation ? 'Confirming your work account email...' : 'Confirming sign-in...'
    );
    const [failed, setFailed] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [confirmationEmail, setConfirmationEmail] = useState(pendingInviteEmail || '');
    const [resending, setResending] = useState(false);
    const [showInviteCodeEntry, setShowInviteCodeEntry] = useState(!nextRoute);
    const shouldShowInviteCodeEntry = !nextRoute || showInviteCodeEntry;

    useEffect(() => {
        confirmEmailLink();
    }, []);

    async function confirmEmailLink() {
        if (isExpiredConfirmationLink(params)) {
            if (nextRoute) {
                replacePendingCompanyInviteFromNextPath(nextRoute, pendingInviteEmail);
            }

            setFailed(true);
            setMessage('Your email confirmation link expired. Request a new confirmation email to continue accepting your company invite.');
            return;
        }

        const tokenHash = firstParam(params.token_hash) || firstParam(params.tokenHash);
        const confirmationCode = firstParam(params.code)?.trim();
        const type = normalizeOtpType(firstParam(params.type));

        if (confirmationCode) {
            const { error } = await supabase.auth.exchangeCodeForSession(confirmationCode);

            if (error) {
                setFailed(true);
                setMessage(isExpiredOtpError(error)
                    ? 'Your email confirmation link expired. Request a new confirmation email to continue accepting your company invite.'
                    : `Email confirmation failed: ${readErrorMessage(error)}`);
                return;
            }

            if (!nextRoute) {
                setFailed(true);
                setMessage('Email confirmed, but this link does not include a usable company invite code. Enter your current invite code or sign in again.');
                return;
            }

            replacePendingCompanyInviteFromNextPath(nextRoute, pendingInviteEmail);
            setMessage('Opening company invitation...');
            router.replace(nextRoute as any);
            return;
        }

        if (!tokenHash) {
            setFailed(true);
            setMessage('This sign-in link is missing required information.');
            return;
        }

        const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
        });

        if (error) {
            setFailed(true);
            setMessage(isExpiredOtpError(error)
                ? 'Your email confirmation link expired. Request a new confirmation email to continue accepting your company invite.'
                : 'This sign-in link is invalid or expired. Request a new invitation email.');
            return;
        }

        if (!nextRoute) {
            setFailed(true);
            setMessage('Email confirmed, but this link does not include a usable company invite code. Enter your current invite code or sign in again.');
            return;
        }

        replacePendingCompanyInviteFromNextPath(nextRoute, pendingInviteEmail);
        setMessage('Opening company invitation...');
        router.replace(nextRoute as any);
    }

    async function resendConfirmationEmail() {
        const email = confirmationEmail.trim().toLowerCase();

        if (!email) {
            setMessage('Enter the invited email address first.');
            return;
        }

        setResending(true);
        setMessage('Sending confirmation email...');

        const { error } = await supabase.auth.resend({
            type: 'signup',
            email,
            options: {
                emailRedirectTo: buildConfirmRedirect(nextRoute),
            },
        });

        setResending(false);

        if (error) {
            setMessage(`Resend confirmation failed: ${readErrorMessage(error)}`);
            return;
        }

        setMessage(
            nextRoute
                ? 'Confirmation email sent. After confirming your work account email, your company invite will continue automatically.'
                : 'Confirmation email sent. Check your inbox, spam, or junk folder.'
        );
    }

    async function signOut() {
        await supabase.auth.signOut();
        setMessage('Signed out. Enter your invite code or sign in with the invited email.');
    }

    function openInviteCode() {
        const code = inviteCode.trim();

        if (!code) {
            setMessage('Enter invite code.');
            return;
        }

        router.replace(`${COMPANY_INVITE_ROUTE}?code=${encodeURIComponent(code)}` as any);
    }

    function backToLogin() {
        router.replace({
            pathname: '/auth/login',
            params: buildLoginParams(nextRoute),
        } as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 520, marginTop: 70 }}>
                <ThemedCard>
                    {!failed && (
                        <ActivityIndicator
                            size="large"
                            color={theme.colors.primary}
                            style={{ marginBottom: 18 }}
                        />
                    )}

                    <Text style={[titleStyle, { color: theme.colors.text }]}>
                        {isCompanyInviteConfirmation ? 'Confirm your work account email' : 'Confirm your email'}
                    </Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>

                    {failed && (
                        <View style={{ marginTop: 18 }}>
                            <TextInput
                                placeholder="Invited email for resend"
                                value={confirmationEmail}
                                onChangeText={setConfirmationEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                                autoCorrect={false}
                                style={[
                                    inputStyle,
                                    {
                                        backgroundColor: theme.colors.surface,
                                        borderColor: theme.colors.border,
                                        color: theme.colors.text,
                                    },
                                ]}
                            />
                            <ThemedButton
                                title={resending ? 'Sending...' : 'Resend Confirmation Email'}
                                onPress={resendConfirmationEmail}
                                disabled={resending}
                            />
                            {shouldShowInviteCodeEntry ? (
                                <>
                                    <TextInput
                                        placeholder="Invite code"
                                        value={inviteCode}
                                        onChangeText={setInviteCode}
                                        autoCapitalize="characters"
                                        autoCorrect={false}
                                        style={[
                                            inputStyle,
                                            {
                                                backgroundColor: theme.colors.surface,
                                                borderColor: theme.colors.border,
                                                color: theme.colors.text,
                                            },
                                        ]}
                                    />
                                    <ThemedButton
                                        title="Enter Invite Code"
                                        onPress={openInviteCode}
                                        style={{ marginTop: 12 }}
                                    />
                                </>
                            ) : (
                                <ThemedButton
                                    title="Enter Another Invite Code"
                                    variant="ghost"
                                    onPress={() => setShowInviteCodeEntry(true)}
                                    style={{ marginTop: 12 }}
                                />
                            )}
                            <ThemedButton
                                title="Back to Login"
                                variant="secondary"
                                onPress={backToLogin}
                                style={{ marginTop: 12 }}
                            />
                            <ThemedButton
                                title="Sign Out"
                                variant="ghost"
                                onPress={signOut}
                                style={{ marginTop: 12 }}
                            />
                        </View>
                    )}
                </ThemedCard>
            </View>
        </ScrollView>
    );
}

function firstParam(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function normalizeOtpType(value: string | undefined): EmailOtpType {
    const normalized = String(value || 'email').trim().toLowerCase() as EmailOtpType;

    return ALLOWED_OTP_TYPES.has(normalized) ? normalized : 'email';
}

function isExpiredConfirmationLink(params: {
    error?: string | string[];
    error_code?: string | string[];
    error_description?: string | string[];
}) {
    const error = String(firstParam(params.error) || '').trim().toLowerCase();
    const errorCode = String(firstParam(params.error_code) || '').trim().toLowerCase();
    const description = String(firstParam(params.error_description) || '').trim().toLowerCase();

    return (
        errorCode === 'otp_expired' ||
        description.includes('email link is invalid or has expired') ||
        (error === 'access_denied' && description.includes('expired')) ||
        (description.includes('invalid') && description.includes('expired'))
    );
}

function isExpiredOtpError(error: unknown) {
    const code = String(
        (error as { code?: unknown; error_code?: unknown })?.code ??
        (error as { error_code?: unknown })?.error_code ??
        ''
    ).toLowerCase();
    const message = readErrorMessage(error).toLowerCase();

    return code === 'otp_expired' || message.includes('expired') || message.includes('already used');
}

function resolveSafeNext(value: string | undefined) {
    if (!value) return null;

    try {
        const parsed = new URL(value, 'https://app.local');

        if (parsed.pathname === COMPANY_INVITE_ROUTE && parsed.searchParams.get('code')?.trim()) {
            return `${COMPANY_INVITE_ROUTE}${parsed.search}`;
        }

    } catch {
        return null;
    }

    return null;
}

function buildConfirmRedirect(nextRoute: string | null) {
    return buildCompanyInviteAuthConfirmRedirect(nextRoute);
}

function buildLoginParams(nextRoute: string | null) {
    if (!nextRoute) return undefined;

    const loginParams: Record<string, string> = {
        next: nextRoute,
    };

    if (nextRoute.startsWith(COMPANY_INVITE_ROUTE)) {
        loginParams.mode = 'work';
    }

    return loginParams;
}

function readErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;

    const message = (error as { message?: unknown })?.message;

    return typeof message === 'string' && message.trim() ? message : 'Unknown error';
}

const titleStyle = {
    fontSize: 24,
    fontWeight: '900' as const,
    marginBottom: 10,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};

const inputStyle = {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '700' as const,
    marginBottom: 12,
    padding: 14,
};
