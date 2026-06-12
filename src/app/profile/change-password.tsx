import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

export default function ChangePasswordScreen() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('Checking recovery session...');

    useEffect(() => {
        prepareSession();
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

        const { error } = await supabase.auth.updateUser({ password });

        setLoading(false);

        if (error) {
            setMessage(`Update failed: ${error.message}`);
            return;
        }

        setMessage('Password updated successfully. Redirecting to login...');

        setTimeout(async () => {
            await supabase.auth.signOut();
            router.replace('/auth/login' as any);
        }, 1500);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 500, marginTop: 50 }}>
                <Text
                    onPress={() => router.back()}
                    style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: '#071B33',
                        marginBottom: 20,
                    }}
                >
                    ← Back
                </Text>

                <Text style={{ fontSize: 34, fontWeight: '900', color: '#071B33' }}>
                    Change Password
                </Text>

                <Text style={{ color: '#637083', marginTop: 8, marginBottom: 24 }}>
                    Update your HomeOS password.
                </Text>

                <TextInput
                    placeholder="New Password"
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    style={inputStyle}
                />

                <TextInput
                    placeholder="Confirm Password"
                    secureTextEntry
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
                        {loading ? 'Updating...' : 'Update Password'}
                    </Text>
                </TouchableOpacity>

                <View style={messageBoxStyle}>
                    <Text style={messageTextStyle}>{message}</Text>
                </View>
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