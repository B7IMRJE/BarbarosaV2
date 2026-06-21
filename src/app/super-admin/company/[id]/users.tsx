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
    created_at: string | null;
};

const ROLE_OPTIONS: { label: string; value: CompanyRole }[] = [
    { label: 'Owner', value: 'owner' },
    { label: 'Admin', value: 'admin' },
    { label: 'Manager', value: 'manager' },
    { label: 'Office', value: 'office' },
    { label: 'Technician', value: 'technician' },
];

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

    useEffect(() => {
        loadCompanyUsers();
    }, [id]);

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
                .select('id, company_id, full_name, email, role, status, created_at')
                .eq('company_id', String(id))
                .eq('status', 'pending')
                .order('created_at', { ascending: false }),
        ]);

        setLoadingLists(false);

        if (membersResult.error) {
            setMessage(`Error loading company members: ${membersResult.error.message}`);
            return false;
        }

        if (invitationsResult.error) {
            setMessage(`Error loading pending invitations: ${invitationsResult.error.message}`);
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

        if (!email.trim()) {
            setMessage('Enter an email address.');
            return;
        }

        setSubmitting(true);
        setMessage('Creating invitation...');

        const { error } = await supabase.rpc('create_company_user_invitation', {
            p_company_id: String(id),
            p_email: email.trim(),
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
        setMessage('Invitation created.');
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

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{
                padding: 20,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <Text
                    onPress={() => router.push(`/super-admin/company/${id}` as any)}
                    style={[backTextStyle, { color: theme.colors.text }]}
                >
                    Back
                </Text>

                <Text style={[titleStyle, { color: theme.colors.text }]}>Company Users</Text>

                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Manage company memberships and pending invitations.
                </Text>

                <ThemedCard style={formCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Create Invitation</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        This creates a pending invitation record. Email delivery will be connected in a later phase. It
                        does not create or modify a Supabase Auth account.
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
                        autoCorrect={false}
                        keyboardType="email-address"
                        style={[
                            inputStyle,
                            {
                                backgroundColor: theme.colors.background,
                                borderColor: theme.colors.border,
                                color: theme.colors.text,
                            },
                        ]}
                    />

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
                            <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>Company Members</Text>
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
                            <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>Pending Invitations</Text>
                            <View style={listStyle}>
                                {invitations.length === 0 ? (
                                    <ThemedCard>
                                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                            No pending invitations.
                                        </Text>
                                    </ThemedCard>
                                ) : (
                                    invitations.map((invitation) => (
                                        <InvitationCard
                                            key={invitation.id}
                                            invitation={invitation}
                                            actionLoadingKey={actionLoadingKey}
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
    onRevoke,
}: {
    invitation: CompanyInvitation;
    actionLoadingKey: string | null;
    onRevoke: (invitationId: string) => void;
}) {
    const { theme } = useTheme();
    const revokeKey = `${invitation.id}:revoke`;

    return (
        <ThemedCard>
            <Text style={[cardTitleStyle, { color: theme.colors.text }]}>
                {invitation.full_name || 'Unnamed invitee'}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{invitation.email}</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>Role: {formatLabel(invitation.role)}</Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Status: {formatLabel(invitation.status)}
            </Text>
            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                Created: {formatDate(invitation.created_at)}
            </Text>

            {normalizeStatus(invitation.status) === 'pending' && (
                <View style={actionRowStyle}>
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

function normalizeStatus(status: string | null) {
    return String(status || '').trim().toLowerCase();
}

function formatLabel(value: string | null) {
    return String(value || 'unknown')
        .trim()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function formatDate(value: string | null) {
    if (!value) return 'Unknown';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';

    return date.toLocaleDateString();
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
    gap: 14,
    marginBottom: 16,
};

const messageCardStyle = {
    marginBottom: 16,
};

const sectionStyle = {
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

const inputStyle = {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '800' as const,
    paddingHorizontal: 16,
    paddingVertical: 16,
};

const roleGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const roleChipStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
};

const roleChipTextStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const listStyle = {
    gap: 12,
};

const cardTitleStyle = {
    fontSize: 19,
    fontWeight: '900' as const,
};

const metaTextStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 6,
};

const actionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 16,
};

const actionButtonStyle = {
    minWidth: 150,
    paddingVertical: 14,
};
