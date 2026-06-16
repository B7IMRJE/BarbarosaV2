import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../../../lib/supabase';

type Company = {
    id: string;
    name: string;
    slug: string | null;
    status: string | null;
    theme_color: string | null;
};

const cards = [
    'Staff',
    'Technicians',
    'Sales',
    'Managers',
    'Customers',
    'Connections',
    'Properties',
    'Jobs',
    'Quotes',
    'Dispatch',
    'Emergency',
    'Partners',
    'Reports',
    'Settings',
];

export default function CompanyDashboardScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const [company, setCompany] = useState<Company | null>(null);
    const [message, setMessage] = useState('Loading company...');

    useEffect(() => {
        loadCompany();
    }, [id]);

    async function loadCompany() {
        if (!id) {
            setMessage('Missing company id.');
            return;
        }

        const { data, error } = await supabase
            .from('companies')
            .select('id, name, slug, status, theme_color')
            .eq('id', String(id))
            .single();

        if (error) {
            setMessage(`Error loading company: ${error.message}`);
            return;
        }

        setCompany(data);
        setMessage('');
    }

    function openModule(card: string) {
        if (card === 'Staff') {
            router.push(`/super-admin/company/${id}/users` as any);
            return;
        }

        if (card === 'Customers') {
            router.push(`/super-admin/company/${id}/homeowners` as any);
            return;
        }

        if (card === 'Properties') {
            router.push(`/super-admin/company/${id}/properties` as any);
            return;
        }

        if (card === 'Connections') {
            router.push(`/super-admin/company/${id}/connections` as any);
            return;
        }

        alert(`${card} module comes next.`);
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
                    onPress={() => router.push('/super-admin' as any)}
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
                    {company?.name || 'Company'}
                </Text>

                <Text
                    style={{
                        color: '#637083',
                        marginTop: 8,
                        marginBottom: 24,
                    }}
                >
                    {company ? `Status: ${company.status || 'ACTIVE'}` : message}
                </Text>

                {company && (
                    <View
                        style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: 20,
                            padding: 18,
                            borderWidth: 1,
                            borderColor: '#E3E8EF',
                            marginBottom: 20,
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 18,
                                fontWeight: '900',
                                color: '#071B33',
                            }}
                        >
                            Company Profile
                        </Text>

                        <Text style={{ color: '#637083', marginTop: 8 }}>
                            Slug: {company.slug || 'none'}
                        </Text>

                        <Text style={{ color: '#637083', marginTop: 4 }}>
                            Theme: {company.theme_color || '#071B33'}
                        </Text>
                    </View>
                )}

                <Text
                    style={{
                        fontSize: 22,
                        fontWeight: '900',
                        color: '#071B33',
                        marginBottom: 14,
                    }}
                >
                    Company Admin Modules
                </Text>

                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}
                >
                    {cards.map((card) => (
                        <TouchableOpacity
                            key={card}
                            onPress={() => openModule(card)}
                            style={{
                                width: '48%',
                                minHeight: 100,
                                backgroundColor: '#FFFFFF',
                                borderRadius: 20,
                                padding: 16,
                                borderWidth: 1,
                                borderColor: '#E3E8EF',
                                justifyContent: 'center',
                            }}
                        >
                            <Text
                                style={{
                                    fontSize: 17,
                                    fontWeight: '900',
                                    color: '#071B33',
                                }}
                            >
                                {card}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
