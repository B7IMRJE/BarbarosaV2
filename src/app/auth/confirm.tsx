import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { replacePendingCompanyInviteFromNextPath } from '../../lib/companyInviteState';
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
        token_hash?: string | string[];
        tokenHash?: string | string[];
        type?: string | string[];
        next?: string | string[];
    }>();
    const [message, setMessage] = useState('Confirming sign-in...');
    const [failed, setFailed] = useState(false);
    const [inviteCode, setInviteCode] = useState('');

    useEffect(() => {
        confirmEmailLink();
    }, []);

    async function confirmEmailLink() {
        const tokenHash = firstParam(params.token_hash) || firstParam(params.tokenHash);
        const type = normalizeOtpType(firstParam(params.type));

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
            setMessage('This sign-in link is invalid or expired. Request a new invitation email.');
            return;
        }

        const nextRoute = resolveSafeNext(firstParam(params.next));

        if (!nextRoute) {
            setFailed(true);
            setMessage('Email confirmed, but this link does not include a usable company invite code. Enter your current invite code or sign in again.');
            return;
        }

        replacePendingCompanyInviteFromNextPath(nextRoute, null);
        setMessage('Opening company invitation...');
        router.replace(nextRoute as any);
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

                    <Text style={[titleStyle, { color: theme.colors.text }]}>Company Invitations</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>

                    {failed && (
                        <View style={{ marginTop: 18 }}>
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
                            />
                            <ThemedButton
                                title="Back to Login"
                                variant="secondary"
                                onPress={() => router.replace('/auth/login' as any)}
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
