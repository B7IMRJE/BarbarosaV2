import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, TextInput, useWindowDimensions, View, type TextInputProps } from 'react-native';
import AdminNavBar from '../../../../components/AdminNavBar';
import HomeHeader from '../../../../components/HomeHeader';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import { getCompanyDisplayName } from '../../../../lib/companyDisplayName';
import {
    buildCompanyClientDirectory,
    buildCompanyClientShelves,
    filterCompanyClientDirectory,
    filterPendingCustomerInvites,
    paginateCompanyClientDirectory,
    type CompanyClientDirectoryEntry,
    type CompanyClientDirectoryShelf,
} from '../../../../lib/companyClientDirectory';
import {
    buildCustomerInviteRpcPayload,
    customerInvitePhoneWasPersisted,
} from '../../../../lib/customerInviteDraft';
import { resolveCompanyWorkspaceTheme } from '../../../../lib/companyWorkspaceTheme';
import { supabase } from '../../../../lib/supabase';
import { ThemeContext } from '../../../../theme';
import { CompanyGlassDepthProvider } from '../../../../theme/glass-depth';
import { GlassPaletteProvider, useGlassPalette } from '../../../../theme/glass-palette-context';
import { createCompanyGlassPalette } from '../../../../theme/glassPalette';
import { useTheme } from '../../../../theme/useTheme';

type CompanyClient = {
    id: string;
    company_id: string;
    property_id: string;
    property_connection_id: string | null;
    display_name: string | null;
    status: string | null;
    source: string | null;
    first_requested_at: string | null;
    last_requested_at: string | null;
    connected_at: string | null;
    created_at: string | null;
};

type PropertyRecord = {
    id: string;
    name: string | null;
    address: string | null;
    address_line_1?: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    postal_code?: string | null;
};

type PreferredProvider = {
    property_id: string;
    company_id: string;
    status: string | null;
};

type PlatformProfile = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

type CustomerInvite = {
    invitation_id: string;
    company_id: string;
    invited_email: string | null;
    invited_phone: string | null;
    invited_name: string | null;
    note: string | null;
    status: string | null;
    invite_code: string | null;
    login_code: string | null;
    login_code_expires_at: string | null;
    expires_at: string | null;
    accepted_property_id?: string | null;
    accepted_at?: string | null;
    created_at: string | null;
};

type CustomerInviteLink = {
    url: string;
    warning: string;
};

type CustomerInviteForm = {
    invitedName: string;
    invitedEmail: string;
    invitedPhone: string;
    note: string;
};

type CustomerInviteEmailResponse = {
    ok?: boolean;
    message?: string;
    error?: string;
    code?: string;
    details?: string;
    login_code?: string;
};

type PreparedCustomerLoginInvite = {
    ok?: boolean;
    login_code?: string;
    expires_at?: string;
    message?: string;
};

type LatestLoginInvite = {
    invitationId: string;
    code: string;
    invitedName: string | null;
    invitedEmail: string | null;
    expiresAt: string | null;
};

