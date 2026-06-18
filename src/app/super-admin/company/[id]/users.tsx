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

type CompanyUser = {
    id: string;
    company_id: string;
    auth_user_id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    status: string;
    created_at: string | null;
};

export default function CompanyUsersScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();

    const [users, setUsers] = useState<CompanyUser[]>([]);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [authUserId, setAuthUserId] = useState('');
    const [role, setRole] = useState('TECHNICIAN');
    const [message, setMessage] = useState('Loading users...');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadUsers();
    }, [id]);

    async function loadUsers() {
        if (!id) {
            setMessage('Missing company id.');
            return;
        }

        const { data, error } = await supabase
            .from('company_users')
            .select('id, company_id, auth_user_id, full_name, email, role, status, created_at')
            .eq('company_id', String(id))
            .order('created_at', { ascending: false });

        if (error) {
            setMessage(`Error loading users: ${error.message}`);
            return;
        }

        setUsers(data || []);
        setMessage(data && data.length > 0 ? '' : 'No users added yet.');
    }

    async function addUser() {
        if (!id) {
            setMessage('Missing company id.');
            return;
        }

        if (!fullName.trim() || !email.trim()) {
            setMessage('Enter auth user ID, full name, and email.');
            return;
        }

        if (!authUserId.trim()) {
            setMessage('Enter auth user ID.');
            return;
        }

        setLoading(true);
        setMessage('Adding user...');

        const { error } = await supabase.rpc('create_company_user', {
            p_company_id: String(id),
            p_auth_user_id: authUserId.trim(),
            p_full_name: fullName.trim(),
            p_email: email.trim().toLowerCase(),
            p_role: role,
            p_status: 'active',
        });

        setLoading(false);

        if (error) {
            setMessage(`Add user failed: ${error.message}`);
            return;
        }

        setFullName('');
        setEmail('');
        setAuthUserId('');
        setRole('TECHNICIAN');
        setMessage('User added.');
        loadUsers();
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
                        color: '#071B33',
                        fontWeight: '900',
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
                    Company Users
                </Text>

                <Text
                    style={{
                        color: '#637083',
                        marginTop: 8,
                        marginBottom: 24,
                    }}
                >
                    Add and manage users for this company.
                </Text>

                <View
                    style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: 20,
                        borderWidth: 1,
                        borderColor: '#E3E8EF',
                        marginBottom: 20,
                    }}
                >
                    <Text
                        style={{
                            fontSize: 20,
                            fontWeight: '900',
                            color: '#071B33',
                            marginBottom: 12,
                        }}
                    >
                        + Add User
                    </Text>

                    <TextInput
                        placeholder="Auth User ID"
                        value={authUserId}
                        onChangeText={setAuthUserId}
                        autoCapitalize="none"
                        style={inputStyle}
                    />

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
                        autoCapitalize="none"
                        style={inputStyle}
                    />
                    <View
                        style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            gap: 10,
                            marginBottom: 14,
                        }}
                    >
                        {['ADMIN', 'MANAGER', 'TECHNICIAN', 'OFFICE', 'OWNER', 'USER'].map((option) => (
                            <TouchableOpacity
                                key={option}
                                onPress={() => setRole(option)}
                                style={{
                                    paddingVertical: 10,
                                    paddingHorizontal: 12,
                                    borderRadius: 999,
                                    backgroundColor:
                                        role === option
                                            ? '#071B33'
                                            : '#F3F6FA',
                                    borderWidth: 1,
                                    borderColor: '#E3E8EF',
                                }}
                            >
                                <Text
                                    style={{
                                        color:
                                            role === option
                                                ? '#FFFFFF'
                                                : '#071B33',
                                        fontWeight: '900',
                                        fontSize: 12,
                                    }}
                                >
                                    {option}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        onPress={addUser}
                        disabled={loading}
                        style={{
                            backgroundColor: '#071B33',
                            padding: 16,
                            borderRadius: 16,
                            alignItems: 'center',
                        }}
                    >
                        <Text
                            style={{
                                color: '#FFFFFF',
                                fontSize: 16,
                                fontWeight: '900',
                            }}
                        >
                            {loading ? 'Adding...' : 'Add User'}
                        </Text>
                    </TouchableOpacity>

                    {!!message && (
                        <Text
                            style={{
                                marginTop: 14,
                                color: '#637083',
                                lineHeight: 20,
                            }}
                        >
                            {message}
                        </Text>
                    )}
                </View>

                <Text
                    style={{
                        fontSize: 22,
                        fontWeight: '900',
                        color: '#071B33',
                        marginBottom: 14,
                    }}
                >
                    User List
                </Text>

                <View style={{ gap: 12 }}>
                    {users.map((user) => (
                        <View
                            key={user.id}
                            style={{
                                backgroundColor: '#FFFFFF',
                                borderRadius: 20,
                                padding: 18,
                                borderWidth: 1,
                                borderColor: '#E3E8EF',
                            }}
                        >
                            <Text
                                style={{
                                    fontSize: 19,
                                    fontWeight: '900',
                                    color: '#071B33',
                                }}
                            >
                                {user.full_name || 'Unnamed user'}
                            </Text>

                            <Text
                                style={{
                                    color: '#637083',
                                    marginTop: 6,
                                }}
                            >
                                {user.email || 'No email'}
                            </Text>

                            <Text
                                style={{
                                    color: '#637083',
                                    marginTop: 4,
                                }}
                            >
                                Auth User ID: {user.auth_user_id}
                            </Text>

                            <Text
                                style={{
                                    color: '#637083',
                                    marginTop: 4,
                                }}
                            >
                                Role: {user.role}
                            </Text>

                            <Text
                                style={{
                                    color: '#637083',
                                    marginTop: 4,
                                }}
                            >
                                Status: {user.status}
                            </Text>
                        </View>
                    ))}
                </View>
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
