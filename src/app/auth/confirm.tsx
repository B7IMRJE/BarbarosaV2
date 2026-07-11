import type { Session, User } from '@supabase/supabase-js';
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
const CUSTOMER_INVITE_ROUTE = '/customer-invite';
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
        redirect_to?: string | string[];
        redirectTo?: string | string[];
        error?: string | string[];
        error_code?: string | string[];
        error_description?: string | string[];
    }>();
    const pendingInvite = getPendingCompanyInviteState();
    const urlNextRoute = resolveInviteNext(firstParam(params.next));
    const redirectNextRoute = resolveInviteNext(firstParam(params.redirect_to) || firstParam(params.redirectTo));
    const pendingNextRoute = pendingInvite && readInviteCodeFromNextPath(pendingInvite.nextPath)
        ? pendingInvite.nextPath
        : null;
    const nextRoute = urlNextRoute || redirectNextRoute || pendingNextRoute;
    const pendingInviteEmail = pendingInvite?.nextPath === nextRoute ? pendingInvite.invitedEmail : null;
    const isCompanyInviteConfirmation = nextRoute?.startsWith(COMPANY_INVITE_ROUTE) === true;
    const isCustomerInviteConfirmation = nextRoute?.startsWith(CUSTOMER_INVITE_ROUTE) === true;
    const [message, setMessage] = useState(
        isCompanyInviteConfirmation
            ? 'Confirming your work account email...'
            : isCustomerInviteConfirmation
                ? 'Confirming your email so you can continue the company invitation...'
                : 'Confirming sign-in...'
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
            setMessage(expiredConfirmationMessage(nextRoute));
            return;
        }

        const tokenHash = firstParam(params.token_hash) || firstParam(params.tokenHash);
        const confirmationCode = firstParam(params.code)?.trim();
        const type = normalizeOtpType(firstParam(params.type));

        if (confirmationCode) {
            const { data, error } = await supabase.auth.exchangeCodeForSession(confirmationCode);

            if (error) {
                setFailed(true);
                if (isExpiredOtpError(error)) {
                    setMessage(expiredConfirmationMessage(nextRoute));
                    return;
                }

                if (isPkceVerifierMissingError(error) && nextRoute) {
                    replacePendingCompanyInviteFromNextPath(nextRoute, pendingInviteEmail);
                    setMessage('Email confirmed. Sign in to continue accepting the invitation.');
                    router.replace({
                        pathname: '/auth/login',
                        params: buildLoginParams(nextRoute, pendingInviteEmail || confirmationEmail),
                    } as any);
                    return;
                }

                setMessage(isPkceVerifierMissingError(error)
                    ? 'This older confirmation link was opened in a browser that did not start signup. Request a new confirmation email to continue accepting the invitation.'
                    : `Email confirmation failed: ${readErrorMessage(error)}`);
                return;
            }

            await finishConfirmedEmail(data.user, data.session);
            return;
        }

        if (!tokenHash) {
            setFailed(true);
            setMessage('This sign-in link is missing required information.');
            return;
        }

        const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
        });

        if (error) {
            setFailed(true);
            setMessage(isExpiredOtpError(error)
                ? expiredConfirmationMessage(nextRoute)
                : 'This sign-in link is invalid or expired. Request a new invitation email.');
            return;
        }

        await finishConfirmedEmail(data.user, data.session);
    }

    async function finishConfirmedEmail(user: User | null, session: Session | null) {
        const recoveredNextRoute = nextRoute || readInviteRouteFromAuthUser(user) || await readInviteRouteFromCurrentUser();
        const recoveredEmail = pendingInviteEmail || readEmailFromAuthUser(user) || await readEmailFromCurrentUser();

        if (!recoveredNextRoute) {
            setFailed(true);
            setMessage('Email confirmed, but this link does not include a usable invitation code. Enter your current invite code or sign in again.');
            return;
        }

        replacePendingCompanyInviteFromNextPath(recoveredNextRoute, recoveredEmail);
        setMessage('Opening company invitation...');

        if (session || await hasCurrentSession()) {
            router.replace(recoveredNextRoute as any);
            return;
        }

        router.replace({
            pathname: '/auth/login',
            params: buildLoginParams(recoveredNextRoute, recoveredEmail),
        } as any);
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
                ? confirmationResentMessage(nextRoute)
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

        const route = nextRoute?.startsWith(CUSTOMER_INVITE_ROUTE) ? CUSTOMER_INVITE_ROUTE : COMPANY_INVITE_ROUTE;

        router.replace(`${route}?code=${encodeURIComponent(code)}` as any);
    }

    function backToLogin() {
        router.replace({
            pathname: '/auth/login',
            params: buildLoginParams(nextRoute, pendingInviteEmail || confirmationEmail),
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
                        {isCompanyInviteConfirmation
                            ? 'Confirm your work account email'
                            : isCustomerInviteConfirmation
                                ? 'Confirm your email'
                                : 'Confirm your email'}
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

function isPkceVerifierMissingError(error: unknown) {
    const message = readErrorMessage(error).toLowerCase();

    return message.includes('code verifier') || message.includes('pkce');
}

function resolveInviteNext(value: string | undefined, depth = 0): string | null {
    if (!value) return null;
    if (depth > 2) return null;

    const directNext = resolveSafeNext(value);
    if (directNext) return directNext;

    try {
        const parsed = new URL(value, 'https://app.local');
        const nestedNext = resolveInviteNext(parsed.searchParams.get('next') || undefined, depth + 1);
        if (nestedNext) return nestedNext;

        return resolveInviteNext(
            parsed.searchParams.get('redirect_to') ||
            parsed.searchParams.get('redirectTo') ||
            undefined,
            depth + 1
        );
    } catch {
        return null;
    }
}

function resolveSafeNext(value: string | undefined) {
    if (!value) return null;

    try {
        const parsed = new URL(value, 'https://app.local');

        if (
            (parsed.pathname === COMPANY_INVITE_ROUTE || parsed.pathname === CUSTOMER_INVITE_ROUTE) &&
            parsed.searchParams.get('code')?.trim()
        ) {
            return `${parsed.pathname}${parsed.search}`;
        }
    } catch {
        return null;
    }

    return null;
}

function readInviteRouteFromAuthUser(user: User | null) {
    const metadata = readMetadataRecord(user);
    if (!metadata) return null;

    const storedRoute = readMetadataString(metadata.pending_invite_route);
    const routeFromMetadata = resolveInviteNext(storedRoute);
    if (routeFromMetadata) return routeFromMetadata;

    const customerInviteCode = readMetadataString(metadata.pending_customer_invite_code);
    if (customerInviteCode) {
        return `${CUSTOMER_INVITE_ROUTE}?code=${encodeURIComponent(customerInviteCode)}`;
    }

    const genericInviteCode = readMetadataString(metadata.pending_invite_code);
    const inviteType = readMetadataString(metadata.pending_invite_type);

    if (genericInviteCode && inviteType === 'customer_company_connection') {
        return `${CUSTOMER_INVITE_ROUTE}?code=${encodeURIComponent(genericInviteCode)}`;
    }

    if (genericInviteCode && inviteType === 'company_user') {
        return `${COMPANY_INVITE_ROUTE}?code=${encodeURIComponent(genericInviteCode)}`;
    }

    return null;
}

async function readInviteRouteFromCurrentUser() {
    const { data } = await supabase.auth.getUser();

    return readInviteRouteFromAuthUser(data.user);
}

function readEmailFromAuthUser(user: User | null) {
    const email = String(user?.email || '').trim().toLowerCase();

    return email || null;
}

async function readEmailFromCurrentUser() {
    const { data } = await supabase.auth.getUser();

    return readEmailFromAuthUser(data.user);
}

async function hasCurrentSession() {
    const { data } = await supabase.auth.getSession();

    return Boolean(data.session);
}

function readMetadataRecord(user: User | null): Record<string, unknown> | null {
    const metadata = user?.user_metadata;

    return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : null;
}

function readMetadataString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function buildConfirmRedirect(nextRoute: string | null) {
    return buildCompanyInviteAuthConfirmRedirect(nextRoute);
}

function buildLoginParams(nextRoute: string | null, email?: string | null) {
    if (!nextRoute) return undefined;

    const loginParams: Record<string, string> = {
        next: nextRoute,
    };
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (nextRoute.startsWith(COMPANY_INVITE_ROUTE)) {
        loginParams.mode = 'work';
    }

    if (cleanEmail) {
        loginParams.email = cleanEmail;
    }

    return loginParams;
}

function expiredConfirmationMessage(nextRoute: string | null) {
    if (nextRoute?.startsWith(CUSTOMER_INVITE_ROUTE)) {
        return 'Your email confirmation link expired. Request a new confirmation email to continue accepting your company invitation.';
    }

    if (nextRoute?.startsWith(COMPANY_INVITE_ROUTE)) {
        return 'Your email confirmation link expired. Request a new confirmation email to continue accepting your company invite.';
    }

    return 'This email confirmation link expired or was already used.';
}

function confirmationResentMessage(nextRoute: string | null) {
    if (nextRoute?.startsWith(CUSTOMER_INVITE_ROUTE)) {
        return 'Confirmation email sent. After confirming your email, your company invitation will continue automatically.';
    }

    return 'Confirmation email sent. After confirming your work account email, your company invite will continue automatically.';
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