export default function CompanyClientsScreen() {
    const themeContext = useTheme();
    const { width: windowWidth } = useWindowDimensions();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [clients, setClients] = useState<CompanyClient[]>([]);
    const [propertiesById, setPropertiesById] = useState<Record<string, PropertyRecord>>({});
    const [preferredByPropertyId, setPreferredByPropertyId] = useState<Record<string, string>>({});
    const [companyName, setCompanyName] = useState('Company');
    const [companyBrand, setCompanyBrand] = useState<{
        primary_color: string | null;
        secondary_color: string | null;
        accent_color: string | null;
        glass_depth: number | null;
    } | null>(null);
    const theme = useMemo(
        () => resolveCompanyWorkspaceTheme(themeContext.theme, companyBrand),
        [companyBrand, themeContext.theme]
    );
    const companyGlassPalette = useMemo(
        () => createCompanyGlassPalette({
            id: `company-clients-${String(id || 'unknown')}`,
            label: `${companyName} Clients`,
            primary: companyBrand?.primary_color,
            secondary: companyBrand?.secondary_color,
            accent: companyBrand?.accent_color,
        }),
        [companyBrand, companyName, id]
    );
    const [customerInvites, setCustomerInvites] = useState<CustomerInvite[]>([]);
    const [inviteForm, setInviteForm] = useState<CustomerInviteForm>({
        invitedName: '',
        invitedEmail: '',
        invitedPhone: '',
        note: '',
    });
    const inviteFormRef = useRef(inviteForm);
    const [inviteActionId, setInviteActionId] = useState('');
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [inviteMessage, setInviteMessage] = useState('');
    const [latestLoginInvite, setLatestLoginInvite] = useState<LatestLoginInvite | null>(null);
    const [searchDraft, setSearchDraft] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeShelfKey, setActiveShelfKey] = useState('');
    const [directoryPage, setDirectoryPage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadClients();
    }, [id]);

    const visibleClients = useMemo(
        () =>
            clients.filter(
                (client) =>
                    normalizeStatus(client.status) === 'active' &&
                    normalizeStatus(preferredByPropertyId[client.property_id]) === 'active'
            ),
        [clients, preferredByPropertyId]
    );
    const pendingCustomerInvites = useMemo(
        () => filterPendingCustomerInvites(customerInvites),
        [customerInvites]
    );
    const directoryEntries = useMemo(
        () => {
            const visibleClientIds = new Set(visibleClients.map((client) => client.id));

            return buildCompanyClientDirectory(
                clients.map((client) => {
                    const property = propertiesById[client.property_id];

                    return {
                        id: client.id,
                        propertyId: client.property_id,
                        displayName: client.display_name || property?.name,
                        address: formatAddress(property),
                        linkedAt: client.connected_at || client.first_requested_at || client.created_at,
                    };
                })
            ).filter((entry) => visibleClientIds.has(entry.id));
        },
        [clients, propertiesById, visibleClients]
    );
    const directoryShelves = useMemo(
        () => buildCompanyClientShelves(directoryEntries),
        [directoryEntries]
    );
    const activeShelf = useMemo(
        () => directoryShelves.find((shelf) => shelf.key === activeShelfKey) || null,
        [activeShelfKey, directoryShelves]
    );
    const filteredEntries = useMemo(
        () =>
            searchQuery
                ? filterCompanyClientDirectory(directoryEntries, searchQuery)
                : activeShelf?.entries || (directoryShelves.length === 0 ? directoryEntries : []),
        [activeShelf, directoryEntries, directoryShelves.length, searchQuery]
    );
    const pagedDirectory = useMemo(
        () => paginateCompanyClientDirectory(filteredEntries, directoryPage),
        [directoryPage, filteredEntries]
    );
    const directoryContentWidth = Math.max(280, Math.min(900, windowWidth - 40));
    const directoryColumnCount = directoryContentWidth < 520 ? 2 : directoryContentWidth < 760 ? 4 : 5;
    const directoryCardWidth = Math.floor(
        (directoryContentWidth - (directoryColumnCount - 1) * 10) / directoryColumnCount
    );
    const showDirectoryShelves = !searchQuery && directoryShelves.length > 0 && !activeShelf;

    useEffect(() => {
        setDirectoryPage(0);
    }, [activeShelfKey, searchQuery]);

    useEffect(() => {
        if (activeShelfKey && !directoryShelves.some((shelf) => shelf.key === activeShelfKey)) {
            setActiveShelfKey('');
        }
    }, [activeShelfKey, directoryShelves]);

    async function loadClients() {
        const companyId = id ? String(id) : '';

        if (!companyId) {
            setMessage('Missing company id.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setMessage('');

        const hasCompanyAccess = await verifyCompanyAccess(companyId);
        if (!hasCompanyAccess) {
            setLoading(false);
            return;
        }

        await loadCompanyName(companyId);

        const { data, error } = await supabase
            .from('company_property_clients')
            .select(
                'id, company_id, property_id, property_connection_id, display_name, status, source, first_requested_at, last_requested_at, connected_at, created_at'
            )
            .eq('company_id', companyId)
            .order('created_at', { ascending: false });

        if (error) {
            setLoading(false);
            setMessage(`Could not load company clients: ${error.message}`);
            return;
        }

        const loadedClients = (data || []) as CompanyClient[];
        setClients(loadedClients);
        await Promise.all([
            loadClientContext(companyId, loadedClients),
            loadCustomerInvites(companyId),
        ]);
        setLoading(false);
    }

    async function loadCompanyName(companyId: string) {
        const { data } = await supabase
            .from('companies')
            .select('name, public_name, dba_name, primary_color, secondary_color, accent_color, glass_depth')
            .eq('id', companyId)
            .maybeSingle();
        const company = (data || {}) as {
            name?: string | null;
            public_name?: string | null;
            dba_name?: string | null;
            primary_color?: string | null;
            secondary_color?: string | null;
            accent_color?: string | null;
            glass_depth?: number | null;
        };

        setCompanyName(getCompanyDisplayName(company));
        setCompanyBrand({
            primary_color: company.primary_color || null,
            secondary_color: company.secondary_color || null,
            accent_color: company.accent_color || null,
            glass_depth: company.glass_depth || null,
        });
    }

    async function loadCustomerInvites(companyId: string) {
        const { data, error } = await supabase.rpc('get_company_customer_invites', {
            p_company_id: companyId,
        });

        if (error) {
            setCustomerInvites([]);
            setInviteMessage(`Customer invite backend is not installed yet or could not load: ${error.message}`);
            return;
        }

        setCustomerInvites((data || []) as CustomerInvite[]);
    }

    async function createCustomerInvite() {
        const companyId = id ? String(id) : '';

        if (!companyId || creatingInvite) return;

        const inviteDraft = inviteFormRef.current;

        if (!inviteDraft.invitedEmail.trim()) {
            setInviteMessage('Add the customer email address to create a six-digit login invitation.');
            return;
        }

        const invitePayload = buildCustomerInviteRpcPayload(companyId, inviteDraft);
        setCreatingInvite(true);
        setInviteMessage('Creating customer invite...');

        const { data, error } = await supabase.rpc('create_company_customer_invite', invitePayload);

        if (error) {
            setCreatingInvite(false);
            setInviteMessage(`Could not create customer invite: ${error.message}`);
            return;
        }

        const createdInvite = firstRow<CustomerInvite>(data);

        if (!customerInvitePhoneWasPersisted(invitePayload.p_invited_phone, createdInvite?.invited_phone)) {
            setCreatingInvite(false);
            setInviteMessage('The connection was created, but its phone number was not saved. Your typed contact details were kept.');
            await loadCustomerInvites(companyId);
            return;
        }

        if (!createdInvite?.invitation_id) {
            setCreatingInvite(false);
            setInviteMessage('The customer connection was created, but its login invitation could not be identified.');
            await loadCustomerInvites(companyId);
            return;
        }

        const preparedInvite = await prepareCustomerLoginInvite(createdInvite.invitation_id);
        setCreatingInvite(false);

        if (!preparedInvite.ok || !preparedInvite.login_code) {
            setInviteMessage(preparedInvite.message || 'The customer connection was created, but the six-digit login code could not be created.');
            await loadCustomerInvites(companyId);
            return;
        }

        updateInviteForm({ invitedName: '', invitedEmail: '', invitedPhone: '', note: '' });
        setLatestLoginInvite({
            invitationId: createdInvite.invitation_id,
            code: preparedInvite.login_code,
            invitedName: createdInvite.invited_name,
            invitedEmail: createdInvite.invited_email,
            expiresAt: preparedInvite.expires_at || createdInvite.login_code_expires_at || null,
        });
        setInviteMessage(`Customer login invitation created. Six-digit code: ${preparedInvite.login_code}`);
        await loadCustomerInvites(companyId);
    }

    async function prepareCustomerLoginInvite(invitationId: string): Promise<PreparedCustomerLoginInvite> {
        const { data, error } = await supabase.functions.invoke('prepare-customer-login-invitation', {
            body: { invitation_id: invitationId },
        });

        if (error) {
            return {
                ok: false,
                message: await formatCustomerLoginCodeError(error),
            };
        }

        return (data || {}) as PreparedCustomerLoginInvite;
    }

    async function createCustomerLoginCode(invite: CustomerInvite) {
        setInviteActionId(invite.invitation_id);
        setInviteMessage('Creating six-digit customer login code...');
        const preparedInvite = await prepareCustomerLoginInvite(invite.invitation_id);
        setInviteActionId('');

        if (!preparedInvite.ok || !preparedInvite.login_code) {
            setInviteMessage(preparedInvite.message || 'The six-digit customer login code could not be created.');
            return;
        }

        setLatestLoginInvite({
            invitationId: invite.invitation_id,
            code: preparedInvite.login_code,
            invitedName: invite.invited_name,
            invitedEmail: invite.invited_email,
            expiresAt: preparedInvite.expires_at || invite.login_code_expires_at || null,
        });
        setInviteMessage(`Six-digit customer login code created: ${preparedInvite.login_code}`);
        await loadCustomerInvites(String(id));
    }

    function updateInviteForm(updates: Partial<CustomerInviteForm>) {
        const nextForm = {
            ...inviteFormRef.current,
            ...updates,
        };

        inviteFormRef.current = nextForm;
        setInviteForm(nextForm);
    }

    async function revokeCustomerInvite(invite: CustomerInvite) {
        if (!invite.invitation_id) return;

        setInviteActionId(invite.invitation_id);
        setInviteMessage('Revoking customer invite...');

        const { error } = await supabase.rpc('revoke_company_customer_invite', {
            p_invitation_id: invite.invitation_id,
            p_reason: null,
        });

        setInviteActionId('');

        if (error) {
            setInviteMessage(`Could not revoke customer invite: ${error.message}`);
            return;
        }

        setInviteMessage('Customer invite revoked.');
        await loadCustomerInvites(String(id));
    }

    async function deleteRevokedCustomerInvite(invite: CustomerInvite) {
        if (!invite.invitation_id) return;

        setInviteActionId(invite.invitation_id);
        setInviteMessage('Deleting revoked customer invite...');

        const { error } = await supabase.rpc('delete_revoked_customer_invite', {
            p_invitation_id: invite.invitation_id,
        });

        setInviteActionId('');

        if (error) {
            setInviteMessage(`Could not delete revoked customer invite: ${error.message}`);
            return;
        }

        setInviteMessage('Revoked customer invite deleted.');
        await loadCustomerInvites(String(id));
    }

    async function copyInviteText(value: string, successMessage: string) {
        try {
            const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null;

            if (clipboard?.writeText) {
                await clipboard.writeText(value);
                setInviteMessage(successMessage);
                return;
            }
        } catch {
            // Fall through to showing the text.
        }

        setInviteMessage(`${successMessage} Copy manually: ${value}`);
    }

    async function sendCustomerInviteEmail(invite: CustomerInvite) {
        if (!invite.invited_email) {
            setInviteMessage('Add an email before sending an email invite.');
            return;
        }

        if (!invite.login_code) {
            setInviteMessage('Create the six-digit login code before sending an email invite.');
            return;
        }

        setInviteActionId(invite.invitation_id);
        setInviteMessage('Sending email invite...');

        const inviteLink = buildCustomerLoginLink(invite.login_code).url;
        const { data, error } = await supabase.functions.invoke('send-customer-invite-email', {
            body: {
                invitation_id: invite.invitation_id,
                invite_link: inviteLink,
            },
        });

        setInviteActionId('');

        if (error) {
            setInviteMessage(await formatCustomerInviteEmailError(error));
            return;
        }

        const result = (data || {}) as CustomerInviteEmailResponse;

        if (!result.ok) {
            setInviteMessage(formatCustomerInviteEmailResponse(result));
            return;
        }

        setInviteMessage(result.message || 'Email invite sent.');
    }

    function sendCustomerInviteText(invite: CustomerInvite) {
        if (!invite.invited_phone) {
            setInviteMessage('Add a phone number before sending a text invite.');
            return;
        }

        setInviteMessage('Text sending is not configured yet. Copy the invite text for now.');
    }

    async function verifyCompanyAccess(companyId: string) {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            router.replace('/auth/login' as any);
            return false;
        }

        const platformAdminCheck = await loadPlatformAdminStatus(user.id);
        if (platformAdminCheck.isPlatformAdmin) {
            return true;
        }

        const { data, error } = await supabase
            .from('company_users')
            .select('id')
            .eq('auth_user_id', user.id)
            .eq('company_id', companyId)
            .eq('status', 'active')
            .limit(1);

        if (error) {
            setMessage(`Could not verify company access: ${error.message}`);
            return false;
        }

        if (!data || data.length === 0) {
            setMessage('No active membership found for this company.');
            return false;
        }

        return true;
    }

    async function loadClientContext(companyId: string, loadedClients: CompanyClient[]) {
        const propertyIds = Array.from(new Set(loadedClients.map((client) => client.property_id).filter(Boolean)));

        if (propertyIds.length === 0) {
            setPropertiesById({});
            setPreferredByPropertyId({});
            return;
        }

        const [propertiesResult, preferredResult] = await Promise.all([
            supabase
                .from('properties')
                .select('id, name, address, address_line_1, city, state, zip, postal_code')
                .in('id', propertyIds),
            supabase
                .from('property_preferred_providers')
                .select('property_id, company_id, status')
                .eq('company_id', companyId)
                .eq('status', 'active')
                .in('property_id', propertyIds),
        ]);

        if (propertiesResult.error) {
            setMessage(`Clients loaded, but home profiles could not be loaded: ${propertiesResult.error.message}`);
            setPropertiesById({});
        } else {
            const nextPropertiesById = ((propertiesResult.data || []) as PropertyRecord[]).reduce<
                Record<string, PropertyRecord>
            >((accumulator, property) => {
                accumulator[property.id] = property;
                return accumulator;
            }, {});
            setPropertiesById(nextPropertiesById);
        }

        if (preferredResult.error) {
            setPreferredByPropertyId({});
            return;
        }

        const nextPreferredByPropertyId = ((preferredResult.data || []) as PreferredProvider[]).reduce<
            Record<string, string>
        >((accumulator, preferredProvider) => {
            if (normalizeStatus(preferredProvider.status) === 'active') {
                accumulator[preferredProvider.property_id] = preferredProvider.status || 'active';
            }
            return accumulator;
        }, {});

        setPreferredByPropertyId(nextPreferredByPropertyId);
    }

    function runCustomerSearch() {
        setSearchQuery(searchDraft.trim());
        setActiveShelfKey('');
    }

    function clearCustomerSearch() {
        setSearchDraft('');
        setSearchQuery('');
        setActiveShelfKey('');
    }

    return (
        <ThemeContext.Provider
            value={{
                ...themeContext,
                theme,
                appearance: {
                    ...themeContext.appearance,
                    appearanceStyle: 'glass',
                },
            }}
        >
        <CompanyGlassDepthProvider value={companyBrand?.glass_depth}>
        <GlassPaletteProvider palette={companyGlassPalette}>
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900, minWidth: 0 }}>
                <HomeHeader />

                <AdminNavBar
                    companyId={String(id || '')}
                    backFallback={`/super-admin/company/${id}` as Href}
                />

                <Text style={[titleStyle, { color: theme.colors.text }]}>Company Clients</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Find and open connected customer homes.
                </Text>

                <InviteCustomerSection
                    form={inviteForm}
                    invites={pendingCustomerInvites}
                    companyName={companyName}
                    creating={creatingInvite}
                    actionInviteId={inviteActionId}
                    message={inviteMessage}
                    latestLoginInvite={latestLoginInvite}
                    onChangeForm={updateInviteForm}
                    onCreate={createCustomerInvite}
                    onRefresh={() => loadCustomerInvites(String(id))}
                    onCopy={copyInviteText}
                    onSendEmail={sendCustomerInviteEmail}
                    onSendText={sendCustomerInviteText}
                    onPrepareLoginCode={createCustomerLoginCode}
                    onRevoke={revokeCustomerInvite}
                    onDeleteRevoked={deleteRevokedCustomerInvite}
                />

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading clients...</Text>
                    </ThemedCard>
                ) : visibleClients.length === 0 ? (
                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>No clients yet</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            Homeowners who choose this company as a provider will appear here.
                        </Text>
                    </ThemedCard>
                ) : (
                    <View style={sectionStyle}>
                        <View style={directoryHeaderStyle}>
                            <View style={{ minWidth: 0 }}>
                                <Text style={[sectionHeadingStyle, { color: theme.colors.text, marginBottom: 2 }]}>
                                    Customers
                                </Text>
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText, marginTop: 0 }]}>
                                    {directoryEntries.length} connected
                                </Text>
                            </View>
                        </View>

                        <View style={searchRowStyle}>
                            <TextInput
                                value={searchDraft}
                                onChangeText={setSearchDraft}
                                onSubmitEditing={runCustomerSearch}
                                placeholder="Search name, address, or customer number"
                                placeholderTextColor={theme.colors.mutedText}
                                returnKeyType="search"
                                style={[
                                    searchInputStyle,
                                    {
                                        backgroundColor: theme.colors.surface,
                                        borderColor: theme.colors.border,
                                        color: theme.colors.text,
                                    },
                                ]}
                            />
                            <ThemedButton
                                title="Search"
                                onPress={runCustomerSearch}
                                style={searchButtonStyle}
                            />
                            {!!searchQuery && (
                                <ThemedButton
                                    title="Clear"
                                    onPress={clearCustomerSearch}
                                    variant="secondary"
                                    style={searchButtonStyle}
                                />
                            )}
                        </View>

                        {showDirectoryShelves ? (
                            <View style={directoryGridStyle}>
                                {directoryShelves.map((shelf) => (
                                    <DirectoryShelfCard
                                        key={shelf.key}
                                        shelf={shelf}
                                        width={directoryCardWidth}
                                        onPress={() => setActiveShelfKey(shelf.key)}
                                    />
                                ))}
                            </View>
                        ) : (
                            <>
                                <View style={directoryResultsHeaderStyle}>
                                    <View style={{ minWidth: 0 }}>
                                        <Text style={[cardTitleStyle, { color: theme.colors.text }]} numberOfLines={1}>
                                            {searchQuery
                                                ? `Search results for "${searchQuery}"`
                                                : activeShelf
                                                    ? `${activeShelf.label} customers`
                                                    : 'All customers'}
                                        </Text>
                                        <Text style={[metaTextStyle, { color: theme.colors.mutedText, marginTop: 2 }]}>
                                            {filteredEntries.length} {filteredEntries.length === 1 ? 'customer' : 'customers'}
                                        </Text>
                                    </View>
                                    {!!activeShelf && (
                                        <ThemedButton
                                            title="Back to letters"
                                            onPress={() => setActiveShelfKey('')}
                                            variant="secondary"
                                            style={directoryBackButtonStyle}
                                        />
                                    )}
                                </View>

                                {pagedDirectory.entries.length === 0 ? (
                                    <ThemedCard>
                                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                            No customers match this search.
                                        </Text>
                                    </ThemedCard>
                                ) : (
                                    <View style={directoryGridStyle}>
                                        {pagedDirectory.entries.map((entry) => (
                                            <ClientCard
                                                key={entry.id}
                                                companyId={String(id || '')}
                                                entry={entry}
                                                width={directoryCardWidth}
                                            />
                                        ))}
                                    </View>
                                )}

                                {pagedDirectory.pageCount > 1 && (
                                    <View style={paginationStyle}>
                                        <ThemedButton
                                            title="Previous"
                                            onPress={() => setDirectoryPage((page) => Math.max(0, page - 1))}
                                            disabled={pagedDirectory.page === 0}
                                            variant="secondary"
                                            style={paginationButtonStyle}
                                        />
                                        <Text style={[metaTextStyle, { color: theme.colors.mutedText, marginTop: 0 }]}>
                                            Page {pagedDirectory.page + 1} of {pagedDirectory.pageCount}
                                        </Text>
                                        <ThemedButton
                                            title="Next"
                                            onPress={() =>
                                                setDirectoryPage((page) =>
                                                    Math.min(pagedDirectory.pageCount - 1, page + 1)
                                                )
                                            }
                                            disabled={pagedDirectory.page >= pagedDirectory.pageCount - 1}
                                            variant="secondary"
                                            style={paginationButtonStyle}
                                        />
                                    </View>
                                )}
                            </>
                        )}
                    </View>
                )}

                {!!message && (
                    <ThemedCard style={{ marginTop: 16 }}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
        </GlassPaletteProvider>
        </CompanyGlassDepthProvider>
        </ThemeContext.Provider>
    );
}

