import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';
import ThemedButton from '../theme/ThemedButton';
import ThemedCard from '../theme/ThemedCard';

export default function EmailVerificationNotice() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const [email, setEmail] = useState('');
    const [dismissed, setDismissed] = useState(false);
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        void supabase.auth.getUser().then(({ data }) => {
            const user = data.user;

            if (user?.email && !user.email_confirmed_at) {
                setEmail(user.email);
            }
        });
    }, []);

    if (!email) return null;

    if (dismissed) {
        return (
            <View style={{ alignItems: 'center', paddingTop: scaleIcon(8) }}>
                <ThemedButton
                    title="Verify Email"
                    variant="secondary"
                    onPress={() => setDismissed(false)}
                    style={{ minHeight: scaleIcon(38), paddingHorizontal: scaleIcon(14) }}
                />
            </View>
        );
    }

    async function resendVerification() {
        if (sending) return;

        setSending(true);
        setMessage('');
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email,
            options: {
                emailRedirectTo: `${resolveAppBaseUrl()}/auth/confirm`,
            },
        });
        setSending(false);
        setMessage(error
            ? 'Verification email could not be sent. Please try again shortly.'
            : 'Verification email sent. The link can be used once.');
    }

    return (
        <View style={{ alignItems: 'center', padding: scaleIcon(10) }}>
            <ThemedCard style={{ width: '100%', maxWidth: 760 }}>
                <Text style={{ color: theme.colors.text, fontSize: scaleFont(17), fontWeight: '900' }}>
                    Please verify your email
                </Text>
                <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(13), lineHeight: scaleFont(19), fontWeight: '700', marginTop: scaleIcon(5) }}>
                    Verify {email} so HomeOS can securely save and recover your information.
                </Text>
                {message ? (
                    <Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(12), fontWeight: '800', marginTop: scaleIcon(8) }}>
                        {message}
                    </Text>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(8), marginTop: scaleIcon(10) }}>
                    <ThemedButton
                        title={sending ? 'Sending...' : 'Send Verification Email'}
                        onPress={() => void resendVerification()}
                        disabled={sending}
                    />
                    <ThemedButton
                        title="Not Now"
                        variant="secondary"
                        onPress={() => setDismissed(true)}
                    />
                </View>
            </ThemedCard>
        </View>
    );
}

function resolveAppBaseUrl() {
    const configured = String(process.env.EXPO_PUBLIC_APP_URL || '').replace(/\/+$/, '');

    if (configured) return configured;
    if (typeof window !== 'undefined') return window.location.origin;

    return 'https://barbarosa-v2.vercel.app';
}
