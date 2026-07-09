import { router, useLocalSearchParams, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import AdminNavBar from '../../../../components/AdminNavBar';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import { logCompanyAuditEvent, safeAuditRecord } from '../../../../lib/companyAuditLogs';
import {
    COMPANY_PERMISSION_LABELS,
    canAccessTechOS as canAccessCompanyTechOS,
    isTechnicianCompanyRole,
    loadCurrentCompanyPermissionAccess,
    normalizeCompanyRole,
    normalizeCompanyStatus,
    resolveCompanyPermissions,
    type CompanyPermissionKey,
    type CompanyPermissionSet,
} from '../../../../lib/companyPermissions';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/useTheme';

type CompanyRole = 'owner' | 'admin' | 'manager' | 'office' | 'dispatcher' | 'supervisor' | 'technician';
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
    warning: string | null;
    message: string;
};

type ManualInviteResult = {
    inviteCode: string | null;
    inviteUrl: string | null;
    expiresAt: string | null;
    warning: string | null;
};

type InvitationEmailResult = {
    ok: boolean;
    message: string;
};

type SubmitStage = 'idle' | 'creating' | 'sending';
type SectionKey = 'owners' | 'adminManagerStaff' | 'technicians' | 'members' | 'invitations';

type CompanyUserManagementAccessResult = {
    canManage: boolean;
    message: string | null;
};

const ROLE_OPTIONS: { label: string; value: CompanyRole }[] = [
    { label: 'Company Owner', value: 'owner' },
    { label: 'Admin', value: 'admin' },
    { label: 'Manager', value: 'manager' },
    { label: 'Office', value: 'office' },
    { label: 'Dispatcher', value: 'dispatcher' },
    { label: 'Supervisor', value: 'supervisor' },
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
    'can_manage_company_users',
    'can_manage_company_profile',
];

