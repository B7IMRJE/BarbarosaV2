import { router } from 'expo-router';
import { useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    async function handleLogin() {
        if (!email.trim() || !password) {
            setMessage('Enter your email and password.');
            return;
        }

        setLoading(true);
        setMessage('Logging in...');

        const cleanEmail = email.trim().toLowerCase();

        const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
        });

        setLoading(false);

        if (error) {
            setMessage(`Login failed: ${error.message}`);
            return;
        }

        if (!data.user) {
            setMessage('Login failed: no user returned.');
            return;
        }

        const role =
            cleanEmail === 'bravomichael38@gmail.com'
                ? 'SUPER_ADMIN'
                : 'HOMEOWNER';

        if (role === 'SUPER_ADMIN') {
            router.replace('/super-admin' as any);
            return;
        }

        router.replace('/' as any);
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
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    style={inputStyle}
                />

                <TextInput
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    style={inputStyle}
                />

                <TouchableOpacity
                    onPress={handleLogin}
                    disabled={loading}
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

                <Text
                    onPress={() => router.push('/auth/register' as any)}
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