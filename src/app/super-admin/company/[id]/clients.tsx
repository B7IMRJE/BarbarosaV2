import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import AdminNavBar from '../../../../components/AdminNavBar';
import HomeHeader from '../../../../components/HomeHeader';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import { supabase } from '../../../../lib/supabase';
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

export default function CompanyClientsScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [clients, setClients] = useState<CompanyClient[]>([]);
    const [propertiesById, setPropertiesById] = useState<Record<string, PropertyRecord>>({});
    const [preferredByPropertyId, setPreferredByPropertyId] = useState<Record<string, string>>({});
    const [companyName, setCompanyName] = useState('Company');
    const [customerInvites, setCustomerInvites] = useState<CustomerInvite[]>([]);
    const [inviteForm, setInviteForm] = useState<CustomerInviteForm>({
        invitedName: '',
        invitedEmail: '',
        invitedPhone: '',
        note: '',
    });
    const [inviteActionId, setInviteActionId] = useState('');
    const [creatingInvite, setCreatingInvite] = useState(false);
    const [inviteMessage, setInviteMessage] = useState('');
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
            .select('name, public_name, dba_name')
            .eq('id', companyId)
            .maybeSingle();
        const company = (data || {}) as { name?: string | null; public_name?: string | null; dba_name?: string | null };

        setCompanyName(company.public_name || company.dba_name || company.name || 'Company');
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
        setInviteMessage('');
    }

    async function createCustomerInvite() {
        const companyId = id ? String(id) : '';

        if (!companyId || creatingInvite) return;

        if (!inviteForm.invitedName.trim() && !inviteForm.invitedEmail.trim() && !inviteForm.invitedPhone.trim()) {
            setInviteMessage('Add a customer name, email, or phone before creating an invite.');
            return;
        }

        setCreatingInvite(true);
        setInviteMessage('Creating customer invite...');

        const { data, error } = await supabase.rpc('create_company_customer_invite', {
            p_company_id: companyId,
            p_invited_email: inviteForm.invitedEmail.trim() || null,
            p_invited_phone: inviteForm.invitedPhone.trim() || null,
            p_invited_name: inviteForm.invitedName.trim() || null,
            p_note: inviteForm.note.trim() || null,
        });

        setCreatingInvite(false);

        if (error) {
            setInviteMessage(`Could not create customer invite: ${error.message}`);
            return;
        }

        const createdInvite = firstRow<CustomerInvite>(data);
        setInviteForm({ invitedName: '', invitedEmail: '', invitedPhone: '', note: '' });
        setInviteMessage(
            createdInvite?.invite_code
                ? `Customer invite created. Code ${createdInvite.invite_code}.`
                : 'Customer invite created.'
        );
        await loadCustomerInvites(companyId);
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

        if (!invite.invite_code) {
            setInviteMessage('Create an invite code before sending an email invite.');
            return;
        }

        setInviteActionId(invite.invitation_id);
        setInviteMessage('Sending email invite...');

        const inviteLink = buildCustomerInviteLink(invite.invite_code).url;
        const { data, error } = await supabase.functions.invoke('send-customer-invite-email', {
            body: {
                invitation_id: invite.invitation_id,
                invite_link: inviteLink,
            },
        });

        setInviteActionId('');

        if (error) {
            setInviteMessage(`Email sending is not configured yet. Copy the invite message for now. ${error.message}`);
            return;
        }

        const result = (data || {}) as { ok?: boolean; message?: string };

        if (!result.ok) {
            setInviteMessage(result.message || 'Email sending is not configured yet. Copy the invite message for now.');
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

    return (
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
                    Homes that selected this company as a service provider appear here with basic home profile details.
                </Text>

                <ThemedCard style={actionCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Private HomeOS Data</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        Photos, documents, service history, quotes, and private item details are not shared from this
                        client list. Homeowners can grant deeper access later through service requests or access codes.
                    </Text>
                    <ThemedButton
                        title="Open Connections"
                        onPress={() => router.push(`/super-admin/company/${id}/connections` as any)}
                        variant="secondary"
                        style={{ marginTop: 16 }}
                    />
                </ThemedCard>

                <InviteCustomerSection
                    form={inviteForm}
                    invites={customerInvites}
                    companyName={companyName}
                    creating={creatingInvite}
                    actionInviteId={inviteActionId}
                    message={inviteMessage}
                    onChangeForm={(updates) => setInviteForm((current) => ({ ...current, ...updates }))}
                    onCreate={createCustomerInvite}
                    onRefresh={() => loadCustomerInvites(String(id))}
                    onCopy={copyInviteText}
                    onSendEmail={sendCustomerInviteEmail}
                    onSendText={sendCustomerInviteText}
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
                        <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>Clients</Text>
                        <View style={listStyle}>
                            {visibleClients.map((client) => (
                                <ClientCard
                                    key={client.id}
                                    companyId={String(id || '')}
                                    client={client}
                                    property={propertiesById[client.property_id]}
                                    preferredStatus={preferredByPropertyId[client.property_id]}
                                />
                            ))}
                        </View>
                    </View>
                )}

                {!!message && (
                    <ThemedCard style={{ marginTop: 16 }}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}

function InviteCustomerSection({
    form,
    invites,
    companyName,
    creating,
    actionInviteId,
    message,
    onChangeForm,
    onCreate,
    onRefresh,
    onCopy,
    onSendEmail,
    onSendText,
    onRevoke,
    onDeleteRevoked,
}: {
    form: CustomerInviteForm;
    invites: CustomerInvite[];
    companyName: string;
    creating: boolean;
    actionInviteId: string;
    message: string;
    onChangeForm: (updates: Partial<CustomerInviteForm>) => void;
    onCreate: () => void;
    onRefresh: () => void;
    onCopy: (value: string, successMessage: string) => void;
    onSendEmail: (invite: CustomerInvite) => void;
    onSendText: (invite: CustomerInvite) => void;
    onRevoke: (invite: CustomerInvite) => void;
    onDeleteRevoked: (invite: CustomerInvite) => void;
}) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={actionCardStyle}>
            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Invite Customer</Text>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                Create a secure manual invite link for a homeowner. Send it by text or email yourself for now.
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
                    title={creating ? 'Creating...' : 'Create Customer Invite'}
                    onPress={onCreate}
                    disabled={creating}
                    style={smallButtonStyle}
                />
                <ThemedButton
                    title="Refresh Invites"
                    variant="secondary"
                    onPress={onRefresh}
                    style={smallButtonStyle}
                />
            </View>

            {!!message && (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText, marginTop: 12 }]}>
                    {message}
                </Text>
            )}

            <View style={{ marginTop: 16, gap: 10 }}>
                <Text style={[sectionHeadingStyle, { color: theme.colors.text, marginBottom: 0 }]}>
                    Customer Invites
                </Text>
                {invites.length === 0 ? (
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        No customer invites yet.
                    </Text>
                ) : (
                    invites.map((invite) => (
                        <CustomerInviteRow
                            key={invite.invitation_id}
                            invite={invite}
                            companyName={companyName}
                            actionInviteId={actionInviteId}
                            onCopy={onCopy}
                            onSendEmail={onSendEmail}
                            onSendText={onSendText}
                            onRevoke={onRevoke}
                            onDeleteRevoked={onDeleteRevoked}
                        />
                    ))
                )}
            </View>
        </ThemedCard>
    );
}

