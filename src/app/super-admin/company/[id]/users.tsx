import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import {
    COMPANY_PERMISSION_LABELS,
    canAccessTechOS as canAccessCompanyTechOS,
    isTechnicianCompanyRole,
    normalizeCompanyRole,
    normalizeCompanyStatus,
    resolveCompanyPermissions,
    type CompanyPermissionKey,
    type CompanyPermissionSet,
} from '../../../../lib/companyPermissions';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/useTheme';

type CompanyRole = 'owner' | 'admin' | 'manager' | 'office' | 'technician';
type MemberActionStatus = 'active' | 'suspended' | 'inactive';

type CompanyUser = {
    id: string;
    company_id: string;
    auth_user_id: string | null;
    full_name: string | null;
    email: string | null;
    role: string;
    status: string;
    created_at: string | null;
    permissions?: Partial<CompanyPermissionSet> | null;
};

type CompanyInvitation = {
    id: string;
    company_id: string;
    email: string;
    full_name: string | null;
    role: string;
    status: string;
    expires_at: string | null;
    created_at: string | null;
    last_email_attempted_at: string | null;
    last_email_sent_at: string | null;
    email_send_count: number | null;
    email_delivery_status: string | null;
    email_delivery_error: string | null;
};

type DeliveryFeedback = {
    status: 'sent' | 'failed';
    message: string;
};

type ManualInviteDetails = {
    status: 'creating' | 'ready' | 'failed' | 'copied';
    inviteCode: string | null;
    inviteUrl: string | null;
    expiresAt: string | null;
    message: string;
};

type SectionKey = 'technicians' | 'members' | 'invitations';

const ROLE_OPTIONS: { label: string; value: CompanyRole }[] = [
    { label: 'Owner', value: 'owner' },
    { label: 'Admin', value: 'admin' },
    { label: 'Manager', value: 'manager' },
    { label: 'Office', value: 'office' },
    { label: 'Technician', value: 'technician' },
];

const EMAIL_SEND_COOLDOWN_MS = 60_000;
const EMAIL_DELIVERY_FALLBACK_MESSAGE = 'Email could not be sent. Use the manual invite link/code below.';
const COMPANY_PERMISSION_KEYS: CompanyPermissionKey[] = [
    'can_view_techos',
    'can_create_estimates',
    'can_add_item_to_estimate',
    'can_view_customers',
    'can_view_jobs',
];

