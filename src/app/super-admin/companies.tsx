import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Image,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type Company = {
    id: string;
    name: string;
    slug: string | null;
    status: string | null;
    theme_color: string | null;
    public_name: string | null;
    dba_name: string | null;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    accent_color: string | null;
    service_categories: string[] | null;
    homeos_rating: number | null;
    homeos_rating_count: number | null;
    combined_experience_years: number | null;
    license_number: string | null;
    phone: string | null;
    website: string | null;
    short_description: string | null;
};

export default function CompaniesScreen() {
    const { selectFor } = useLocalSearchParams<{ selectFor?: string }>();
    const { width: viewportWidth } = useWindowDimensions();
    const isSelectingForProperties = selectFor === 'properties';
    const isPhoneLayout = viewportWidth <= 640;
    const pagePadding = isPhoneLayout ? 16 : 20;
    const logoSize = isPhoneLayout ? 56 : 70;
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
            .select('id, name, slug, status, theme_color, public_name, dba_name, logo_url, primary_color, secondary_color, accent_color, service_categories, homeos_rating, homeos_rating_count, combined_experience_years, license_number, phone, website, short_description')
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

        const { error } = await supabase.rpc('create_company', {
            p_name: name.trim(),
            p_slug: createSlug(name),
            p_status: 'ACTIVE',
            p_theme_color: '#071B33',
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

    function openCompany(companyId: string) {
        if (isSelectingForProperties) {
            router.push(`/super-admin/company/${companyId}/properties` as any);
            return;
        }

        router.push(`/super-admin/company/${companyId}` as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{
                padding: pagePadding,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 900, minWidth: 0 }}>
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
                    {isSelectingForProperties
                        ? 'Select a company to manage its properties.'
                        : 'Create and manage HomeOS company accounts.'}
                </Text>

                <View
                    style={{
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: 0,
                        backgroundColor: '#FFFFFF',
                        borderRadius: 20,
                        padding: isPhoneLayout ? 16 : 20,
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
                                minWidth: 0,
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

                <View style={{ width: '100%', gap: 14 }}>
                    {companies.map((company) => {
                        const displayName = company.public_name || company.name;
                        const dbaName = company.dba_name || company.name;
                        const primaryColor = company.primary_color || company.theme_color || '#071B33';
                        const accentColor = company.accent_color || '#0B5FFF';
                        const secondaryColor = company.secondary_color || '#FFFFFF';
                        const categories = company.service_categories || [];
                        const rating = Number(company.homeos_rating || 0).toFixed(1);
                        const ratingCount = company.homeos_rating_count || 0;
                        const experienceYears = company.combined_experience_years || 0;

                        return (
                            <TouchableOpacity
                                key={company.id}
                                onPress={() => openCompany(company.id)}
                                activeOpacity={0.86}
                                style={{
                                    width: '100%',
                                    maxWidth: '100%',
                                    minWidth: 0,
                                    backgroundColor: '#FFFFFF',
                                    borderRadius: 24,
                                    padding: 18,
                                    borderWidth: 1,
                                    borderColor: '#DFE7F1',
                                    shadowColor: '#071B33',
                                    shadowOpacity: 0.06,
                                    shadowRadius: 14,
                                    shadowOffset: { width: 0, height: 6 },
                                }}
                            >
                                <View
                                    style={{
                                        flexDirection: 'row',
                                        alignItems: 'flex-start',
                                        gap: isPhoneLayout ? 12 : 14,
                                        maxWidth: '100%',
                                        minWidth: 0,
                                    }}
                                >
                                    {company.logo_url ? (
                                        <Image
                                            source={{ uri: company.logo_url }}
                                            style={{
                                                width: logoSize,
                                                height: logoSize,
                                                borderRadius: 18,
                                                backgroundColor: '#EEF2F7',
                                                flexShrink: 0,
                                            }}
                                        />
                                    ) : (
                                        <View
                                            style={{
                                                width: logoSize,
                                                height: logoSize,
                                                borderRadius: 18,
                                                backgroundColor: primaryColor,
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0,
                                            }}
                                        >
                                            <Text style={{ color: secondaryColor, fontSize: isPhoneLayout ? 22 : 28, fontWeight: '900' }}>
                                                {displayName.slice(0, 1).toUpperCase()}
                                            </Text>
                                        </View>
                                    )}

                                    <View style={{ flex: 1, minWidth: 0, maxWidth: '100%' }}>
                                        <View
                                            style={{
                                                flexDirection: 'row',
                                                flexWrap: 'wrap',
                                                justifyContent: 'space-between',
                                                alignItems: 'flex-start',
                                                gap: 12,
                                                minWidth: 0,
                                            }}
                                        >
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Text
                                                    numberOfLines={2}
                                                    style={{
                                                        fontSize: isPhoneLayout ? 19 : 21,
                                                        fontWeight: '900',
                                                        color: '#071B33',
                                                        flexShrink: 1,
                                                    }}
                                                >
                                                    {displayName}
                                                </Text>
                                                <Text
                                                    numberOfLines={1}
                                                    style={{
                                                        color: accentColor,
                                                        fontWeight: '900',
                                                        marginTop: 4,
                                                        flexShrink: 1,
                                                    }}
                                                >
                                                    {dbaName}
                                                </Text>
                                            </View>

                                            <View
                                                style={{
                                                    alignSelf: 'flex-start',
                                                    maxWidth: '100%',
                                                    flexShrink: 1,
                                                    backgroundColor: '#ECFDF3',
                                                    borderRadius: 999,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 6,
                                                }}
                                            >
                                                <Text numberOfLines={1} style={{ color: '#047857', fontSize: 12, fontWeight: '900' }}>
                                                    {company.status || 'ACTIVE'}
                                                </Text>
                                            </View>
                                        </View>

                                        <Text
                                            numberOfLines={2}
                                            style={{
                                                color: '#64748B',
                                                lineHeight: 20,
                                                fontWeight: '700',
                                                marginTop: 8,
                                                minWidth: 0,
                                            }}
                                        >
                                            {company.short_description || 'No company description added yet.'}
                                        </Text>

                                        <View
                                            style={{
                                                flexDirection: 'row',
                                                flexWrap: 'wrap',
                                                gap: 8,
                                                marginTop: 12,
                                                maxWidth: '100%',
                                                minWidth: 0,
                                            }}
                                        >
                                            {(categories.length ? categories : ['No categories']).slice(0, 4).map((category) => (
                                                <View
                                                    key={category}
                                                    style={{
                                                        maxWidth: '100%',
                                                        flexShrink: 1,
                                                        backgroundColor: '#EEF4FF',
                                                        borderRadius: 999,
                                                        paddingHorizontal: 10,
                                                        paddingVertical: 6,
                                                    }}
                                                >
                                                    <Text numberOfLines={1} style={{ color: '#0B5FFF', fontSize: 12, fontWeight: '900', flexShrink: 1 }}>
                                                        {category}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>

                                        <View
                                            style={{
                                                flexDirection: 'row',
                                                flexWrap: 'wrap',
                                                gap: 12,
                                                marginTop: 14,
                                                maxWidth: '100%',
                                                minWidth: 0,
                                            }}
                                        >
                                            <Text style={{ color: '#071B33', fontWeight: '900' }}>
                                                HomeOS {rating} stars
                                            </Text>
                                            <Text style={{ color: '#64748B', fontWeight: '700', flexShrink: 1 }}>
                                                {ratingCount} ratings
                                            </Text>
                                            <Text style={{ color: '#64748B', fontWeight: '700', flexShrink: 1 }}>
                                                {experienceYears} years combined
                                            </Text>
                                            {!!company.license_number && (
                                                <Text numberOfLines={1} style={{ color: '#64748B', fontWeight: '700', maxWidth: '100%' }}>
                                                    Lic# {company.license_number}
                                                </Text>
                                            )}
                                        </View>

                                        <Text
                                            style={{
                                                color: accentColor,
                                                marginTop: 14,
                                                fontWeight: '900',
                                            }}
                                        >
                                            Open Company
                                        </Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>
        </ScrollView>
    );
}
