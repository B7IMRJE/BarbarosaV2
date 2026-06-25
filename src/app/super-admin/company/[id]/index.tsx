import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../../../lib/supabase';

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

type CompanyBrandForm = {
    publicName: string;
    dbaName: string;
    logoUrl: string;
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    serviceCategories: string;
    homeosRating: string;
    homeosRatingCount: string;
    combinedExperienceYears: string;
    licenseNumber: string;
    phone: string;
    website: string;
    shortDescription: string;
};

const defaultBrandForm: CompanyBrandForm = {
    publicName: '',
    dbaName: '',
    logoUrl: '',
    primaryColor: '#071B33',
    secondaryColor: '#FFFFFF',
    accentColor: '#0B5FFF',
    serviceCategories: 'Plumbing',
    homeosRating: '0',
    homeosRatingCount: '0',
    combinedExperienceYears: '0',
    licenseNumber: '',
    phone: '',
    website: '',
    shortDescription: '',
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
    const [brandForm, setBrandForm] = useState<CompanyBrandForm>(defaultBrandForm);
    const [message, setMessage] = useState('Loading company...');
    const [savingBrand, setSavingBrand] = useState(false);

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
            .select(`
                id,
                name,
                slug,
                status,
                theme_color,
                public_name,
                dba_name,
                logo_url,
                primary_color,
                secondary_color,
                accent_color,
                service_categories,
                homeos_rating,
                homeos_rating_count,
                combined_experience_years,
                license_number,
                phone,
                website,
                short_description
            `)
            .eq('id', String(id))
            .single();

        if (error) {
            setMessage(`Error loading company: ${error.message}`);
            return;
        }

        const loadedCompany = data as Company;

        setCompany(loadedCompany);
        setBrandForm(companyToBrandForm(loadedCompany));
        setMessage('');
    }

    async function saveBrandProfile() {
        if (!company) {
            setMessage('Load a company before saving.');
            return;
        }

        setSavingBrand(true);
        setMessage('Saving company configuration...');

        const { data, error } = await supabase.rpc('update_company_brand_profile', {
            p_company_id: company.id,
            p_public_name: brandForm.publicName.trim(),
            p_dba_name: brandForm.dbaName.trim(),
            p_logo_url: brandForm.logoUrl.trim(),
            p_primary_color: brandForm.primaryColor.trim(),
            p_secondary_color: brandForm.secondaryColor.trim(),
            p_accent_color: brandForm.accentColor.trim(),
            p_service_categories: parseCategories(brandForm.serviceCategories),
            p_homeos_rating: parseNumber(brandForm.homeosRating),
            p_homeos_rating_count: parseInteger(brandForm.homeosRatingCount),
            p_combined_experience_years: parseInteger(brandForm.combinedExperienceYears),
            p_license_number: brandForm.licenseNumber.trim(),
            p_phone: brandForm.phone.trim(),
            p_website: brandForm.website.trim(),
            p_short_description: brandForm.shortDescription.trim(),
        });

        setSavingBrand(false);

        if (error) {
            setMessage(`Save failed: ${error.message}`);
            return;
        }

        const updatedCompany = data as Company;

        setCompany(updatedCompany);
        setBrandForm(companyToBrandForm(updatedCompany));
        setMessage('Company configuration saved.');
    }

    function updateBrandField(key: keyof CompanyBrandForm, value: string) {
        setBrandForm((current) => ({
            ...current,
            [key]: value,
        }));
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

    const previewName = brandForm.publicName || company?.name || 'Company';
    const previewDba = brandForm.dbaName || 'DBA not set';
    const previewCategories = parseCategories(brandForm.serviceCategories);
    const logoCanPreview = brandForm.logoUrl.trim().startsWith('http');

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{
                padding: 20,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 1180 }}>
                <View
                    style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        gap: 18,
                        marginTop: 16,
                        marginBottom: 22,
                    }}
                >
                    <View style={{ flex: 1 }}>
                        <Text
                            style={{
                                color: '#64748B',
                                fontSize: 13,
                                fontWeight: '800',
                                marginBottom: 8,
                            }}
                        >
                            Super Admin / Company Configuration
                        </Text>

                        <Text
                            style={{
                                fontSize: 36,
                                fontWeight: '900',
                                color: '#071B33',
                                letterSpacing: -0.4,
                            }}
                        >
                            {company?.public_name || company?.name || 'Company'}
                        </Text>

                        <Text
                            style={{
                                color: '#64748B',
                                marginTop: 8,
                                lineHeight: 22,
                                fontWeight: '700',
                                maxWidth: 760,
                            }}
                        >
                            Configure the brand, public card, service categories, ratings, colors, and company identity
                            used by ManagementOS, TechOS, homeowner search, proposals, invoices, and receipts.
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={() => router.push('/super-admin/companies' as any)}
                        activeOpacity={0.82}
                        style={{
                            backgroundColor: '#FFFFFF',
                            borderColor: '#DFE7F1',
                            borderRadius: 16,
                            borderWidth: 1,
                            paddingHorizontal: 18,
                            paddingVertical: 12,
                        }}
                    >
                        <Text
                            style={{
                                color: '#071B33',
                                fontSize: 14,
                                fontWeight: '900',
                            }}
                        >
                            Back to Companies
                        </Text>
                    </TouchableOpacity>
                </View>

                <View
                    style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 22,
                        borderWidth: 1,
                        borderColor: '#DFE7F1',
                        padding: 16,
                        marginBottom: 20,
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}
                >
                    <Text style={{ color: '#64748B', fontWeight: '900' }}>
                        Status: {company?.status || 'ACTIVE'}
                    </Text>
                    <Text style={{ color: '#64748B', fontWeight: '900' }}>
                        Slug: {company?.slug || 'none'}
                    </Text>
                    <Text style={{ color: '#64748B', fontWeight: '900' }}>
                        Theme: {company?.theme_color || '#071B33'}
                    </Text>
                </View>

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

                {company && (
                    <View
                        style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: 24,
                            padding: 20,
                            borderWidth: 1,
                            borderColor: '#E3E8EF',
                            marginBottom: 22,
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 22,
                                fontWeight: '900',
                                color: '#071B33',
                                marginBottom: 8,
                            }}
                        >
                            Company Brand / Profile Configuration
                        </Text>

                        <Text
                            style={{
                                color: '#637083',
                                lineHeight: 21,
                                marginBottom: 18,
                            }}
                        >
                            This controls how the company appears in ManagementOS, TechOS, homeowner search,
                            company cards, proposals, invoices, and future review screens.
                        </Text>

                        <View
                            style={{
                                backgroundColor: '#F8FAFC',
                                borderColor: '#E3E8EF',
                                borderRadius: 24,
                                borderWidth: 1,
                                marginBottom: 20,
                                padding: 18,
                            }}
                        >
                            <View
                                style={{
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 18,
                                    marginBottom: 16,
                                }}
                            >
                                <View style={{ flex: 1 }}>
                                    <Text
                                        style={{
                                            color: '#0B5FFF',
                                            fontSize: 13,
                                            fontWeight: '900',
                                            marginBottom: 6,
                                        }}
                                    >
                                        Live Brand Preview
                                    </Text>
                                    <Text
                                        style={{
                                            color: '#64748B',
                                            fontSize: 14,
                                            fontWeight: '700',
                                            lineHeight: 20,
                                        }}
                                    >
                                        This is how the company card will feel in homeowner search, ManagementOS, TechOS, proposals, and invoices.
                                    </Text>
                                </View>

                                <View
                                    style={{
                                        backgroundColor: brandForm.primaryColor || '#071B33',
                                        borderRadius: 999,
                                        height: 18,
                                        width: 18,
                                    }}
                                />
                            </View>

                            <View
                                style={{
                                    backgroundColor: '#FFFFFF',
                                    borderColor: '#DFE7F1',
                                    borderRadius: 22,
                                    borderWidth: 1,
                                    padding: 18,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 18,
                                }}
                            >
                                {logoCanPreview ? (
                                    <Image
                                        source={{ uri: brandForm.logoUrl.trim() }}
                                        style={{
                                            width: 88,
                                            height: 88,
                                            borderRadius: 20,
                                            backgroundColor: '#F8FAFC',
                                        }}
                                    />
                                ) : (
                                    <View
                                        style={{
                                            width: 88,
                                            height: 88,
                                            borderRadius: 20,
                                            backgroundColor: brandForm.primaryColor || '#071B33',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: brandForm.secondaryColor || '#FFFFFF',
                                                fontSize: 38,
                                                fontWeight: '900',
                                            }}
                                        >
                                            {previewName.slice(0, 1).toUpperCase()}
                                        </Text>
                                    </View>
                                )}

                                <View style={{ flex: 1 }}>
                                    <Text
                                        style={{
                                            color: '#071B33',
                                            fontSize: 24,
                                            fontWeight: '900',
                                        }}
                                    >
                                        {previewName}
                                    </Text>
                                    <Text
                                        style={{
                                            color: brandForm.accentColor || '#0B5FFF',
                                            marginTop: 4,
                                            fontSize: 14,
                                            fontWeight: '900',
                                        }}
                                    >
                                        {previewDba}
                                    </Text>
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            color: '#64748B',
                                            marginTop: 8,
                                            fontSize: 13,
                                            fontWeight: '700',
                                            lineHeight: 19,
                                        }}
                                    >
                                        {brandForm.shortDescription || 'Short company description will appear here.'}
                                    </Text>

                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            flexWrap: 'wrap',
                                            gap: 8,
                                            marginTop: 12,
                                        }}
                                    >
                                        {(previewCategories.length ? previewCategories : ['No categories']).map((category) => (
                                            <View
                                                key={category}
                                                style={{
                                                    backgroundColor: '#EEF4FF',
                                                    borderRadius: 999,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 6,
                                                }}
                                            >
                                                <Text
                                                    style={{
                                                        color: '#0B5FFF',
                                                        fontSize: 12,
                                                        fontWeight: '900',
                                                    }}
                                                >
                                                    {category}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>

                                <View
                                    style={{
                                        alignItems: 'flex-start',
                                        backgroundColor: '#F8FAFC',
                                        borderColor: '#E3E8EF',
                                        borderRadius: 18,
                                        borderWidth: 1,
                                        padding: 14,
                                        minWidth: 150,
                                    }}
                                >
                                    <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '900' }}>HomeOS Rating</Text>
                                    <Text style={{ color: '#071B33', fontSize: 30, fontWeight: '900', marginTop: 4 }}>
                                        {brandForm.homeosRating || '0'}
                                    </Text>
                                    <Text style={{ color: '#64748B', fontSize: 20, fontWeight: '900' }}>star rating</Text>
                                    <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
                                        {brandForm.homeosRatingCount || '0'} ratings
                                    </Text>
                                    <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
                                        {brandForm.combinedExperienceYears || '0'} years combined
                                    </Text>
                                </View>
                            </View>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                            <Field label="Public Name" value={brandForm.publicName} onChangeText={(value) => updateBrandField('publicName', value)} />
                            <Field label="DBA Name" value={brandForm.dbaName} onChangeText={(value) => updateBrandField('dbaName', value)} />
                            <Field label="Logo URL" value={brandForm.logoUrl} onChangeText={(value) => updateBrandField('logoUrl', value)} />
                            <Field label="Primary Color" value={brandForm.primaryColor} onChangeText={(value) => updateBrandField('primaryColor', value)} />
                            <Field label="Secondary Color" value={brandForm.secondaryColor} onChangeText={(value) => updateBrandField('secondaryColor', value)} />
                            <Field label="Accent Color" value={brandForm.accentColor} onChangeText={(value) => updateBrandField('accentColor', value)} />
                            <Field label="Service Categories" value={brandForm.serviceCategories} onChangeText={(value) => updateBrandField('serviceCategories', value)} />
                            <Field label="HomeOS Rating" value={brandForm.homeosRating} onChangeText={(value) => updateBrandField('homeosRating', value)} />
                            <Field label="Rating Count" value={brandForm.homeosRatingCount} onChangeText={(value) => updateBrandField('homeosRatingCount', value)} />
                            <Field label="Combined Experience Years" value={brandForm.combinedExperienceYears} onChangeText={(value) => updateBrandField('combinedExperienceYears', value)} />
                            <Field label="License Number" value={brandForm.licenseNumber} onChangeText={(value) => updateBrandField('licenseNumber', value)} />
                            <Field label="Phone" value={brandForm.phone} onChangeText={(value) => updateBrandField('phone', value)} />
                            <Field label="Website" value={brandForm.website} onChangeText={(value) => updateBrandField('website', value)} />
                            <Field label="Short Description" value={brandForm.shortDescription} onChangeText={(value) => updateBrandField('shortDescription', value)} multiline />
                        </View>

                        <Text style={{ color: '#637083', marginTop: 12, lineHeight: 20 }}>
                            Categories: {previewCategories.length ? previewCategories.join(', ') : 'none'}
                        </Text>

                        <TouchableOpacity
                            onPress={saveBrandProfile}
                            disabled={savingBrand}
                            style={{
                                backgroundColor: '#071B33',
                                padding: 16,
                                borderRadius: 16,
                                alignItems: 'center',
                                marginTop: 16,
                            }}
                        >
                            <Text
                                style={{
                                    color: '#FFFFFF',
                                    fontSize: 16,
                                    fontWeight: '900',
                                }}
                            >
                                {savingBrand ? 'Saving...' : 'Save Company Configuration'}
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

function Field({
    label,
    value,
    onChangeText,
    multiline,
}: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    multiline?: boolean;
}) {
    return (
        <View style={{ width: '48%', minWidth: 260 }}>
            <Text
                style={{
                    color: '#071B33',
                    fontWeight: '900',
                    marginBottom: 6,
                }}
            >
                {label}
            </Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                multiline={multiline}
                style={{
                    backgroundColor: '#F3F6FA',
                    borderRadius: 16,
                    padding: 14,
                    minHeight: multiline ? 96 : 50,
                    borderWidth: 1,
                    borderColor: '#E3E8EF',
                    color: '#071B33',
                }}
            />
        </View>
    );
}

function companyToBrandForm(company: Company): CompanyBrandForm {
    return {
        publicName: company.public_name || company.name || '',
        dbaName: company.dba_name || '',
        logoUrl: company.logo_url || '',
        primaryColor: company.primary_color || company.theme_color || '#071B33',
        secondaryColor: company.secondary_color || '#FFFFFF',
        accentColor: company.accent_color || '#0B5FFF',
        serviceCategories: (company.service_categories || []).join(', '),
        homeosRating: valueToString(company.homeos_rating),
        homeosRatingCount: valueToString(company.homeos_rating_count),
        combinedExperienceYears: valueToString(company.combined_experience_years),
        licenseNumber: company.license_number || '',
        phone: company.phone || '',
        website: company.website || '',
        shortDescription: company.short_description || '',
    };
}

function parseCategories(value: string) {
    return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseNumber(value: string) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
}

function parseInteger(value: string) {
    const parsed = Number.parseInt(value, 10);

    return Number.isFinite(parsed) ? parsed : 0;
}

function valueToString(value: string | number | null | undefined) {
    if (value === null || value === undefined) return '';

    return String(value);
}