export default function CompanyUsersScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();

    const [members, setMembers] = useState<CompanyUser[]>([]);
    const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<CompanyRole>('technician');
    const [searchQuery, setSearchQuery] = useState('');
    const [message, setMessage] = useState('Loading company users...');
    const [loadingLists, setLoadingLists] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
    const [deliveryFeedbackById, setDeliveryFeedbackById] = useState<Record<string, DeliveryFeedback>>({});
    const [manualInvitesById, setManualInvitesById] = useState<Record<string, ManualInviteDetails>>({});
    const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
        technicians: false,
        members: true,
        invitations: true,
    });
    const [touchedSections, setTouchedSections] = useState<Partial<Record<SectionKey, boolean>>>({});
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        loadCompanyUsers();
    }, [id]);

    useEffect(() => {
        const timer = setInterval(() => {
            setNowMs(Date.now());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const hasTechnicians = members.some((member) => isTechnicianRole(member.role));
        const hasMembers = members.length > 0;
        const hasPendingInvitations = invitations.some(
            (invitation) => normalizeStatus(invitation.status) === 'pending' && !isInvitationExpired(invitation, nowMs)
        );

        setCollapsedSections((current) => ({
            technicians: touchedSections.technicians ? current.technicians : false,
            members: touchedSections.members ? current.members : hasTechnicians && hasMembers,
            invitations: touchedSections.invitations ? current.invitations : !hasPendingInvitations,
        }));
    }, [members, invitations, touchedSections, nowMs]);

    async function loadCompanyUsers(showLoading = true) {
        if (!id) {
            setMessage('Missing company id.');
            setLoadingLists(false);
            return false;
        }

        if (showLoading) {
            setLoadingLists(true);
            setMessage('Loading company users...');
        }

        const [membersResult, invitationsResult] = await Promise.all([
            loadCompanyMembers(String(id)),
            supabase
                .from('company_user_invitations')
                .select(
                    'id, company_id, full_name, email, role, status, expires_at, created_at, last_email_attempted_at, last_email_sent_at, email_send_count, email_delivery_status, email_delivery_error'
                )
                .eq('company_id', String(id))
                .order('created_at', { ascending: false }),
        ]);

        setLoadingLists(false);

        if (membersResult.error) {
            setMessage(`Error loading company members: ${membersResult.error.message}`);
            return false;
        }

        if (invitationsResult.error) {
            setMessage(`Error loading invitations: ${invitationsResult.error.message}`);
            return false;
        }

        setMembers(membersResult.data);
        setInvitations((invitationsResult.data || []) as CompanyInvitation[]);

        if (showLoading) {
            setMessage('');
        }

        return true;
    }

    async function createInvitation() {
        if (!id) {
            setMessage('Missing company id.');
            return;
        }

        const normalizedEmail = email.trim().toLowerCase();

        if (!normalizedEmail) {
            setMessage('Enter an email address.');
            return;
        }

        if (!isValidEmail(normalizedEmail)) {
            setMessage('Enter a valid email address. Gmail plus aliases are okay.');
            return;
        }

        setSubmitting(true);
        setMessage('Creating invitation...');

        const { error } = await supabase.rpc('create_company_user_invitation', {
            p_company_id: String(id),
            p_email: normalizedEmail,
            p_full_name: fullName.trim() || null,
            p_role: role,
        });

        setSubmitting(false);

        if (error) {
            setMessage(`Create invitation failed: ${error.message}`);
            return;
        }

        setFullName('');
        setEmail('');
        setRole('technician');
        await loadCompanyUsers(false);
        setMessage('Invitation created. Use Send Email when ready.');
    }

    async function sendInvitationEmail(invitationId: string) {
        const actionKey = `${invitationId}:email`;
        setActionLoadingKey(actionKey);
        setDeliveryFeedbackById((current) => ({
            ...current,
            [invitationId]: {
                status: 'sent',
                message: 'Sending invitation email...',
            },
        }));
        setMessage('Sending invitation email...');

        const { data, error } = await supabase.functions.invoke('send-company-user-invitation', {
            body: {
                invitation_id: invitationId,
            },
        });

        setActionLoadingKey(null);
        setNowMs(Date.now());

        if (error) {
            setDeliveryFeedbackById((current) => ({
                ...current,
                [invitationId]: {
                    status: 'failed',
                    message: EMAIL_DELIVERY_FALLBACK_MESSAGE,
                },
            }));
            await loadCompanyUsers(false);
            setMessage(EMAIL_DELIVERY_FALLBACK_MESSAGE);
            await createManualInvite(invitationId, {
                failurePrefix: 'Email failed, and manual invite creation failed',
                loadingMessage: 'Email failed. Creating manual invite link/code...',
                successMessage: EMAIL_DELIVERY_FALLBACK_MESSAGE,
            });
            return;
        }

        const responseMessage =
            data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
                ? data.message
                : 'Invitation email sent.';

        setDeliveryFeedbackById((current) => ({
            ...current,
            [invitationId]: {
                status: 'sent',
                message: responseMessage,
            },
        }));
        await loadCompanyUsers(false);
        setMessage(responseMessage);
    }

    async function updateMemberStatus(memberId: string, nextStatus: MemberActionStatus) {
        const actionKey = `${memberId}:${nextStatus}`;
        setActionLoadingKey(actionKey);
        setMessage(`${statusVerb(nextStatus)} member...`);

        const { error } = await supabase.rpc('update_company_user_status', {
            p_company_user_id: memberId,
            p_status: nextStatus,
        });

        setActionLoadingKey(null);

        if (error) {
            setMessage(`Member update failed: ${error.message}`);
            return;
        }

        await loadCompanyUsers(false);
        setMessage(`Member ${statusResult(nextStatus)}.`);
    }

    async function revokeInvitation(invitationId: string) {
        const actionKey = `${invitationId}:revoke`;
        setActionLoadingKey(actionKey);
        setMessage('Revoking invitation...');

        const { error } = await supabase.rpc('revoke_company_user_invitation', {
            p_invitation_id: invitationId,
        });

        setActionLoadingKey(null);

        if (error) {
            setMessage(`Revoke invitation failed: ${error.message}`);
            return;
        }

        await loadCompanyUsers(false);
        setMessage('Invitation revoked.');
    }

    async function createManualInvite(
        invitationId: string,
        options?: {
            loadingMessage?: string;
            successMessage?: string;
            failurePrefix?: string;
        }
    ) {
        const actionKey = `${invitationId}:manual`;
        const loadingMessage = options?.loadingMessage || 'Creating manual invite link/code...';
        const successMessage = options?.successMessage || 'Manual invite link/code ready.';
        const failurePrefix = options?.failurePrefix || 'Manual invite creation failed';

        setActionLoadingKey(actionKey);
        setManualInvitesById((current) => ({
            ...current,
            [invitationId]: {
                status: 'creating',
                inviteCode: current[invitationId]?.inviteCode || null,
                inviteUrl: current[invitationId]?.inviteUrl || null,
                expiresAt: current[invitationId]?.expiresAt || null,
                message: loadingMessage,
            },
        }));
        setMessage(loadingMessage);

        const { data, error } = await supabase.rpc('create_company_user_manual_invite_link', {
            p_invitation_id: invitationId,
            p_site_url: getAppBaseUrl(),
        });

        setActionLoadingKey(null);

        if (error) {
            const message = `${failurePrefix}: ${error.message}`;
            setManualInvitesById((current) => ({
                ...current,
                [invitationId]: {
                    status: 'failed',
                    inviteCode: null,
                    inviteUrl: null,
                    expiresAt: null,
                    message,
                },
            }));
            setMessage(message);
            return false;
        }

        const manualInvite = parseManualInviteResponse(data);

        if (!manualInvite.inviteCode && !manualInvite.inviteUrl) {
            const message = `${failurePrefix}: the server did not return an invite link or code.`;
            setManualInvitesById((current) => ({
                ...current,
                [invitationId]: {
                    status: 'failed',
                    inviteCode: null,
                    inviteUrl: null,
                    expiresAt: null,
                    message,
                },
            }));
            setMessage(message);
            return false;
        }

        setManualInvitesById((current) => ({
            ...current,
            [invitationId]: {
                status: 'ready',
                inviteCode: manualInvite.inviteCode,
                inviteUrl: manualInvite.inviteUrl,
                expiresAt: manualInvite.expiresAt,
                message: successMessage,
            },
        }));
        await loadCompanyUsers(false);
        setMessage(successMessage);
        return true;
    }

    async function copyManualInviteValue(invitationId: string, label: string, value: string) {
        try {
            await writeClipboardText(value);
            const message = `${label} copied.`;

            setManualInvitesById((current) => {
                const manualInvite = current[invitationId];

                if (!manualInvite) return current;

                return {
                    ...current,
                    [invitationId]: {
                        ...manualInvite,
                        status: 'copied',
                        message,
                    },
                };
            });
            setMessage(message);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Copy is not available on this platform.';
            setManualInvitesById((current) => {
                const manualInvite = current[invitationId];

                if (!manualInvite) return current;

                return {
                    ...current,
                    [invitationId]: {
                        ...manualInvite,
                        message: errorMessage,
                    },
                };
            });
            setMessage(errorMessage);
        }
    }

    async function deleteRevokedInvitation(invitationId: string) {
        const actionKey = `${invitationId}:delete`;
        setActionLoadingKey(actionKey);
        setMessage('Deleting revoked invitation...');

        const { error } = await supabase.rpc('delete_revoked_company_user_invitation', {
            p_invitation_id: invitationId,
        });

        setActionLoadingKey(null);

        if (error) {
            setMessage(`Delete revoked invitation failed: ${error.message}`);
            return;
        }

        setManualInvitesById((current) => {
            const next = { ...current };
            delete next[invitationId];
            return next;
        });
        await loadCompanyUsers(false);
        setMessage('Revoked invitation deleted.');
    }

    function prepareTechnicianInvite() {
        setRole('technician');
        setMessage('Technician invite selected. Enter the technician name and email, then create the invitation.');
    }

    function toggleSection(section: SectionKey) {
        setTouchedSections((current) => ({
            ...current,
            [section]: true,
        }));
        setCollapsedSections((current) => ({
            ...current,
            [section]: !current[section],
        }));
    }

    function toggleRow(rowKey: string) {
        setExpandedRows((current) => ({
            ...current,
            [rowKey]: !current[rowKey],
        }));
    }

    const normalizedSearch = normalizeSearch(searchQuery);
    const filteredMembers = useMemo(
        () => members.filter((member) => matchesMemberSearch(member, normalizedSearch)),
        [members, normalizedSearch]
    );
    const filteredInvitations = useMemo(
        () => invitations.filter((invitation) => matchesInvitationSearch(invitation, normalizedSearch, nowMs)),
        [invitations, normalizedSearch, nowMs]
    );
    const allTechnicianMembers = members.filter((member) => isTechnicianRole(member.role));
    const technicianMembers = filteredMembers.filter((member) => isTechnicianRole(member.role));
    const activeTechnicians = allTechnicianMembers.filter((member) => normalizeStatus(member.status) === 'active');
    const activeMembers = members.filter((member) => normalizeStatus(member.status) === 'active');
    const pendingTechnicianInvitations = invitations.filter(
        (invitation) =>
            isTechnicianRole(invitation.role) &&
            normalizeStatus(invitation.status) === 'pending' &&
            !isInvitationExpired(invitation, nowMs)
    );

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{
                padding: 20,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 900, minWidth: 0 }}>
                <Text
                    onPress={() => router.push(`/super-admin/company/${id}` as any)}
                    style={[backTextStyle, { color: theme.colors.text }]}
                >
                    Back
                </Text>

                <Text style={[titleStyle, { color: theme.colors.text }]}>Team / Technicians</Text>

                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Manage company credentials, technician access, and pending team invitations for TechOS.
                </Text>

                <ThemedCard style={heroCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>TechOS Access Foundation</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        Technicians are company users with the Technician role. Invite the first test technician here;
                        they will become active only after accepting the invitation with their own Supabase Auth account.
                    </Text>
                    <View style={metricGridStyle}>
                        <MetricCard label="Active Technicians" value={activeTechnicians.length.toString()} />
                        <MetricCard label="Pending Technician Invites" value={pendingTechnicianInvitations.length.toString()} />
                        <MetricCard label="Active Team Members" value={activeMembers.length.toString()} />
                    </View>
                    <ThemedButton
                        title="Invite First Test Technician"
                        onPress={prepareTechnicianInvite}
                        variant="secondary"
                        style={{ marginTop: 14 }}
                    />
                </ThemedCard>

                <ThemedCard style={searchCardStyle}>
                    <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>Search Team</Text>
                    <TextInput
                        placeholder="Search name, email, role, or status"
                        placeholderTextColor={theme.colors.mutedText}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={[
                            inputStyle,
                            {
                                backgroundColor: theme.colors.background,
                                borderColor: theme.colors.border,
                                color: theme.colors.text,
                            },
                        ]}
                    />
                </ThemedCard>

                <ThemedCard style={formCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Invite Team Member</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        This creates a pending invitation record. Use Send Email after creation to deliver a Supabase
                        Auth sign-in link. Invitation creation does not directly modify a Supabase Auth account.
                    </Text>

                    <TextInput
                        placeholder="Full Name"
                        placeholderTextColor={theme.colors.mutedText}
                        value={fullName}
                        onChangeText={setFullName}
                        style={[
                            inputStyle,
                            {
                                backgroundColor: theme.colors.background,
                                borderColor: theme.colors.border,
                                color: theme.colors.text,
                            },
                        ]}
                    />

                    <TextInput
                        placeholder="Email"
                        placeholderTextColor={theme.colors.mutedText}
                        value={email}
                        onChangeText={setEmail}
                        autoCapitalize="none"
                        autoComplete="email"
                        autoCorrect={false}
                        keyboardType="email-address"
                        textContentType="emailAddress"
                        style={[
                            inputStyle,
                            {
                                backgroundColor: theme.colors.background,
                                borderColor: theme.colors.border,
                                color: theme.colors.text,
                            },
                        ]}
                    />
                    <Text style={[helperTextStyle, { color: theme.colors.mutedText }]}>
                        Use a different email for each test user. Gmail plus aliases are okay.
                    </Text>

                    <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>Role</Text>
                    <View style={roleGridStyle}>
                        {ROLE_OPTIONS.map((option) => {
                            const selected = role === option.value;

                            return (
                                <TouchableOpacity
                                    key={option.value}
                                    activeOpacity={0.82}
                                    onPress={() => setRole(option.value)}
                                    style={[
                                        roleChipStyle,
                                        {
                                            backgroundColor: selected ? theme.colors.primary : theme.colors.background,
                                            borderColor: selected ? theme.colors.primary : theme.colors.border,
                                        },
                                    ]}
                                >
                                    <Text
                                        style={[
                                            roleChipTextStyle,
                                            {
                                                color: selected ? theme.colors.primaryText : theme.colors.text,
                                            },
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <ThemedButton
                        title={submitting ? 'Creating Invitation...' : 'Create Invitation'}
                        onPress={createInvitation}
                        disabled={submitting}
                    />
                </ThemedCard>

                {!!message && (
                    <ThemedCard style={messageCardStyle}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}

                {loadingLists ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading company users...</Text>
                    </ThemedCard>
                ) : (
                    <>
                        <CompactSection
                            title="Technicians"
                            count={technicianMembers.length}
                            collapsed={collapsedSections.technicians}
                            onToggle={() => toggleSection('technicians')}
                        >
                            {technicianMembers.length === 0 ? (
                                <EmptyListMessage message="No technicians match this view. Refresh the list, clear search, or invite a technician." />
                            ) : (
                                technicianMembers.map((member) => (
                                    <TeamMemberRow
                                        key={member.id}
                                        member={member}
                                        expanded={!!expandedRows[`member:${member.id}`]}
                                        actionLoadingKey={actionLoadingKey}
                                        onToggle={() => toggleRow(`member:${member.id}`)}
                                        onStatusChange={updateMemberStatus}
                                    />
                                ))
                            )}
                        </CompactSection>

                        <CompactSection
                            title="All Team Members"
                            count={filteredMembers.length}
                            collapsed={collapsedSections.members}
                            onToggle={() => toggleSection('members')}
                        >
                            {filteredMembers.length === 0 ? (
                                <EmptyListMessage message="No company members match this view." />
                            ) : (
                                filteredMembers.map((member) => (
                                    <TeamMemberRow
                                        key={member.id}
                                        member={member}
                                        expanded={!!expandedRows[`member:${member.id}`]}
                                        actionLoadingKey={actionLoadingKey}
                                        onToggle={() => toggleRow(`member:${member.id}`)}
                                        onStatusChange={updateMemberStatus}
                                    />
                                ))
                            )}
                        </CompactSection>

                        <CompactSection
                            title="Invitations"
                            count={filteredInvitations.length}
                            collapsed={collapsedSections.invitations}
                            onToggle={() => toggleSection('invitations')}
                        >
                            {filteredInvitations.length === 0 ? (
                                <EmptyListMessage message="No invitations match this view." />
                            ) : (
                                filteredInvitations.map((invitation) => (
                                    <InvitationRow
                                        key={invitation.id}
                                        invitation={invitation}
                                        expanded={!!expandedRows[`invitation:${invitation.id}`]}
                                        actionLoadingKey={actionLoadingKey}
                                        feedback={deliveryFeedbackById[invitation.id]}
                                        manualInvite={manualInvitesById[invitation.id]}
                                        nowMs={nowMs}
                                        onToggle={() => toggleRow(`invitation:${invitation.id}`)}
                                        onSendEmail={sendInvitationEmail}
                                        onCreateManualInvite={createManualInvite}
                                        onCopyManualInviteValue={copyManualInviteValue}
                                        onRevoke={revokeInvitation}
                                        onDeleteRevoked={deleteRevokedInvitation}
                                    />
                                ))
                            )}
                        </CompactSection>
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function MetricCard({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <View
            style={[
                metricCardStyle,
                {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                },
            ]}
        >
            <Text style={[metricValueStyle, { color: theme.colors.text }]}>{value}</Text>
            <Text style={[metricLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
        </View>
    );
}

function CompactSection({
    title,
    count,
    collapsed,
    onToggle,
    children,
}: {
    title: string;
    count: number;
    collapsed: boolean;
    onToggle: () => void;
    children: ReactNode;
}) {
    const { theme } = useTheme();

    return (
        <View style={compactSectionStyle}>
            <View style={compactSectionHeaderStyle}>
                <View style={compactSectionTitleWrapStyle}>
                    <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>{title}</Text>
                    <View
                        style={[
                            countBadgeStyle,
                            {
                                backgroundColor: theme.colors.background,
                                borderColor: theme.colors.border,
                            },
                        ]}
                    >
                        <Text style={[countBadgeTextStyle, { color: theme.colors.mutedText }]}>{count}</Text>
                    </View>
                </View>
                <ThemedButton
                    title={collapsed ? 'Expand' : 'Collapse'}
                    variant="secondary"
                    onPress={onToggle}
                    style={sectionToggleButtonStyle}
                    textStyle={sectionToggleTextStyle}
                />
            </View>

            {!collapsed && <View style={compactListStyle}>{children}</View>}
        </View>
    );
}

function EmptyListMessage({ message }: { message: string }) {
    const { theme } = useTheme();

    return (
        <ThemedCard style={compactRowStyle}>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
        </ThemedCard>
    );
}

function TeamMemberRow({
    member,
    expanded,
    actionLoadingKey,
    onToggle,
    onStatusChange,
}: {
    member: CompanyUser;
    expanded: boolean;
    actionLoadingKey: string | null;
    onToggle: () => void;
    onStatusChange: (memberId: string, nextStatus: MemberActionStatus) => void;
}) {
    const { theme } = useTheme();
    const status = normalizeStatus(member.status);
    const displayName = getMemberDisplayName(member, 'Unnamed member');
    const contactLine = getMemberContactLine(member);
    const permissions = resolveCompanyPermissions(member);
    const techOSAllowed = canAccessCompanyTechOS(member);

    return (
        <ThemedCard onPress={onToggle} style={compactRowStyle}>
            <View style={compactRowHeaderStyle}>
                <View style={compactIdentityStyle}>
                    <View style={compactAvatarStyle}>
                        <Text style={compactAvatarTextStyle}>{getInitials(displayName || contactLine)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[compactTitleStyle, { color: theme.colors.text }]} numberOfLines={1}>
                            {displayName}
                        </Text>
                        <Text style={[compactMetaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                            {contactLine}
                        </Text>
                    </View>
                </View>

                <View style={compactBadgeClusterStyle}>
                    <RoleBadge label={formatRole(member.role)} />
                    <RoleBadge label={status === 'active' ? 'Active' : formatLabel(member.status)} tone={status} />
                    <Text style={[compactDateTextStyle, { color: theme.colors.mutedText }]}>
                        {formatDate(member.created_at)}
                    </Text>
                </View>
            </View>

            {expanded && (
                <View style={rowDetailsStyle}>
                    <DetailPanelSection title="Status">
                        <DetailLine label="Role" value={formatRole(member.role)} />
                        <DetailLine label="Status" value={formatLabel(member.status)} />
                        <DetailLine label="Created" value={formatDate(member.created_at)} />
                        <DetailLine label="Contact" value={contactLine} />
                    </DetailPanelSection>

                    <DetailPanelSection title="Billing Seat">
                        <DetailLine label="Seat" value={billingSeatLabel(status)} />
                        <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText }]}>
                            Invitations are free. Accepted users become billable only when a seat is activated. Plan pricing is not configured yet.
                        </Text>
                        <PlaceholderButton title="Billing confirmation will be added before paid seat activation." />
                    </DetailPanelSection>

                    <DetailPanelSection title="Role & Permissions">
                        <DetailLine label="Role" value={formatRole(member.role)} />
                        <View style={permissionGridStyle}>
                            {COMPANY_PERMISSION_KEYS.map((permissionKey) => {
                                const allowed = permissions[permissionKey];

                                return (
                                    <View
                                        key={permissionKey}
                                        style={[
                                            permissionPillStyle,
                                            {
                                                backgroundColor: allowed ? theme.colors.secondaryButton : theme.colors.background,
                                                borderColor: allowed ? theme.colors.primary : theme.colors.border,
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                permissionPillTextStyle,
                                                { color: allowed ? theme.colors.primary : theme.colors.mutedText },
                                            ]}
                                        >
                                            {COMPANY_PERMISSION_LABELS[permissionKey]}: {allowed ? 'Allowed' : 'Not allowed'}
                                        </Text>
                                    </View>
                                );
                            })}
                        </View>
                        <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText }]}>
                            Permissions currently come from role and active status. Explicit permission overrides will be saved after the database foundation is applied.
                        </Text>
                    </DetailPanelSection>

                    <DetailPanelSection title="TechOS Access">
                        <DetailLine label="Access" value={techOSAllowed ? 'Allowed' : 'Not allowed'} />
                        <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText }]}>
                            Active technicians, managers, admins, and owners can currently access TechOS.
                        </Text>
                    </DetailPanelSection>

                    <DetailPanelSection title="Technician Public Profile">
                        <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText }]}>
                            Technician public profile editing will be added here later.
                        </Text>
                    </DetailPanelSection>

                    <DetailPanelSection title="Jobs">
                        <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText }]}>
                            Assigned job history will appear here after dispatch assignment is built.
                        </Text>
                    </DetailPanelSection>

                    <DetailPanelSection title="Sales">
                        <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText }]}>
                            Sales totals will appear here after job sale tracking is built.
                        </Text>
                    </DetailPanelSection>

                    <DetailPanelSection title="Security">
                        <StatusActionButtons
                            status={status}
                            memberId={member.id}
                            actionLoadingKey={actionLoadingKey}
                            onStatusChange={onStatusChange}
                        />
                        {status !== 'active' && <PlaceholderButton title="Remove from Company placeholder" />}
                    </DetailPanelSection>

                    <View style={actionRowStyle}>
                        {status === 'active' && isTechnicianRole(member.role) && (
                            <>
                                <PlaceholderButton title="View Jobs placeholder" />
                                <PlaceholderButton title="View Sales placeholder" />
                            </>
                        )}
                        {status === 'active' && <PlaceholderButton title="Edit Permissions placeholder" />}
                        {status === 'inactive' && <PlaceholderButton title="Activate Seat placeholder" />}
                    </View>
                </View>
            )}
        </ThemedCard>
    );
}

