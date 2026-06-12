import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function ForgotPasswordScreen() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleReset() {
        if (!email) {
            Alert.alert('Missing email', 'Enter your email address.');
            return;
        }

        setLoading(true);

        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: 'http://localhost:8081/auth/reset-password',
        });

        setLoading(false);

        if (error) {
            Alert.alert('Reset failed', error.message);
            return;
        }

        Alert.alert('Reset email sent', 'Check your email for the password reset link.');
        router.push('/auth/login' as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 500 }}>
                <Text style={{ fontSize: 34, fontWeight: '900', color: '#071B33', marginTop: 40 }}>
                    Forgot Password
                </Text>

                <Text style={{ color: '#637083', marginTop: 8, marginBottom: 24 }}>
                    Enter your email and HomeOS will send a reset link.
                </Text>

                <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" style={inputStyle} />

                <TouchableOpacity onPress={handleReset} style={buttonStyle}>
                    <Text style={buttonTextStyle}>{loading ? 'Sending...' : 'Send Reset Link'}</Text>
                </TouchableOpacity>

                <Text onPress={() => router.push('/auth/login' as any)} style={linkStyle}>
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

const linkStyle = {
    marginTop: 20,
    color: '#0B5FFF',
    fontWeight: '900' as const,
    textAlign: 'center' as const,
};