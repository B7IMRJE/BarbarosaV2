import { router } from 'expo-router';
import { useState } from 'react';
import {
    Alert,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

export default function RegisterScreen() {
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleRegister() {
        const cleanName = fullName.trim();
        const cleanPhone = phone.trim();
        const cleanEmail = email.trim().toLowerCase();

        if (!cleanName || !cleanEmail || !password) {
            Alert.alert('Missing information', 'Please enter name, email, and password.');
            return;
        }

        setLoading(true);

        const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
                data: {
                    full_name: cleanName,
                    phone: cleanPhone,
                    role: 'HOMEOWNER',
                },
            },
        });

        if (error) {
            setLoading(false);
            Alert.alert('Create account failed', error.message);
            return;
        }

        if (data.user) {
            await supabase.from('profiles').upsert({
                id: data.user.id,
                email: cleanEmail,
                full_name: cleanName,
                phone: cleanPhone,
                role: 'HOMEOWNER',
            });
        }

        setLoading(false);

        Alert.alert(
            'Account created',
            'Check your email to verify your account. After that, log in.'
        );

        router.replace('/auth/login' as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 500 }}>
                <Text style={titleStyle}>Create Account</Text>

                <Text style={subtitleStyle}>Create your HomeOS account.</Text>

                <TextInput
                    placeholder="Full Name"
                    value={fullName}
                    onChangeText={setFullName}
                    autoCapitalize="words"
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    importantForAutofill="no"
                    style={inputStyle}
                />

                <TextInput
                    placeholder="Phone"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    importantForAutofill="no"
                    style={inputStyle}
                />

                <TextInput
                    placeholder="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    importantForAutofill="no"
                    style={inputStyle}
                />

                <TextInput
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="new-password"
                    textContentType="newPassword"
                    importantForAutofill="no"
                    style={inputStyle}
                />

                <TouchableOpacity
                    onPress={handleRegister}
                    disabled={loading}
                    style={buttonStyle}
                >
                    <Text style={buttonTextStyle}>
                        {loading ? 'Creating...' : 'Create Account'}
                    </Text>
                </TouchableOpacity>

                <Text onPress={() => router.push('/auth/login' as any)} style={linkStyle}>
                    Already have an account? Login
                </Text>
            </View>
        </ScrollView>
    );
}

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
    color: '#071B33',
    marginTop: 40,
};

const subtitleStyle = {
    color: '#637083',
    marginTop: 8,
    marginBottom: 24,
};

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