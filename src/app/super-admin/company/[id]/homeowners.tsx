import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../../../lib/supabase';

type Homeowner = {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
};

export default function HomeownersScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();

    const [homeowners, setHomeowners] = useState<Homeowner[]>([]);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadHomeowners();
    }, [id]);

    async function loadHomeowners() {
        if (!id) return;

        const { data, error } = await supabase
            .from('homeowners')
            .select('*')
            .eq('company_id', String(id))
            .order('created_at', { ascending: false });

        if (error) {
            setMessage(error.message);
            return;
        }

        setHomeowners(data || []);
    }

    async function addHomeowner() {
        if (!fullName.trim()) {
            setMessage('Enter homeowner name.');
            return;
        }

        setLoading(true);

        const { error } = await supabase
            .from('homeowners')
            .insert({
                company_id: String(id),
                full_name: fullName.trim(),
                email: email.trim(),
                phone: phone.trim(),
            });

        setLoading(false);

        if (error) {
            setMessage(error.message);
            return;
        }

        setFullName('');
        setEmail('');
        setPhone('');
        setMessage('');

        loadHomeowners();
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{
                padding: 20,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <Text
                    onPress={() => router.push(`/super-admin/company/${id}` as any)}
                    style={{
                        marginTop: 20,
                        marginBottom: 20,
                        fontSize: 18,
                        fontWeight: '900',
                        color: '#071B33',
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
                    Homeowners
                </Text>

                <Text
                    style={{
                        color: '#637083',
                        marginTop: 8,
                        marginBottom: 24,
                    }}
                >
                    Add and manage homeowners.
                </Text>

                <View
                    style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: '#E3E8EF',
                    }}
                >
                    <Text
                        style={{
                            fontSize: 20,
                            fontWeight: '900',
                            marginBottom: 14,
                            color: '#071B33',
                        }}
                    >
                        + Add Homeowner
                    </Text>

                    <TextInput
                        placeholder="Full Name"
                        value={fullName}
                        onChangeText={setFullName}
                        style={inputStyle}
                    />

                    <TextInput
                        placeholder="Email"
                        value={email}
                        onChangeText={setEmail}
                        style={inputStyle}
                    />

                    <TextInput
                        placeholder="Phone"
                        value={phone}
                        onChangeText={setPhone}
                        style={inputStyle}
                    />

                    <TouchableOpacity
                        onPress={addHomeowner}
                        style={buttonStyle}
                    >
                        <Text style={buttonTextStyle}>
                            {loading ? 'Adding...' : 'Add Homeowner'}
                        </Text>
                    </TouchableOpacity>

                    {!!message && (
                        <Text
                            style={{
                                marginTop: 14,
                                color: '#637083',
                            }}
                        >
                            {message}
                        </Text>
                    )}
                </View>

                <Text
                    style={{
                        marginTop: 24,
                        marginBottom: 14,
                        fontSize: 22,
                        fontWeight: '900',
                        color: '#071B33',
                    }}
                >
                    Homeowner List
                </Text>

                {homeowners.map((homeowner) => (
                    <View
                        key={homeowner.id}
                        style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: 20,
                            padding: 18,
                            borderWidth: 1,
                            borderColor: '#E3E8EF',
                            marginBottom: 12,
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 19,
                                fontWeight: '900',
                                color: '#071B33',
                            }}
                        >
                            {homeowner.full_name}
                        </Text>

                        <Text
                            style={{
                                marginTop: 8,
                                color: '#637083',
                            }}
                        >
                            {homeowner.email || 'No email'}
                        </Text>

                        <Text
                            style={{
                                marginTop: 4,
                                color: '#637083',
                            }}
                        >
                            {homeowner.phone || 'No phone'}
                        </Text>
                    </View>
                ))}
            </View>
        </ScrollView>
    );
}

const inputStyle = {
    backgroundColor: '#F3F6FA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const buttonStyle = {
    backgroundColor: '#071B33',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center' as const,
};

const buttonTextStyle = {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900' as const,
};