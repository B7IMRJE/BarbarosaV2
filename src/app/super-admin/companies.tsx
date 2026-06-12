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

type Company = {
    id: string;
    name: string;
    slug: string | null;
    status: string | null;
    theme_color: string | null;
};

export default function CompaniesScreen() {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('Loading companies...');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadCompanies();
    }, []);

    async function loadCompanies() {
        const { data, error } = await supabase
            .from('companies')
            .select('id, name, slug, status, theme_color')
            .order('created_at', { ascending: false });

        if (error) {
            setMessage(`Error loading companies: ${error.message}`);
            return;
        }

        setCompanies(data || []);
        setMessage(data && data.length > 0 ? '' : 'No companies created yet.');
    }

    function createSlug(companyName: string) {
        return companyName
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    async function createCompany() {
        if (!name.trim()) {
            setMessage('Enter a company name.');
            return;
        }

        setLoading(true);
        setMessage('Creating company...');

        const { error } = await supabase.from('companies').insert({
            name: name.trim(),
            slug: createSlug(name),
            status: 'ACTIVE',
            theme_color: '#071B33',
        });

        setLoading(false);

        if (error) {
            setMessage(`Create company failed: ${error.message}`);
            return;
        }

        setName('');
        setMessage('Company created.');
        loadCompanies();
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
                    onPress={() => router.back()}
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
                    Companies
                </Text>

                <Text
                    style={{
                        color: '#637083',
                        marginTop: 8,
                        marginBottom: 24,
                    }}
                >
                    Create and manage HomeOS company accounts.
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
                        + Create Company
                    </Text>

                    <TextInput
                        placeholder="Company Name"
                        value={name}
                        onChangeText={setName}
                        style={{
                            backgroundColor: '#F3F6FA',
                            borderRadius: 16,
                            padding: 16,
                            marginBottom: 14,
                            borderWidth: 1,
                            borderColor: '#E3E8EF',
                        }}
                    />

                    <TouchableOpacity
                        onPress={createCompany}
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
                            {loading ? 'Creating...' : 'Create Company'}
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
                    Company List
                </Text>

                <View style={{ gap: 12 }}>
                    {companies.map((company) => (
                        <TouchableOpacity
                            key={company.id}
                            onPress={() =>
                                router.push(
                                    `/super-admin/company/${company.id}` as any
                                )
                            }
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
                                {company.name}
                            </Text>

                            <Text
                                style={{
                                    color: '#637083',
                                    marginTop: 6,
                                }}
                            >
                                Status: {company.status || 'ACTIVE'}
                            </Text>

                            <Text
                                style={{
                                    color: '#637083',
                                    marginTop: 4,
                                }}
                            >
                                Slug: {company.slug || 'none'}
                            </Text>

                            <Text
                                style={{
                                    color: '#0B5FFF',
                                    marginTop: 10,
                                    fontWeight: '900',
                                }}
                            >
                                Open Company →
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}