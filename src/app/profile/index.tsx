import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function ProfileScreen() {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState('Loading profile...');

    useEffect(() => {
        loadUser();
    }, []);

    async function loadUser() {
        const { data } = await supabase.auth.getUser();

        if (!data.user) {
            setMessage('Not logged in.');
            return;
        }

        setEmail(data.user.email || '');
        setMessage('Logged in');
    }

    async function handleLogout() {
        await supabase.auth.signOut();
        router.replace('/auth/login' as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 24, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 500, marginTop: 50 }}>
                <Text
                    onPress={() => router.push('/' as any)}
                    style={{
                        fontSize: 18,
                        fontWeight: '900',
                        color: '#071B33',
                        marginBottom: 20,
                    }}
                >
                    ← Back
                </Text>

                <Text
                    style={{
                        fontSize: 34,
                        fontWeight: '900',
                        color: '#071B33',
                    }}
                >
                    Profile
                </Text>

                <Text style={{ color: '#637083', marginTop: 8, marginBottom: 24 }}>
                    Account settings.
                </Text>

                <View style={cardStyle}>
                    <Text style={labelStyle}>Status</Text>
                    <Text style={valueStyle}>{message}</Text>

                    <Text style={labelStyle}>Email</Text>
                    <Text style={valueStyle}>{email || 'No email found'}</Text>
                </View>

                <TouchableOpacity
                    onPress={() => router.push('/profile/change-password' as any)}
                    style={buttonStyle}
                >
                    <Text style={buttonTextStyle}>Change Password</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleLogout}
                    style={logoutButtonStyle}
                >
                    <Text style={logoutTextStyle}>Logout</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
}

const cardStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    marginBottom: 18,
};

const labelStyle = {
    fontSize: 13,
    color: '#637083',
    fontWeight: '900' as const,
    marginTop: 8,
};

const valueStyle = {
    fontSize: 16,
    color: '#071B33',
    fontWeight: '800' as const,
    marginTop: 4,
};

const buttonStyle = {
    backgroundColor: '#071B33',
    padding: 18,
    borderRadius: 18,
    alignItems: 'center' as const,
    marginBottom: 14,
};

const buttonTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
};

const logoutButtonStyle = {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 18,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const logoutTextStyle = {
    color: '#B00020',
    fontSize: 16,
    fontWeight: '900' as const,
};