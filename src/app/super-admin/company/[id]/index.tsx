import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, Pressable, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import AdminNavBar from '../../../../components/AdminNavBar';
import { logCompanyAuditEvent, safeAuditRecord } from '../../../../lib/companyAuditLogs';
import { getCompanyDisplayName } from '../../../../lib/companyDisplayName';
import {
    getCompanyLeadCounts,
    LEAD_ALERT_REFRESH_MS,
    type CompanyLeadCounts,
} from '../../../../lib/companyLeadAlerts';
import {
    loadCurrentCompanyPermissionAccess,
    type CompanyPermissionKey,
    type CompanyPermissionSet,
} from '../../../../lib/companyPermissions';
import { loadLoggedInUserCompanyAccess } from '../../../../lib/onboarding';
import { loadCurrentUserPlatformAdmin } from '../../../../lib/roles';
import { supabase } from '../../../../lib/supabase';
import { resolveCompanyTechOSTheme, type TechOSThemePalette } from '../../../../lib/techosAppearance';
import { CompanyGlassDepthProvider } from '../../../../theme/glass-depth';

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
    glass_depth: number | null;
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
    glassDepth: string;
};

type BrandColorKey = 'primaryColor' | 'secondaryColor' | 'accentColor';
type ConfigSectionKey = 'identity' | 'theme' | 'services' | 'contact';

const HOMEOS_SERVICE_ERROR_MESSAGE = 'Could not reach HomeOS services. Check connection and try again.';

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
    glassDepth: '70',
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
        name: 'Orbital Green / Blue',
        primaryColor: '#075748',
        secondaryColor: '#043F69',
        accentColor: '#2FA5B3',
    },
    {
        name: 'Ocean Blue / Teal',
        primaryColor: '#075E68',
        secondaryColor: '#074B7A',
        accentColor: '#38B7C7',
    },
    {
        name: 'Forest / Steel',
        primaryColor: '#175B3B',
        secondaryColor: '#294F64',
        accentColor: '#72B58C',
    },
    {
        name: 'Navy / Gold',
        primaryColor: '#31566F',
        secondaryColor: '#071F38',
        accentColor: '#C9A84C',
    },
    {
        name: 'Black / Gold',
        primaryColor: '#26312D',
        secondaryColor: '#111820',
        accentColor: '#C8A84A',
    },
    {
        name: 'Copper / Steel',
        primaryColor: '#7A4C2F',
        secondaryColor: '#2F526B',
        accentColor: '#C48756',
    },
];
const cards = [
    'Company Profile / Identity',
    'Visual Control Center',
    'Customers / Clients',
    'Leads / Requests',
    'Opportunities',
    'Estimates / Proposals',
    'Jobs / Dispatch',
    'Team / Technicians',
    'Activity / Audit Log',
    'Price Book',
    'Knowledge Engine',
    'Settings / Permissions',
];
const COMPANY_DASHBOARD_PERMISSION_KEYS: CompanyPermissionKey[] = [
    'can_view_techos',
    'can_create_estimates',
    'can_add_item_to_estimate',
    'can_manage_price_book',
    'can_view_customers',
    'can_view_jobs',
    'can_manage_company_users',
    'can_manage_company_profile',
];