function InviteInput({
    label,
    value,
    placeholder,
    onChangeText,
}: {
    label: string;
    value: string;
    placeholder: string;
    onChangeText: (value: string) => void;
}) {
    const { theme } = useTheme();

    return (
        <View style={inputWrapStyle}>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={theme.colors.mutedText}
                style={[
                    inputStyle,
                    {
                        borderColor: theme.colors.border,
                        color: theme.colors.text,
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
    onRevoke,
    onDeleteRevoked,
}: {
    invite: CustomerInvite;
    companyName: string;
    actionInviteId: string;
    onCopy: (value: string, successMessage: string) => void;
    onSendEmail: (invite: CustomerInvite) => void;
    onSendText: (invite: CustomerInvite) => void;
    onRevoke: (invite: CustomerInvite) => void;
    onDeleteRevoked: (invite: CustomerInvite) => void;
}) {
    const { theme } = useTheme();
    const inviteLink = buildCustomerInviteLink(invite.invite_code);
    const inviteUrl = inviteLink.url;
    const textMessage = `Hi, this is ${companyName}. Please use this secure link to connect your home with us: ${inviteUrl}`;
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
                    disabled={!invite.invite_code}
                    style={smallButtonStyle}
                />
                <ThemedButton
                    title="Copy Invite Code"
                    variant="secondary"
                    onPress={() => onCopy(invite.invite_code || '', 'Invite code copied.')}
                    disabled={!invite.invite_code}
                    style={smallButtonStyle}
                />
                <ThemedButton
                    title="Copy Text Message"
                    variant="secondary"
                    onPress={() => onCopy(textMessage, 'Text message copied.')}
                    disabled={!invite.invite_code}
                    style={smallButtonStyle}
                />
                <ThemedButton
                    title={actionInviteId === invite.invitation_id ? 'Sending...' : 'Send Email Invite'}
                    variant="secondary"
                    onPress={() => onSendEmail(invite)}
                    disabled={!invite.invited_email || !invite.invite_code || actionInviteId === invite.invitation_id}
                    style={smallButtonStyle}
                />
                <ThemedButton
                    title="Send Text Invite"
                    variant="secondary"
                    onPress={() => onSendText(invite)}
                    disabled={!invite.invited_phone || !invite.invite_code}
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
    client,
    property,
    preferredStatus,
}: {
    companyId: string;
    client: CompanyClient;
    property?: PropertyRecord;
    preferredStatus?: string;
}) {
    const { theme } = useTheme();
    const displayName = client.display_name || property?.name || 'Home';
    const linkedAt = client.connected_at || client.first_requested_at || client.created_at;
    const clientRoute = `/super-admin/company/${companyId}/client/${client.property_id}` as Href;

    return (
        <ThemedCard onPress={() => router.push(clientRoute)}>
            <Text style={[cardTitleStyle, { color: theme.colors.text }]}>{displayName}</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Status: {formatStatus(client.status)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Provider: {preferredStatus ? 'Preferred' : 'Selected'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Source: {formatSource(client.source)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                {formatAddress(property) || 'Home profile details are not available yet.'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Linked: {formatDate(linkedAt)}
            </Text>
            <ThemedButton
                title="Open Customer Home"
                variant="secondary"
                onPress={() => router.push(clientRoute)}
                style={{ marginTop: 12 }}
            />
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

function formatSource(source: string | null) {
    const normalized = normalizeStatus(source);

    if (normalized === 'homeowner_provider_request') return 'Homeowner selected';
    if (normalized === 'connection_code') return 'Connection code';
    if (normalized === 'manual') return 'Manual';

    return normalized ? titleCase(normalized.replace(/_/g, ' ')) : 'Not specified';
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

function buildCustomerInviteLink(code?: string | null): CustomerInviteLink {
    const configuredBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_APP_URL);
    const fallbackBaseUrl =
        typeof window !== 'undefined' && window.location?.origin
            ? normalizeBaseUrl(window.location.origin)
            : '';
    const baseUrl = configuredBaseUrl || fallbackBaseUrl;
    const path = `/customer-invite?code=${encodeURIComponent(code || '')}`;
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

const actionCardStyle = {
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

const listStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    gap: 12,
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