function InviteCustomerSection({
    form,
    invites,
    companyName,
    creating,
    actionInviteId,
    message,
    latestLoginInvite,
    onChangeForm,
    onCreate,
    onRefresh,
    onCopy,
    onSendEmail,
    onSendText,
    onPrepareLoginCode,
    onRevoke,
    onDeleteRevoked,
}: {
    form: CustomerInviteForm;
    invites: CustomerInvite[];
    companyName: string;
    creating: boolean;
    actionInviteId: string;
    message: string;
    latestLoginInvite: LatestLoginInvite | null;
    onChangeForm: (updates: Partial<CustomerInviteForm>) => void;
    onCreate: () => void;
    onRefresh: () => void;
    onCopy: (value: string, successMessage: string) => void;
    onSendEmail: (invite: CustomerInvite) => void;
    onSendText: (invite: CustomerInvite) => void;
    onPrepareLoginCode: (invite: CustomerInvite) => void;
    onRevoke: (invite: CustomerInvite) => void;
    onDeleteRevoked: (invite: CustomerInvite) => void;
}) {
    const { theme } = useTheme();
    const glassPalette = useGlassPalette();
    const [composerOpen, setComposerOpen] = useState(false);
    const [pendingOpen, setPendingOpen] = useState(false);

    return (
        <View style={inviteSectionStyle}>
            <View style={inviteActionRowStyle}>
                <ThemedButton
                    title={composerOpen ? 'Close invitation form' : 'Invite homeowner'}
                    onPress={() => setComposerOpen((open) => !open)}
                    style={inviteActionButtonStyle}
                />
                {invites.length > 0 && (
                    <ThemedButton
                        title={`${invites.length} pending ${invites.length === 1 ? 'invitation' : 'invitations'}`}
                        onPress={() => setPendingOpen((open) => !open)}
                        variant="secondary"
                        style={inviteActionButtonStyle}
                    />
                )}
            </View>

            {!!message && (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    {message}
                </Text>
            )}

            {latestLoginInvite ? (
                <ThemedCard>
                    <Text style={[sectionTitleStyle, { color: glassPalette.text }]}>
                        Homeowner Login Code
                    </Text>
                    <Text style={[metaTextStyle, { color: glassPalette.mutedText }]}>
                        {latestLoginInvite.invitedName ||
                            latestLoginInvite.invitedEmail ||
                            'New homeowner invitation'}
                    </Text>
                    <Text selectable style={[loginCodeStyle, { color: glassPalette.text }]}>
                        {latestLoginInvite.code}
                    </Text>
                    <Text style={[bodyTextStyle, { color: glassPalette.mutedText }]}>
                        At HomeOS sign-in, choose Invitation Code and enter this six-digit code.
                    </Text>
                    {latestLoginInvite.expiresAt ? (
                        <Text style={[metaTextStyle, { color: glassPalette.mutedText }]}>
                            Expires {formatDate(latestLoginInvite.expiresAt)}
                        </Text>
                    ) : null}
                    <View style={buttonRowStyle}>
                        <ThemedButton
                            title="Copy Code"
                            onPress={() =>
                                onCopy(latestLoginInvite.code, 'Login code copied.')
                            }
                            style={smallButtonStyle}
                        />
                        <ThemedButton
                            title="Copy Login Link"
                            onPress={() =>
                                onCopy(
                                    buildCustomerLoginLink(latestLoginInvite.code).url,
                                    'Login link copied.',
                                )
                            }
                            variant="secondary"
                            style={smallButtonStyle}
                        />
                    </View>
                </ThemedCard>
            ) : null}

            {composerOpen && (
                <ThemedCard>
                    <Text style={[sectionTitleStyle, { color: glassPalette.text }]}>Invite Homeowner</Text>
                    <Text style={[metaTextStyle, { color: glassPalette.mutedText }]}>
                        Creates a six-digit, one-time HomeOS login code. The customer can connect or create their home after signing in.
                    </Text>
                    <View style={formGridStyle}>
                        <InviteInput
                            label="Customer name"
                            value={form.invitedName}
                            placeholder="Optional"
                            onChangeText={(invitedName) => onChangeForm({ invitedName })}
                        />
                        <InviteInput
                            label="Email"
                            value={form.invitedEmail}
                            placeholder="Optional"
                            onChangeText={(invitedEmail) => onChangeForm({ invitedEmail })}
                        />
                        <InviteInput
                            label="Phone"
                            value={form.invitedPhone}
                            placeholder="Optional"
                            keyboardType="phone-pad"
                            autoComplete="tel"
                            onChangeText={(invitedPhone) => onChangeForm({ invitedPhone })}
                        />
                        <InviteInput
                            label="Note"
                            value={form.note}
                            placeholder="Optional internal note"
                            onChangeText={(note) => onChangeForm({ note })}
                        />
                    </View>
                    <View style={buttonRowStyle}>
                        <ThemedButton
                            title={creating ? 'Creating...' : 'Create Login Invitation'}
                            onPress={onCreate}
                            disabled={creating}
                            style={smallButtonStyle}
                        />
                    </View>
                </ThemedCard>
            )}

            {pendingOpen && invites.length > 0 && (
                <ThemedCard>
                    <View style={pendingHeaderStyle}>
                        <Text style={[sectionTitleStyle, { color: glassPalette.text, marginBottom: 0 }]}>
                            Pending Invitations
                        </Text>
                        <ThemedButton
                            title="Refresh"
                            variant="secondary"
                            onPress={onRefresh}
                            style={refreshInviteButtonStyle}
                        />
                    </View>
                    <View style={pendingListStyle}>
                        {invites.map((invite) => (
                            <CustomerInviteRow
                                key={invite.invitation_id}
                                invite={invite}
                                companyName={companyName}
                                actionInviteId={actionInviteId}
                                onCopy={onCopy}
                                onSendEmail={onSendEmail}
                                onSendText={onSendText}
                                onPrepareLoginCode={onPrepareLoginCode}
                                onRevoke={onRevoke}
                                onDeleteRevoked={onDeleteRevoked}
                            />
                        ))}
                    </View>
                </ThemedCard>
            )}
        </View>
    );
}

