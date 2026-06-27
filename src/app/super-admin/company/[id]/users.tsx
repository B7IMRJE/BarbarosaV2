import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/useTheme';

type CompanyRole = 'owner' | 'admin' | 'manager' | 'office' | 'technician';
type MemberActionStatus = 'active' | 'suspended' | 'inactive';

type CompanyUser = {
    id: string;
    company_id: string;
    full_name: string | null;
    email: string | null;
    role: string;
    status: string;
    created_at: string | null;
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

const ROLE_OPTIONS: { label: string; value: CompanyRole }[] = [
    { label: 'Owner', value: 'owner' },
    { label: 'Admin', value: 'admin' },
    { label: 'Manager', value: 'manager' },
    { label: 'Office', value: 'office' },
    { label: 'Technician', value: 'technician' },
];

const EMAIL_SEND_COOLDOWN_MS = 60_000;
const MANUAL_INVITE_UNAVAILABLE_MESSAGE =
    'Invite link/code is not available yet. The current backend does not store a safe copyable invitation code.';
const EMAIL_DELIVERY_FALLBACK_MESSAGE =
    'Email could not be sent. Manual invite link/code is not available yet; apply the invite-link proposal before sending manually.';
const REVOKED_INVITE_ARCHIVE_MESSAGE =
    'Revoked invitations are kept for audit. Delete/archive needs a dedicated RPC before it can be shown here.';

export default function CompanyUsersScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();

    const [members, setMembers] = useState<CompanyUser[]>([]);
    const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<CompanyRole>('technician');
    const [message, setMessage] = useState('Loading company users...');
    const [loadingLists, setLoadingLists] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
    const [deliveryFeedbackById, setDeliveryFeedbackById] = useState<Record<string, DeliveryFeedback>>({});
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
            supabase
                .from('company_users')
                .select('id, company_id, full_name, email, role, status, created_at')
                .eq('company_id', String(id))
                .order('created_at', { ascending: false }),
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

        setMembers((membersResult.data || []) as CompanyUser[]);
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

    function prepareTechnicianInvite() {
        setRole('technician');
        setMessage('Technician invite selected. Enter the technician name and email, then create the invitation.');
    }

    const technicianMembers = members.filter((member) => normalizeRole(member.role) === 'technician');
    const activeTechnicians = technicianMembers.filter((member) => normalizeStatus(member.status) === 'active');
    const activeMembers = members.filter((member) => normalizeStatus(member.status) === 'active');
    const pendingTechnicianInvitations = invitations.filter(
        (invitation) =>
            normalizeRole(invitation.role) === 'technician' &&
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
                        <View style={sectionStyle}>
                            <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>Technicians</Text>
                            <Text style={[sectionNoteStyle, { color: theme.colors.mutedText }]}>
                                These are the company users who will become the first TechOS field team. Customer and
                                home assignment comes later from the selected client/home list.
                            </Text>
                            <View style={listStyle}>
                                {technicianMembers.length === 0 ? (
                                    <ThemedCard>
                                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                            No technicians connected yet. Use Invite First Test Technician to create a
                                            pending Technician invitation.
                                        </Text>
                                    </ThemedCard>
                                ) : (
                                    technicianMembers.map((member) => (
                                        <TechnicianCard key={member.id} member={member} />
                                    ))
                                )}
                            </View>
                        </View>

                        <View style={sectionStyle}>
                            <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>All Team Members</Text>
                            <View style={listStyle}>
                                {members.length === 0 ? (
                                    <ThemedCard>
                                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                            No company members found.
                                        </Text>
                                    </ThemedCard>
                                ) : (
                                    members.map((member) => (
                                        <MemberCard
                                            key={member.id}
                                            member={member}
                                            actionLoadingKey={actionLoadingKey}
                                            onStatusChange={updateMemberStatus}
                                        />
                                    ))
                                )}
                            </View>
                        </View>

                        <View style={sectionStyle}>
                            <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>Invitations</Text>
                            <View style={listStyle}>
                                {invitations.length === 0 ? (
                                    <ThemedCard>
                                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                            No invitations found.
                                        </Text>
                                    </ThemedCard>
                                ) : (
                                    invitations.map((invitation) => (
                                        <InvitationCard
                                            key={invitation.id}
                                            invitation={invitation}
                                            actionLoadingKey={actionLoadingKey}
                                            feedback={deliveryFeedbackById[invitation.id]}
                                            nowMs={nowMs}
                                            onSendEmail={sendInvitationEmail}
                                            onRevoke={revokeInvitation}
                                        />
                                    ))
                                )}
                            </View>
                        </View>
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

function TechnicianCard({ member }: { member: CompanyUser }) {
    const { theme } = useTheme();
    const status = normalizeStatus(member.status);

    return (
        <ThemedCard>
            <View style={technicianCardHeaderStyle}>
                <View style={technicianAvatarStyle}>
                    <Text style={technicianAvatarTextStyle}>{getInitials(member.full_name || member.email)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[cardTitleStyle, { color: theme.colors.text }]}>
                        {member.full_name || 'Unnamed technician'}
                    </Text>
                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{member.email || 'No email'}</Text>
                </View>
            </View>
            <View style={badgeRowStyle}>
                <RoleBadge label="Technician" />
                <RoleBadge label={status === 'active' ? 'Active' : formatLabel(member.status)} tone={status} />
            </View>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                TechOS field assignments will connect after client/home assignment is added.
            </Text>
        </ThemedCard>
    );
}

function RoleBadge({ label, tone }: { label: string; tone?: string }) {
    const { theme } = useTheme();
    const normalizedTone = normalizeStatus(tone);
    const isActive = normalizedTone === 'active';

    return (
        <View
            style={{
                backgroundColor: isActive ? theme.colors.secondaryButton : theme.colors.background,
                borderColor: isActive ? theme.colors.primary : theme.colors.border,
                borderRadius: 999,
                borderWidth: 1,
                maxWidth: '100%',
                paddingHorizontal: 10,
                paddingVertical: 6,
            }}
        >
            <Text
                style={{
                    color: isActive ? theme.colors.primary : theme.colors.text,
                    fontSize: 12,
                    fontWeight: '900',
                    flexShrink: 1,
                }}
            >
                {label}
            </Text>
        </View>
    );
}

function MemberCard({
    member,
    actionLoadingKey,
    onStatusChange,
}: {
    member: CompanyUser;
    actionLoadingKey: string | null;
    onStatusChange: (memberId: string, nextStatus: MemberActionStatus) => void;
}) {
    const { theme } = useTheme();
    const status = normalizeStatus(member.status);

    return (
        <ThemedCard>
            <Text style={[cardTitleStyle, { color: theme.colors.text }]}>{member.full_name || 'Unnamed member'}</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{member.email || 'No email'}</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>Role: {formatLabel(member.role)}</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>Status: {formatLabel(member.status)}</Text>

            {(status === 'active' || status === 'suspended' || status === 'inactive') && (
                <View style={actionRowStyle}>
                    {status === 'active' ? (
                        <>
                            <ThemedButton
                                title="Suspend"
                                variant="secondary"
                                onPress={() => onStatusChange(member.id, 'suspended')}
                                disabled={actionLoadingKey !== null}
                                style={actionButtonStyle}
                            />
                            <ThemedButton
                                title="Deactivate"
                                variant="danger"
                                onPress={() => onStatusChange(member.id, 'inactive')}
                                disabled={actionLoadingKey !== null}
                                style={actionButtonStyle}
                            />
                        </>
                    ) : (
                        <ThemedButton
                            title="Reactivate"
                            variant="secondary"
                            onPress={() => onStatusChange(member.id, 'active')}
                            disabled={actionLoadingKey !== null}
                            style={actionButtonStyle}
                        />
                    )}
                </View>
            )}
        </ThemedCard>
    );
}

function InvitationCard({
    invitation,
    actionLoadingKey,
    feedback,
    nowMs,
    onSendEmail,
    onRevoke,
}: {
    invitation: CompanyInvitation;
    actionLoadingKey: string | null;
    feedback?: DeliveryFeedback;
    nowMs: number;
    onSendEmail: (invitationId: string) => void;
    onRevoke: (invitationId: string) => void;
}) {
    const { theme } = useTheme();
    const emailKey = `${invitation.id}:email`;
    const revokeKey = `${invitation.id}:revoke`;
    const status = normalizeStatus(invitation.status);
    const expired = isInvitationExpired(invitation, nowMs);
    const sendable = status === 'pending' && !expired;
    const cooldownRemainingMs = getCooldownRemainingMs(invitation, nowMs);
    const sending = actionLoadingKey === emailKey;
    const anyActionLoading = actionLoadingKey !== null;
    const emailSendCount = invitation.email_send_count || 0;

    return (
        <ThemedCard>
            <Text style={[cardTitleStyle, { color: theme.colors.text }]}>
                {invitation.full_name || 'Unnamed invitee'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{invitation.email}</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>Role: {formatLabel(invitation.role)}</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Status: {expired ? 'Expired' : formatLabel(invitation.status)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Created: {formatDate(invitation.created_at)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Email: {formatDeliverySummary(invitation, feedback)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                {MANUAL_INVITE_UNAVAILABLE_MESSAGE}
            </Text>
            {status === 'revoked' && (
                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                    {REVOKED_INVITE_ARCHIVE_MESSAGE}
                </Text>
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
                        title={actionLoadingKey === revokeKey ? 'Revoking...' : 'Revoke Invitation'}
                        variant="danger"
                        onPress={() => onRevoke(invitation.id)}
                        disabled={actionLoadingKey !== null}
                        style={actionButtonStyle}
                    />
                </View>
            )}
        </ThemedCard>
    );
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeStatus(status?: string | null) {
    return String(status || '').trim().toLowerCase();
}

function normalizeRole(role?: string | null) {
    return String(role || '').trim().toLowerCase();
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
    if (normalizeStatus(invitation.status) === 'expired') return true;
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
