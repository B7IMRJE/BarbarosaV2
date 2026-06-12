import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

export default function ResetPasswordScreen() {
    const params = useLocalSearchParams<{ code?: string }>();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('Preparing password reset...');
    const [loading, setLoading] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        prepareRecoverySession();
    }, []);

    async function prepareRecoverySession() {
        try {
            if (params.code) {
                const { error } = await supabase.auth.exchangeCodeForSession(
                    String(params.code)
                );

                if (error) {
                    setMessage(`Reset session failed: ${error.message}`);
                    return;
                }

                setReady(true);
                setMessage('Ready. Enter your new password.');
                return;
            }

            const { data, error } = await supabase.auth.getSession();

            if (error) {
                setMessage(`Session check failed: ${error.message}`);
                return;
            }

            if (data.session) {
                setReady(true);
                setMessage('Ready. Enter your new password.');
                return;
            }

            setMessage('No reset session found. Please open the newest reset email link.');
        } catch (err) {
            setMessage(`Unexpected reset error: ${String(err)}`);
        }
    }

    async function handleResetPassword() {
        if (!ready) {
            setMessage('Reset session is not ready. Open the newest reset email link.');
            return;
        }

        if (!password || !confirmPassword) {
            setMessage('Enter and confirm your new password.');
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
        });

        setLoading(false);

        if (error) {
            setMessage(`Password update failed: ${error.message}`);
            return;
        }

        await supabase.auth.signOut();

        setMessage('Password updated successfully. Go login.');

        setTimeout(() => {
            router.replace('/auth/login' as any);
        }, 1200);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 500, marginTop: 60 }}>
                <Text style={{ fontSize: 34, fontWeight: '900', color: '#071B33' }}>
                    Reset Password
                </Text>

                <Text style={{ color: '#637083', marginTop: 8, marginBottom: 24 }}>
                    Create a new password for your HomeOS account.
                </Text>

                <TextInput
                    placeholder="New Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    style={inputStyle}
                />

                <TextInput
                    placeholder="Confirm New Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    style={inputStyle}
                />

                <TouchableOpacity
                    onPress={handleResetPassword}
                    disabled={loading}
                    style={buttonStyle}
                >
                    <Text style={buttonTextStyle}>
                        {loading ? 'Updating...' : 'Update Password'}
                    </Text>
                </TouchableOpacity>

                <View style={messageBoxStyle}>
                    <Text style={messageTextStyle}>{message}</Text>
                </View>

                <Text
                    onPress={() => router.replace('/auth/login' as any)}
                    style={linkStyle}
                >
                    Back to Login
                </Text>
            </View>
        </ScrollView>
    );
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

const linkStyle = {
    marginTop: 18,
    color: '#0B5FFF',
    fontWeight: '900' as const,
    textAlign: 'center' as const,
};