function InviteInput({
    label,
    value,
    placeholder,
    keyboardType,
    autoComplete,
    onChangeText,
}: {
    label: string;
    value: string;
    placeholder: string;
    keyboardType?: TextInputProps['keyboardType'];
    autoComplete?: TextInputProps['autoComplete'];
    onChangeText: (value: string) => void;
}) {
    const glassPalette = useGlassPalette();

    return (
        <View style={inputWrapStyle}>
            <Text style={[metaTextStyle, { color: glassPalette.mutedText }]}>{label}</Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={glassPalette.mutedText}
                keyboardType={keyboardType}
                autoComplete={autoComplete}
                style={[
                    inputStyle,
                    {
                        backgroundColor: 'rgba(255, 255, 255, 0.12)',
                        borderColor: glassPalette.tones.steel.border,
                        color: glassPalette.text,
                    },
                ]}
            />
        </View>
    );
}

function CustomerInviteRow({
    invite,
    companyName,
    actionInviteId,
    onCopy,
    onSendEmail,
    onSendText,
    onPrepareLoginCode,
    onRevoke,
    onDeleteRevoked,
}: {
    invite: CustomerInvite;
    companyName: string;
    actionInviteId: string;
    onCopy: (value: string, successMessage: string) => void;
    onSendEmail: (invite: CustomerInvite) => void;
    onSendText: (invite: CustomerInvite) => void;
    onPrepareLoginCode: (invite: CustomerInvite) => void;
    onRevoke: (invite: CustomerInvite) => void;
    onDeleteRevoked: (invite: CustomerInvite) => void;
}) {
    const { theme } = useTheme();
    const inviteLink = buildCustomerLoginLink(invite.login_code);
    const inviteUrl = inviteLink.url;
    const textMessage = `Hi, this is ${companyName}. Open this secure HomeOS login link and use code ${invite.login_code || 'not created'}: ${inviteUrl}`;
    const status = normalizeStatus(invite.status);
    const isPending = status === 'pending';
    const isRevoked = status === 'revoked';

    return (
        <View
            style={[
                inviteRowStyle,
                {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                },
            ]}
        >
            <Text style={[cardTitleStyle, { color: theme.colors.text }]} numberOfLines={1}>
                {invite.invited_name || invite.invited_email || invite.invited_phone || 'Customer invite'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Status: {formatStatus(invite.status)} / Expires: {formatDate(invite.expires_at)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                Contact: {[invite.invited_email, invite.invited_phone].filter(Boolean).join(' / ') || 'Not provided'}
            </Text>
            <Text selectable style={[loginCodeStyle, { color: theme.colors.text }]}>
                Login code: {invite.login_code || 'Not created'}
            </Text>
            {!!inviteLink.warning && (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    {inviteLink.warning}
                </Text>
            )}
            <View style={buttonRowStyle}>
                <ThemedButton
                    title="Copy Invite Link"
                    variant="secondary"
                    onPress={() => onCopy(inviteUrl, 'Invite link copied.')}
                    disabled={!invite.login_code}
                    style={smallButtonStyle}
                />
                <ThemedButton
                    title="Copy Invite Code"
                    variant="secondary"
                    onPress={() => onCopy(invite.login_code || '', 'Six-digit login code copied.')}
                    disabled={!invite.login_code}
                    style={smallButtonStyle}
                />
                <ThemedButton
                    title={
                        actionInviteId === invite.invitation_id
                            ? 'Refreshing...'
                            : invite.login_code
                                ? 'Refresh Code'
                                : 'Create Login Code'
                    }
                    variant="secondary"
                    onPress={() => onPrepareLoginCode(invite)}
                    disabled={!invite.invited_email || actionInviteId === invite.invitation_id}
                    style={smallButtonStyle}
                />
                <ThemedButton
                    title="Copy Text Message"
                    variant="secondary"
                    onPress={() => onCopy(textMessage, 'Text message copied.')}
                    disabled={!invite.login_code}
                    style={smallButtonStyle}
                />
                <ThemedButton
                    title={actionInviteId === invite.invitation_id ? 'Sending...' : 'Send Email Invite'}
                    variant="secondary"
                    onPress={() => onSendEmail(invite)}
                    disabled={!invite.invited_email || !invite.login_code || actionInviteId === invite.invitation_id}
                    style={smallButtonStyle}
                />
                <ThemedButton
                    title="Send Text Invite"
                    variant="secondary"
                    onPress={() => onSendText(invite)}
                    disabled={!invite.invited_phone || !invite.login_code}
                    style={smallButtonStyle}
                />
                {isPending && (
                    <ThemedButton
                        title={actionInviteId === invite.invitation_id ? 'Revoking...' : 'Revoke Invitation'}
                        variant="secondary"
                        onPress={() => onRevoke(invite)}
                        disabled={actionInviteId === invite.invitation_id}
                        style={smallButtonStyle}
                    />
                )}
                {isRevoked && (
                    <ThemedButton
                        title={actionInviteId === invite.invitation_id ? 'Deleting...' : 'Delete Revoked Invitation'}
                        variant="secondary"
                        onPress={() => onDeleteRevoked(invite)}
                        disabled={actionInviteId === invite.invitation_id}
                        style={smallButtonStyle}
                    />
                )}
            </View>
        </View>
    );
}

function ClientCard({
    companyId,
    entry,
    width,
}: {
    companyId: string;
    entry: CompanyClientDirectoryEntry;
    width: number;
}) {
    const { theme } = useTheme();
    const glassPalette = useGlassPalette();
    const clientRoute = `/super-admin/company/${companyId}/client/${entry.propertyId}` as Href;

    return (
        <ThemedCard
            onPress={() => router.push(clientRoute)}
            style={[customerCardStyle, { width }]}
            contentStyle={{ borderColor: theme.colors.border }}
        >
            <View style={customerCardMetaStyle}>
                <Text style={[customerNumberStyle, { color: glassPalette.text }]}>
                    #{entry.customerNumber}
                </Text>
                <Text style={[customerTenureStyle, { color: glassPalette.mutedText }]} numberOfLines={1}>
                    {entry.tenure}
                </Text>
            </View>
            <View style={customerCardIdentityStyle}>
                <Text style={[customerNameStyle, { color: glassPalette.text }]} numberOfLines={2}>
                    {entry.name}
                </Text>
                <Text style={[customerAddressStyle, { color: glassPalette.mutedText }]} numberOfLines={2}>
                    {entry.address}
                </Text>
            </View>
        </ThemedCard>
    );
}

function DirectoryShelfCard({
    shelf,
    width,
    onPress,
}: {
    shelf: CompanyClientDirectoryShelf;
    width: number;
    onPress: () => void;
}) {
    const { theme } = useTheme();

    return (
        <ThemedCard
            onPress={onPress}
            style={[directoryShelfStyle, { width }]}
            contentStyle={{ borderColor: theme.colors.primary }}
        >
            <Text style={[directoryShelfLabelStyle, { color: theme.colors.text }]} numberOfLines={1}>
                {shelf.label}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText, marginTop: 2 }]} numberOfLines={1}>
                {shelf.entries.length} customers
            </Text>
        </ThemedCard>
    );
}

