import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import {
    ScrollView,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import PasswordField from '../../components/auth/password-field';
import {
    clearInvitationPasswordSetupPending,
    INVITATION_PASSWORD_SETUP_COMPLETED_AT_KEY,
    requiresInvitationPasswordSetup,
} from '../../lib/invitation-password-setup';
import { supabase } from '../../lib/supabase';

export default function ChangePasswordScreen() {
    const { width: windowWidth } = useWindowDimensions();
    const params = useLocalSearchParams<{ first?: string; next?: string }>();
    const firstPasswordSetup = params.first === '1';
    const nextRoute = safeNextRoute(params.next);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('Checking recovery session...');
    const prepareSessionEvent = useEffectEvent(prepareSession);
    const horizontalPadding = windowWidth < 390 ? 16 : 24;
    const formWidth = Math.max(0, Math.min(windowWidth - (horizontalPadding * 2), 500));

    useEffect(() => {
        void prepareSessionEvent();
    }, []);

    async function prepareSession() {
        if (typeof window !== 'undefined' && window.location.hash) {
            const hash = new URLSearchParams(window.location.hash.replace('#', ''));

            const accessToken = hash.get('access_token');
            const refreshToken = hash.get('refresh_token');

            if (accessToken && refreshToken) {
                const { error } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                });

                if (error) {
                    setMessage(`Session failed: ${error.message}`);
                    return;
                }

                window.history.replaceState({}, document.title, '/profile/change-password');
            }
        }

        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) {
            setMessage('No active login session. Open the newest email link first.');
            return;
        }

        if (firstPasswordSetup && !(await requiresInvitationPasswordSetup({ assumePending: true }))) {
            setMessage('Your password is already set. Opening your account...');
            router.replace(nextRoute as any);
            return;
        }

        setMessage(`Logged in as: ${data.user.email}`);
    }

    async function handleUpdatePassword() {
        if (!password || !confirmPassword) {
            setMessage('Enter both password fields.');
            return;
        }

        if (password !== confirmPassword) {
            setMessage('Passwords do not match.');
            return;
        }

        if (password.length < 6) {
            setMessage('Password must be at least 6 characters.');
            return;
        }

        setLoading(true);
        setMessage('Updating password...');

        const { error } = await supabase.auth.updateUser({
            password,
            data: {
                [INVITATION_PASSWORD_SETUP_COMPLETED_AT_KEY]: new Date().toISOString(),
            },
        });

        setLoading(false);

        if (error) {
            setMessage(`Update failed: ${error.message}`);
            return;
        }

        await clearInvitationPasswordSetupPending();
        setMessage('Password created successfully. Opening your account...');
        router.replace(nextRoute as any);
    }

    async function cancelInvitationLogin() {
        await clearInvitationPasswordSetupPending();
        await supabase.auth.signOut();
        router.replace('/auth/login' as any);
    }

    return (
        <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{
                alignItems: 'center',
                paddingBottom: 32,
                paddingHorizontal: horizontalPadding,
                paddingTop: 24,
            }}
        >
            <View style={{ width: formWidth, maxWidth: '100%', minWidth: 0, marginTop: windowWidth < 390 ? 18 : 34 }}>
                <Text
                    onPress={firstPasswordSetup ? cancelInvitationLogin : () => router.back()}
                    style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: '#071B33',
                        marginBottom: 20,
                    }}
                >
                    {firstPasswordSetup ? '← Sign Out' : '← Back'}
                </Text>

                <Text style={{ fontSize: windowWidth < 390 ? 30 : 34, fontWeight: '900', color: '#071B33', flexShrink: 1 }}>
                    {firstPasswordSetup ? 'Create Your Password' : 'Change Password'}
                </Text>

                <Text style={{ color: '#637083', marginTop: 8, marginBottom: 24 }}>
                    {firstPasswordSetup
                        ? 'Create a password to finish this invitation-code login and protect your account.'
                        : 'Update your HomeOS password.'}
                </Text>

                <PasswordField
                    placeholder="New Password"
                    value={password}
                    onChangeText={setPassword}
                    style={inputStyle}
                />

                <PasswordField
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    style={inputStyle}
                />

                <TouchableOpacity
                    onPress={handleUpdatePassword}
                    disabled={loading}
                    style={buttonStyle}
                >
                    <Text style={buttonTextStyle}>
                        {loading ? 'Saving...' : firstPasswordSetup ? 'Create Password' : 'Update Password'}
                    </Text>
                </TouchableOpacity>

                <View style={messageBoxStyle}>
                    <Text style={messageTextStyle}>{message}</Text>
                </View>
            </View>
        </ScrollView>
    );
}

function safeNextRoute(value?: string) {
    const route = String(value || '/').trim();

    return route.startsWith('/') && !route.startsWith('//') ? route : '/';
}

const inputStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    minWidth: 0,
    width: '100%' as const,
};

const buttonStyle = {
    backgroundColor: '#071B33',
    padding: 18,
    borderRadius: 18,
    alignItems: 'center' as const,
    width: '100%' as const,
};

const buttonTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
};

const messageBoxStyle = {
    marginTop: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    minWidth: 0,
    width: '100%' as const,
};

const messageTextStyle = {
    fontSize: 14,
    color: '#637083',
    lineHeight: 20,
};
