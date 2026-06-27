import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
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

type BrandColorKey = 'primaryColor' | 'secondaryColor' | 'accentColor';
type ConfigSectionKey = 'identity' | 'theme' | 'services';

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
        name: 'Navy / Red',
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
    'Company Profile / Identity',
    'Theme & Brand Colors',
    'Services & Trust Profile',
    'Customers / Clients',
    'Team / Technicians',
    'TechOS',
    'ManagementOS',
];

export default function CompanyDashboardScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const { width: viewportWidth } = useWindowDimensions();
    const isPhoneLayout = viewportWidth <= 640;
    const pagePadding = isPhoneLayout ? 16 : 20;
    const heroLogoSize = isPhoneLayout ? 72 : 86;
    const previewLogoSize = isPhoneLayout ? 72 : 88;
    const [company, setCompany] = useState<Company | null>(null);
    const [brandForm, setBrandForm] = useState<CompanyBrandForm>(defaultBrandForm);
    const [message, setMessage] = useState('Loading company...');
    const [savingBrand, setSavingBrand] = useState(false);
    const [extractedLogoColors, setExtractedLogoColors] = useState<string[]>([]);
    const [expandedConfigSection, setExpandedConfigSection] = useState<ConfigSectionKey | null>(null);

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

    function updateBrandColorSlot(slot: BrandColorKey, color: string) {
        updateBrandField(slot, color);
        setMessage('Custom color applied. Save to keep it.');
    }

    function swapBrandColors(first: BrandColorKey, second: BrandColorKey) {
        setBrandForm((current) => ({
            ...current,
            [first]: current[second],
            [second]: current[first],
        }));
        setMessage('Theme colors swapped. Save to keep changes.');
    }
    function applyStarterBrandPreset() {
        setBrandForm((current) => ({
            ...current,
            primaryColor: '#0B2E59',
            secondaryColor: '#FFFFFF',
            accentColor: '#E11D2E',
            serviceCategories: current.serviceCategories || 'Plumbing, Water Heaters, Leak Detection',
        }));
        setMessage('Starter brand colors applied. Save to keep them.');
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
            setExtractedLogoColors(colors.palette);
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
                setExtractedLogoColors(colors.palette);
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
        if (card === 'Company Profile / Identity') {
            toggleConfigSection('identity');
            return;
        }

        if (card === 'Theme & Brand Colors') {
            toggleConfigSection('theme');
            return;
        }

        if (card === 'Services & Trust Profile') {
            toggleConfigSection('services');
            return;
        }

        if (card === 'Team / Technicians') {
            router.push(`/super-admin/company/${id}/users` as any);
            return;
        }

        if (card === 'Customers / Clients') {
            router.push(`/super-admin/company/${id}/clients` as any);
            return;
        }

        if (card === 'ManagementOS') {
            router.push(`/super-admin/company/${id}/connections` as any);
            return;
        }

        if (card === 'TechOS') {
            router.push({
                pathname: '/techos',
                params: { companyId: String(id) },
            } as any);
            return;
        }

        alert(`${card} module comes next.`);
    }

    function toggleConfigSection(section: ConfigSectionKey) {
        setExpandedConfigSection((current) => (current === section ? null : section));
    }

    const previewName = brandForm.publicName || company?.name || 'Company';
    const previewDba = brandForm.dbaName || 'DBA not set';
    const previewCategories = parseCategories(brandForm.serviceCategories);
    const logoCanPreview = brandForm.logoUrl.trim().startsWith('http');
    const brandPrimary = brandForm.primaryColor || '#071B33';
    const brandSecondary = brandForm.secondaryColor || '#FFFFFF';
    const brandAccent = brandForm.accentColor || '#0B5FFF';
    const brandHeaderText = getReadableColor(brandPrimary);

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{
                padding: pagePadding,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 1180, minWidth: 0 }}>
                <View
                    style={{
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: 0,
                        backgroundColor: brandPrimary,
                        borderRadius: 28,
                        borderWidth: 1,
                        borderColor: brandAccent,
                        padding: isPhoneLayout ? 18 : 22,
                        marginTop: 16,
                        marginBottom: 22,
                    }}
                >
                    <View
                        style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 18,
                            marginBottom: 22,
                            minWidth: 0,
                        }}
                    >
                        <View style={{ flex: 1, minWidth: 0, maxWidth: '100%' }}>
                            <Text
                                style={{
                                    color: brandHeaderText,
                                    fontSize: 13,
                                    fontWeight: '900',
                                    marginBottom: 8,
                                    opacity: 0.78,
                                }}
                            >
                                Company Management Home
                            </Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, minWidth: 0 }}>
                                {logoCanPreview ? (
                                    <Image
                                        source={{ uri: brandForm.logoUrl.trim() }}
                                        style={{
                                            width: heroLogoSize,
                                            height: heroLogoSize,
                                            borderRadius: 24,
                                            backgroundColor: brandSecondary,
                                            flexShrink: 0,
                                        }}
                                    />
                                ) : (
                                    <View
                                        style={{
                                            width: heroLogoSize,
                                            height: heroLogoSize,
                                            borderRadius: 24,
                                            backgroundColor: brandSecondary,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: getReadableColor(brandSecondary),
                                                fontSize: 38,
                                                fontWeight: '900',
                                            }}
                                        >
                                            {previewName.slice(0, 1).toUpperCase()}
                                        </Text>
                                    </View>
                                )}

                                <View style={{ flex: 1, maxWidth: '100%', minWidth: isPhoneLayout ? 0 : 260 }}>
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            color: brandHeaderText,
                                            fontSize: isPhoneLayout ? 30 : 36,
                                            fontWeight: '900',
                                            flexShrink: 1,
                                        }}
                                    >
                                        {previewName}
                                    </Text>
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            color: brandAccent,
                                            fontSize: 16,
                                            fontWeight: '900',
                                            marginTop: 4,
                                            flexShrink: 1,
                                        }}
                                    >
                                        {previewDba}
                                    </Text>
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            color: brandHeaderText,
                                            fontSize: 14,
                                            fontWeight: '700',
                                            lineHeight: 20,
                                            marginTop: 8,
                                            opacity: 0.84,
                                        }}
                                    >
                                        {brandForm.shortDescription || 'Company profile details and customer-facing brand settings.'}
                                    </Text>
                                </View>
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={() => router.push('/super-admin/companies' as any)}
                            activeOpacity={0.82}
                            style={{
                                alignSelf: 'flex-start',
                                maxWidth: '100%',
                                backgroundColor: brandSecondary,
                                borderRadius: 16,
                                paddingHorizontal: 18,
                                paddingVertical: 12,
                            }}
                        >
                            <Text
                                numberOfLines={1}
                                style={{
                                    color: getReadableColor(brandSecondary),
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
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            gap: 10,
                            maxWidth: '100%',
                            minWidth: 0,
                        }}
                    >
                        <BrandInfoPill label="Status" value={company?.status || 'Active'} textColor={brandHeaderText} />
                        <BrandInfoPill label="License" value={brandForm.licenseNumber || 'Not set'} textColor={brandHeaderText} />
                        <BrandInfoPill
                            label="Experience"
                            value={`${brandForm.combinedExperienceYears || '0'} years`}
                            textColor={brandHeaderText}
                        />
                        {(previewCategories.length ? previewCategories.slice(0, 4) : ['Services not set']).map((category) => (
                            <BrandInfoPill key={category} label="Service" value={category} textColor={brandHeaderText} />
                        ))}
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18, maxWidth: '100%', minWidth: 0 }}>
                        {[brandPrimary, brandSecondary, brandAccent].map((color) => (
                            <View
                                key={color}
                                style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 999,
                                    backgroundColor: color,
                                    borderColor: 'rgba(255,255,255,0.7)',
                                    borderWidth: 1,
                                }}
                            />
                        ))}
                    </View>
                </View>

                <View
                    style={{
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: 0,
                        backgroundColor: '#FFFFFF',
                        borderColor: '#DFE7F1',
                        borderRadius: 24,
                        borderWidth: 1,
                        padding: isPhoneLayout ? 16 : 20,
                        marginBottom: 22,
                    }}
                >
                    <View
                        style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 16,
                            marginBottom: 18,
                            minWidth: 0,
                        }}
                    >
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                                style={{
                                    fontSize: 22,
                                    fontWeight: '900',
                                    color: '#071B33',
                                }}
                            >
                                Company Management
                            </Text>
                            <Text
                                style={{
                                    color: '#64748B',
                                    fontWeight: '700',
                                    lineHeight: 20,
                                    marginTop: 6,
                                }}
                            >
                                Manage the company profile, customers, team, and operating workspaces from one place.
                            </Text>
                        </View>

                        <View
                            style={{
                                alignSelf: 'flex-start',
                                maxWidth: '100%',
                                backgroundColor: '#EEF4FF',
                                borderRadius: 999,
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                            }}
                        >
                            <Text numberOfLines={1} style={{ color: brandAccent, fontSize: 12, fontWeight: '900' }}>
                                {cards.length} core modules
                            </Text>
                        </View>
                    </View>

                    <View
                        style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            gap: 12,
                            width: '100%',
                            minWidth: 0,
                        }}
                    >
                        {cards.map((card) => (
                            <CompanyModuleCard
                                key={card}
                                title={card}
                                description={getModuleDescription(card)}
                                actionLabel={getModuleActionLabel(card)}
                                isExpanded={
                                    (card === 'Company Profile / Identity' && expandedConfigSection === 'identity') ||
                                    (card === 'Theme & Brand Colors' && expandedConfigSection === 'theme') ||
                                    (card === 'Services & Trust Profile' && expandedConfigSection === 'services')
                                }
                                primaryColor={brandPrimary}
                                accentColor={brandAccent}
                                onPress={() => openModule(card)}
                            />
                        ))}
                    </View>
                </View>

                {company && (
                    <View
                        style={{
                            width: '100%',
                            maxWidth: '100%',
                            minWidth: 0,
                            backgroundColor: '#FFFFFF',
                            borderRadius: 24,
                            padding: isPhoneLayout ? 16 : 20,
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
                            Company Configuration Editor
                        </Text>

                        <Text
                            style={{
                                color: '#637083',
                                lineHeight: 21,
                                marginBottom: 18,
                            }}
                        >
                            Open a management section above or use the section headers below to update the company
                            profile, theme, services, trust details, and contact information.
                        </Text>

                        <View
                            style={{
                                backgroundColor: '#F8FAFC',
                                borderColor: '#E3E8EF',
                                borderRadius: 24,
                                borderWidth: 1,
                                marginBottom: 20,
                                padding: isPhoneLayout ? 14 : 18,
                                minWidth: 0,
                            }}
                        >
                            <View
                                style={{
                                    flexDirection: 'row',
                                    flexWrap: 'wrap',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 18,
                                    marginBottom: 16,
                                    minWidth: 0,
                                }}
                            >
                                <View style={{ flex: 1, minWidth: 0 }}>
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
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                    gap: 18,
                                    minWidth: 0,
                                }}
                            >
                                {logoCanPreview ? (
                                    <Image
                                        source={{ uri: brandForm.logoUrl.trim() }}
                                        style={{
                                            width: previewLogoSize,
                                            height: previewLogoSize,
                                            borderRadius: 20,
                                            backgroundColor: '#F8FAFC',
                                            flexShrink: 0,
                                        }}
                                    />
                                ) : (
                                    <View
                                        style={{
                                            width: previewLogoSize,
                                            height: previewLogoSize,
                                            borderRadius: 20,
                                            backgroundColor: brandForm.primaryColor || '#071B33',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
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

                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            color: '#071B33',
                                            fontSize: isPhoneLayout ? 21 : 24,
                                            fontWeight: '900',
                                            flexShrink: 1,
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
                                                    maxWidth: '100%',
                                                    flexShrink: 1,
                                                    backgroundColor: '#EEF4FF',
                                                    borderRadius: 999,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 6,
                                                }}
                                            >
                                                <Text
                                                    numberOfLines={1}
                                                    style={{
                                                        color: '#0B5FFF',
                                                        fontSize: 12,
                                                        fontWeight: '900',
                                                        flexShrink: 1,
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
                                        width: isPhoneLayout ? '100%' : undefined,
                                        maxWidth: '100%',
                                        minWidth: isPhoneLayout ? 0 : 150,
                                        backgroundColor: '#F8FAFC',
                                        borderColor: '#E3E8EF',
                                        borderRadius: 18,
                                        borderWidth: 1,
                                        padding: 14,
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
                        <CollapsibleConfigSection
                            title="Company Profile / Identity"
                            description="Public-facing company name, DBA, logo link, and short description."
                            expanded={expandedConfigSection === 'identity'}
                            accentColor={brandAccent}
                            onToggle={() => toggleConfigSection('identity')}
                        >
                            <Field label="Public Name" value={brandForm.publicName} onChangeText={(value) => updateBrandField('publicName', value)} />
                            <Field label="DBA Name" value={brandForm.dbaName} onChangeText={(value) => updateBrandField('dbaName', value)} />
                            <Field label="Logo URL" value={brandForm.logoUrl} onChangeText={(value) => updateBrandField('logoUrl', value)} />
                            <View style={{ width: '100%', maxWidth: '100%', minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                                <TouchableOpacity
                                    onPress={uploadCompanyLogo}
                                    disabled={savingBrand}
                                    style={{
                                        maxWidth: '100%',
                                        flexShrink: 1,
                                        backgroundColor: '#071B33',
                                        borderRadius: 999,
                                        paddingHorizontal: 14,
                                        paddingVertical: 10,
                                    }}
                                >
                                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900', textAlign: 'center' }}>
                                        Upload Logo
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={extractThemeFromLogo}
                                    disabled={savingBrand}
                                    style={{
                                        maxWidth: '100%',
                                        flexShrink: 1,
                                        backgroundColor: '#EEF4FF',
                                        borderColor: '#CFE0FF',
                                        borderRadius: 999,
                                        borderWidth: 1,
                                        paddingHorizontal: 14,
                                        paddingVertical: 10,
                                    }}
                                >
                                    <Text style={{ color: '#0B5FFF', fontSize: 12, fontWeight: '900', textAlign: 'center' }}>
                                        Extract colors from current logo
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            <Field label="Short Description" value={brandForm.shortDescription} onChangeText={(value) => updateBrandField('shortDescription', value)} multiline />
                        </CollapsibleConfigSection>

                        <CollapsibleConfigSection
                            title="Theme & Brand Colors"
                            description="Company colors used for company cards, TechOS, proposals, invoices, and receipts."
                            expanded={expandedConfigSection === 'theme'}
                            accentColor={brandAccent}
                            onToggle={() => toggleConfigSection('theme')}
                        >
                            <Field label="Primary Color" value={brandForm.primaryColor} onChangeText={(value) => updateBrandField('primaryColor', value)} />
                            <Field label="Secondary Color" value={brandForm.secondaryColor} onChangeText={(value) => updateBrandField('secondaryColor', value)} />
                            <Field label="Accent Color" value={brandForm.accentColor} onChangeText={(value) => updateBrandField('accentColor', value)} />

                            <BrandColorAssignmentPanel
                                brandForm={brandForm}
                                extractedColors={extractedLogoColors}
                                onApply={updateBrandColorSlot}
                                onSwap={swapBrandColors}
                            />
                            <View style={{ width: '100%', gap: 12, marginTop: 4 }}>
                                <Text style={{ color: '#071B33', fontSize: 13, fontWeight: '900' }}>
                                    Quick theme tools
                                </Text>

                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, maxWidth: '100%', minWidth: 0 }}>
                                    <TouchableOpacity
                                        onPress={applyStarterBrandPreset}
                                        style={{
                                            maxWidth: '100%',
                                            flexShrink: 1,
                                            backgroundColor: '#071B33',
                                            borderRadius: 999,
                                            paddingHorizontal: 14,
                                            paddingVertical: 10,
                                        }}
                                    >
                                        <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900', textAlign: 'center' }}>
                                            Apply starter colors
                                        </Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        onPress={extractThemeFromLogo}
                                        style={{
                                            maxWidth: '100%',
                                            flexShrink: 1,
                                            backgroundColor: '#EEF4FF',
                                            borderColor: '#CFE0FF',
                                            borderRadius: 999,
                                            borderWidth: 1,
                                            paddingHorizontal: 14,
                                            paddingVertical: 10,
                                        }}
                                    >
                                        <Text style={{ color: '#0B5FFF', fontSize: 12, fontWeight: '900', textAlign: 'center' }}>
                                            Extract colors from Logo URL
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, maxWidth: '100%', minWidth: 0 }}>
                                    {brandThemePresets.map((preset) => (
                                        <TouchableOpacity
                                            key={preset.name}
                                            onPress={() => applyThemePreset(preset)}
                                            style={{
                                                width: isPhoneLayout ? '100%' : undefined,
                                                maxWidth: '100%',
                                                minWidth: isPhoneLayout ? 0 : 150,
                                                flexShrink: 1,
                                                backgroundColor: '#FFFFFF',
                                                borderColor: '#E3E8EF',
                                                borderRadius: 14,
                                                borderWidth: 1,
                                                padding: 10,
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
                        </CollapsibleConfigSection>

                        <CollapsibleConfigSection
                            title="Services / Trust Profile"
                            description="Ratings, service categories, license details, and experience shown to homeowners."
                            expanded={expandedConfigSection === 'services'}
                            accentColor={brandAccent}
                            onToggle={() => toggleConfigSection('services')}
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
                        </CollapsibleConfigSection>

                        <CollapsibleConfigSection
                            title="Contact"
                            description="Contact information shown on company cards and customer-facing screens."
                            expanded={expandedConfigSection === 'identity'}
                            accentColor={brandAccent}
                            onToggle={() => toggleConfigSection('identity')}
                        >
                            <Field label="Phone" value={brandForm.phone} onChangeText={(value) => updateBrandField('phone', value)} />
                            <Field label="Website" value={brandForm.website} onChangeText={(value) => updateBrandField('website', value)} />
                        </CollapsibleConfigSection>

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

            </View>
        </ScrollView>
    );
}

function BrandInfoPill({ label, value, textColor }: { label: string; value: string; textColor: string }) {
    return (
        <View
            style={{
                maxWidth: '100%',
                flexShrink: 1,
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderColor: 'rgba(255,255,255,0.28)',
                borderRadius: 999,
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 8,
            }}
        >
            <Text style={{ color: textColor, fontSize: 11, fontWeight: '800', opacity: 0.72 }}>
                {label}
            </Text>
            <Text numberOfLines={1} style={{ color: textColor, fontSize: 13, fontWeight: '900', marginTop: 2 }}>
                {value}
            </Text>
        </View>
    );
}

function CompanyModuleCard({
    title,
    description,
    actionLabel,
    isExpanded,
    primaryColor,
    accentColor,
    onPress,
}: {
    title: string;
    description: string;
    actionLabel: string;
    isExpanded: boolean;
    primaryColor: string;
    accentColor: string;
    onPress: () => void;
}) {
    const { width: viewportWidth } = useWindowDimensions();
    const isPhoneLayout = viewportWidth <= 640;

    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.82}
            style={{
                width: isPhoneLayout ? '100%' : '31%',
                maxWidth: '100%',
                minWidth: isPhoneLayout ? 0 : 240,
                flexShrink: 1,
                minHeight: 118,
                backgroundColor: isExpanded ? primaryColor : '#F8FAFC',
                borderRadius: 18,
                padding: 16,
                borderWidth: 1,
                borderColor: isExpanded ? accentColor : '#E3E8EF',
                gap: 12,
            }}
        >
            <View
                style={{
                    width: 44,
                    height: 44,
                    borderRadius: 15,
                    backgroundColor: isExpanded ? accentColor : '#EEF4FF',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Text
                    style={{
                        color: getReadableColor(isExpanded ? accentColor : '#EEF4FF'),
                        fontSize: 12,
                        fontWeight: '900',
                    }}
                >
                    {getModuleInitials(title)}
                </Text>
            </View>

            <View style={{ minWidth: 0 }}>
                <Text
                    numberOfLines={2}
                    style={{
                        fontSize: 16,
                        fontWeight: '900',
                        color: isExpanded ? getReadableColor(primaryColor) : '#071B33',
                        flexShrink: 1,
                    }}
                >
                    {title}
                </Text>
                <Text
                    numberOfLines={3}
                    style={{
                        color: isExpanded ? getReadableColor(primaryColor) : '#64748B',
                        fontSize: 12,
                        fontWeight: '700',
                        lineHeight: 18,
                        marginTop: 5,
                        opacity: isExpanded ? 0.82 : 1,
                    }}
                >
                    {description}
                </Text>
                <Text
                    numberOfLines={1}
                    style={{
                        color: isExpanded ? getReadableColor(primaryColor) : accentColor,
                        fontSize: 12,
                        fontWeight: '900',
                        marginTop: 8,
                        opacity: isExpanded ? 0.92 : 1,
                    }}
                >
                    {actionLabel}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

function getModuleInitials(title: string) {
    return title
        .split(/[ /]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word.slice(0, 1).toUpperCase())
        .join('');
}

function getModuleDescription(title: string) {
    if (title === 'Company Profile / Identity') return 'Configure names, logo, description, phone, and website below.';
    if (title === 'Theme & Brand Colors') return 'Configure colors, logo extraction, and presets below.';
    if (title === 'Services & Trust Profile') return 'Configure categories, license, rating, and experience below.';
    if (title === 'Customers / Clients') return 'Open homes that selected this company as a preferred provider.';
    if (title === 'Team / Technicians') return 'Open company staff, managers, technicians, and invitations.';
    if (title === 'TechOS') return 'Open the technician-facing service operations workspace.';
    if (title === 'ManagementOS') return 'Open the company connections workflow.';

    return `Open ${title.toLowerCase()} tools.`;
}

function getModuleActionLabel(title: string) {
    if (title === 'Company Profile / Identity') return 'Configure below';
    if (title === 'Theme & Brand Colors') return 'Configure below';
    if (title === 'Services & Trust Profile') return 'Configure below';

    return 'Open';
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
function BrandColorAssignmentPanel({
    brandForm,
    extractedColors,
    onApply,
    onSwap,
}: {
    brandForm: CompanyBrandForm;
    extractedColors: string[];
    onApply: (slot: BrandColorKey, color: string) => void;
    onSwap: (first: BrandColorKey, second: BrandColorKey) => void;
}) {
    const { width: viewportWidth } = useWindowDimensions();
    const isPhoneLayout = viewportWidth <= 640;
    const currentColors: { key: BrandColorKey; label: string; value: string }[] = [
        { key: 'primaryColor', label: 'Primary', value: brandForm.primaryColor },
        { key: 'secondaryColor', label: 'Secondary', value: brandForm.secondaryColor },
        { key: 'accentColor', label: 'Accent', value: brandForm.accentColor },
    ];

    return (
        <View
            style={{
                width: '100%',
                backgroundColor: '#FFFFFF',
                borderColor: '#E3E8EF',
                borderRadius: 18,
                borderWidth: 1,
                padding: 14,
                gap: 14,
                minWidth: 0,
            }}
        >
            <View>
                <Text style={{ color: '#071B33', fontSize: 15, fontWeight: '900' }}>
                    Current Custom Theme
                </Text>
                <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '700', marginTop: 4, lineHeight: 18 }}>
                    These are the colors currently assigned to this company.
                </Text>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {currentColors.map((item) => (
                    <View
                        key={item.key}
                        style={{
                            width: isPhoneLayout ? '100%' : undefined,
                            maxWidth: '100%',
                            minWidth: isPhoneLayout ? 0 : 150,
                            flex: isPhoneLayout ? undefined : 1,
                            flexShrink: 1,
                            borderColor: '#E3E8EF',
                            borderRadius: 16,
                            borderWidth: 1,
                            overflow: 'hidden',
                        }}
                    >
                        <View
                            style={{
                                height: 58,
                                backgroundColor: item.value || '#F8FAFC',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Text style={{ color: getReadableColor(item.value), fontSize: 12, fontWeight: '900' }}>
                                {item.value || 'none'}
                            </Text>
                        </View>
                        <View style={{ padding: 10, backgroundColor: '#F8FAFC' }}>
                            <Text style={{ color: '#071B33', fontSize: 13, fontWeight: '900' }}>
                                {item.label}
                            </Text>
                        </View>
                    </View>
                ))}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <TouchableOpacity
                    onPress={() => onSwap('primaryColor', 'secondaryColor')}
                    style={swapButtonStyle}
                >
                    <Text style={swapButtonTextStyle}>Swap Primary / Secondary</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => onSwap('primaryColor', 'accentColor')}
                    style={swapButtonStyle}
                >
                    <Text style={swapButtonTextStyle}>Swap Primary / Accent</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => onSwap('secondaryColor', 'accentColor')}
                    style={swapButtonStyle}
                >
                    <Text style={swapButtonTextStyle}>Swap Secondary / Accent</Text>
                </TouchableOpacity>
            </View>

            <View>
                <Text style={{ color: '#071B33', fontSize: 15, fontWeight: '900' }}>
                    Extracted Logo Colors
                </Text>
                <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '700', marginTop: 4, lineHeight: 18 }}>
                    Pick where each extracted logo color belongs.
                </Text>
            </View>

            {extractedColors.length === 0 ? (
                <View
                    style={{
                        backgroundColor: '#F8FAFC',
                        borderColor: '#E3E8EF',
                        borderRadius: 14,
                        borderWidth: 1,
                        padding: 12,
                    }}
                >
                    <Text style={{ color: '#64748B', fontWeight: '700', lineHeight: 20 }}>
                        No extracted colors yet. Upload a logo or click Extract colors from current logo.
                    </Text>
                </View>
            ) : (
                <View style={{ gap: 10 }}>
                    {extractedColors.map((color) => (
                        <View
                            key={color}
                            style={{
                                backgroundColor: '#F8FAFC',
                                borderColor: '#E3E8EF',
                                borderRadius: 16,
                                borderWidth: 1,
                                padding: 10,
                                gap: 10,
                            }}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View
                                    style={{
                                        width: 44,
                                        height: 44,
                                        borderRadius: 14,
                                        backgroundColor: color,
                                        borderColor: '#CBD5E1',
                                        borderWidth: 1,
                                    }}
                                />
                                <Text numberOfLines={1} style={{ color: '#071B33', fontWeight: '900', flexShrink: 1 }}>
                                    {color}
                                </Text>
                            </View>

                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                <TouchableOpacity onPress={() => onApply('primaryColor', color)} style={assignButtonStyle}>
                                    <Text style={assignButtonTextStyle}>Use as Primary</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => onApply('secondaryColor', color)} style={assignButtonStyle}>
                                    <Text style={assignButtonTextStyle}>Use as Secondary</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => onApply('accentColor', color)} style={assignButtonStyle}>
                                    <Text style={assignButtonTextStyle}>Use as Accent</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ))}
                </View>
            )}
        </View>
    );
}

const swapButtonStyle = {
    maxWidth: '100%',
    flexShrink: 1,
    backgroundColor: '#EEF4FF',
    borderColor: '#CFE0FF',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
} as const;

const swapButtonTextStyle = {
    color: '#0B5FFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
} as const;

const assignButtonStyle = {
    maxWidth: '100%',
    flexShrink: 1,
    backgroundColor: '#071B33',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
} as const;

const assignButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
} as const;

function getReadableColor(color: string) {
    const normalized = color.replace('#', '');

    if (normalized.length !== 6) {
        return '#071B33';
    }

    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    return luma < 145 ? '#FFFFFF' : '#071B33';
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
    palette: string[];
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
                    palette: colors.slice(0, 6).map((color) => rgbToHex(color.r, color.g, color.b)),
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
function CollapsibleConfigSection({
    title,
    description,
    expanded,
    accentColor,
    onToggle,
    children,
}: {
    title: string;
    description: string;
    expanded: boolean;
    accentColor: string;
    onToggle: () => void;
    children: React.ReactNode;
}) {
    return (
        <View
            style={{
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                backgroundColor: '#F8FAFC',
                borderColor: '#E3E8EF',
                borderRadius: 20,
                borderWidth: 1,
                marginBottom: 16,
                padding: 16,
            }}
        >
            <TouchableOpacity
                onPress={onToggle}
                activeOpacity={0.82}
                style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    minWidth: 0,
                }}
            >
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: '#071B33', fontSize: 18, fontWeight: '900', marginBottom: 4 }}>
                        {title}
                    </Text>
                    <Text style={{ color: '#64748B', fontWeight: '700', lineHeight: 20 }}>
                        {description}
                    </Text>
                </View>
                <View
                    style={{
                        alignSelf: 'flex-start',
                        maxWidth: '100%',
                        backgroundColor: expanded ? accentColor : '#FFFFFF',
                        borderColor: expanded ? accentColor : '#CBD5E1',
                        borderRadius: 999,
                        borderWidth: 1,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                    }}
                >
                    <Text
                        style={{
                            color: expanded ? getReadableColor(accentColor) : '#071B33',
                            fontSize: 12,
                            fontWeight: '900',
                        }}
                    >
                        {expanded ? 'Hide' : 'Edit'}
                    </Text>
                </View>
            </TouchableOpacity>
            {expanded && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16, minWidth: 0 }}>
                    {children}
                </View>
            )}
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
    const { width: viewportWidth } = useWindowDimensions();
    const isPhoneLayout = viewportWidth <= 640;

    return (
        <View style={{ width: isPhoneLayout ? '100%' : '48%', maxWidth: '100%', minWidth: 0, flexShrink: 1 }}>
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
                    minWidth: 0,
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