async function loadPlatformAdminStatus(userId: string) {
    const primaryQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

    if (!primaryQuery.error) {
        return {
            isPlatformAdmin: isPlatformAdminProfile((primaryQuery.data || [])[0] as PlatformProfile | undefined),
        };
    }

    const fallbackQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

    return {
        isPlatformAdmin: isPlatformAdminProfile((fallbackQuery.data || [])[0] as PlatformProfile | undefined),
    };
}

function isPlatformAdminProfile(profile?: PlatformProfile | null) {
    return (
        String(profile?.role || '').trim().toUpperCase() === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

function formatAddress(property?: PropertyRecord) {
    if (!property) return '';

    const street = property.address || property.address_line_1;
    const postalCode = property.zip || property.postal_code;

    return [street, property.city, property.state, postalCode].filter(Boolean).join(', ');
}

function formatStatus(status: string | null) {
    const normalized = normalizeStatus(status);

    if (normalized === 'active') return 'Active';
    if (normalized === 'pending') return 'Pending';
    if (normalized === 'archived') return 'Archived';

    return normalized ? titleCase(normalized) : 'Unknown';
}

function formatDate(value: string | null) {
    if (!value) return 'Not available';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Not available';
    }

    return date.toLocaleDateString();
}

function normalizeStatus(status: string | null) {
    return String(status || '').trim().toLowerCase();
}

function titleCase(value: string) {
    return value
        .split(' ')
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function firstRow<T>(data: unknown): T | null {
    if (Array.isArray(data)) return (data[0] as T | undefined) || null;
    return (data as T | null) || null;
}

function buildCustomerLoginLink(code?: string | null): CustomerInviteLink {
    const configuredBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_APP_URL);
    const fallbackBaseUrl =
        typeof window !== 'undefined' && window.location?.origin
            ? normalizeBaseUrl(window.location.origin)
            : '';
    const baseUrl = configuredBaseUrl || fallbackBaseUrl;
    const path = `/auth/login?invitationCode=${encodeURIComponent(code || '')}`;
    const warning = !configuredBaseUrl && isLikelyNonPublicInviteOrigin(fallbackBaseUrl)
        ? 'Warning: this link may not be public. Set EXPO_PUBLIC_APP_URL to your production app URL.'
        : '';

    return {
        url: baseUrl ? `${baseUrl}${path}` : path,
        warning,
    };
}

function normalizeBaseUrl(value?: string | null) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function isLikelyNonPublicInviteOrigin(origin: string) {
    if (!origin) return true;

    try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();

        return (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.endsWith('.local') ||
            hostname.endsWith('.vercel.app')
        );
    } catch {
        return true;
    }
}

