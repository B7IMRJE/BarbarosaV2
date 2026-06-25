import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

const brandColorSwatches = [
    '#071B33',
    '#0B2E59',
    '#0B5FFF',
    '#1D4ED8',
    '#E11D2E',
    '#DC2626',
    '#F59E0B',
    '#D97706',
    '#047857',
    '#111827',
    '#FFFFFF',
    '#F8FAFC',
];

const serviceCategoryOptions = [
    'Plumbing',
    'Repipe',
    'Water Heaters',
    'Leak Detection',
    'Slab Leak',
    'Drain Cleaning',
    'Sewer',
    'Gas',
    'Water Treatment',
    'HVAC',
    'Electrical',
    'Roofing',
    'Restoration',
    'Remodeling',
    'Handyman',
    'Property Management',
];

const brandThemePresets = [
    {
        name: 'Repipe 1 Starter',
        primaryColor: '#0B2E59',
        secondaryColor: '#FFFFFF',
        accentColor: '#E11D2E',
    },
    {
        name: 'Blue / White',
        primaryColor: '#071B33',
        secondaryColor: '#FFFFFF',
        accentColor: '#0B5FFF',
    },
    {
        name: 'Black / Gold',
        primaryColor: '#111827',
        secondaryColor: '#FFFFFF',
        accentColor: '#D97706',
    },
    {
        name: 'Green / White',
        primaryColor: '#064E3B',
        secondaryColor: '#FFFFFF',
        accentColor: '#10B981',
    },
];
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

    function toggleServiceCategory(category: string) {
        setBrandForm((current) => {
            const selected = parseCategories(current.serviceCategories);
            const exists = selected.includes(category);
            const nextCategories = exists
                ? selected.filter((selectedCategory) => selectedCategory !== category)
                : [...selected, category];

            return {
                ...current,
                serviceCategories: nextCategories.join(', '),
            };
        });
    }

    function applyRepipeOnePreset() {
        setBrandForm((current) => ({
            ...current,
            publicName: 'Repipe 1',
            dbaName: 'Repipe 1',
            primaryColor: '#0B2E59',
            secondaryColor: '#FFFFFF',
            accentColor: '#E11D2E',
            serviceCategories: current.serviceCategories || 'Repipe, Plumbing, Leak Detection',
            shortDescription: current.shortDescription || 'Professional repipe and plumbing services.',
        }));
        setMessage('Repipe 1 starter branding applied. Save to keep it.');
    }

    function applyThemePreset(preset: (typeof brandThemePresets)[number]) {
        setBrandForm((current) => ({
            ...current,
            primaryColor: preset.primaryColor,
            secondaryColor: preset.secondaryColor,
            accentColor: preset.accentColor,
        }));
        setMessage(preset.name + ' colors applied. Save to keep them.');
    }

    async function extractThemeFromLogo() {
        const logoUrl = brandForm.logoUrl.trim();

        if (!logoUrl) {
            setMessage('Paste a Logo URL first, then extract colors.');
            return;
        }

        setMessage('Extracting theme colors from logo...');

        try {
            const colors = await extractLogoThemeColors(logoUrl);
            setBrandForm((current) => ({
                ...current,
                primaryColor: colors.primaryColor,
                secondaryColor: colors.secondaryColor,
                accentColor: colors.accentColor,
            }));
            setMessage('Logo colors extracted. Review the preview, then save.');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setMessage('Could not extract logo colors: ' + errorMessage);
        }
    }

    async function uploadCompanyLogo() {
        if (!company) {
            setMessage('Load a company before uploading a logo.');
            return;
        }

        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

        if (!permission.granted) {
            setMessage('Photo library permission is required to upload a logo.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.9,
        });

        if (result.canceled || !result.assets?.[0]) {
            return;
        }

        setSavingBrand(true);
        setMessage('Uploading company logo...');

        try {
            const asset = result.assets[0];
            const response = await fetch(asset.uri);
            const arrayBuffer = await response.arrayBuffer();
            const extension = getFileExtension(asset.fileName || asset.uri);
            const filePath = 'company-logos/' + company.id + '/' + Date.now() + '.' + extension;

            const { error: uploadError } = await supabase.storage.from('item-files').upload(filePath, arrayBuffer, {
                contentType: asset.mimeType || 'image/' + extension,
                upsert: true,
            });

            if (uploadError) {
                throw uploadError;
            }

            const { data } = supabase.storage.from('item-files').getPublicUrl(filePath);
            const publicUrl = data.publicUrl;

            setBrandForm((current) => ({
                ...current,
                logoUrl: publicUrl,
            }));

            try {
                const colors = await extractLogoThemeColors(publicUrl);
                setBrandForm((current) => ({
                    ...current,
                    logoUrl: publicUrl,
                    primaryColor: colors.primaryColor,
                    secondaryColor: colors.secondaryColor,
                    accentColor: colors.accentColor,
                }));
                setMessage('Logo uploaded and colors extracted. Save to keep changes.');
            } catch {
                setMessage('Logo uploaded. Save to keep it. Color extraction can be adjusted manually.');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setMessage('Logo upload failed: ' + errorMessage);
        } finally {
            setSavingBrand(false);
        }
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
                    <View
                        style={{
                            backgroundColor: '#ECFDF3',
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                        }}
                    >
                        <Text style={{ color: '#047857', fontSize: 12, fontWeight: '900' }}>
                            {company?.status || 'ACTIVE'}
                        </Text>
                    </View>
                    <Text style={{ color: '#64748B', fontWeight: '900', alignSelf: 'center' }}>
                        Company brand profile
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

                        <Text style={{ color: '#64748B', marginTop: 8, lineHeight: 20, fontWeight: '700' }}>
                            This controls how the company appears to homeowners, staff, proposals, receipts, and company selection screens.
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
                                    <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '900' }}>Company Rating</Text>
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
                        <ConfigSection
                            title="Identity"
                            description="Public-facing company name, DBA, logo link, and short description."
                        >
                            <Field label="Public Name" value={brandForm.publicName} onChangeText={(value) => updateBrandField('publicName', value)} />
                            <Field label="DBA Name" value={brandForm.dbaName} onChangeText={(value) => updateBrandField('dbaName', value)} />
                            <Field label="Logo URL" value={brandForm.logoUrl} onChangeText={(value) => updateBrandField('logoUrl', value)} />
                            <View style={{ width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                <TouchableOpacity
                                    onPress={uploadCompanyLogo}
                                    disabled={savingBrand}
                                    style={{
                                        backgroundColor: '#071B33',
                                        borderRadius: 999,
                                        paddingHorizontal: 14,
                                        paddingVertical: 10,
                                    }}
                                >
                                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>
                                        Upload Logo
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={extractThemeFromLogo}
                                    disabled={savingBrand}
                                    style={{
                                        backgroundColor: '#EEF4FF',
                                        borderColor: '#CFE0FF',
                                        borderRadius: 999,
                                        borderWidth: 1,
                                        paddingHorizontal: 14,
                                        paddingVertical: 10,
                                    }}
                                >
                                    <Text style={{ color: '#0B5FFF', fontSize: 12, fontWeight: '900' }}>
                                        Extract colors from current logo
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <Field label="Short Description" value={brandForm.shortDescription} onChangeText={(value) => updateBrandField('shortDescription', value)} multiline />
                        </ConfigSection>

                        <ConfigSection
                            title="Brand Colors"
                            description="Company colors used for company cards, TechOS, proposals, invoices, and receipts."
                        >
                            <Field label="Primary Color" value={brandForm.primaryColor} onChangeText={(value) => updateBrandField('primaryColor', value)} />
                            <Field label="Secondary Color" value={brandForm.secondaryColor} onChangeText={(value) => updateBrandField('secondaryColor', value)} />
                            <Field label="Accent Color" value={brandForm.accentColor} onChangeText={(value) => updateBrandField('accentColor', value)} />

                            <View style={{ width: '100%', gap: 12, marginTop: 4 }}>
                                <Text style={{ color: '#071B33', fontSize: 13, fontWeight: '900' }}>
                                    Quick theme tools
                                </Text>

                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                    <TouchableOpacity
                                        onPress={applyRepipeOnePreset}
                                        style={{
                                            backgroundColor: '#071B33',
                                            borderRadius: 999,
                                            paddingHorizontal: 14,
                                            paddingVertical: 10,
                                        }}
                                    >
                                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>
                                            Apply Repipe 1 preset
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={extractThemeFromLogo}
                                        style={{
                                            backgroundColor: '#EEF4FF',
                                            borderColor: '#CFE0FF',
                                            borderRadius: 999,
                                            borderWidth: 1,
                                            paddingHorizontal: 14,
                                            paddingVertical: 10,
                                        }}
                                    >
                                        <Text style={{ color: '#0B5FFF', fontSize: 12, fontWeight: '900' }}>
                                            Extract colors from Logo URL
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                    {brandThemePresets.map((preset) => (
                                        <TouchableOpacity
                                            key={preset.name}
                                            onPress={() => applyThemePreset(preset)}
                                            style={{
                                                backgroundColor: '#FFFFFF',
                                                borderColor: '#E3E8EF',
                                                borderRadius: 14,
                                                borderWidth: 1,
                                                padding: 10,
                                                minWidth: 150,
                                            }}
                                        >
                                            <View style={{ flexDirection: 'row', gap: 5, marginBottom: 8 }}>
                                                {[preset.primaryColor, preset.secondaryColor, preset.accentColor].map((color) => (
                                                    <View
                                                        key={color}
                                                        style={{
                                                            width: 18,
                                                            height: 18,
                                                            borderRadius: 999,
                                                            backgroundColor: color,
                                                            borderColor: '#CBD5E1',
                                                            borderWidth: 1,
                                                        }}
                                                    />
                                                ))}
                                            </View>
                                            <Text style={{ color: '#071B33', fontSize: 12, fontWeight: '900' }}>
                                                {preset.name}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <ColorSwatchRow
                                    label="Primary swatches"
                                    value={brandForm.primaryColor}
                                    onSelect={(color) => updateBrandField('primaryColor', color)}
                                />
                                <ColorSwatchRow
                                    label="Secondary swatches"
                                    value={brandForm.secondaryColor}
                                    onSelect={(color) => updateBrandField('secondaryColor', color)}
                                />
                                <ColorSwatchRow
                                    label="Accent swatches"
                                    value={brandForm.accentColor}
                                    onSelect={(color) => updateBrandField('accentColor', color)}
                                />
                            </View>
                        </ConfigSection>

                        <ConfigSection
                            title="Services / Trust Profile"
                            description="Ratings, service categories, license details, and experience shown to homeowners."
                        >
                            <Field label="Service Categories" value={brandForm.serviceCategories} onChangeText={(value) => updateBrandField('serviceCategories', value)} />
                            <CategoryChipSelector
                                selectedCategories={parseCategories(brandForm.serviceCategories)}
                                onToggle={toggleServiceCategory}
                            />
                            <Field label="Company Rating" value={brandForm.homeosRating} onChangeText={(value) => updateBrandField('homeosRating', value)} />
                            <Field label="Rating Count" value={brandForm.homeosRatingCount} onChangeText={(value) => updateBrandField('homeosRatingCount', value)} />
                            <Field label="Combined Experience Years" value={brandForm.combinedExperienceYears} onChangeText={(value) => updateBrandField('combinedExperienceYears', value)} />
                            <Field label="License Number" value={brandForm.licenseNumber} onChangeText={(value) => updateBrandField('licenseNumber', value)} />
                        </ConfigSection>

                        <ConfigSection
                            title="Contact"
                            description="Contact information shown on company cards and customer-facing screens."
                        >
                            <Field label="Phone" value={brandForm.phone} onChangeText={(value) => updateBrandField('phone', value)} />
                            <Field label="Website" value={brandForm.website} onChangeText={(value) => updateBrandField('website', value)} />
                        </ConfigSection>

                        <View
                            style={{
                                backgroundColor: '#F8FAFC',
                                borderColor: '#E3E8EF',
                                borderRadius: 16,
                                borderWidth: 1,
                                marginTop: 4,
                                padding: 14,
                            }}
                        >
                            <Text style={{ color: '#071B33', fontSize: 13, fontWeight: '900', marginBottom: 5 }}>
                                Service category preview
                            </Text>
                            <Text style={{ color: '#64748B', lineHeight: 20, fontWeight: '700' }}>
                                {previewCategories.length ? previewCategories.join('  /  ') : 'none'}
                            </Text>
                        </View>

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

                <View
                    style={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#DFE7F1',
                        borderRadius: 24,
                        borderWidth: 1,
                        padding: 20,
                    }}
                >
                    <View
                        style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 16,
                            marginBottom: 18,
                        }}
                    >
                        <View style={{ flex: 1 }}>
                            <Text
                                style={{
                                    fontSize: 22,
                                    fontWeight: '900',
                                    color: '#071B33',
                                }}
                            >
                                Company Admin Modules
                            </Text>
                            <Text
                                style={{
                                    color: '#64748B',
                                    fontWeight: '700',
                                    lineHeight: 20,
                                    marginTop: 6,
                                }}
                            >
                                Manage the operational areas connected to this company account.
                            </Text>
                        </View>

                        <View
                            style={{
                                backgroundColor: '#EEF4FF',
                                borderRadius: 999,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                            }}
                        >
                            <Text style={{ color: '#0B5FFF', fontSize: 12, fontWeight: '900' }}>
                                {cards.length} modules
                            </Text>
                        </View>
                    </View>

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
                                activeOpacity={0.82}
                                style={{
                                    width: '31%',
                                    minWidth: 240,
                                    minHeight: 82,
                                    backgroundColor: '#F8FAFC',
                                    borderRadius: 18,
                                    padding: 14,
                                    borderWidth: 1,
                                    borderColor: '#E3E8EF',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 12,
                                }}
                            >
                                <View
                                    style={{
                                        width: 42,
                                        height: 42,
                                        borderRadius: 14,
                                        backgroundColor: '#EEF4FF',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Text style={{ color: '#0B5FFF', fontSize: 12, fontWeight: '900' }}>
                                        {card.slice(0, 2).toUpperCase()}
                                    </Text>
                                </View>

                                <View style={{ flex: 1 }}>
                                    <Text
                                        style={{
                                            fontSize: 16,
                                            fontWeight: '900',
                                            color: '#071B33',
                                        }}
                                    >
                                        {card}
                                    </Text>
                                    <Text
                                        style={{
                                            color: '#64748B',
                                            fontSize: 12,
                                            fontWeight: '700',
                                            marginTop: 4,
                                        }}
                                    >
                                        Open {card.toLowerCase()} tools
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </View>
        </ScrollView>
    );
}

function getFileExtension(fileName: string) {
    const cleanName = fileName.split('?')[0] || '';
    const extension = cleanName.includes('.') ? cleanName.split('.').pop()?.toLowerCase() : 'jpg';

    if (!extension || extension.length > 5) {
        return 'jpg';
    }

    if (extension === 'jpeg') {
        return 'jpg';
    }

    return extension;
}
function CategoryChipSelector({
    selectedCategories,
    onToggle,
}: {
    selectedCategories: string[];
    onToggle: (category: string) => void;
}) {
    return (
        <View style={{ width: '100%', marginTop: 4 }}>
            <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '900', marginBottom: 8 }}>
                Select service categories
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {serviceCategoryOptions.map((category) => {
                    const selected = selectedCategories.includes(category);

                    return (
                        <TouchableOpacity
                            key={category}
                            onPress={() => onToggle(category)}
                            style={{
                                backgroundColor: selected ? '#071B33' : '#FFFFFF',
                                borderColor: selected ? '#071B33' : '#CBD5E1',
                                borderRadius: 999,
                                borderWidth: 1,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                            }}
                        >
                            <Text
                                style={{
                                    color: selected ? '#FFFFFF' : '#334155',
                                    fontSize: 12,
                                    fontWeight: '900',
                                }}
                            >
                                {category}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

function ColorSwatchRow({
    label,
    value,
    onSelect,
}: {
    label: string;
    value: string;
    onSelect: (color: string) => void;
}) {
    return (
        <View style={{ width: '100%' }}>
            <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '900', marginBottom: 8 }}>
                {label}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {brandColorSwatches.map((color) => {
                    const selected = value.toUpperCase() === color.toUpperCase();

                    return (
                        <TouchableOpacity
                            key={`${label}-${color}`}
                            onPress={() => onSelect(color)}
                            style={{
                                width: 34,
                                height: 34,
                                borderRadius: 999,
                                backgroundColor: color,
                                borderColor: selected ? '#071B33' : '#CBD5E1',
                                borderWidth: selected ? 3 : 1,
                            }}
                        />
                    );
                })}
            </View>
        </View>
    );
}

function extractLogoThemeColors(logoUrl: string): Promise<{
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
}> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return Promise.reject(new Error('Color extraction is available in the web app only right now.'));
    }

    return new Promise((resolve, reject) => {
        const image = new window.Image();
        image.crossOrigin = 'anonymous';

        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                const size = 64;
                canvas.width = size;
                canvas.height = size;

                const context = canvas.getContext('2d');

                if (!context) {
                    reject(new Error('Could not read logo pixels.'));
                    return;
                }

                context.drawImage(image, 0, 0, size, size);

                const pixels = context.getImageData(0, 0, size, size).data;
                const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();

                for (let i = 0; i < pixels.length; i += 16) {
                    const alpha = pixels[i + 3];

                    if (alpha < 180) {
                        continue;
                    }

                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];
                    const hsl = rgbToHsl(r, g, b);

                    if (hsl.s < 0.12 || hsl.l < 0.08 || hsl.l > 0.92) {
                        continue;
                    }

                    const qr = clampByte(Math.round(r / 24) * 24);
                    const qg = clampByte(Math.round(g / 24) * 24);
                    const qb = clampByte(Math.round(b / 24) * 24);
                    const key = rgbToHex(qr, qg, qb);
                    const current = buckets.get(key) || { count: 0, r: qr, g: qg, b: qb };

                    buckets.set(key, {
                        ...current,
                        count: current.count + 1,
                    });
                }

                const colors = Array.from(buckets.values()).sort((a, b) => b.count - a.count);

                if (!colors.length) {
                    reject(new Error('No strong logo colors found. Try a clearer logo image.'));
                    return;
                }

                const primary = colors[0];
                const accent = colors.find((color) => colorDistance(color, primary) > 90) || colors[1] || primary;
                const secondaryColor = getLuma(primary) < 150 ? '#FFFFFF' : '#071B33';

                resolve({
                    primaryColor: rgbToHex(primary.r, primary.g, primary.b),
                    secondaryColor,
                    accentColor: rgbToHex(accent.r, accent.g, accent.b),
                });
            } catch (error) {
                reject(new Error('Logo URL blocked color reading. Try an uploaded image URL or direct image link.'));
            }
        };

        image.onerror = () => reject(new Error('Logo image could not be loaded.'));
        image.src = logoUrl;
    });
}

