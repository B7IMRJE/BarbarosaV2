import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';
export default function RegisterScreen() {
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleRegister() {
        if (!fullName || !email || !password) {
            Alert.alert('Missing information', 'Please enter name, email, and password.');
            return;
        }

        setLoading(true);

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            setLoading(false);
            Alert.alert('Create account failed', error.message);
            return;
        }

        if (data.user) {
            await supabase.from('profiles').upsert({
                id: data.user.id,
                email,
                full_name: fullName,
                phone,
                role: 'HOMEOWNER',
            });
        }

        setLoading(false);

        Alert.alert(
            'Account created',
            'Check your email to verify your account. After that, log in.'
        );

        router.push('/auth/login' as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 500 }}>
                <Text style={{ fontSize: 34, fontWeight: '900', color: '#071B33', marginTop: 40 }}>
                    Create Account
                </Text>

                <Text style={{ color: '#637083', marginTop: 8, marginBottom: 24 }}>
                    Create your HomeOS account.
                </Text>

                <TextInput placeholder="Full Name" value={fullName} onChangeText={setFullName} style={inputStyle} />
                <TextInput placeholder="Phone" value={phone} onChangeText={setPhone} style={inputStyle} />
                <TextInput placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" style={inputStyle} />
                <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry style={inputStyle} />

                <TouchableOpacity onPress={handleRegister} style={buttonStyle}>
                    <Text style={buttonTextStyle}>{loading ? 'Creating...' : 'Create Account'}</Text>
                </TouchableOpacity>

                <Text onPress={() => router.push('/auth/login' as any)} style={linkStyle}>
                    Already have an account? Login
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