async function formatCustomerInviteEmailError(error: unknown) {
    const response = readFunctionErrorResponse(error);
    const fallbackMessage = error instanceof Error
        ? error.message
        : 'Customer invite email could not be sent.';

    if (!response) {
        return `Customer invite email failed: ${fallbackMessage}`;
    }

    try {
        const payload = await response.clone().json() as CustomerInviteEmailResponse;

        return formatCustomerInviteEmailResponse(payload);
    } catch {
        try {
            const text = await response.clone().text();

            return `Customer invite email failed: ${text || fallbackMessage}`;
        } catch {
            return `Customer invite email failed: ${fallbackMessage}`;
        }
    }
}

async function formatCustomerLoginCodeError(error: unknown) {
    const context = (
        typeof error === 'object' &&
        error !== null &&
        'context' in error
    )
        ? (error as { context?: unknown }).context
        : null;

    if (context instanceof Response) {
        const payload = await context.clone().json().catch(() => null) as PreparedCustomerLoginInvite | null;
        if (payload?.message) return payload.message;
    }

    const message = error instanceof Error ? error.message : '';
    return message || 'Could not create the six-digit customer login code.';
}

function formatCustomerInviteEmailResponse(payload: CustomerInviteEmailResponse) {
    const message = payload.error || payload.message || 'Customer invite email could not be sent.';
    const detail = [payload.code, payload.details].filter(Boolean).join(': ');

    return detail
        ? `Customer invite email failed: ${message} (${detail})`
        : `Customer invite email failed: ${message}`;
}