function DetailPanelSection({ title, children }: { title: string; children: ReactNode }) {
    const { theme } = useTheme();

    return (
        <View
            style={[
                detailSectionStyle,
                {
                    backgroundColor: theme.colors.background,
                    borderColor: theme.colors.border,
                },
            ]}
        >
            <Text style={[detailSectionTitleStyle, { color: theme.colors.text }]}>{title}</Text>
            {children}
        </View>
    );
}

function DetailLine({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <View style={detailLineStyle}>
            <Text style={[detailLineLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <Text style={[detailLineValueStyle, { color: theme.colors.text }]}>{value}</Text>
        </View>
    );
}

function PlaceholderButton({ title }: { title: string }) {
    return (
        <ThemedButton
            title={title}
            variant="secondary"
            disabled
            style={placeholderButtonStyle}
            textStyle={placeholderButtonTextStyle}
        />
    );
}

function StatusActionButtons({
    status,
    memberId,
    actionLoadingKey,
    onStatusChange,
}: {
    status: string;
    memberId: string;
    actionLoadingKey: string | null;
    onStatusChange: (memberId: string, nextStatus: MemberActionStatus) => void;
}) {
    if (status !== 'active' && status !== 'suspended' && status !== 'inactive') {
        return null;
    }

    return (
        <View style={actionRowStyle}>
            {status === 'active' ? (
                <>
                    <ThemedButton
                        title="Suspend"
                        variant="secondary"
                        onPress={() => onStatusChange(memberId, 'suspended')}
                        disabled={actionLoadingKey !== null}
                        style={actionButtonStyle}
                    />
                    <ThemedButton
                        title="Deactivate"
                        variant="danger"
                        onPress={() => onStatusChange(memberId, 'inactive')}
                        disabled={actionLoadingKey !== null}
                        style={actionButtonStyle}
                    />
                </>
            ) : status === 'suspended' ? (
                <>
                    <ThemedButton
                        title="Reactivate"
                        variant="secondary"
                        onPress={() => onStatusChange(memberId, 'active')}
                        disabled={actionLoadingKey !== null}
                        style={actionButtonStyle}
                    />
                    <ThemedButton
                        title="Deactivate"
                        variant="danger"
                        onPress={() => onStatusChange(memberId, 'inactive')}
                        disabled={actionLoadingKey !== null}
                        style={actionButtonStyle}
                    />
                </>
            ) : (
                <ThemedButton
                    title="Reactivate"
                    variant="secondary"
                    onPress={() => onStatusChange(memberId, 'active')}
                    disabled={actionLoadingKey !== null}
                    style={actionButtonStyle}
                />
            )}
        </View>
    );
}

function RoleBadge({ label, tone }: { label: string; tone?: string }) {
    const { theme } = useTheme();
    const normalizedTone = normalizeStatus(tone);
    const isActive = normalizedTone === 'active';
    const isPending = normalizedTone === 'pending';
    const isDanger = normalizedTone === 'revoked' || normalizedTone === 'inactive' || normalizedTone === 'suspended';

    return (
        <View
            style={[
                badgeStyle,
                {
                    backgroundColor: isActive || isPending ? theme.colors.secondaryButton : theme.colors.background,
                    borderColor: isActive ? theme.colors.primary : isDanger ? theme.colors.danger : theme.colors.border,
                },
            ]}
        >
            <Text
                style={[
                    badgeTextStyle,
                    {
                        color: isActive ? theme.colors.primary : isDanger ? theme.colors.danger : theme.colors.text,
                    },
                ]}
                numberOfLines={1}
            >
                {label}
            </Text>
        </View>
    );
}

function InvitationRow({
    invitation,
    expanded,
    actionLoadingKey,
    feedback,
    manualInvite,
    nowMs,
    onToggle,
    onSendEmail,
    onCreateManualInvite,
    onCopyManualInviteValue,
    onRevoke,
    onDeleteRevoked,
}: {
    invitation: CompanyInvitation;
    expanded: boolean;
    actionLoadingKey: string | null;
    feedback?: DeliveryFeedback;
    manualInvite?: ManualInviteDetails;
    nowMs: number;
    onToggle: () => void;
    onSendEmail: (invitationId: string) => void;
    onCreateManualInvite: (invitationId: string) => void;
    onCopyManualInviteValue: (invitationId: string, label: string, value: string) => void;
    onRevoke: (invitationId: string) => void;
    onDeleteRevoked: (invitationId: string) => void;
}) {
    const { theme } = useTheme();
    const emailKey = `${invitation.id}:email`;
    const manualKey = `${invitation.id}:manual`;
    const revokeKey = `${invitation.id}:revoke`;
    const deleteKey = `${invitation.id}:delete`;
    const status = normalizeStatus(invitation.status);
    const expired = isInvitationExpired(invitation, nowMs);
    const displayStatus = expired ? 'expired' : status;
    const sendable = status === 'pending' && !expired;
    const cooldownRemainingMs = getCooldownRemainingMs(invitation, nowMs);
    const sending = actionLoadingKey === emailKey;
    const creatingManualInvite = actionLoadingKey === manualKey;
    const deletingRevoked = actionLoadingKey === deleteKey;
    const anyActionLoading = actionLoadingKey !== null;
    const emailSendCount = invitation.email_send_count || 0;
    const inviteTitle = invitation.full_name || invitation.email || 'Unnamed invitee';

    return (
        <ThemedCard onPress={onToggle} style={compactRowStyle}>
            <View style={compactRowHeaderStyle}>
                <View style={compactIdentityStyle}>
                    <View style={compactAvatarStyle}>
                        <Text style={compactAvatarTextStyle}>{getInitials(inviteTitle)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[compactTitleStyle, { color: theme.colors.text }]} numberOfLines={1}>
                            {inviteTitle}
                        </Text>
                        <Text style={[compactMetaTextStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                            {invitation.email || 'No email'}
                        </Text>
                    </View>
                </View>

                <View style={compactBadgeClusterStyle}>
                    <RoleBadge label={formatRole(invitation.role)} />
                    <RoleBadge label={formatLabel(displayStatus)} tone={displayStatus} />
                    <Text style={[compactDateTextStyle, { color: theme.colors.mutedText }]}>
                        {formatDate(invitation.created_at)}
                    </Text>
                </View>
            </View>

            {expanded && (
                <View style={rowDetailsStyle}>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>Role: {formatRole(invitation.role)}</Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Status: {formatLabel(displayStatus)}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Created: {formatDate(invitation.created_at)}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                        Email: {formatDeliverySummary(invitation, feedback)}
                    </Text>

                    {manualInvite && (
                        <View
                            style={[
                                manualInviteBoxStyle,
                                {
                                    backgroundColor: theme.colors.background,
                                    borderColor: theme.colors.border,
                                },
                            ]}
                        >
                            <Text style={[manualInviteTitleStyle, { color: theme.colors.text }]}>Manual Invite</Text>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{manualInvite.message}</Text>

                            {!!manualInvite.inviteUrl && (
                                <>
                                    <Text style={[manualInviteLabelStyle, { color: theme.colors.text }]}>Invite Link</Text>
                                    <Text selectable style={[manualInviteValueStyle, { color: theme.colors.mutedText }]}>
                                        {manualInvite.inviteUrl}
                                    </Text>
                                </>
                            )}
                            {!!manualInvite.inviteCode && (
                                <>
                                    <Text style={[manualInviteLabelStyle, { color: theme.colors.text }]}>Invite Code</Text>
                                    <Text selectable style={[manualInviteValueStyle, { color: theme.colors.mutedText }]}>
                                        {manualInvite.inviteCode}
                                    </Text>
                                </>
                            )}
                            {!!manualInvite.expiresAt && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Expires: {formatDate(manualInvite.expiresAt)}
                                </Text>
                            )}

                            {(!!manualInvite.inviteUrl || !!manualInvite.inviteCode) && (
                                <View style={actionRowStyle}>
                                    {!!manualInvite.inviteUrl && (
                                        <ThemedButton
                                            title="Copy Invite Link"
                                            variant="secondary"
                                            onPress={() => onCopyManualInviteValue(invitation.id, 'Invite link', manualInvite.inviteUrl as string)}
                                            disabled={actionLoadingKey !== null}
                                            style={actionButtonStyle}
                                        />
                                    )}
                                    {!!manualInvite.inviteCode && (
                                        <ThemedButton
                                            title="Copy Invite Code"
                                            variant="secondary"
                                            onPress={() => onCopyManualInviteValue(invitation.id, 'Invite code', manualInvite.inviteCode as string)}
                                            disabled={actionLoadingKey !== null}
                                            style={actionButtonStyle}
                                        />
                                    )}
                                </View>
                            )}
                        </View>
                    )}

                    {status === 'pending' && (
                        <View style={actionRowStyle}>
                            <ThemedButton
                                title={getEmailButtonTitle({
                                    sending,
                                    sendable,
                                    cooldownRemainingMs,
                                    emailSendCount,
                                })}
                                variant={feedback?.status === 'failed' ? 'danger' : 'secondary'}
                                onPress={() => onSendEmail(invitation.id)}
                                disabled={anyActionLoading || !sendable || cooldownRemainingMs > 0}
                                style={actionButtonStyle}
                            />
                            <ThemedButton
                                title={creatingManualInvite ? 'Creating...' : 'Create / Copy Manual Invite'}
                                variant="secondary"
                                onPress={() => onCreateManualInvite(invitation.id)}
                                disabled={anyActionLoading || expired}
                                style={actionButtonStyle}
                            />
                            <ThemedButton
                                title={actionLoadingKey === revokeKey ? 'Revoking...' : 'Revoke Invitation'}
                                variant="danger"
                                onPress={() => onRevoke(invitation.id)}
                                disabled={actionLoadingKey !== null}
                                style={actionButtonStyle}
                            />
                        </View>
                    )}

                    {status === 'revoked' && (
                        <View style={actionRowStyle}>
                            <ThemedButton
                                title={deletingRevoked ? 'Deleting...' : 'Delete Revoked Invitation'}
                                variant="danger"
                                onPress={() => onDeleteRevoked(invitation.id)}
                                disabled={actionLoadingKey !== null}
                                style={actionButtonStyle}
                            />
                        </View>
                    )}
                </View>
            )}
        </ThemedCard>
    );
}

function parseManualInviteResponse(data: unknown) {
    const row = Array.isArray(data) ? data[0] : data;
    const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

    return {
        inviteCode: readStringField(record, 'invite_code'),
        inviteUrl: readStringField(record, 'invite_url'),
        expiresAt: readStringField(record, 'expires_at'),
    };
}

async function loadCompanyMembers(companyId: string): Promise<{
    data: CompanyUser[];
    error: { message: string } | null;
}> {
    const rpcResult = await supabase.rpc('get_company_users_for_management', {
        p_company_id: companyId,
    });

    if (!rpcResult.error) {
        return {
            data: normalizeCompanyUsers(rpcResult.data),
            error: null,
        };
    }

    const directResult = await supabase
        .from('company_users')
        .select('id, company_id, auth_user_id, full_name, email, role, status, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

    if (directResult.error) {
        return {
            data: [],
            error: {
                message: `${directResult.error.message}. Management RPC fallback also failed: ${rpcResult.error.message}`,
            },
        };
    }

    return {
        data: normalizeCompanyUsers(directResult.data),
        error: null,
    };
}

function normalizeCompanyUsers(data: unknown): CompanyUser[] {
    return (Array.isArray(data) ? data : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

            return {
                id: readStringField(record, 'id') || '',
                company_id: readStringField(record, 'company_id') || '',
                auth_user_id: readStringField(record, 'auth_user_id'),
                full_name: readStringField(record, 'full_name'),
                email: readStringField(record, 'email'),
                role: readStringField(record, 'role') || 'unknown',
                status: readStringField(record, 'status') || 'unknown',
                created_at: readStringField(record, 'created_at'),
                permissions: readPermissionOverrides(record, 'permissions'),
            };
        })
        .filter((member) => member.id && member.company_id);
}

function readStringField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value : null;
}

function readPermissionOverrides(record: Record<string, unknown>, key: string): Partial<CompanyPermissionSet> | null {
    const value = record[key];

    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const source = value as Record<string, unknown>;
    const permissions: Partial<CompanyPermissionSet> = {};

    COMPANY_PERMISSION_KEYS.forEach((permissionKey) => {
        const permissionValue = source[permissionKey];

        if (typeof permissionValue === 'boolean') {
            permissions[permissionKey] = permissionValue;
        }
    });

    return Object.keys(permissions).length > 0 ? permissions : null;
}

function getAppBaseUrl() {
    const globalWithLocation = globalThis as unknown as {
        location?: { origin?: string };
        window?: { location?: { origin?: string } };
    };
    const origin = globalWithLocation.window?.location?.origin || globalWithLocation.location?.origin || null;

    return typeof origin === 'string' && origin.trim() ? origin : null;
}

async function writeClipboardText(value: string) {
    const globalWithNavigator = globalThis as unknown as {
        navigator?: {
            clipboard?: {
                writeText?: (text: string) => Promise<void>;
            };
        };
    };
    const clipboard = globalWithNavigator.navigator?.clipboard;

    if (!clipboard?.writeText) {
        throw new Error('Copy is not available on this platform. Select the invite text and copy it manually.');
    }

    await clipboard.writeText(value);
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeStatus(status?: string | null) {
    return normalizeCompanyStatus(status);
}

function normalizeRole(role?: string | null) {
    return normalizeCompanyRole(role);
}

function normalizeSearch(value: string) {
    return value.trim().toLowerCase();
}

function matchesMemberSearch(member: CompanyUser, search: string) {
    if (!search) return true;

    return [
        member.full_name,
        member.email,
        member.role,
        member.status,
        member.auth_user_id,
    ].some((value) => String(value || '').toLowerCase().includes(search));
}

function matchesInvitationSearch(invitation: CompanyInvitation, search: string, nowMs: number) {
    if (!search) return true;

    const status = isInvitationExpired(invitation, nowMs) ? 'expired' : invitation.status;

    return [
        invitation.full_name,
        invitation.email,
        invitation.role,
        status,
        invitation.email_delivery_status,
    ].some((value) => String(value || '').toLowerCase().includes(search));
}

function isTechnicianRole(role?: string | null) {
    return isTechnicianCompanyRole(role);
}

function formatRole(role?: string | null) {
    return isTechnicianRole(role) ? 'Technician' : formatLabel(role || null);
}

function billingSeatLabel(status: string) {
    if (status === 'active') return 'Billable seat: Active';
    if (status === 'suspended') return 'Seat suspended';
    if (status === 'inactive' || status === 'revoked') return 'Not currently billable';

    return 'Seat status not configured';
}

function getMemberDisplayName(member: CompanyUser, fallback: string) {
    return member.full_name?.trim() || member.email?.trim() || formatAuthUserId(member.auth_user_id) || fallback;
}

function getMemberContactLine(member: CompanyUser) {
    return member.email?.trim() || formatAuthUserId(member.auth_user_id) || 'No email';
}

function formatAuthUserId(authUserId: string | null) {
    if (!authUserId) return '';

    return `Auth user ${authUserId.slice(0, 8)}`;
}

function formatLabel(value: string | null) {
    return String(value || 'unknown')
        .trim()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function getInitials(value: string | null) {
    const parts = String(value || '')
        .trim()
        .split(/[\s@._-]+/)
        .filter(Boolean);

    if (parts.length === 0) return 'TE';

    return parts
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('');
}

function formatDate(value: string | null) {
    if (!value) return 'Unknown';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';

    return date.toLocaleDateString();
}

function isInvitationExpired(invitation: CompanyInvitation, nowMs: number) {
    const status = normalizeStatus(invitation.status);

    if (status === 'expired') return true;
    if (status !== 'pending') return false;
    if (!invitation.expires_at) return false;

    const expiresAtMs = new Date(invitation.expires_at).getTime();

    return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

function getCooldownRemainingMs(invitation: CompanyInvitation, nowMs: number) {
    if (!invitation.last_email_attempted_at) return 0;

    const attemptedAtMs = new Date(invitation.last_email_attempted_at).getTime();

    if (!Number.isFinite(attemptedAtMs)) return 0;

    return Math.max(0, attemptedAtMs + EMAIL_SEND_COOLDOWN_MS - nowMs);
}

function formatDuration(ms: number) {
    return `${Math.ceil(ms / 1000)}s`;
}

function formatDeliverySummary(invitation: CompanyInvitation, feedback?: DeliveryFeedback) {
    if (feedback?.message) return feedback.message;

    const status = normalizeStatus(invitation.email_delivery_status);

    if (status === 'sent') {
        const sentAt = formatDate(invitation.last_email_sent_at);
        const count = invitation.email_send_count || 0;

        return count > 1 ? `Sent ${sentAt} (${count} total)` : `Sent ${sentAt}`;
    }

    if (status === 'failed') {
        return invitation.email_delivery_error || 'Last send failed';
    }

    if (status === 'sending') {
        return 'Sending invitation email...';
    }

    return 'Not sent';
}

function getEmailButtonTitle({
    sending,
    sendable,
    cooldownRemainingMs,
    emailSendCount,
}: {
    sending: boolean;
    sendable: boolean;
    cooldownRemainingMs: number;
    emailSendCount: number;
}) {
    if (sending) return 'Sending...';
    if (!sendable) return 'Email Unavailable';
    if (cooldownRemainingMs > 0) return `Wait ${formatDuration(cooldownRemainingMs)}`;
    return emailSendCount > 0 ? 'Resend Email' : 'Send Email';
}

function statusVerb(status: MemberActionStatus) {
    if (status === 'active') return 'Reactivating';
    if (status === 'suspended') return 'Suspending';
    return 'Deactivating';
}

function statusResult(status: MemberActionStatus) {
    if (status === 'active') return 'reactivated';
    if (status === 'suspended') return 'suspended';
    return 'deactivated';
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

const formCardStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    gap: 14,
    marginBottom: 16,
};

const searchCardStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    gap: 10,
    marginBottom: 16,
};

const heroCardStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    gap: 14,
    marginBottom: 16,
};

const messageCardStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    marginBottom: 16,
};

const sectionStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    marginTop: 24,
};

const compactSectionStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    marginTop: 18,
};

const compactSectionHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    justifyContent: 'space-between' as const,
    marginBottom: 10,
};

const compactSectionTitleWrapStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    minWidth: 0,
};

const countBadgeStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
};

const countBadgeTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const sectionToggleButtonStyle = {
    minWidth: 100,
    paddingHorizontal: 12,
    paddingVertical: 9,
};

const sectionToggleTextStyle = {
    fontSize: 13,
};

const sectionHeadingStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 14,
};

const sectionNoteStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginBottom: 12,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};

const fieldLabelStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};

const helperTextStyle = {
    fontSize: 13,
    fontWeight: '800' as const,
    lineHeight: 19,
    marginTop: -6,
};

const inputStyle = {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '800' as const,
    minWidth: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
};

const roleGridStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const roleChipStyle = {
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%' as const,
    flexShrink: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
};

const roleChipTextStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
};

const listStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    gap: 12,
};

const compactListStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    gap: 8,
};

const metricGridStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const metricCardStyle = {
    flexBasis: 170,
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: '100%' as const,
    borderRadius: 16,
    borderWidth: 1,
    minWidth: 0,
    padding: 14,
};

const metricValueStyle = {
    fontSize: 26,
    fontWeight: '900' as const,
};

const metricLabelStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    lineHeight: 17,
    marginTop: 4,
};

const technicianCardHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    minWidth: 0,
};

const compactRowStyle = {
    padding: 12,
};

const compactRowHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    justifyContent: 'space-between' as const,
    minWidth: 0,
};

const compactIdentityStyle = {
    alignItems: 'center' as const,
    flexBasis: 260,
    flexDirection: 'row' as const,
    flexGrow: 1,
    flexShrink: 1,
    gap: 10,
    minWidth: 0,
};

const compactAvatarStyle = {
    alignItems: 'center' as const,
    backgroundColor: '#EEF4FF',
    borderRadius: 12,
    height: 36,
    justifyContent: 'center' as const,
    width: 36,
};

const compactAvatarTextStyle = {
    color: '#0B5FFF',
    fontSize: 12,
    fontWeight: '900' as const,
};

const compactTitleStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
    flexShrink: 1,
};

const compactMetaTextStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 17,
    marginTop: 2,
};

const compactBadgeClusterStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    justifyContent: 'flex-end' as const,
    minWidth: 0,
};

const compactDateTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const rowDetailsStyle = {
    borderTopWidth: 1,
    borderColor: '#E3E8EF',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
};

const detailSectionStyle = {
    borderRadius: 12,
    borderWidth: 1,
    maxWidth: '100%' as const,
    minWidth: 0,
    padding: 12,
};

const detailSectionTitleStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const detailLineStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
    marginTop: 4,
    minWidth: 0,
};

const detailLineLabelStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const detailLineValueStyle = {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '900' as const,
    textAlign: 'right' as const,
};

const detailBodyTextStyle = {
    fontSize: 13,
    fontWeight: '800' as const,
    lineHeight: 19,
};

const permissionGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 4,
};

const permissionPillStyle = {
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%' as const,
    paddingHorizontal: 9,
    paddingVertical: 6,
};

const permissionPillTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const placeholderButtonStyle = {
    alignSelf: 'flex-start' as const,
    marginTop: 10,
    maxWidth: '100%' as const,
    paddingHorizontal: 12,
    paddingVertical: 10,
};

const placeholderButtonTextStyle = {
    fontSize: 12,
};

const badgeStyle = {
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 160,
    paddingHorizontal: 8,
    paddingVertical: 4,
};

const badgeTextStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
    flexShrink: 1,
};

const technicianAvatarStyle = {
    alignItems: 'center' as const,
    backgroundColor: '#EEF4FF',
    borderRadius: 16,
    height: 48,
    justifyContent: 'center' as const,
    width: 48,
};

const technicianAvatarTextStyle = {
    color: '#0B5FFF',
    fontSize: 14,
    fontWeight: '900' as const,
};

const badgeRowStyle = {
    maxWidth: '100%' as const,
    minWidth: 0,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    marginTop: 14,
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

const manualInviteBoxStyle = {
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 14,
    maxWidth: '100%' as const,
    minWidth: 0,
    padding: 14,
};

const manualInviteTitleStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
};

const manualInviteLabelStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginTop: 12,
};

const manualInviteValueStyle = {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '700' as const,
    lineHeight: 19,
    marginTop: 5,
};

const actionRowStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 16,
};

const actionButtonStyle = {
    flexBasis: 150,
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: '100%' as const,
    minWidth: 0,
    paddingVertical: 14,
};
