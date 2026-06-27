import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type EmailOtpType = 'signup' | 'invite' | 'magiclink' | 'email';

const COMPANY_INVITATIONS_ROUTE = '/onboarding/company-invitations';
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

        setMessage('Opening company invitations...');
        router.replace(resolveSafeNext(firstParam(params.next)) as any);
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
                        <ThemedButton
                            title="Go to Login"
                            variant="secondary"
                            onPress={() => router.replace('/auth/login' as any)}
                            style={{ marginTop: 18 }}
                        />
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
    if (!value) return COMPANY_INVITATIONS_ROUTE;

    try {
        const parsed = new URL(value, 'https://app.local');

        if (parsed.pathname === COMPANY_INVITE_ROUTE) {
            return `${COMPANY_INVITE_ROUTE}${parsed.search}`;
        }

        if (parsed.pathname === COMPANY_INVITATIONS_ROUTE) {
            return COMPANY_INVITATIONS_ROUTE;
        }
    } catch {
        return COMPANY_INVITATIONS_ROUTE;
    }

    return COMPANY_INVITATIONS_ROUTE;
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