function readFunctionErrorResponse(error: unknown) {
    if (!error || typeof error !== 'object') return null;

    const context = (error as { context?: unknown }).context;

    return isResponseLike(context) ? context : null;
}

function isResponseLike(value: unknown): value is Response {
    return (
        typeof Response !== 'undefined' &&
        value instanceof Response
    );
}

const backTextStyle = {
    marginTop: 20,
    marginBottom: 20,
    fontSize: 18,
    fontWeight: '900' as const,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const subtitleStyle = {
    fontSize: 17,
    lineHeight: 24,
    marginTop: 8,
    marginBottom: 24,
};

const sectionStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    marginTop: 24,
};

const sectionHeadingStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 14,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};

const formGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 14,
};

const inputWrapStyle = {
    flexBasis: 180,
    flexGrow: 1,
    minWidth: 160,
};

const inputStyle = {
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '800' as const,
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const buttonRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 12,
};

const smallButtonStyle = {
    flexBasis: 150,
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const inviteRowStyle = {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
};

const inviteSectionStyle = {
    width: '100%' as const,
    gap: 12,
    marginBottom: 8,
};

const inviteActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const inviteActionButtonStyle = {
    flexBasis: 190,
    flexGrow: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
};

const pendingHeaderStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    flexWrap: 'wrap' as const,
};