function clampByte(value: number) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(r: number, g: number, b: number) {
    return `#${[r, g, b].map((value) => clampByte(value).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function getLuma(color: { r: number; g: number; b: number }) {
    return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

function colorDistance(
    first: { r: number; g: number; b: number },
    second: { r: number; g: number; b: number }
) {
    return Math.sqrt(
        (first.r - second.r) ** 2 +
        (first.g - second.g) ** 2 +
        (first.b - second.b) ** 2
    );
}

function rgbToHsl(r: number, g: number, b: number) {
    const nr = r / 255;
    const ng = g / 255;
    const nb = b / 255;
    const max = Math.max(nr, ng, nb);
    const min = Math.min(nr, ng, nb);
    const l = (max + min) / 2;

    if (max === min) {
        return { h: 0, s: 0, l };
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;

    if (max === nr) {
        h = (ng - nb) / d + (ng < nb ? 6 : 0);
    } else if (max === ng) {
        h = (nb - nr) / d + 2;
    } else {
        h = (nr - ng) / d + 4;
    }

    return { h: h / 6, s, l };
}
function ConfigSection({
    title,
    description,
    children,
}: {
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <View
            style={{
                backgroundColor: '#F8FAFC',
                borderColor: '#E3E8EF',
                borderRadius: 20,
                borderWidth: 1,
                marginBottom: 16,
                padding: 16,
            }}
        >
            <Text style={{ color: '#071B33', fontSize: 18, fontWeight: '900', marginBottom: 4 }}>
                {title}
            </Text>
            <Text style={{ color: '#64748B', fontWeight: '700', lineHeight: 20, marginBottom: 14 }}>
                {description}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {children}
            </View>
        </View>
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