export default function CompanyUsersScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();

    const [members, setMembers] = useState<CompanyUser[]>([]);
    const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<CompanyRole>('technician');
    const [companyName, setCompanyName] = useState('Company');
    const [searchQuery, setSearchQuery] = useState('');
    const [message, setMessage] = useState('Loading company users...');
    const [loadingLists, setLoadingLists] = useState(true);
    const [canManageUsers, setCanManageUsers] = useState(false);
    const [submitStage, setSubmitStage] = useState<SubmitStage>('idle');
    const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
    const [deliveryFeedbackById, setDeliveryFeedbackById] = useState<Record<string, DeliveryFeedback>>({});
    const [manualInvitesById, setManualInvitesById] = useState<Record<string, ManualInviteDetails>>({});
    const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
        owners: false,
        adminManagerStaff: false,
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
        const hasOwners = members.some((member) => isCompanyOwnerRole(member.role));
        const hasAdminManagerStaff = members.some((member) => isAdminManagerStaffRole(member.role));
        const hasTechnicians = members.some((member) => isTechnicianRole(member.role));
        const hasMembers = members.length > 0;
        const hasPendingInvitations = invitations.some(
            (invitation) => normalizeStatus(invitation.status) === 'pending' && !isInvitationExpired(invitation, nowMs)
        );
        const hasCategorizedMembers = hasOwners || hasAdminManagerStaff || hasTechnicians;

        setCollapsedSections((current) => ({
            owners: touchedSections.owners ? current.owners : false,
            adminManagerStaff: touchedSections.adminManagerStaff ? current.adminManagerStaff : !hasAdminManagerStaff,
            technicians: touchedSections.technicians ? current.technicians : false,
            members: touchedSections.members ? current.members : hasCategorizedMembers && hasMembers,
            invitations: touchedSections.invitations ? current.invitations : !hasPendingInvitations,
        }));
    }, [members, invitations, touchedSections, nowMs]);

    async function loadCompanyUsers(showLoading = true) {
        if (!id) {
            setCanManageUsers(false);
            setMessage('Missing company id.');
            setLoadingLists(false);
            return false;
        }

        if (showLoading) {
            setLoadingLists(true);
            setCanManageUsers(false);
            setMessage('Checking company user management access...');
        }

        const accessResult = await loadCompanyUserManagementAccess(String(id));

        if (!accessResult.canManage) {
            setMembers([]);
            setInvitations([]);
            setCanManageUsers(false);
            setLoadingLists(false);
            setMessage(accessResult.message || 'Company user management requires owner, admin, or manager access.');
            return false;
        }

        setCanManageUsers(true);

        const [membersResult, invitationsResult, companyNameResult] = await Promise.all([
            loadCompanyMembers(String(id)),
            supabase
                .from('company_user_invitations')
                .select(
                    'id, company_id, full_name, email, role, status, expires_at, created_at, last_email_attempted_at, last_email_sent_at, email_send_count, email_delivery_status, email_delivery_error'
                )
                .eq('company_id', String(id))
                .order('created_at', { ascending: false }),
            loadCompanyDisplayName(String(id)),
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
        setCompanyName(companyNameResult);

        if (showLoading) {
            setMessage('');
        }

        return true;
    }

    async function sendInvitation() {
        if (!canManageUsers) {
            setMessage('Company user management requires owner, admin, or manager access.');
            return;
        }

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

        const existingPendingInvite =
            findReusablePendingInvitation(normalizedEmail, invitations, nowMs) ||
            await loadReusablePendingInvitation(String(id), normalizedEmail, nowMs);
        let invitationToSend: CompanyInvitation | null = existingPendingInvite;
        let createdNewInvitation = false;

        setSubmitStage(existingPendingInvite ? 'sending' : 'creating');
        setMessage(existingPendingInvite
            ? `A pending invite already exists for ${normalizedEmail}. Sending that invitation email...`
            : 'Creating invitation...');

        if (!existingPendingInvite) {
            const { data, error } = await supabase.rpc('create_company_user_invitation', {
                p_company_id: String(id),
                p_email: normalizedEmail,
                p_full_name: fullName.trim() || null,
                p_role: role,
            });

            if (error) {
                setSubmitStage('idle');
                setMessage(`Create invitation failed: ${error.message}`);
                return;
            }

            invitationToSend = normalizeInvitationRecord(data);
            createdNewInvitation = true;

            await recordCompanyAuditEvent({
                companyId: String(id),
                action: 'company_user_invitation_created',
                targetType: 'company_user_invitation',
                targetId: invitationToSend?.id || null,
                targetLabel: `${normalizedEmail} (${role})`,
                afterData: safeAuditRecord({
                    email: normalizedEmail,
                    full_name: fullName.trim() || null,
                    role,
                    status: invitationToSend?.status || 'pending',
                }),
            });
        }

        if (!invitationToSend) {
            setSubmitStage('idle');
            await loadCompanyUsers(false);
            setMessage('Invitation was created, but the app could not read the invitation id. Refresh and use the pending invites list to resend.');
            return;
        }

        setSubmitStage('sending');
        setMessage('Sending email...');
        const emailResult = await sendInvitationEmailForInvitation(invitationToSend, {
            messagePrefixOnFailure: createdNewInvitation
                ? 'Invite was created, but email sending failed. You can resend it from the pending invites list.'
                : 'A pending invite already exists, but email sending failed. You can resend it from the pending invites list.',
        });

        setSubmitStage('idle');
        await loadCompanyUsers(false);

        if (!emailResult.ok) {
            setMessage(emailResult.message);
            return;
        }

        setFullName('');
        setEmail('');
        setRole('technician');
        setMessage(`Invitation sent to ${normalizedEmail}`);
    }

    async function sendInvitationEmail(invitationId: string) {
        if (!canManageUsers) {
            setMessage('Company user management requires owner, admin, or manager access.');
            return;
        }

        const invitation = invitations.find((candidate) => candidate.id === invitationId);

        if (!invitation) {
            setMessage('Invitation could not be found. Refresh the list and try again.');
            return;
        }

        const emailResult = await sendInvitationEmailForInvitation(invitation);

        if (!emailResult.ok) {
            setMessage(emailResult.message);
        }
    }

    async function sendInvitationEmailForInvitation(
        invitation: CompanyInvitation,
        options: { messagePrefixOnFailure?: string } = {}
    ): Promise<InvitationEmailResult> {
        if (!canManageUsers) {
            const message = 'Company user management requires owner, admin, or manager access.';
            setMessage(message);
            return { ok: false, message };
        }

        const invitationId = invitation.id;
        const actionKey = `${invitationId}:email`;
        setActionLoadingKey(actionKey);
        setDeliveryFeedbackById((current) => ({
            ...current,
            [invitationId]: {
                status: 'sent',
                message: 'Sending invitation email...',
            },
        }));
        setMessage('Sending email...');

        const manualInvite = await requestManualInvite(invitationId);

        if (!manualInvite.inviteCode) {
            const message = manualInvite.warning || 'Email could not be sent because the invite link/code could not be created.';
            setActionLoadingKey(null);
            setDeliveryFeedbackById((current) => ({
                ...current,
                [invitationId]: {
                    status: 'failed',
                    message,
                },
            }));
            const responseMessage = options.messagePrefixOnFailure ? `${options.messagePrefixOnFailure} ${message}` : message;
            setMessage(responseMessage);
            return { ok: false, message: responseMessage };
        }

        setMessage('Sending invitation email...');
        const publicInvite = buildPublicCompanyInvite(manualInvite.inviteCode);
        const emailResult = await sendCompanyInvitationEmail({
            invitation,
            invitationId,
            companyName,
            inviteCode: manualInvite.inviteCode,
            inviteLink: publicInvite.inviteLink,
            appBaseUrl: publicInvite.appBaseUrl,
        });

        setActionLoadingKey(null);
        setNowMs(Date.now());

        if (!emailResult.ok) {
            const deliveryMessage = emailResult.message || EMAIL_DELIVERY_FALLBACK_MESSAGE;
            const message = options.messagePrefixOnFailure
                ? `${options.messagePrefixOnFailure} ${deliveryMessage}`
                : `${deliveryMessage} Manual invite link/code is ready below.`;

            setManualInvitesById((current) => ({
                ...current,
                [invitationId]: {
                    status: 'ready',
                    inviteCode: manualInvite.inviteCode,
                    inviteUrl: manualInvite.inviteUrl,
                    expiresAt: manualInvite.expiresAt,
                    warning: manualInvite.warning,
                    message: manualInvite.warning
                        ? `Email send failed. Manual invite ready. ${manualInvite.warning}`
                        : 'Email send failed. Manual invite link/code is ready below.',
                },
            }));
            setDeliveryFeedbackById((current) => ({
                ...current,
                [invitationId]: {
                    status: 'failed',
                    message,
                },
            }));
            await loadCompanyUsers(false);
            setMessage(message);
            return { ok: false, message };
        }

        const responseMessage = emailResult.message || 'Invitation email sent.';

        await recordCompanyAuditEvent({
            companyId: invitation.company_id,
            action: 'company_user_invitation_email_sent',
            targetType: 'company_user_invitation',
            targetId: invitation.id,
            targetLabel: `${invitation.email} (${invitation.role})`,
            metadata: safeAuditRecord({
                email: invitation.email,
                role: invitation.role,
                invite_link_built: Boolean(publicInvite.inviteLink),
                app_base_url: publicInvite.appBaseUrl,
            }),
        });

        setDeliveryFeedbackById((current) => ({
            ...current,
            [invitationId]: {
                status: 'sent',
                message: responseMessage,
            },
        }));
        await loadCompanyUsers(false);
        setMessage(responseMessage);
        return { ok: true, message: responseMessage };
    }

    async function updateMemberStatus(memberId: string, nextStatus: MemberActionStatus) {
        if (!canManageUsers) {
            setMessage('Company user management requires owner, admin, or manager access.');
            return;
        }

        const actionKey = `${memberId}:${nextStatus}`;
        const member = members.find((candidate) => candidate.id === memberId) || null;
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

        await recordCompanyAuditEvent({
            companyId: member?.company_id || String(id),
            action: nextStatus === 'inactive' ? 'company_user_deactivated' : 'company_user_status_changed',
            targetType: 'company_user',
            targetId: memberId,
            targetLabel: member ? getMemberDisplayName(member, member.email || memberId) : memberId,
            beforeData: member
                ? safeAuditRecord({
                    email: member.email,
                    full_name: member.full_name,
                    role: member.role,
                    status: member.status,
                })
                : null,
            afterData: safeAuditRecord({
                status: nextStatus,
            }),
        });

        await loadCompanyUsers(false);
        setMessage(`Member ${statusResult(nextStatus)}.`);
    }

    async function revokeInvitation(invitationId: string) {
        if (!canManageUsers) {
            setMessage('Company user management requires owner, admin, or manager access.');
            return;
        }

        const actionKey = `${invitationId}:revoke`;
        const invitation = invitations.find((candidate) => candidate.id === invitationId) || null;
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

        await recordCompanyAuditEvent({
            companyId: invitation?.company_id || String(id),
            action: 'company_user_invitation_revoked',
            targetType: 'company_user_invitation',
            targetId: invitationId,
            targetLabel: invitation ? `${invitation.email} (${invitation.role})` : invitationId,
            beforeData: invitation
                ? safeAuditRecord({
                    email: invitation.email,
                    full_name: invitation.full_name,
                    role: invitation.role,
                    status: invitation.status,
                })
                : null,
            afterData: safeAuditRecord({
                status: 'revoked',
            }),
        });

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
        if (!canManageUsers) {
            setMessage('Company user management requires owner, admin, or manager access.');
            return false;
        }

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
                warning: current[invitationId]?.warning || null,
                message: loadingMessage,
            },
        }));
        setMessage(loadingMessage);

        const manualInvite = await requestManualInvite(invitationId);

        setActionLoadingKey(null);

        if (!manualInvite.inviteCode && !manualInvite.inviteUrl) {
            const message = `${failurePrefix}: ${manualInvite.warning || 'the server did not return an invite link or code.'}`;
            setManualInvitesById((current) => ({
                ...current,
                [invitationId]: {
                    status: 'failed',
                    inviteCode: null,
                    inviteUrl: null,
                    expiresAt: null,
                    warning: null,
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
                warning: manualInvite.warning,
                message: manualInvite.warning ? `${successMessage} ${manualInvite.warning}` : successMessage,
            },
        }));
        await loadCompanyUsers(false);
        setMessage(manualInvite.warning ? `${successMessage} ${manualInvite.warning}` : successMessage);
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

    async function deleteInvitation(invitationId: string) {
        if (!canManageUsers) {
            setMessage('Company user management requires owner, admin, or manager access.');
            return;
        }

        const invitation = invitations.find((candidate) => candidate.id === invitationId);
        const status = normalizeStatus(invitation?.status);
        const expiredPending = !!invitation && status === 'pending' && isInvitationExpired(invitation, Date.now());
        const actionKey = `${invitationId}:delete`;
        setActionLoadingKey(actionKey);
        setMessage(status === 'revoked' ? 'Deleting revoked invitation...' : 'Deleting old invitation...');

        const deleteResult = await supabase.rpc('delete_company_user_invitation', {
            p_invitation_id: invitationId,
        });

        if (deleteResult.error && status === 'revoked') {
            const fallbackResult = await supabase.rpc('delete_revoked_company_user_invitation', {
                p_invitation_id: invitationId,
            });

            setActionLoadingKey(null);

            if (fallbackResult.error) {
                setMessage(`Delete invitation failed: ${fallbackResult.error.message}`);
                return;
            }

            setManualInvitesById((current) => {
                const next = { ...current };
                delete next[invitationId];
                return next;
            });
            await recordCompanyAuditEvent({
                companyId: invitation?.company_id || String(id),
                action: 'company_user_invitation_deleted',
                targetType: 'company_user_invitation',
                targetId: invitationId,
                targetLabel: invitation ? `${invitation.email} (${invitation.role})` : invitationId,
                beforeData: invitation
                    ? safeAuditRecord({
                        email: invitation.email,
                        full_name: invitation.full_name,
                        role: invitation.role,
                        status: invitation.status,
                    })
                    : null,
                metadata: safeAuditRecord({
                    fallback_delete: true,
                }),
            });
            await loadCompanyUsers(false);
            setMessage('Revoked invitation deleted.');
            return;
        }

        setActionLoadingKey(null);

        if (deleteResult.error) {
            setMessage(
                expiredPending
                    ? `Delete old invitation failed: ${deleteResult.error.message}. Apply SQL 589 to enable safe deletion of expired pending invitations.`
                    : `Delete invitation failed: ${deleteResult.error.message}`
            );
            return;
        }

        setManualInvitesById((current) => {
            const next = { ...current };
            delete next[invitationId];
            return next;
        });
        await recordCompanyAuditEvent({
            companyId: invitation?.company_id || String(id),
            action: 'company_user_invitation_deleted',
            targetType: 'company_user_invitation',
            targetId: invitationId,
            targetLabel: invitation ? `${invitation.email} (${invitation.role})` : invitationId,
            beforeData: invitation
                ? safeAuditRecord({
                    email: invitation.email,
                    full_name: invitation.full_name,
                    role: invitation.role,
                    status: invitation.status,
                })
                : null,
        });
        await loadCompanyUsers(false);
        setMessage('Invitation deleted.');
    }

    function prepareOwnerInvite() {
        setRole('owner');
        setMessage('Company owner invite selected. Enter the owner name and email, then send the invitation.');
    }

    function prepareTechnicianInvite() {
        setRole('technician');
        setMessage('Technician invite selected. Enter the technician name and email, then send the invitation.');
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
    const submitting = submitStage !== 'idle';
    const inviteSubmitTitle = submitStage === 'creating'
        ? 'Creating invitation...'
        : submitStage === 'sending'
            ? 'Sending email...'
            : 'Send Invitation';
    const filteredMembers = useMemo(
        () => members.filter((member) => matchesMemberSearch(member, normalizedSearch)),
        [members, normalizedSearch]
    );
    const filteredInvitations = useMemo(
        () => invitations.filter((invitation) => matchesInvitationSearch(invitation, normalizedSearch, nowMs)),
        [invitations, normalizedSearch, nowMs]
    );
    const allOwnerMembers = members.filter((member) => isCompanyOwnerRole(member.role));
    const ownerMembers = filteredMembers.filter((member) => isCompanyOwnerRole(member.role));
    const adminManagerStaffMembers = filteredMembers.filter((member) => isAdminManagerStaffRole(member.role));
    const allTechnicianMembers = members.filter((member) => isTechnicianRole(member.role));
    const technicianMembers = filteredMembers.filter((member) => isTechnicianRole(member.role));
    const activeOwners = allOwnerMembers.filter((member) => normalizeStatus(member.status) === 'active');
    const activeTechnicians = allTechnicianMembers.filter((member) => normalizeStatus(member.status) === 'active');
    const activeMembers = members.filter((member) => normalizeStatus(member.status) === 'active');
    const pendingOwnerInvitations = invitations.filter(
        (invitation) =>
            isCompanyOwnerRole(invitation.role) &&
            normalizeStatus(invitation.status) === 'pending' &&
            !isInvitationExpired(invitation, nowMs)
    );
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
                <AdminNavBar
                    companyId={String(id || '')}
                    backFallback={`/super-admin/company/${id}` as Href}
                />

                <Text style={[titleStyle, { color: theme.colors.text }]}>Team / Technicians</Text>

                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Manage company credentials, Dispatch access, technician access, and pending team invitations for TechOS.
                </Text>

                {canManageUsers && (
                    <>
                        <ThemedCard style={heroCardStyle}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Company Ownership & TechOS Access</Text>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                Invite the real company owner first, then add admins, managers, Dispatch staff, and technicians.
                                Invited users become active only after accepting with their own work account.
                            </Text>
                            <Text style={[helperTextStyle, { color: theme.colors.mutedText }]}>
                                Owner transfer/removal coming soon. Invite and activate the new owner first.
                            </Text>
                            <View style={metricGridStyle}>
                                <MetricCard label="Active Company Owners" value={activeOwners.length.toString()} />
                                <MetricCard label="Pending Owner Invites" value={pendingOwnerInvitations.length.toString()} />
                                <MetricCard label="Active Technicians" value={activeTechnicians.length.toString()} />
                                <MetricCard label="Pending Technician Invites" value={pendingTechnicianInvitations.length.toString()} />
                                <MetricCard label="Active Team Members" value={activeMembers.length.toString()} />
                            </View>
                            <View style={[actionRowStyle, { marginTop: 14 }]}>
                                <ThemedButton
                                    title="Invite Company Owner"
                                    onPress={prepareOwnerInvite}
                                    variant="secondary"
                                    style={actionButtonStyle}
                                />
                                <ThemedButton
                                    title="Invite First Test Technician"
                                    onPress={prepareTechnicianInvite}
                                    variant="secondary"
                                    style={actionButtonStyle}
                                />
                            </View>
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
                                Send one company invitation email for ManagementOS or TechOS access. The invite creates a pending
                                company membership only after the user accepts it with their work account.
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
                                title={inviteSubmitTitle}
                                onPress={sendInvitation}
                                disabled={submitting}
                            />
                        </ThemedCard>
                    </>
                )}

                {!!message && (
                    <ThemedCard style={messageCardStyle}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}

                {loadingLists ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading company users...</Text>
                    </ThemedCard>
                ) : canManageUsers ? (
                    <>
                        <CompactSection
                            title="Company Owners"
                            count={ownerMembers.length}
                            collapsed={collapsedSections.owners}
                            onToggle={() => toggleSection('owners')}
                        >
                            {ownerMembers.length === 0 ? (
                                <EmptyListMessage message="No company owners match this view. Invite and activate the real company owner before removing any temporary admin access." />
                            ) : (
                                ownerMembers.map((member) => (
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
                            title="Admins / Managers / Dispatch Staff"
                            count={adminManagerStaffMembers.length}
                            collapsed={collapsedSections.adminManagerStaff}
                            onToggle={() => toggleSection('adminManagerStaff')}
                        >
                            {adminManagerStaffMembers.length === 0 ? (
                                <EmptyListMessage message="No admins, managers, office, dispatcher, or supervisor staff match this view." />
                            ) : (
                                adminManagerStaffMembers.map((member) => (
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
                            title="Pending Invitations & History"
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
                                        onDeleteInvitation={deleteInvitation}
                                    />
                                ))
                            )}
                        </CompactSection>
                    </>
                ) : null}
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
        <ThemedCard style={emptyListCardStyle}>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
        </ThemedCard>
    );
}

function GlassGridCard({
    children,
    expanded,
    onPress,
}: {
    children: ReactNode;
    expanded: boolean;
    onPress: () => void;
}) {
    const { theme } = useTheme();
    const [hovered, setHovered] = useState(false);

    return (
        <Pressable
            accessibilityRole="button"
            onHoverIn={() => setHovered(true)}
            onHoverOut={() => setHovered(false)}
            onPress={onPress}
            style={[
                glassCardStyle,
                {
                    backgroundColor: hovered ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.74)',
                    borderColor: hovered ? theme.colors.primary : 'rgba(255,255,255,0.86)',
                    shadowColor: theme.colors.text,
                },
                hovered && glassCardHoverStyle,
                expanded && glassCardExpandedStyle,
            ]}
        >
            {children}
        </Pressable>
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
    const companyOwner = isCompanyOwnerRole(member.role);

    return (
        <GlassGridCard expanded={expanded} onPress={onToggle}>
            <View style={glassCardTopRowStyle}>
                <View style={[glassAvatarStyle, { backgroundColor: theme.colors.secondaryButton }]}>
                    <Text style={[glassAvatarTextStyle, { color: theme.colors.primary }]}>
                        {getInitials(displayName || contactLine)}
                    </Text>
                </View>
                <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={onToggle}
                    style={[
                        manageChipStyle,
                        {
                            backgroundColor: expanded ? theme.colors.primary : 'rgba(255,255,255,0.82)',
                            borderColor: expanded ? theme.colors.primary : theme.colors.border,
                        },
                    ]}
                >
                    <Text
                        style={[
                            manageChipTextStyle,
                            { color: expanded ? theme.colors.primaryText : theme.colors.text },
                        ]}
                    >
                        {expanded ? 'Close' : 'Manage'}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={glassIdentityColumnStyle}>
                <Text style={[glassNameStyle, { color: theme.colors.text }]} numberOfLines={2}>
                    {displayName}
                </Text>
                <Text style={[glassEmailStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                    {contactLine}
                </Text>
            </View>

            <View style={glassPillRowStyle}>
                <RoleBadge label={formatRole(member.role)} />
                <RoleBadge label={status === 'active' ? 'Active' : formatLabel(member.status)} tone={status} />
            </View>

            <View style={glassMetaFooterStyle}>
                <Text style={[glassDateTextStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                    Joined {formatDate(member.created_at)}
                </Text>
            </View>

            {expanded && (
                <View style={rowDetailsStyle}>
                    <View style={compactManageHeaderStyle}>
                        <Text style={[compactManageTitleStyle, { color: theme.colors.text }]}>Manage Staff Member</Text>
                        <View style={compactBadgeClusterStyle}>
                            <RoleBadge label={formatRole(member.role)} />
                            <RoleBadge label={status === 'active' ? 'Active' : formatLabel(member.status)} tone={status} />
                        </View>
                    </View>

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
                            Active technicians and approved company staff roles can access TechOS.
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
                        {companyOwner && (
                            <PlaceholderButton title="Owner transfer/removal coming soon. Invite and activate the new owner first." />
                        )}
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
        </GlassGridCard>
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
    onDeleteInvitation,
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
    onDeleteInvitation: (invitationId: string) => void;
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
    const deletingInvitation = actionLoadingKey === deleteKey;
    const anyActionLoading = actionLoadingKey !== null;
    const emailSendCount = invitation.email_send_count || 0;
    const inviteTitle = invitation.full_name || invitation.email || 'Unnamed invitee';

    return (
        <GlassGridCard expanded={expanded} onPress={onToggle}>
            <View style={glassCardTopRowStyle}>
                <View style={[glassAvatarStyle, { backgroundColor: theme.colors.secondaryButton }]}>
                    <Text style={[glassAvatarTextStyle, { color: theme.colors.primary }]}>
                        {getInitials(inviteTitle)}
                    </Text>
                </View>
                <TouchableOpacity
                    activeOpacity={0.82}
                    onPress={onToggle}
                    style={[
                        manageChipStyle,
                        {
                            backgroundColor: expanded ? theme.colors.primary : 'rgba(255,255,255,0.82)',
                            borderColor: expanded ? theme.colors.primary : theme.colors.border,
                        },
                    ]}
                >
                    <Text
                        style={[
                            manageChipTextStyle,
                            { color: expanded ? theme.colors.primaryText : theme.colors.text },
                        ]}
                    >
                        {expanded ? 'Close' : 'Manage'}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={glassIdentityColumnStyle}>
                <Text style={[glassNameStyle, { color: theme.colors.text }]} numberOfLines={2}>
                    {inviteTitle}
                </Text>
                <Text style={[glassEmailStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                    {invitation.email || 'No email'}
                </Text>
            </View>

            <View style={glassPillRowStyle}>
                <RoleBadge label={formatRole(invitation.role)} />
                <RoleBadge label={formatLabel(displayStatus)} tone={displayStatus} />
            </View>

            <View style={glassMetaFooterStyle}>
                <Text style={[glassDateTextStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                    Invited {formatDate(invitation.created_at)}
                </Text>
            </View>

            {expanded && (
                <View style={rowDetailsStyle}>
                    <View style={compactManageHeaderStyle}>
                        <Text style={[compactManageTitleStyle, { color: theme.colors.text }]}>Manage Invitation</Text>
                        <View style={compactBadgeClusterStyle}>
                            <RoleBadge label={formatRole(invitation.role)} />
                            <RoleBadge label={formatLabel(displayStatus)} tone={displayStatus} />
                        </View>
                    </View>
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

                    {status === 'pending' && (
                        <>
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
                                {expired && (
                                    <ThemedButton
                                        title={deletingInvitation ? 'Deleting...' : 'Delete Old Invite'}
                                        variant="danger"
                                        onPress={() => onDeleteInvitation(invitation.id)}
                                        disabled={actionLoadingKey !== null}
                                        style={actionButtonStyle}
                                    />
                                )}
                            </View>

                            <DetailPanelSection title="Advanced / Manual Invite">
                                <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText }]}>
                                    Use this backup only if normal email delivery fails or you need to send the invite code another way.
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
                                        {!!manualInvite.warning && (
                                            <Text style={[metaTextStyle, { color: theme.colors.danger }]}>
                                                {manualInvite.warning}
                                            </Text>
                                        )}

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
                                <ThemedButton
                                    title={creatingManualInvite ? 'Creating...' : 'Create / Copy Manual Invite'}
                                    variant="secondary"
                                    onPress={() => onCreateManualInvite(invitation.id)}
                                    disabled={anyActionLoading || expired}
                                    style={actionButtonStyle}
                                />
                            </DetailPanelSection>
                        </>
                    )}

                    {status === 'revoked' && (
                        <View style={actionRowStyle}>
                            <ThemedButton
                                title={deletingInvitation ? 'Deleting...' : 'Delete Invitation'}
                                variant="danger"
                                onPress={() => onDeleteInvitation(invitation.id)}
                                disabled={actionLoadingKey !== null}
                                style={actionButtonStyle}
                            />
                        </View>
                    )}
                </View>
            )}
        </GlassGridCard>
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

async function requestManualInvite(invitationId: string): Promise<ManualInviteResult> {
    const { baseUrl, warning: baseUrlWarning } = getAppBaseUrl();
    const { data, error } = await supabase.rpc('create_company_user_manual_invite_link', {
        p_invitation_id: invitationId,
        p_site_url: baseUrl,
    });

    if (error) {
        return {
            inviteCode: null,
            inviteUrl: null,
            expiresAt: null,
            warning: error.message,
        };
    }

    const manualInvite = parseManualInviteResponse(data);
    const warning = baseUrlWarning || publicInviteUrlWarning(manualInvite.inviteUrl);

    return {
        ...manualInvite,
        warning,
    };
}

async function sendCompanyInvitationEmail({
    invitation,
    invitationId,
    companyName,
    inviteCode,
    inviteLink,
    appBaseUrl,
}: {
    invitation: CompanyInvitation;
    invitationId: string;
    companyName: string;
    inviteCode: string;
    inviteLink: string | null;
    appBaseUrl: string | null;
}): Promise<InvitationEmailResult> {
    const {
        data: { session },
        error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
        return {
            ok: false,
            message: sessionError?.message || 'Sign in again before sending company invitations.',
        };
    }

    const payload: Record<string, string> = {
        invitation_id: invitationId,
        invitationId,
        email: invitation.email,
        invite_name: invitation.full_name || '',
        inviteName: invitation.full_name || '',
        company_name: companyName,
        companyName,
        invite_code: inviteCode,
        inviteCode,
        role: invitation.role,
    };

    if (inviteLink) {
        payload.invite_link = inviteLink;
        payload.inviteLink = inviteLink;
    }

    if (appBaseUrl) {
        payload.app_base_url = appBaseUrl;
        payload.appBaseUrl = appBaseUrl;
    }

    try {
        const response = await fetch(`${supabaseUrl}/functions/v1/send-company-user-invitation`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: supabaseAnonKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        const body = await readInvitationEmailResponse(response);

        if (!response.ok || body.ok === false) {
            return {
                ok: false,
                message: body.message || `Invitation email failed with status ${response.status}.`,
            };
        }

        return {
            ok: true,
            message: body.message || 'Invitation email sent.',
        };
    } catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : 'Network error sending invitation email.',
        };
    }
}

async function readInvitationEmailResponse(response: Response): Promise<{
    ok: boolean | null;
    message: string | null;
}> {
    const text = await response.text();

    if (!text.trim()) {
        return {
            ok: response.ok,
            message: null,
        };
    }

    try {
        const body = JSON.parse(text) as unknown;
        const record = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};

        return {
            ok: typeof record.ok === 'boolean' ? record.ok : response.ok,
            message: readStringField(record, 'message'),
        };
    } catch {
        return {
            ok: response.ok,
            message: text.trim(),
        };
    }
}

function buildPublicCompanyInvite(inviteCode: string | null) {
    const appBaseUrl = getEmailAppBaseUrl();

    if (!inviteCode || !appBaseUrl) {
        return {
            inviteLink: null,
            appBaseUrl,
        };
    }

    try {
        const inviteUrl = new URL('/company-invite', appBaseUrl);
        inviteUrl.searchParams.set('code', inviteCode);

        return {
            inviteLink: inviteUrl.toString(),
            appBaseUrl,
        };
    } catch {
        return {
            inviteLink: null,
            appBaseUrl,
        };
    }
}

function getEmailAppBaseUrl() {
    const configuredBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_APP_URL);

    if (configuredBaseUrl) return configuredBaseUrl;

    const fallbackBaseUrl = getBrowserOrigin();

    return fallbackBaseUrl && !isLocalInviteOrigin(fallbackBaseUrl) ? fallbackBaseUrl : null;
}

function getBrowserOrigin() {
    const globalWithLocation = globalThis as unknown as {
        location?: { origin?: string };
        window?: { location?: { origin?: string } };
    };

    return normalizeBaseUrl(globalWithLocation.window?.location?.origin || globalWithLocation.location?.origin || null);
}

async function loadCompanyDisplayName(companyId: string) {
    const { data, error } = await supabase
        .from('companies')
        .select('name, public_name, dba_name')
        .eq('id', companyId)
        .maybeSingle();

    if (error || !data) return 'Company';

    const record = data as Record<string, unknown>;

    return (
        readStringField(record, 'public_name') ||
        readStringField(record, 'dba_name') ||
        readStringField(record, 'name') ||
        'Company'
    );
}

async function loadCompanyUserManagementAccess(companyId: string): Promise<CompanyUserManagementAccessResult> {
    const rpcResult = await supabase.rpc('can_manage_company_users', {
        p_company_id: companyId,
    });

    if (!rpcResult.error) {
        return {
            canManage: rpcResult.data === true,
            message: rpcResult.data === true
                ? null
                : 'Company user management requires owner, admin, or manager access.',
        };
    }

    const permissionResult = await loadCurrentCompanyPermissionAccess('can_manage_company_users', {
        companyId,
    });

    if (permissionResult.access) {
        return { canManage: true, message: null };
    }

    return {
        canManage: false,
        message: permissionResult.error
            ? `Company user management unavailable: ${permissionResult.error}`
            : 'Company user management requires owner, admin, or manager access.',
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

function normalizeInvitationRecord(row: unknown): CompanyInvitation | null {
    if (!row || typeof row !== 'object') return null;

    const record = row as Record<string, unknown>;
    const id = readStringField(record, 'id') || '';
    const companyId = readStringField(record, 'company_id') || '';
    const email = readStringField(record, 'email') || '';

    if (!id || !companyId || !email) return null;

    return {
        id,
        company_id: companyId,
        email,
        full_name: readStringField(record, 'full_name'),
        role: readStringField(record, 'role') || 'unknown',
        status: readStringField(record, 'status') || 'unknown',
        expires_at: readStringField(record, 'expires_at'),
        created_at: readStringField(record, 'created_at'),
        last_email_attempted_at: readStringField(record, 'last_email_attempted_at'),
        last_email_sent_at: readStringField(record, 'last_email_sent_at'),
        email_send_count: readNullableNumberField(record, 'email_send_count'),
        email_delivery_status: readStringField(record, 'email_delivery_status'),
        email_delivery_error: readStringField(record, 'email_delivery_error'),
    };
}

function findReusablePendingInvitation(email: string, invitations: CompanyInvitation[], nowMs: number) {
    const normalizedEmail = email.trim().toLowerCase();

    return invitations.find((invitation) =>
        invitation.email.trim().toLowerCase() === normalizedEmail &&
        normalizeStatus(invitation.status) === 'pending' &&
        !isInvitationExpired(invitation, nowMs)
    ) || null;
}

async function loadReusablePendingInvitation(companyId: string, email: string, nowMs: number) {
    const { data, error } = await supabase
        .from('company_user_invitations')
        .select(
            'id, company_id, full_name, email, role, status, expires_at, created_at, last_email_attempted_at, last_email_sent_at, email_send_count, email_delivery_status, email_delivery_error'
        )
        .eq('company_id', companyId)
        .ilike('email', email.trim().toLowerCase())
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) return null;

    const invitations = (Array.isArray(data) ? data : [])
        .map((row) => normalizeInvitationRecord(row))
        .filter((invitation): invitation is CompanyInvitation => Boolean(invitation));

    return findReusablePendingInvitation(email, invitations, nowMs);
}

async function recordCompanyAuditEvent(input: Parameters<typeof logCompanyAuditEvent>[0]) {
    try {
        await logCompanyAuditEvent(input);
    } catch {
        // Audit logging should not roll back an already-completed ManagementOS action.
    }
}

function readStringField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value : null;
}

function readNullableNumberField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'number' && Number.isFinite(value) ? value : null;
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
    const configuredBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_APP_URL);
    const fallbackBaseUrl = getBrowserOrigin();
    const baseUrl = configuredBaseUrl || fallbackBaseUrl || null;
    const warning = !configuredBaseUrl && isLikelyNonPublicInviteOrigin(fallbackBaseUrl)
        ? 'Warning: this invite link may not be public. Set EXPO_PUBLIC_APP_URL to your production app URL.'
        : '';

    return { baseUrl, warning };
}

function normalizeBaseUrl(value?: string | null) {
    return String(value || '').trim().replace(/\/+$/, '');
}

function publicInviteUrlWarning(inviteUrl: string | null) {
    if (!inviteUrl) return '';

    return isLikelyNonPublicInviteOrigin(inviteUrl)
        ? 'Warning: this invite link may not be public. Set EXPO_PUBLIC_APP_URL to your production app URL.'
        : '';
}

function isLikelyNonPublicInviteOrigin(originOrUrl: string | null) {
    if (!originOrUrl) return true;

    try {
        const url = new URL(originOrUrl);
        const hostname = url.hostname.toLowerCase();

        return (
            hostname === 'localhost' ||
            hostname === '127.0.0.1' ||
            hostname.endsWith('.local') ||
            hostname.includes('vercel.app')
        );
    } catch {
        return true;
    }
}

function isLocalInviteOrigin(originOrUrl: string | null) {
    if (!originOrUrl) return true;

    try {
        const url = new URL(originOrUrl);
        const hostname = url.hostname.toLowerCase();

        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
    } catch {
        return true;
    }
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

function isCompanyOwnerRole(role?: string | null) {
    return normalizeRole(role) === 'owner';
}

function isAdminManagerStaffRole(role?: string | null) {
    const normalizedRole = normalizeRole(role);

    return ['admin', 'manager', 'office', 'dispatcher', 'supervisor'].includes(normalizedRole);
}

function formatRole(role?: string | null) {
    const normalizedRole = normalizeRole(role);

    if (normalizedRole === 'owner') return 'Company Owner';
    if (normalizedRole === 'admin') return 'Admin';
    if (normalizedRole === 'manager') return 'Manager';
    if (normalizedRole === 'office') return 'Office';
    if (normalizedRole === 'dispatcher') return 'Dispatcher';
    if (normalizedRole === 'supervisor') return 'Supervisor';
    if (normalizedRole === 'technician') return 'Technician';

    return formatLabel(role || null);
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
    return emailSendCount > 0 ? 'Resend Email Invitation' : 'Send Email Invitation';
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
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
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

const emptyListCardStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    padding: 14,
};

const glassCardStyle = {
    borderRadius: 22,
    borderWidth: 1,
    flexBasis: 230,
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: 268,
    minHeight: 188,
    minWidth: 0,
    overflow: 'hidden' as const,
    padding: 14,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.09,
    shadowRadius: 24,
    elevation: 3,
};

const glassCardHoverStyle = {
    shadowOpacity: 0.14,
    transform: [{ translateY: -2 }],
};

const glassCardExpandedStyle = {
    flexBasis: 460,
    maxWidth: 560,
    minHeight: 240,
};

const glassCardTopRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
};

const glassIdentityColumnStyle = {
    marginTop: 14,
    minWidth: 0,
};

const glassAvatarStyle = {
    alignItems: 'center' as const,
    borderRadius: 18,
    height: 44,
    justifyContent: 'center' as const,
    width: 44,
};

const glassAvatarTextStyle = {
    fontSize: 14,
    fontWeight: '900' as const,
};

const glassNameStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    lineHeight: 20,
};

const glassEmailStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 17,
    marginTop: 4,
};

const glassPillRowStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    marginTop: 12,
    minWidth: 0,
};

const glassMetaFooterStyle = {
    marginTop: 12,
};

const glassDateTextStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
};

const manageChipStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
};

const manageChipTextStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
};

const compactManageHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
    justifyContent: 'space-between' as const,
    minWidth: 0,
};

const compactManageTitleStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};

const compactBadgeClusterStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    justifyContent: 'flex-end' as const,
    minWidth: 0,
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