const pendingListStyle = {
    gap: 10,
    marginTop: 14,
};

const loginCodeStyle = {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '900' as const,
    letterSpacing: 3,
};

const refreshInviteButtonStyle = {
    paddingHorizontal: 14,
    paddingVertical: 10,
};

const directoryHeaderStyle = {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
    marginBottom: 14,
};

const searchRowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'stretch' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 16,
};

const searchInputStyle = {
    minWidth: 210,
    flexBasis: 320,
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 15,
    fontWeight: '800' as const,
    paddingHorizontal: 14,
    paddingVertical: 12,
};

const searchButtonStyle = {
    minWidth: 96,
    paddingHorizontal: 16,
    paddingVertical: 12,
};

const directoryGridStyle = {
    width: '100%' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'stretch' as const,
    gap: 10,
};

const directoryResultsHeaderStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 12,
};

const directoryBackButtonStyle = {
    paddingHorizontal: 14,
    paddingVertical: 10,
};

const customerCardStyle = {
    aspectRatio: 1.08,
    justifyContent: 'space-between' as const,
    padding: 14,
};

const customerCardMetaStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 6,
};

const customerNumberStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const customerTenureStyle = {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800' as const,
    textAlign: 'right' as const,
};

const customerCardIdentityStyle = {
    minWidth: 0,
    gap: 5,
};

const customerNameStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    lineHeight: 21,
};

const customerAddressStyle = {
    fontSize: 13,
    fontWeight: '800' as const,
    lineHeight: 17,
};

const directoryShelfStyle = {
    aspectRatio: 1.08,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: 14,
};

const directoryShelfLabelStyle = {
    fontSize: 28,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
};

const paginationStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 16,
};

const paginationButtonStyle = {
    minWidth: 110,
    paddingHorizontal: 14,
    paddingVertical: 10,
};

const cardTitleStyle = {
    fontSize: 19,
    fontWeight: '900' as const,
    flexShrink: 1,
};

const metaTextStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 6,
};
