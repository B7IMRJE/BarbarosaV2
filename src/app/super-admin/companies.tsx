import DictationTextInput from '@/components/input/DictationTextInput';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Image,
    ScrollView,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import {
    COMPANY_CREDENTIAL_MAX_LENGTH,
    formatCompanyCredential,
    normalizeCompanyCredential,
} from '../../lib/companyCredential';
import { getCompanyDisplayName } from '../../lib/companyDisplayName';
import {
    getExplicitProviderCategoryOptions,
    getProviderCategoryCatalog,
} from '../../lib/providerVisibility';
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

const providerCategoryCatalog = getProviderCategoryCatalog();

export default function CompaniesScreen() {
    const { selectFor } = useLocalSearchParams<{ selectFor?: string }>();
    const { width: viewportWidth } = useWindowDimensions();
    const isSelectingForProperties = selectFor === 'properties';
    const isPhoneLayout = viewportWidth <= 640;
    const isTabletLayout = viewportWidth <= 980;
    const pagePadding = isPhoneLayout ? 16 : 20;
    const logoSize = isPhoneLayout ? 46 : 52;
    const companyCardWidth: '100%' | '48%' | '31.5%' = isPhoneLayout ? '100%' : isTabletLayout ? '48%' : '31.5%';
    const [companies, setCompanies] = useState<Company[]>([]);
    const [name, setName] = useState('');
    const [message, setMessage] = useState('Loading companies...');
    const [loading, setLoading] = useState(false);
    const [openCategoryCompanyId, setOpenCategoryCompanyId] = useState('');
    const [savingCategoryCompanyId, setSavingCategoryCompanyId] = useState('');
    const [categoryMessageByCompanyId, setCategoryMessageByCompanyId] = useState<Record<string, string>>({});
    const [editingCredentialCompanyId, setEditingCredentialCompanyId] = useState('');
    const [credentialDraft, setCredentialDraft] = useState('');
    const [savingCredentialCompanyId, setSavingCredentialCompanyId] = useState('');
    const [credentialMessageByCompanyId, setCredentialMessageByCompanyId] = useState<Record<string, string>>({});

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

    async function updateCompanyCategory(company: Company, categoryLabel: string | null) {
        setSavingCategoryCompanyId(company.id);
        setCategoryMessageByCompanyId((current) => ({
            ...current,
            [company.id]: categoryLabel ? `Saving ${categoryLabel}...` : 'Removing category...',
        }));

        const { data, error } = await supabase.rpc('update_company_brand_profile', {
            p_company_id: company.id,
            p_public_name: company.public_name || '',
            p_dba_name: company.dba_name || '',
            p_logo_url: company.logo_url || '',
            p_primary_color: company.primary_color || company.theme_color || '#071B33',
            p_secondary_color: company.secondary_color || '#FFFFFF',
            p_accent_color: company.accent_color || '#0B5FFF',
            p_service_categories: categoryLabel ? [categoryLabel] : [],
            p_homeos_rating: Number(company.homeos_rating || 0),
            p_homeos_rating_count: Number(company.homeos_rating_count || 0),
            p_combined_experience_years: Number(company.combined_experience_years || 0),
            p_license_number: company.license_number || '',
            p_phone: company.phone || '',
            p_website: company.website || '',
            p_short_description: company.short_description || '',
        });

        setSavingCategoryCompanyId('');

        if (error) {
            setCategoryMessageByCompanyId((current) => ({
                ...current,
                [company.id]: `Could not save category: ${error.message}`,
            }));
            return;
        }

        const updatedCompany = data as Company;
        setCompanies((current) =>
            current.map((currentCompany) =>
                currentCompany.id === company.id
                    ? { ...currentCompany, ...updatedCompany }
                    : currentCompany
            )
        );
        setOpenCategoryCompanyId('');
        setCategoryMessageByCompanyId((current) => ({
            ...current,
            [company.id]: categoryLabel
                ? `${categoryLabel} category saved.`
                : 'No category. This company is hidden from homeowner discovery.',
        }));
    }

    function beginCredentialEdit(company: Company) {
        setEditingCredentialCompanyId(company.id);
        setCredentialDraft(company.license_number || '');
        setCredentialMessageByCompanyId((current) => ({ ...current, [company.id]: '' }));
    }

    function cancelCredentialEdit() {
        setEditingCredentialCompanyId('');
        setCredentialDraft('');
    }

    async function saveCompanyCredential(company: Company) {
        const nextCredential = normalizeCompanyCredential(credentialDraft);

        if (nextCredential.length > COMPANY_CREDENTIAL_MAX_LENGTH) {
            setCredentialMessageByCompanyId((current) => ({
                ...current,
                [company.id]: `Keep the license or credential under ${COMPANY_CREDENTIAL_MAX_LENGTH} characters.`,
            }));
            return;
        }

        setSavingCredentialCompanyId(company.id);
        setCredentialMessageByCompanyId((current) => ({
            ...current,
            [company.id]: nextCredential ? 'Saving license or credential...' : 'Removing license or credential...',
        }));

        const { data, error } = await supabase.rpc('update_company_brand_profile', {
            p_company_id: company.id,
            p_public_name: company.public_name || '',
            p_dba_name: company.dba_name || '',
            p_logo_url: company.logo_url || '',
            p_primary_color: company.primary_color || company.theme_color || '#071B33',
            p_secondary_color: company.secondary_color || '#FFFFFF',
            p_accent_color: company.accent_color || '#0B5FFF',
            p_service_categories: company.service_categories || [],
            p_homeos_rating: Number(company.homeos_rating || 0),
            p_homeos_rating_count: Number(company.homeos_rating_count || 0),
            p_combined_experience_years: Number(company.combined_experience_years || 0),
            p_license_number: nextCredential,
            p_phone: company.phone || '',
            p_website: company.website || '',
            p_short_description: company.short_description || '',
        });

        setSavingCredentialCompanyId('');

        if (error) {
            setCredentialMessageByCompanyId((current) => ({
                ...current,
                [company.id]: `Could not save license or credential: ${error.message}`,
            }));
            return;
        }

        const updatedCompany = data as Company;
        setCompanies((current) => current.map((currentCompany) => (
            currentCompany.id === company.id
                ? { ...currentCompany, ...updatedCompany }
                : currentCompany
        )));
        setEditingCredentialCompanyId('');
        setCredentialDraft('');
        setCredentialMessageByCompanyId((current) => ({
            ...current,
            [company.id]: nextCredential ? 'License or credential saved.' : 'License or credential marked missing.',
        }));
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
            <View style={{ width: '100%', maxWidth: 1240, minWidth: 0 }}>
                <AdminNavBar backFallback="/super-admin" />

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

                        <DictationTextInput
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

                <View
                    style={{
                        width: '100%',
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        alignItems: 'stretch',
                        gap: 14,
                    }}
                >
                    {companies.map((company) => {
                        const displayName = getCompanyDisplayName(company);
                        const dbaName = company.dba_name || company.name;
                        const primaryColor = company.primary_color || company.theme_color || '#071B33';
                        const accentColor = company.accent_color || '#0B5FFF';
                        const secondaryColor = company.secondary_color || '#FFFFFF';
                        const categories = company.service_categories || [];
                        const explicitCategories = getExplicitProviderCategoryOptions(categories);
                        const categoryButtonLabel = explicitCategories.length > 0
                            ? explicitCategories.map((category) => category.label).join(', ')
                            : 'Pick category';
                        const categoryPickerOpen = openCategoryCompanyId === company.id;
                        const savingCategory = savingCategoryCompanyId === company.id;
                        const credentialEditorOpen = editingCredentialCompanyId === company.id;
                        const savingCredential = savingCredentialCompanyId === company.id;
                        const rating = Number(company.homeos_rating || 0).toFixed(1);
                        const ratingCount = company.homeos_rating_count || 0;
                        const visibleCategories = (categories.length ? categories : ['No categories']).slice(0, 2);
                        const hiddenCategoryCount = Math.max(0, categories.length - visibleCategories.length);

                        return (
                            <TouchableOpacity
                                key={company.id}
                                onPress={() => openCompany(company.id)}
                                activeOpacity={0.86}
                                style={{
                                    width: companyCardWidth,
                                    maxWidth: '100%',
                                    minWidth: 0,
                                    flexGrow: 1,
                                    flexShrink: 1,
                                    minHeight: 230,
                                    backgroundColor: '#FFFFFF',
                                    borderRadius: 18,
                                    padding: 14,
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
                                                        fontSize: isPhoneLayout ? 18 : 19,
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

                                        {!!company.short_description && (
                                            <Text
                                                numberOfLines={2}
                                                style={{
                                                    color: '#64748B',
                                                    lineHeight: 19,
                                                    fontWeight: '700',
                                                    marginTop: 8,
                                                    minWidth: 0,
                                                }}
                                            >
                                                {company.short_description}
                                            </Text>
                                        )}

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
                                            {visibleCategories.map((category) => (
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
                                            {hiddenCategoryCount > 0 && (
                                                <View
                                                    style={{
                                                        maxWidth: '100%',
                                                        flexShrink: 1,
                                                        backgroundColor: '#F8FAFC',
                                                        borderColor: '#E3E8EF',
                                                        borderRadius: 999,
                                                        borderWidth: 1,
                                                        paddingHorizontal: 10,
                                                        paddingVertical: 6,
                                                    }}
                                                >
                                                    <Text numberOfLines={1} style={{ color: '#64748B', fontSize: 12, fontWeight: '900', flexShrink: 1 }}>
                                                        +{hiddenCategoryCount}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>

                                        {!isSelectingForProperties && (
                                            <View
                                                style={{
                                                    marginTop: 12,
                                                    borderTopWidth: 1,
                                                    borderTopColor: '#E3E8EF',
                                                    paddingTop: 12,
                                                    gap: 8,
                                                }}
                                            >
                                                <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '900' }}>
                                                    SERVICE CATEGORY
                                                </Text>
                                                <TouchableOpacity
                                                    disabled={savingCategory}
                                                    onPress={(event) => {
                                                        event.stopPropagation();
                                                        setOpenCategoryCompanyId((current) =>
                                                            current === company.id ? '' : company.id
                                                        );
                                                    }}
                                                    style={{
                                                        minHeight: 42,
                                                        borderWidth: 1,
                                                        borderColor: explicitCategories.length > 0 ? '#8BC9D2' : '#F1B7B7',
                                                        borderRadius: 12,
                                                        backgroundColor: explicitCategories.length > 0 ? '#ECFEFF' : '#FFF7F7',
                                                        paddingHorizontal: 12,
                                                        paddingVertical: 10,
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        gap: 8,
                                                    }}
                                                >
                                                    <Text
                                                        numberOfLines={2}
                                                        style={{
                                                            color: '#071B33',
                                                            fontWeight: '900',
                                                            flex: 1,
                                                            minWidth: 0,
                                                        }}
                                                    >
                                                        {savingCategory ? 'Saving...' : categoryButtonLabel}
                                                    </Text>
                                                    <Text style={{ color: '#0F7485', fontWeight: '900' }}>
                                                        {categoryPickerOpen ? '▲' : '▼'}
                                                    </Text>
                                                </TouchableOpacity>

                                                {categoryPickerOpen && (
                                                    <View
                                                        style={{
                                                            borderWidth: 1,
                                                            borderColor: '#CBD5E1',
                                                            borderRadius: 12,
                                                            backgroundColor: '#FFFFFF',
                                                            overflow: 'hidden',
                                                        }}
                                                    >
                                                        {providerCategoryCatalog.map((category) => (
                                                            <TouchableOpacity
                                                                key={category.key}
                                                                disabled={savingCategory}
                                                                onPress={(event) => {
                                                                    event.stopPropagation();
                                                                    void updateCompanyCategory(company, category.label);
                                                                }}
                                                                style={{
                                                                    paddingHorizontal: 12,
                                                                    paddingVertical: 11,
                                                                    borderBottomWidth: 1,
                                                                    borderBottomColor: '#E3E8EF',
                                                                    backgroundColor: explicitCategories.some(
                                                                        (selectedCategory) => selectedCategory.key === category.key
                                                                    )
                                                                        ? '#ECFEFF'
                                                                        : '#FFFFFF',
                                                                }}
                                                            >
                                                                <Text style={{ color: '#071B33', fontWeight: '800' }}>
                                                                    {category.label}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                        <TouchableOpacity
                                                            disabled={savingCategory}
                                                            onPress={(event) => {
                                                                event.stopPropagation();
                                                                void updateCompanyCategory(company, null);
                                                            }}
                                                            style={{
                                                                paddingHorizontal: 12,
                                                                paddingVertical: 11,
                                                                backgroundColor: '#FFF7F7',
                                                            }}
                                                        >
                                                            <Text style={{ color: '#B42318', fontWeight: '800' }}>
                                                                No category — hide from homeowners
                                                            </Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}

                                                {!!categoryMessageByCompanyId[company.id] && (
                                                    <Text
                                                        style={{
                                                            color: categoryMessageByCompanyId[company.id].startsWith('Could not')
                                                                ? '#B42318'
                                                                : '#475569',
                                                            fontSize: 12,
                                                            fontWeight: '700',
                                                            lineHeight: 17,
                                                        }}
                                                    >
                                                        {categoryMessageByCompanyId[company.id]}
                                                    </Text>
                                                )}
                                            </View>
                                        )}

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
                                            {!isSelectingForProperties && !credentialEditorOpen && (
                                                <TouchableOpacity
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`${formatCompanyCredential(company.license_number)}. Edit.`}
                                                    disabled={savingCredential}
                                                    onPress={(event) => {
                                                        event.stopPropagation();
                                                        beginCredentialEdit(company);
                                                    }}
                                                    style={{
                                                        maxWidth: '100%',
                                                        minWidth: 0,
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        gap: 6,
                                                        borderBottomWidth: 1,
                                                        borderBottomColor: company.license_number ? '#CBD5E1' : '#F1B7B7',
                                                        paddingBottom: 2,
                                                    }}
                                                >
                                                    <Text
                                                        numberOfLines={2}
                                                        style={{
                                                            color: company.license_number ? '#64748B' : '#B42318',
                                                            fontWeight: '800',
                                                            maxWidth: '100%',
                                                            flexShrink: 1,
                                                        }}
                                                    >
                                                        {formatCompanyCredential(company.license_number)}
                                                    </Text>
                                                    <Text style={{ color: accentColor, fontWeight: '900' }}>Edit</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>

                                        {!isSelectingForProperties && credentialEditorOpen && (
                                            <View
                                                style={{
                                                    marginTop: 12,
                                                    borderWidth: 1,
                                                    borderColor: '#8BC9D2',
                                                    borderRadius: 14,
                                                    backgroundColor: '#ECFEFF',
                                                    padding: 12,
                                                    gap: 9,
                                                }}
                                            >
                                                <Text style={{ color: '#071B33', fontSize: 12, fontWeight: '900' }}>
                                                    LICENSE OR PROFESSIONAL CREDENTIAL
                                                </Text>
                                                <DictationTextInput
                                                    value={credentialDraft}
                                                    onChangeText={(value) => setCredentialDraft(value.slice(0, COMPANY_CREDENTIAL_MAX_LENGTH))}
                                                    onPressIn={(event) => event.stopPropagation()}
                                                    placeholder="License number, Journeyman, Professional, or custom text"
                                                    placeholderTextColor="#64748B"
                                                    autoCapitalize="words"
                                                    autoCorrect={false}
                                                    editable={!savingCredential}
                                                    maxLength={COMPANY_CREDENTIAL_MAX_LENGTH}
                                                    style={{
                                                        minHeight: 46,
                                                        borderWidth: 1,
                                                        borderColor: '#8BC9D2',
                                                        borderRadius: 12,
                                                        backgroundColor: '#FFFFFF',
                                                        color: '#071B33',
                                                        paddingHorizontal: 12,
                                                        paddingVertical: 11,
                                                        fontWeight: '800',
                                                    }}
                                                />
                                                <Text style={{ color: '#64748B', fontSize: 12, fontWeight: '700', lineHeight: 17 }}>
                                                    Leave blank to display “Missing.” This text is reused anywhere the company credential appears.
                                                </Text>
                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                                    <TouchableOpacity
                                                        accessibilityRole="button"
                                                        disabled={savingCredential}
                                                        onPress={(event) => {
                                                            event.stopPropagation();
                                                            void saveCompanyCredential(company);
                                                        }}
                                                        style={{
                                                            flexGrow: 1,
                                                            minWidth: 110,
                                                            borderRadius: 10,
                                                            backgroundColor: '#071B33',
                                                            paddingHorizontal: 14,
                                                            paddingVertical: 11,
                                                            alignItems: 'center',
                                                            opacity: savingCredential ? 0.55 : 1,
                                                        }}
                                                    >
                                                        <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>
                                                            {savingCredential ? 'Saving...' : 'Save'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        accessibilityRole="button"
                                                        disabled={savingCredential}
                                                        onPress={(event) => {
                                                            event.stopPropagation();
                                                            cancelCredentialEdit();
                                                        }}
                                                        style={{
                                                            flexGrow: 1,
                                                            minWidth: 110,
                                                            borderWidth: 1,
                                                            borderColor: '#CBD5E1',
                                                            borderRadius: 10,
                                                            backgroundColor: '#FFFFFF',
                                                            paddingHorizontal: 14,
                                                            paddingVertical: 11,
                                                            alignItems: 'center',
                                                        }}
                                                    >
                                                        <Text style={{ color: '#071B33', fontWeight: '900' }}>Cancel</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        )}

                                        {!!credentialMessageByCompanyId[company.id] && (
                                            <Text
                                                selectable
                                                style={{
                                                    color: credentialMessageByCompanyId[company.id].startsWith('Could not') || credentialMessageByCompanyId[company.id].startsWith('Keep')
                                                        ? '#B42318'
                                                        : '#475569',
                                                    fontSize: 12,
                                                    fontWeight: '700',
                                                    lineHeight: 17,
                                                    marginTop: 8,
                                                }}
                                            >
                                                {credentialMessageByCompanyId[company.id]}
                                            </Text>
                                        )}

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