export default function CompanyDashboardScreen() {
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const routeCompanyId = normalizeRouteParam(id);
    const { width: viewportWidth } = useWindowDimensions();
    const isPhoneLayout = viewportWidth <= 640;
    const pagePadding = isPhoneLayout ? 16 : 20;
    const heroLogoSize = isPhoneLayout ? 64 : 86;
    const previewLogoSize = isPhoneLayout ? 112 : 96;
    const [company, setCompany] = useState<Company | null>(null);
    const [brandForm, setBrandForm] = useState<CompanyBrandForm>(defaultBrandForm);
    const [message, setMessage] = useState('Loading company...');
    const [savingBrand, setSavingBrand] = useState(false);
    const [extractedLogoColors, setExtractedLogoColors] = useState<string[]>([]);
    const [expandedConfigSection, setExpandedConfigSection] = useState<ConfigSectionKey | null>(null);
    const [isConfigEditorOpen, setIsConfigEditorOpen] = useState(false);
    const [leadCounts, setLeadCounts] = useState<CompanyLeadCounts | null>(null);
    const [leadCountMessage, setLeadCountMessage] = useState('');
    const [leadCountLoading, setLeadCountLoading] = useState(false);
    const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
    const [companyPermissions, setCompanyPermissions] = useState<CompanyPermissionSet | null>(null);
    const leadRefreshInFlight = useRef(false);
    const activeCompanyId = company?.id || routeCompanyId;
    const visibleCards = cards.filter((card) =>
        isPlatformAdmin || canViewCompanyModule(card, companyPermissions)
    );

    useEffect(() => {
        setIsConfigEditorOpen(false);
        setExpandedConfigSection(null);
        setCompanyPermissions(null);
        loadCompany();
        void loadCurrentUserPlatformAdmin().then(setIsPlatformAdmin);
        if (routeCompanyId) {
            void loadCompanyDashboardPermissions(routeCompanyId).then(setCompanyPermissions);
            void redirectTechnicianAwayFromCompanyDashboard(routeCompanyId);
        }
    }, [routeCompanyId]);

    async function redirectTechnicianAwayFromCompanyDashboard(companyId: string) {
        const platformAdmin = await loadCurrentUserPlatformAdmin();
        if (platformAdmin) return;

        const userResult = await supabase.auth.getUser();
        const userId = userResult.data.user?.id || '';
        if (!userId) return;

        const accessResult = await loadLoggedInUserCompanyAccess(userId);
        if (accessResult.error) return;

        const companyAccess = accessResult.data.find((access) => (
            access.company_id === companyId &&
            String(access.status || '').trim().toLowerCase() === 'active'
        ));
        const role = String(companyAccess?.role || '').trim().toLowerCase();

        if (['technician', 'tech', 'field_tech', 'field-tech', 'field technician'].includes(role)) {
            router.replace({ pathname: '/techos', params: { companyId } } as never);
        }
    }

    useEffect(() => {
        const companyIdToLoad = activeCompanyId;

        if (!companyIdToLoad) {
            setLeadCounts(null);
            setLeadCountMessage('');
            setLeadCountLoading(false);
            return;
        }

        void loadCompanyLeadCounts(companyIdToLoad);

        const intervalId = setInterval(() => {
            void loadCompanyLeadCounts(companyIdToLoad);
        }, LEAD_ALERT_REFRESH_MS);

        const appStateSubscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') {
                void loadCompanyLeadCounts(companyIdToLoad);
            }
        });

        const focusTarget = globalThis as {
            addEventListener?: (type: 'focus', listener: () => void) => void;
            removeEventListener?: (type: 'focus', listener: () => void) => void;
        };
        const handleFocus = () => {
            void loadCompanyLeadCounts(companyIdToLoad);
        };

        focusTarget.addEventListener?.('focus', handleFocus);

        return () => {
            clearInterval(intervalId);
            appStateSubscription.remove();
            focusTarget.removeEventListener?.('focus', handleFocus);
        };
    }, [activeCompanyId]);

    async function loadCompany() {
        if (!routeCompanyId) {
            setMessage('Missing company id.');
            return;
        }

        let data: unknown = null;
        let errorMessage = '';

        try {
            const result = await supabase
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
                    ,glass_depth
                `)
                .eq('id', routeCompanyId)
                .single();
            data = result.data || null;
            errorMessage = result.error?.message || '';
        } catch (error) {
            errorMessage = normalizeServiceErrorMessage(getErrorMessage(error));
        }

        if (errorMessage) {
            setMessage(`Error loading company: ${normalizeServiceErrorMessage(errorMessage)}`);
            return;
        }

        const loadedCompany = data as Company;

        setCompany(loadedCompany);
        setBrandForm(companyToBrandForm(loadedCompany));
        setMessage('');
    }

    async function loadCompanyLeadCounts(companyIdToLoad: string) {
        if (leadRefreshInFlight.current) return;

        leadRefreshInFlight.current = true;
        setLeadCountLoading(true);

        try {
            const counts = await getCompanyLeadCounts(companyIdToLoad);

            setLeadCounts(counts);
            setLeadCountMessage(counts.newLeads === 0 ? 'No new leads.' : '');
        } catch {
            setLeadCounts(null);
            setLeadCountMessage('Lead count unavailable.');
        } finally {
            leadRefreshInFlight.current = false;
            setLeadCountLoading(false);
        }
    }

    async function persistBrandProfile(
        nextBrandForm: CompanyBrandForm,
        successMessage = 'Company configuration saved.'
    ) {
        if (!company) {
            setMessage('Load a company before saving.');
            return false;
        }

        setSavingBrand(true);
        setMessage('Saving company configuration...');

        let data: unknown = null;
        let errorMessage = '';

        try {
            const glassDepth = Math.max(1, Math.min(100, parseInteger(nextBrandForm.glassDepth) || 70));
            const depthResult = await supabase.rpc('update_company_glass_depth', {
                p_company_id: company.id,
                p_glass_depth: glassDepth,
            });
            if (depthResult.error) {
                throw new Error(depthResult.error.message);
            }

            const result = await supabase.rpc('update_company_brand_profile', {
                p_company_id: company.id,
                p_public_name: nextBrandForm.publicName.trim(),
                p_dba_name: nextBrandForm.dbaName.trim(),
                p_logo_url: nextBrandForm.logoUrl.trim(),
                p_primary_color: nextBrandForm.primaryColor.trim(),
                p_secondary_color: nextBrandForm.secondaryColor.trim(),
                p_accent_color: nextBrandForm.accentColor.trim(),
                p_service_categories: parseCategories(nextBrandForm.serviceCategories),
                p_homeos_rating: parseNumber(nextBrandForm.homeosRating),
                p_homeos_rating_count: parseInteger(nextBrandForm.homeosRatingCount),
                p_combined_experience_years: parseInteger(nextBrandForm.combinedExperienceYears),
                p_license_number: nextBrandForm.licenseNumber.trim(),
                p_phone: nextBrandForm.phone.trim(),
                p_website: nextBrandForm.website.trim(),
                p_short_description: nextBrandForm.shortDescription.trim(),
            });
            data = result.data || null;
            errorMessage = result.error?.message || '';
        } catch (error) {
            errorMessage = normalizeServiceErrorMessage(getErrorMessage(error));
        }

        setSavingBrand(false);

        if (errorMessage) {
            setMessage(`Save failed: ${normalizeServiceErrorMessage(errorMessage)}`);
            return false;
        }

        const updatedCompany = data as Company;

        await recordCompanyAuditEvent({
            companyId: updatedCompany.id,
            action: 'company_profile_updated',
            targetType: 'company',
            targetId: updatedCompany.id,
            targetLabel: getCompanyDisplayName(updatedCompany),
            beforeData: companyToAuditRecord(company),
            afterData: companyToAuditRecord(updatedCompany),
        });

        setCompany(updatedCompany);
        setBrandForm(companyToBrandForm(updatedCompany));
        setMessage(successMessage);
        return true;
    }

    async function saveBrandProfile() {
        await persistBrandProfile(brandForm);
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

    async function updateBrandColorSlot(slot: BrandColorKey, color: string) {
        const nextBrandForm = {
            ...brandForm,
            [slot]: color,
        };
        setBrandForm(nextBrandForm);
        await persistBrandProfile(nextBrandForm, 'Custom company color applied and saved.');
    }

    async function swapBrandColors(first: BrandColorKey, second: BrandColorKey) {
        const nextBrandForm = {
            ...brandForm,
            [first]: brandForm[second],
            [second]: brandForm[first],
        };
        setBrandForm(nextBrandForm);
        await persistBrandProfile(nextBrandForm, 'Company theme colors swapped and saved.');
    }
    async function applyStarterBrandPreset() {
        const nextBrandForm = {
            ...brandForm,
            primaryColor: '#0B2E59',
            secondaryColor: '#FFFFFF',
            accentColor: '#E11D2E',
            serviceCategories: brandForm.serviceCategories || 'Plumbing, Water Heaters, Leak Detection',
        };
        setBrandForm(nextBrandForm);
        await persistBrandProfile(nextBrandForm, 'Starter company colors applied and saved.');
    }

    async function saveThemeField(key: BrandColorKey | 'glassDepth', value: string) {
        if (key !== 'glassDepth' && !/^#[0-9A-F]{6}$/i.test(value.trim())) {
            setMessage('Use a complete six-digit color such as #2A145F.');
            return;
        }

        const nextBrandForm = {
            ...brandForm,
            [key]: value,
        };
        setBrandForm(nextBrandForm);
        await persistBrandProfile(nextBrandForm, 'Company theme saved.');
    }

    async function applyThemePreset(preset: (typeof brandThemePresets)[number]) {
        const nextBrandForm = {
            ...brandForm,
            primaryColor: preset.primaryColor,
            secondaryColor: preset.secondaryColor,
            accentColor: preset.accentColor,
        };
        setBrandForm(nextBrandForm);
        await persistBrandProfile(nextBrandForm, preset.name + ' colors applied and saved.');
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
            const nextBrandForm = {
                ...brandForm,
                primaryColor: colors.primaryColor,
                secondaryColor: colors.secondaryColor,
                accentColor: colors.accentColor,
            };
            setBrandForm(nextBrandForm);
            await persistBrandProfile(nextBrandForm, 'Logo colors extracted and saved.');
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
            let nextBrandForm: CompanyBrandForm = {
                ...brandForm,
                logoUrl: publicUrl,
            };

            try {
                const colors = await extractLogoThemeColors(publicUrl);
                setExtractedLogoColors(colors.palette);
                nextBrandForm = {
                    ...nextBrandForm,
                    primaryColor: colors.primaryColor,
                    secondaryColor: colors.secondaryColor,
                    accentColor: colors.accentColor,
                };
                setBrandForm(nextBrandForm);
                await persistBrandProfile(
                    nextBrandForm,
                    'Logo uploaded. Company colors and theme saved automatically.'
                );
            } catch {
                setBrandForm(nextBrandForm);
                await persistBrandProfile(
                    nextBrandForm,
                    'Logo uploaded and saved. Colors can be adjusted manually.'
                );
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            setMessage('Logo upload failed: ' + errorMessage);
        } finally {
            setSavingBrand(false);
        }
    }
    async function openModule(card: string) {
        if (!activeCompanyId) {
            alert('Missing company id.');
            return;
        }

        if (card === 'Company Profile / Identity') {
            if (!isPlatformAdmin && !companyPermissions?.can_manage_company_profile) return;
            setIsConfigEditorOpen(true);
            toggleConfigSection('identity');
            return;
        }

        if (card === 'Visual Control Center') {
            if (!isPlatformAdmin) return;
            setIsConfigEditorOpen(true);
            toggleConfigSection('theme');
            return;
        }

        if (card === 'Team / Technicians') {
            router.push(`/super-admin/company/${activeCompanyId}/users` as any);
            return;
        }

        if (card === 'Settings / Permissions') {
            router.push(`/super-admin/company/${activeCompanyId}/users` as any);
            return;
        }

        if (card === 'Activity / Audit Log') {
            router.push(`/super-admin/company/${activeCompanyId}/audit-log` as never);
            return;
        }

        if (card === 'Customers / Clients') {
            router.push(`/super-admin/company/${activeCompanyId}/clients` as any);
            return;
        }

        if (card === 'Leads / Requests' || card === 'Jobs / Dispatch') {
            router.push({
                pathname: '/dispatch',
                params: { companyId: activeCompanyId },
            } as any);
            return;
        }

        if (card === 'Estimates / Proposals') {
            router.push('/estimate' as any);
            return;
        }

        if (card === 'Price Book') {
            router.push(`/super-admin/company/${activeCompanyId}/price-book` as never);
            return;
        }

        if (card === 'Knowledge Engine') {
            router.push(`/super-admin/company/${activeCompanyId}/knowledge-engine` as never);
            return;
        }

        alert(`${card} foundation comes next.`);
    }

    function toggleConfigSection(section: ConfigSectionKey) {
        setExpandedConfigSection((current) => (current === section ? null : section));
    }

    const previewName = getCompanyDisplayName({
        dba_name: null,
        public_name: brandForm.publicName || company?.public_name,
        name: company?.name,
    });
    const previewMotto = brandForm.dbaName || 'Add a short company motto';
    const previewCategories = parseCategories(brandForm.serviceCategories);
    const logoCanPreview = brandForm.logoUrl.trim().startsWith('http');
    const brandPrimary = brandForm.primaryColor || '#071B33';
    const brandSecondary = brandForm.secondaryColor || '#FFFFFF';
    const brandAccent = replacePurpleWithGold(brandForm.accentColor || '#D89A1D');
    const brandHeaderText = getReadableColor(brandPrimary);
    const techOSPreviewTheme = resolveCompanyTechOSTheme({
        primaryColor: brandPrimary,
        secondaryColor: brandSecondary,
        accentColor: brandAccent,
    });

    return (
        <CompanyGlassDepthProvider value={Number(brandForm.glassDepth) || 70}>
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{
                padding: pagePadding,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 1180, minWidth: 0 }}>
                <AdminNavBar
                    companyId={activeCompanyId}
                    backFallback="/super-admin/companies"
                    showBack={false}
                />

                <View
                    style={{
                        width: '100%',
                        maxWidth: '100%',
                        minWidth: 0,
                        backgroundColor: brandPrimary,
                        borderRadius: 28,
                        borderWidth: 2,
                        borderTopColor: 'rgba(255,255,255,0.48)',
                        borderColor: mixHexColors(brandAccent, '#FFFFFF', 0.24),
                        borderBottomColor: brandAccent,
                        borderBottomWidth: 7,
                        boxShadow: '0 16px 30px rgba(7, 27, 51, 0.28), inset 0 2px 0 rgba(255,255,255,0.22)',
                        padding: isPhoneLayout ? 18 : 22,
                        marginTop: 16,
                        marginBottom: 22,
                    }}
                >
                    <View
                        style={{
                            flexDirection: isPhoneLayout ? 'column' : 'row',
                            flexWrap: isPhoneLayout ? 'nowrap' : 'wrap',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: isPhoneLayout ? 14 : 18,
                            marginBottom: 22,
                            minWidth: 0,
                        }}
                    >
                        <View
                            style={{
                                flex: isPhoneLayout ? undefined : 1,
                                width: isPhoneLayout ? '100%' : undefined,
                                minWidth: 0,
                                maxWidth: '100%',
                            }}
                        >
                            <Text
                                style={{
                                    color: brandHeaderText,
                                    fontSize: 13,
                                    fontWeight: '900',
                                    marginBottom: 8,
                                    opacity: 0.78,
                                }}
                            >
                                ManagementOS
                            </Text>

                            <View
                                style={{
                                    width: '100%',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    flexWrap: 'nowrap',
                                    gap: isPhoneLayout ? 12 : 16,
                                    minWidth: 0,
                                }}
                            >
                                {logoCanPreview ? (
                                    <Image
                                        source={{ uri: brandForm.logoUrl.trim() }}
                                        style={{
                                            width: heroLogoSize,
                                            height: heroLogoSize,
                                            borderRadius: 24,
                                            backgroundColor: brandSecondary,
                                            borderColor: 'rgba(255,255,255,0.72)',
                                            borderWidth: 2,
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
                                            borderColor: 'rgba(255,255,255,0.72)',
                                            borderWidth: 2,
                                            boxShadow: '0 9px 18px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.75)',
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
                                            fontSize: isPhoneLayout ? 24 : 36,
                                            lineHeight: isPhoneLayout ? 29 : 43,
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
                                        {previewMotto}
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
                                        {brandForm.shortDescription || 'Company workspace for customers, requests, estimates, jobs, team, and permissions.'}
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
                                borderColor: 'rgba(255,255,255,0.72)',
                                borderRadius: 14,
                                borderWidth: 2,
                                borderBottomColor: brandAccent,
                                borderBottomWidth: 5,
                                boxShadow: '0 7px 14px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.78)',
                                paddingHorizontal: isPhoneLayout ? 14 : 18,
                                paddingVertical: isPhoneLayout ? 10 : 12,
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
                                Company workspace modules for customer work, requests, estimates, jobs, team, and permissions.
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
                                {visibleCards.length} core modules
                            </Text>
                        </View>
                    </View>

                    {(isPlatformAdmin ||
                        (companyPermissions?.can_view_customers && companyPermissions.can_view_jobs)) && (
                        <LeadAlertPanel
                            counts={leadCounts}
                            loading={leadCountLoading}
                            message={leadCountMessage}
                            accentColor={brandAccent}
                            primaryColor={brandPrimary}
                            onOpen={() => router.push({
                                pathname: '/dispatch',
                                params: { companyId: activeCompanyId },
                            } as never)}
                            onRefresh={() => {
                                if (activeCompanyId) {
                                    void loadCompanyLeadCounts(activeCompanyId);
                                }
                            }}
                        />
                    )}

                    <View
                        style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            gap: 12,
                            width: '100%',
                            minWidth: 0,
                        }}
                    >
                        {visibleCards.map((card, index) => (
                            <CompanyModuleCard
                                key={card}
                                title={card}
                                description={getModuleDescription(card)}
                                actionLabel={getModuleActionLabel(card)}
                                isExpanded={
                                    (card === 'Company Profile / Identity' && expandedConfigSection === 'identity') ||
                                    (card === 'Visual Control Center' && expandedConfigSection === 'theme') ||
                                    (card === 'Services & Trust Profile' && expandedConfigSection === 'services')
                                }
                                primaryColor={brandPrimary}
                                accentColor={brandAccent}
                                toneIndex={index}
                                glassDepth={Number(brandForm.glassDepth) || 70}
                                onPress={() => openModule(card)}
                            />
                        ))}
                    </View>
                </View>

                {company && (isPlatformAdmin || companyPermissions?.can_manage_company_profile) && (
                    <View
                        style={{
                            width: '100%',
                            maxWidth: '100%',
                            minWidth: 0,
                            backgroundColor: mixHexColors(brandPrimary, '#FFFFFF', 0.91),
                            borderRadius: 24,
                            padding: isPhoneLayout ? 16 : 20,
                            borderWidth: 2,
                            borderTopColor: 'rgba(255, 255, 255, 0.95)',
                            borderColor: mixHexColors(brandPrimary, '#FFFFFF', 0.38),
                            borderBottomColor: brandPrimary,
                            borderBottomWidth: 7,
                            boxShadow: '0 12px 24px rgba(7, 27, 51, 0.22), inset 0 2px 0 rgba(255, 255, 255, 0.94)',
                            marginBottom: 22,
                        }}
                    >
                        <TouchableOpacity
                            activeOpacity={0.84}
                            onPress={() => {
                                setIsConfigEditorOpen((current) => !current);
                                if (isConfigEditorOpen) setExpandedConfigSection(null);
                            }}
                            style={{
                                alignItems: 'center',
                                flexDirection: 'row',
                                gap: 12,
                                justifyContent: 'space-between',
                                minWidth: 0,
                            }}
                        >
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ fontSize: 22, fontWeight: '900', color: '#071B33' }}>
                                    Company Configuration Editor
                                </Text>
                                <Text style={{ color: '#637083', fontWeight: '700', lineHeight: 19, marginTop: 5 }}>
                                    {isConfigEditorOpen ? 'Editing tools are open.' : 'Closed by default. Open only when you need to change the company.'}
                                </Text>
                            </View>
                            <View
                                style={{
                                    backgroundColor: isConfigEditorOpen ? brandPrimary : '#FFFFFF',
                                    borderColor: brandAccent,
                                    borderRadius: 999,
                                    borderWidth: 2,
                                    borderBottomColor: brandPrimary,
                                    borderBottomWidth: 5,
                                    boxShadow: '0 6px 12px rgba(7,27,51,0.18), inset 0 1px 0 rgba(255,255,255,0.8)',
                                    paddingHorizontal: 14,
                                    paddingVertical: 9,
                                }}
                            >
                                <Text style={{ color: isConfigEditorOpen ? getReadableColor(brandPrimary) : '#071B33', fontSize: 12, fontWeight: '900' }}>
                                    {isConfigEditorOpen ? 'Close' : 'Open Editor'}
                                </Text>
                            </View>
                        </TouchableOpacity>

                        {isConfigEditorOpen && <>
                        <Text
                            style={{
                                color: '#637083',
                                lineHeight: 21,
                                marginBottom: 18,
                                marginTop: 16,
                            }}
                        >
                            Open a management section above or use the section headers below to update the company
                            profile, theme, services, trust details, and contact information.
                        </Text>

                        <View
                            style={{
                                backgroundColor: mixHexColors(brandAccent, '#FFFFFF', 0.84),
                                borderColor: mixHexColors(brandAccent, '#FFFFFF', 0.38),
                                borderRadius: 24,
                                borderWidth: 2,
                                borderTopColor: 'rgba(255, 255, 255, 0.96)',
                                borderBottomColor: brandAccent,
                                borderBottomWidth: 6,
                                boxShadow: '0 9px 18px rgba(7, 27, 51, 0.18), inset 0 2px 0 rgba(255, 255, 255, 0.94)',
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
                                    backgroundColor: 'rgba(255, 255, 255, 0.68)',
                                    borderColor: mixHexColors(brandPrimary, '#FFFFFF', 0.48),
                                    borderRadius: 22,
                                    borderWidth: 2,
                                    borderTopColor: 'rgba(255, 255, 255, 0.98)',
                                    borderBottomColor: brandPrimary,
                                    borderBottomWidth: 5,
                                    boxShadow: '0 8px 16px rgba(7, 27, 51, 0.16), inset 0 2px 0 rgba(255, 255, 255, 0.96)',
                                    padding: 18,
                                    flexDirection: isPhoneLayout ? 'column' : 'row',
                                    flexWrap: isPhoneLayout ? 'nowrap' : 'wrap',
                                    alignItems: 'center',
                                    gap: isPhoneLayout ? 14 : 18,
                                    minWidth: 0,
                                }}
                            >
                                {logoCanPreview ? (
                                    <Image
                                        source={{ uri: brandForm.logoUrl.trim() }}
                                        resizeMode="contain"
                                        style={{
                                            width: previewLogoSize,
                                            height: previewLogoSize,
                                            borderRadius: 20,
                                            backgroundColor: '#F8FAFC',
                                            flexShrink: 0,
                                            alignSelf: isPhoneLayout ? 'center' : 'auto',
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
                                            alignSelf: isPhoneLayout ? 'center' : 'auto',
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

                                <View
                                    style={{
                                        flex: isPhoneLayout ? undefined : 1,
                                        minWidth: 0,
                                        width: isPhoneLayout ? '100%' : undefined,
                                        alignItems: isPhoneLayout ? 'center' : 'flex-start',
                                    }}
                                >
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            color: '#071B33',
                                            fontSize: isPhoneLayout ? 21 : 24,
                                            fontWeight: '900',
                                            flexShrink: 1,
                                            textAlign: isPhoneLayout ? 'center' : 'left',
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
                                            textAlign: isPhoneLayout ? 'center' : 'left',
                                        }}
                                    >
                                        {previewMotto}
                                    </Text>
                                    <Text
                                        numberOfLines={2}
                                        style={{
                                            color: '#64748B',
                                            marginTop: 8,
                                            fontSize: 13,
                                            fontWeight: '700',
                                            lineHeight: 19,
                                            textAlign: isPhoneLayout ? 'center' : 'left',
                                        }}
                                    >
                                        {brandForm.shortDescription || 'Short company description will appear here.'}
                                    </Text>

                                    <View
                                        style={{
                                            flexDirection: 'row',
                                            flexWrap: 'wrap',
                                            justifyContent: isPhoneLayout ? 'center' : 'flex-start',
                                            gap: 8,
                                            marginTop: 12,
                                        }}
                                    >
                                        {(previewCategories.length ? previewCategories.slice(0, 4) : ['No services selected']).map((category) => (
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
                                        {previewCategories.length > 4 && (
                                            <View
                                                style={{
                                                    backgroundColor: mixHexColors(brandAccent, '#FFFFFF', 0.82),
                                                    borderColor: mixHexColors(brandAccent, '#FFFFFF', 0.36),
                                                    borderRadius: 999,
                                                    borderWidth: 1,
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 6,
                                                }}
                                            >
                                                <Text style={{ color: '#071B33', fontSize: 12, fontWeight: '900' }}>
                                                    +{previewCategories.length - 4} more services
                                                </Text>
                                            </View>
                                        )}
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
                        <View
                            style={{
                                width: '100%',
                                flexDirection: 'row',
                                flexWrap: 'wrap',
                                alignItems: 'flex-start',
                                gap: 12,
                            }}
                        >
                        <CollapsibleConfigSection
                            title="Company Profile / Identity"
                            description="Public-facing company name, motto, logo, and company description."
                            expanded={expandedConfigSection === 'identity'}
                            accentColor={brandAccent}
                            primaryColor={brandPrimary}
                            onToggle={() => toggleConfigSection('identity')}
                            compact
                        >
                            <Field label="Public Name" value={brandForm.publicName} onChangeText={(value) => updateBrandField('publicName', value)} />
                            <Field label="Company Motto" value={brandForm.dbaName} onChangeText={(value) => updateBrandField('dbaName', value)} />
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
                            <Field label="Company Description" value={brandForm.shortDescription} onChangeText={(value) => updateBrandField('shortDescription', value)} multiline />
                        </CollapsibleConfigSection>

                        {isPlatformAdmin && (
                        <CollapsibleConfigSection
                            title="Visual Control Center"
                            description="Platform-only controls for this company’s glass colors, card depth, TechOS, and connected HomeOS provider surfaces."
                            expanded={expandedConfigSection === 'theme'}
                            accentColor={brandAccent}
                            primaryColor={brandPrimary}
                            onToggle={() => toggleConfigSection('theme')}
                            compact
                        >
                            <Field
                                label="Primary Color"
                                value={brandForm.primaryColor}
                                onChangeText={(value) => updateBrandField('primaryColor', value)}
                                onEndEditing={(value) => saveThemeField('primaryColor', value)}
                            />
                            <Field
                                label="Secondary Color"
                                value={brandForm.secondaryColor}
                                onChangeText={(value) => updateBrandField('secondaryColor', value)}
                                onEndEditing={(value) => saveThemeField('secondaryColor', value)}
                            />
                            <Field
                                label="Accent Color"
                                value={brandForm.accentColor}
                                onChangeText={(value) => updateBrandField('accentColor', value)}
                                onEndEditing={(value) => saveThemeField('accentColor', value)}
                            />
                            <Field
                                label="Glass Depth (1–100)"
                                value={brandForm.glassDepth}
                                onChangeText={(value) => updateBrandField('glassDepth', value.replace(/[^0-9]/g, '').slice(0, 3))}
                                onEndEditing={(value) => saveThemeField('glassDepth', value)}
                            />

                            <BrandColorAssignmentPanel
                                brandForm={brandForm}
                                extractedColors={extractedLogoColors}
                                onApply={updateBrandColorSlot}
                                onSwap={swapBrandColors}
                            />
                            <CompanyTechOSThemePreview
                                companyName={previewName}
                                logoUrl={brandForm.logoUrl}
                                theme={techOSPreviewTheme}
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
                                    onSelect={(color) => updateBrandColorSlot('primaryColor', color)}
                                />
                                <ColorSwatchRow
                                    label="Secondary swatches"
                                    value={brandForm.secondaryColor}
                                    onSelect={(color) => updateBrandColorSlot('secondaryColor', color)}
                                />
                                <ColorSwatchRow
                                    label="Accent swatches"
                                    value={brandForm.accentColor}
                                    onSelect={(color) => updateBrandColorSlot('accentColor', color)}
                                />
                            </View>
                        </CollapsibleConfigSection>
                        )}

                        <CollapsibleConfigSection
                            title="Services / Trust Profile"
                            description="Ratings, service categories, license details, and experience shown to homeowners."
                            expanded={expandedConfigSection === 'services'}
                            accentColor={brandAccent}
                            primaryColor={brandPrimary}
                            onToggle={() => toggleConfigSection('services')}
                            compact
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
                            expanded={expandedConfigSection === 'contact'}
                            accentColor={brandAccent}
                            primaryColor={brandPrimary}
                            onToggle={() => toggleConfigSection('contact')}
                            compact
                        >
                            <Field label="Phone" value={brandForm.phone} onChangeText={(value) => updateBrandField('phone', value)} />
                            <Field label="Website" value={brandForm.website} onChangeText={(value) => updateBrandField('website', value)} />
                        </CollapsibleConfigSection>
                        </View>

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
                                borderWidth: 2,
                                borderTopColor: 'rgba(255, 255, 255, 0.68)',
                                borderBottomColor: brandAccent,
                                borderBottomWidth: 6,
                                boxShadow: '0 9px 18px rgba(7, 27, 51, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.42)',
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
                        </>}
                    </View>
                )}

            </View>
        </ScrollView>
        </CompanyGlassDepthProvider>
    );
}

function LeadAlertPanel({
    counts,
    loading,
    message,
    accentColor,
    primaryColor,
    onOpen,
    onRefresh,
}: {
    counts: CompanyLeadCounts | null;
    loading: boolean;
    message: string;
    accentColor: string;
    primaryColor: string;
    onOpen: () => void;
    onRefresh: () => void;
}) {
    const unavailable = message === 'Lead count unavailable.';
    const hasLeads = !!counts && counts.newLeads > 0;
    const checking = loading && !counts && !unavailable;

    return (
        <View
            style={{
                backgroundColor: hasLeads ? '#F8FAFC' : '#FFFFFF',
                borderColor: unavailable ? '#DC2626' : hasLeads ? accentColor : '#E3E8EF',
                borderRadius: 18,
                borderWidth: 1,
                marginBottom: 16,
                padding: 14,
            }}
        >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, minWidth: 220 }}>
                    <Text style={{ color: unavailable ? '#DC2626' : primaryColor, fontSize: 13, fontWeight: '900' }}>
                        Lead Alerts
                    </Text>
                    <Text style={{ color: '#64748B', fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 4 }}>
                        {unavailable
                            ? 'Lead count unavailable.'
                            : checking
                                ? 'Checking leads...'
                                : hasLeads
                                ? 'New company-visible service requests are waiting in Dispatch.'
                                : message || 'No new leads.'}
                    </Text>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <LeadAlertPill
                        label={
                            unavailable
                                ? 'Lead count unavailable.'
                                : checking
                                    ? 'Checking leads...'
                                    : hasLeads
                                        ? `New Leads: ${counts?.newLeads || 0}`
                                        : 'No new leads.'
                        }
                        backgroundColor={unavailable ? '#FEE2E2' : '#EEF4FF'}
                        textColor={unavailable ? '#DC2626' : accentColor}
                        onPress={hasLeads ? onOpen : undefined}
                    />
                    {!!counts && counts.emergencyLeads > 0 && (
                        <LeadAlertPill
                            label={`Emergency Leads: ${counts.emergencyLeads}`}
                            backgroundColor="#FEE2E2"
                            textColor="#DC2626"
                            onPress={onOpen}
                        />
                    )}
                    <LeadAlertPill
                        label={loading ? 'Refreshing...' : 'Refresh'}
                        backgroundColor="#FFFFFF"
                        textColor={primaryColor}
                        onPress={onRefresh}
                    />
                    <LeadAlertPill
                        label="Open Dispatch"
                        backgroundColor={primaryColor}
                        textColor="#FFFFFF"
                        onPress={onOpen}
                    />
                </View>
            </View>
        </View>
    );
}

function LeadAlertPill({
    label,
    backgroundColor,
    textColor,
    onPress,
}: {
    label: string;
    backgroundColor: string;
    textColor: string;
    onPress?: () => void;
}) {
    const content = (
        <View
            style={{
                backgroundColor,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
            }}
        >
            <Text numberOfLines={1} style={{ color: textColor, fontSize: 12, fontWeight: '900' }}>
                {label}
            </Text>
        </View>
    );

    if (!onPress) return content;

    return (
        <TouchableOpacity activeOpacity={0.84} onPress={onPress}>
            {content}
        </TouchableOpacity>
    );
}

function BrandInfoPill({ label, value, textColor }: { label: string; value: string; textColor: string }) {
    return (
        <View
            style={{
                maxWidth: '100%',
                flexShrink: 1,
                backgroundColor: 'rgba(255,255,255,0.14)',
                borderColor: 'rgba(255,255,255,0.48)',
                borderRadius: 999,
                borderWidth: 2,
                borderBottomColor: 'rgba(0,0,0,0.28)',
                borderBottomWidth: 4,
                boxShadow: '0 6px 12px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.38)',
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

function CompanyTechOSThemePreview({
    companyName,
    logoUrl,
    theme,
}: {
    companyName: string;
    logoUrl: string;
    theme: TechOSThemePalette;
}) {
    const { width: viewportWidth } = useWindowDimensions();
    const isPhoneLayout = viewportWidth <= 640;
    const logoCanPreview = logoUrl.trim().startsWith('http');
    const previewCards = [
        { key: 'jobs' as const, label: 'Jobs', value: '4' },
        { key: 'schedule' as const, label: 'Schedule', value: '3' },
        { key: 'estimates' as const, label: 'Estimates', value: '2' },
        { key: 'messages' as const, label: 'Messages', value: '1' },
    ];

    return (
        <View
            style={{
                width: '100%',
                backgroundColor: theme.screenBackgroundColor,
                borderColor: theme.panelBorderColor,
                borderRadius: 8,
                borderWidth: 1,
                padding: isPhoneLayout ? 12 : 16,
            }}
        >
            <View
                style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 12,
                }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    {logoCanPreview ? (
                        <Image
                            source={{ uri: logoUrl }}
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 8,
                                backgroundColor: theme.panelBackgroundColor,
                            }}
                        />
                    ) : (
                        <View
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 8,
                                backgroundColor: theme.activeBorderColor,
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <Text style={{ color: getReadableColor(theme.activeBorderColor), fontSize: 18, fontWeight: '900' }}>
                                {companyName.slice(0, 1).toUpperCase()}
                            </Text>
                        </View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: theme.textColor, fontSize: 16, fontWeight: '900' }}>
                            {companyName}
                        </Text>
                        <Text style={{ color: theme.mutedTextColor, fontSize: 12, fontWeight: '800', marginTop: 2 }}>
                            Company TechOS Preview
                        </Text>
                    </View>
                </View>
                <View
                    style={{
                        backgroundColor: theme.activeBorderColor,
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                    }}
                >
                    <Text style={{ color: getReadableColor(theme.activeBorderColor), fontSize: 11, fontWeight: '900' }}>
                        Company managed
                    </Text>
                </View>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {previewCards.map((card) => {
                    const variant = theme.dashboard[card.key];

                    return (
                        <View
                            key={card.key}
                            style={{
                                width: isPhoneLayout ? '48%' : undefined,
                                flex: isPhoneLayout ? undefined : 1,
                                minWidth: isPhoneLayout ? 0 : 120,
                                minHeight: 76,
                                backgroundColor: variant.backgroundColor,
                                borderColor: variant.borderColor,
                                borderRadius: 8,
                                borderWidth: 1,
                                padding: 10,
                                overflow: 'hidden',
                            }}
                        >
                            <View
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: 4,
                                    backgroundColor: variant.accentColor,
                                }}
                            />
                            <Text style={{ color: theme.textColor, fontSize: 20, fontWeight: '900' }}>{card.value}</Text>
                            <Text style={{ color: theme.textColor, fontSize: 12, fontWeight: '900', marginTop: 3 }}>{card.label}</Text>
                        </View>
                    );
                })}
            </View>
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
    toneIndex,
    glassDepth,
    onPress,
}: {
    title: string;
    description: string;
    actionLabel: string;
    isExpanded: boolean;
    primaryColor: string;
    accentColor: string;
    toneIndex: number;
    glassDepth: number;
    onPress: () => void;
}) {
    const { width: viewportWidth } = useWindowDimensions();
    const isPhoneLayout = viewportWidth <= 640;
    const depth = Math.max(1, Math.min(100, glassDepth)) / 100;

    const glassColor = mixHexColors(
        toneIndex % 4 === 2 ? accentColor : primaryColor,
        '#FFFFFF',
        toneIndex % 4 === 0 ? 0.72 : 0.8,
    );
    const glassBorder = mixHexColors(
        toneIndex % 4 === 2 ? accentColor : primaryColor,
        '#FFFFFF',
        0.28,
    );
    const iconColor = mixHexColors(
        toneIndex % 3 === 1 ? accentColor : primaryColor,
        '#FFFFFF',
        0.55,
    );

    return (
        <Pressable
            accessibilityRole="button"
            onPress={onPress}
            style={({ pressed }) => ({
                width: isPhoneLayout ? '100%' : '31%',
                maxWidth: '100%',
                minWidth: isPhoneLayout ? 0 : 240,
                flexShrink: 1,
                minHeight: 118,
                backgroundColor: isExpanded ? primaryColor : glassColor,
                borderRadius: 18,
                borderCurve: 'continuous',
                padding: 16,
                borderWidth: 2,
                borderTopColor: 'rgba(255, 255, 255, 0.94)',
                borderBottomColor: isExpanded ? accentColor : glassBorder,
                borderBottomWidth: pressed ? 1 : Math.max(1, Math.round(8 * depth)),
                borderColor: isExpanded ? accentColor : glassBorder,
                gap: 12,
                boxShadow: pressed
                    ? '0 1px 2px rgba(7, 27, 51, 0.14)'
                    : `0 ${Math.max(1, Math.round(10 * depth))}px ${Math.max(2, Math.round(20 * depth))}px rgba(7, 27, 51, ${0.05 + 0.2 * depth}), inset 0 1px 0 rgba(255, 255, 255, 0.94)`,
                transform: [{ translateY: pressed ? Math.max(1, Math.round(5 * depth)) : 0 }],
            })}
        >
            <View
                style={{
                    width: 44,
                    height: 44,
                    borderRadius: 15,
                    backgroundColor: isExpanded ? accentColor : iconColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <Text
                    style={{
                        color: getReadableColor(isExpanded ? accentColor : iconColor),
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
                    {actionLabel} →
                </Text>
            </View>
        </Pressable>
    );
}

function mixHexColors(base: string, overlay: string, overlayWeight: number) {
    const safeWeight = Math.max(0, Math.min(1, overlayWeight));
    const parse = (value: string) => {
        const normalized = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1) : '071B33';
        return [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
    };
    const baseRgb = parse(base);
    const overlayRgb = parse(overlay);
    return `#${baseRgb.map((channel, index) => Math.round(
        channel * (1 - safeWeight) + overlayRgb[index] * safeWeight,
    ).toString(16).padStart(2, '0')).join('')}`;
}

function replacePurpleWithGold(value: string) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) return '#D89A1D';
    const red = Number.parseInt(value.slice(1, 3), 16);
    const green = Number.parseInt(value.slice(3, 5), 16);
    const blue = Number.parseInt(value.slice(5, 7), 16);
    const looksPurple = blue > green * 1.12 && red > green * 1.08;
    return looksPurple ? '#D89A1D' : value;
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
    if (title === 'Visual Control Center') return 'Platform-only glass colors, custom palette, and card-depth controls.';
    if (title === 'Services & Trust Profile') return 'Configure categories, license, rating, and experience below.';
    if (title === 'Customers / Clients') return 'Open homes that selected this company as a preferred provider.';
    if (title === 'Leads / Requests') return 'Review incoming homeowner service requests before they become jobs.';
    if (title === 'Opportunities') return 'Track sales opportunities after request triage is built.';
    if (title === 'Estimates / Proposals') return 'Open estimate drafts and proposal foundations without fake pricing.';
    if (title === 'Jobs / Dispatch') return 'Open the dispatch queue for jobs, requests, and technician workflow setup.';
    if (title === 'Team / Technicians') return 'Open company owners, admins, managers, technicians, and invitations.';
    if (title === 'Activity / Audit Log') return 'Review company-scoped ManagementOS actions and changes.';
    if (title === 'Price Book') return 'Company-owned price book for estimate and proposal line items.';
    if (title === 'Knowledge Engine') return 'Review read-only Bravo Knowledge Engine objects before connecting them to operations.';
    if (title === 'Settings / Permissions') return 'Manage company access, owner/admin permissions, and team safety.';

    return `Open ${title.toLowerCase()} tools.`;
}

function getModuleActionLabel(title: string) {
    if (title === 'Company Profile / Identity') return 'Configure below';
    if (title === 'Visual Control Center') return 'Open Controls';
    if (title === 'Services & Trust Profile') return 'Configure below';
    if (title === 'Leads / Requests') return 'Open Requests';
    if (title === 'Jobs / Dispatch') return 'Open Dispatch';
    if (title === 'Estimates / Proposals') return 'Open Estimates';
    if (title === 'Activity / Audit Log') return 'Open Audit Log';
    if (title === 'Price Book') return 'Open Price Book';
    if (title === 'Knowledge Engine') return 'Open Viewer';
    if (title === 'Opportunities') return 'Coming Soon';
    if (title === 'Settings / Permissions') return 'Open Settings';

    return 'Open';
}

async function loadCompanyDashboardPermissions(companyId: string): Promise<CompanyPermissionSet> {
    const permissionResults = await Promise.all(
        COMPANY_DASHBOARD_PERMISSION_KEYS.map(async (permissionKey) => {
            const result = await loadCurrentCompanyPermissionAccess(permissionKey, { companyId });
            return [permissionKey, Boolean(result.access)] as const;
        })
    );

    return permissionResults.reduce((permissions, [permissionKey, allowed]) => {
        permissions[permissionKey] = allowed;
        return permissions;
    }, {
        can_view_techos: false,
        can_create_estimates: false,
        can_add_item_to_estimate: false,
        can_manage_price_book: false,
        can_view_customers: false,
        can_view_jobs: false,
        can_manage_company_users: false,
        can_manage_company_profile: false,
    } as CompanyPermissionSet);
}

function canViewCompanyModule(card: string, permissions: CompanyPermissionSet | null) {
    if (!permissions) return false;

    if (card === 'Company Profile / Identity') return permissions.can_manage_company_profile;
    if (card === 'Visual Control Center') return false;
    if (card === 'Customers / Clients') return permissions.can_view_customers;
    if (card === 'Leads / Requests') {
        return permissions.can_view_customers && permissions.can_view_jobs;
    }
    if (card === 'Opportunities') {
        return permissions.can_view_customers && permissions.can_view_jobs;
    }
    if (card === 'Estimates / Proposals') return permissions.can_create_estimates;
    if (card === 'Jobs / Dispatch') return permissions.can_view_jobs;
    if (card === 'Team / Technicians') return permissions.can_manage_company_users;
    if (card === 'Activity / Audit Log') return permissions.can_manage_company_users;
    if (card === 'Price Book') {
        return permissions.can_view_techos || permissions.can_manage_price_book;
    }
    if (card === 'Knowledge Engine') return permissions.can_view_jobs;
    if (card === 'Settings / Permissions') {
        return permissions.can_manage_company_users || permissions.can_manage_company_profile;
    }

    return false;
}

function normalizeServiceErrorMessage(message?: string | null) {
    const cleanMessage = String(message || '').trim();

    if (!cleanMessage || isFetchFailureMessage(cleanMessage)) {
        return HOMEOS_SERVICE_ERROR_MESSAGE;
    }

    return cleanMessage;
}

function isFetchFailureMessage(message?: string | null) {
    const normalizedMessage = String(message || '').toLowerCase();

    return (
        normalizedMessage.includes('failed to fetch') ||
        normalizedMessage.includes('network request failed') ||
        normalizedMessage.includes('fetch failed') ||
        normalizedMessage.includes('load failed') ||
        normalizedMessage.includes('networkerror')
    );
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;

    return HOMEOS_SERVICE_ERROR_MESSAGE;
}

function normalizeRouteParam(value?: string | string[]) {
    return (Array.isArray(value) ? value[0] || '' : value || '').trim();
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
    primaryColor,
    onToggle,
    compact = false,
    children,
}: {
    title: string;
    description: string;
    expanded: boolean;
    accentColor: string;
    primaryColor: string;
    onToggle: () => void;
    compact?: boolean;
    children: React.ReactNode;
}) {
    const { width: viewportWidth } = useWindowDimensions();
    const useCompactGrid = compact && viewportWidth > 720 && !expanded;

    return (
        <View
            style={{
                width: useCompactGrid ? '48%' : '100%',
                flexBasis: useCompactGrid ? '48%' : '100%',
                flexGrow: useCompactGrid ? 1 : 0,
                maxWidth: '100%',
                minWidth: 0,
                backgroundColor: mixHexColors(accentColor, '#FFFFFF', 0.84),
                borderColor: mixHexColors(accentColor, '#FFFFFF', 0.36),
                borderRadius: 20,
                borderWidth: 2,
                borderTopColor: 'rgba(255, 255, 255, 0.96)',
                borderBottomColor: primaryColor,
                borderBottomWidth: 6,
                boxShadow: '0 9px 18px rgba(7, 27, 51, 0.20), inset 0 2px 0 rgba(255, 255, 255, 0.94)',
                marginBottom: compact ? 0 : 16,
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
                        borderWidth: 2,
                        borderBottomColor: expanded ? primaryColor : accentColor,
                        borderBottomWidth: 4,
                        boxShadow: '0 5px 10px rgba(7, 27, 51, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.88)',
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
    onEndEditing,
    multiline,
}: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    onEndEditing?: (value: string) => void;
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
                onEndEditing={(event) => onEndEditing?.(event.nativeEvent.text)}
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
        glassDepth: String(company.glass_depth || 70),
    };
}

function companyToAuditRecord(company: Company) {
    return safeAuditRecord({
        name: company.name,
        public_name: company.public_name,
        dba_name: company.dba_name,
        logo_url: company.logo_url,
        primary_color: company.primary_color,
        secondary_color: company.secondary_color,
        accent_color: company.accent_color,
        glass_depth: company.glass_depth,
        service_categories: company.service_categories || [],
        homeos_rating: company.homeos_rating,
        homeos_rating_count: company.homeos_rating_count,
        combined_experience_years: company.combined_experience_years,
        license_number: company.license_number,
        phone: company.phone,
        website: company.website,
        short_description: company.short_description,
    });
}

async function recordCompanyAuditEvent(input: Parameters<typeof logCompanyAuditEvent>[0]) {
    try {
        await logCompanyAuditEvent(input);
    } catch {
        // The business action already succeeded; keep the audit failure from blocking MVP workflows.
    }
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
