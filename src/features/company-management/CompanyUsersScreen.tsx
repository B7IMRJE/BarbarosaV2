import DictationTextInput from '@/components/input/DictationTextInput';
import { useLocalSearchParams, type Href } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import type { ReactNode } from 'react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
    Pressable,
    ScrollView,
    Switch,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { logCompanyAuditEvent, safeAuditRecord } from '../../lib/companyAuditLogs';
import {
    COMPANY_PERMISSION_KEYS,
    COMPANY_ROLE_OPTIONS as ROLE_OPTIONS,
    CUSTOMIZABLE_COMPANY_ROLE_OPTIONS as CUSTOMIZABLE_ROLE_OPTIONS,
    findReusablePendingInvitation,
    formatPermissionCoverage,
    isInvitationExpired,
    type CompanyRole,
    type CustomizableCompanyRole,
} from '../../lib/companyInvitationRules';
import { mergeCompanyTeamRosterMembers } from '../../lib/companyTeamRoster';
import { resolveCompanyTeamContentWidth } from '../../lib/companyTeamLayout';
import {
    COMPANY_PERMISSION_LABELS,
    canAccessTechOS as canAccessCompanyTechOS,
    getRoleDefaultPermissions,
    isTechnicianCompanyRole,
    loadCurrentCompanyPermissionAccess,
    normalizeCompanyRole,
    normalizeCompanyStatus,
    resolveCompanyPermissions,
    type CompanyPermissionKey,
    type CompanyPermissionSet,
} from '../../lib/companyPermissions';
import {
    resolveCompanyWorkspaceTheme,
    type CompanyWorkspaceBrand,
} from '../../lib/companyWorkspaceTheme';
import {
    formatProfileList,
    loadCompanyTechnicianPublicProfiles,
    parseProfileList,
    saveCompanyTechnicianPublicProfile,
    type CompanyTechnicianPublicProfile,
} from '../../lib/technicianPublicProfile';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../lib/supabase';
import {
    PROFESSIONAL_CONTACT_FIELDS,
    buildProfessionalVCard,
    loadCompanyStaffProfessionalContacts,
    saveStaffProfessionalContact,
    type ProfessionalContactField,
    type StaffProfessionalContact,
} from '../../lib/staffProfessionalContact';
import { ThemeContext } from '../../theme';
import { GlassPaletteProvider } from '../../theme/glass-palette-context';
import { createCompanyGlassPalette } from '../../theme/glassPalette';
import { useTheme } from '../../theme/useTheme';

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

type SubmitStage = 'idle' | 'creating' | 'sending';
type SectionKey = 'owners' | 'adminManagerStaff' | 'technicians' | 'members' | 'invitations';
type CompanyUserManagementAccessResult = {
    canManage: boolean;
    canView: boolean;
    message: string | null;
};

type TechnicianProfileDraft = {
    displayName: string;
    profilePhotoUrl: string;
    shortBio: string;
    generalLocation: string;
    familyNote: string;
    hobbies: string;
    specialties: string;
    languages: string;
    certifications: string;
    yearsExperience: string;
    published: boolean;
};

type StaffProfessionalContactDraft = {
    professionalTitle: string;
    department: string;
    professionalPhone: string;
    professionalEmail: string;
    extension: string;
    professionalWebsite: string;
    yearsWithCompany: string;
    sharedFields: ProfessionalContactField[];
};

const COMPANY_PERMISSION_DESCRIPTIONS: Record<CompanyPermissionKey, string> = {
    can_view_techos: 'Open TechOS and use its available work tools.',
    can_create_estimates: 'Create estimate and proposal drafts.',
    can_add_item_to_estimate: 'Add price-book items to an estimate.',
    can_manage_price_book: 'Review and change company selling prices and starter recommendations.',
    can_view_customers: 'See customers connected to this company.',
    can_view_jobs: 'See company jobs and assigned work.',
    can_manage_company_users: 'Invite, suspend, and manage company team members.',
    can_manage_company_profile: 'Change company identity, branding, and public profile.',
};

export default function CompanyUsersScreen() {
    const themeContext = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { width: viewportWidth } = useWindowDimensions();
    const phone = viewportWidth < 700;
    const pagePadding = phone ? 14 : 20;
    const contentWidth = resolveCompanyTeamContentWidth(viewportWidth, pagePadding);
    const teamScrollRef = useRef<ScrollView>(null);

    const [members, setMembers] = useState<CompanyUser[]>([]);
    const [technicianProfilesByMemberId, setTechnicianProfilesByMemberId] = useState<Record<string, CompanyTechnicianPublicProfile>>({});
    const [professionalContactsByMemberId, setProfessionalContactsByMemberId] = useState<Record<string, StaffProfessionalContact>>({});
    const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<CompanyRole>('technician');
    const [companyName, setCompanyName] = useState('Company');
    const [companyBrand, setCompanyBrand] = useState<CompanyWorkspaceBrand | null>(null);
    const theme = useMemo(
        () => resolveCompanyWorkspaceTheme(themeContext.theme, companyBrand, {
            appearanceStyle: themeContext.appearance.appearanceStyle,
        }),
        [companyBrand, themeContext.appearance.appearanceStyle, themeContext.theme]
    );
    const companyGlassPalette = useMemo(
        () => createCompanyGlassPalette({
            id: `company-team-${String(id || 'unknown')}`,
            label: `${companyName} Team`,
            primary: companyBrand?.primary_color,
            secondary: companyBrand?.secondary_color,
            accent: companyBrand?.accent_color,
        }),
        [companyBrand, companyName, id]
    );
    const [searchQuery, setSearchQuery] = useState('');
    const [message, setMessage] = useState('Loading company users...');
    const [loadingLists, setLoadingLists] = useState(true);
    const [canManageUsers, setCanManageUsers] = useState(false);
    const [canViewTeam, setCanViewTeam] = useState(false);
    const [submitStage, setSubmitStage] = useState<SubmitStage>('idle');
    const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
    const [manualInvitesById, setManualInvitesById] = useState<Record<string, ManualInviteDetails>>({});
    const [invitationResultToReveal, setInvitationResultToReveal] = useState<{ invitationId: string } | null>(null);
    const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
        owners: false,
        adminManagerStaff: false,
        technicians: false,
        members: true,
        invitations: true,
    });
    const [touchedSections, setTouchedSections] = useState<Partial<Record<SectionKey, boolean>>>({});
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
    const [permissionsExpanded, setPermissionsExpanded] = useState(false);
    const [selectedPermissionRole, setSelectedPermissionRole] = useState<CustomizableCompanyRole>('admin');
    const [rolePermissions, setRolePermissions] = useState<Record<CustomizableCompanyRole, CompanyPermissionSet>>(
        () => createDefaultRolePermissionProfiles()
    );
    const [savedRolePermissions, setSavedRolePermissions] = useState<Record<CustomizableCompanyRole, CompanyPermissionSet>>(
        () => createDefaultRolePermissionProfiles()
    );
    const [permissionSaving, setPermissionSaving] = useState(false);
    const [canManageRolePermissions, setCanManageRolePermissions] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());
    const loadCompanyUsersEvent = useEffectEvent(loadCompanyUsers);

    useEffect(() => {
        void loadCompanyUsersEvent();
    }, [id]);

    useEffect(() => {
        const timer = setInterval(() => {
            setNowMs(Date.now());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!invitationResultToReveal) return;

        setTouchedSections((current) => ({ ...current, invitations: true }));
        setCollapsedSections((current) => ({ ...current, invitations: false }));
        setExpandedRows((current) => ({
            ...current,
            [`invitation:${invitationResultToReveal.invitationId}`]: true,
        }));

        const scrollTimer = setTimeout(() => {
            teamScrollRef.current?.scrollToEnd({ animated: true });
        }, 250);

        return () => clearTimeout(scrollTimer);
    }, [invitationResultToReveal]);

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
            setCanViewTeam(false);
            setMessage('Missing company id.');
            setLoadingLists(false);
            return false;
        }

        if (showLoading) {
            setLoadingLists(true);
            setCanManageUsers(false);
            setCanViewTeam(false);
            setMessage('Checking team access...');
        }

        const accessResult = await loadCompanyUserManagementAccess(String(id));

        if (!accessResult.canView) {
            setMembers([]);
            setInvitations([]);
            setCanManageUsers(false);
            setCanViewTeam(false);
            setLoadingLists(false);
            setMessage(accessResult.message || 'Team access requires active Dispatch or company management access.');
            return false;
        }

        setCanManageUsers(accessResult.canManage);
        setCanViewTeam(true);

        const [membersResult, companyProfileResult] = await Promise.all([
            loadCompanyMembers(String(id)),
            loadCompanyWorkspaceProfile(String(id)),
        ]);

        setLoadingLists(false);

        if (membersResult.error) {
            setMessage(`Error loading company members: ${membersResult.error.message}`);
            return false;
        }

        setMembers(membersResult.data);
        setCompanyName(companyProfileResult.name);
        setCompanyBrand(companyProfileResult.brand);

        if (!accessResult.canManage) {
            setInvitations([]);
            setTechnicianProfilesByMemberId({});
            setProfessionalContactsByMemberId({});
            setCanManageRolePermissions(false);
            if (showLoading) {
                setMessage('Viewing the active company roster. Only owners, admins, and managers can change team access.');
            }
            return true;
        }

        const [invitationsResult, permissionProfilesResult, technicianProfilesResult, professionalContactsResult] = await Promise.all([
            supabase
                .from('company_user_invitations')
                .select(
                    'id, company_id, full_name, email, role, status, expires_at, created_at, last_email_attempted_at, last_email_sent_at, email_send_count, email_delivery_status, email_delivery_error'
                )
                .eq('company_id', String(id))
                .order('created_at', { ascending: false }),
            loadCompanyRolePermissionProfiles(String(id)),
            loadCompanyTechnicianPublicProfiles(String(id))
                .then((profiles) => ({ profiles, error: null as Error | null }))
                .catch((error) => ({ profiles: [] as CompanyTechnicianPublicProfile[], error: error as Error })),
            loadCompanyStaffProfessionalContacts(String(id))
                .then((contacts) => ({ contacts, error: null as Error | null }))
                .catch((error) => ({ contacts: [] as StaffProfessionalContact[], error: error as Error })),
        ]);

        if (invitationsResult.error) {
            setMessage(`Error loading invitations: ${invitationsResult.error.message}`);
            return false;
        }

        setInvitations((invitationsResult.data || []) as CompanyInvitation[]);
        setTechnicianProfilesByMemberId(technicianProfilesResult.profiles.reduce<Record<string, CompanyTechnicianPublicProfile>>((result, profile) => {
            result[profile.company_user_id] = profile;
            return result;
        }, {}));
        setProfessionalContactsByMemberId(professionalContactsResult.contacts.reduce<Record<string, StaffProfessionalContact>>((result, contact) => {
            result[contact.company_user_id] = contact;
            return result;
        }, {}));
        setRolePermissions(permissionProfilesResult.profiles);
        setSavedRolePermissions(permissionProfilesResult.profiles);
        setCanManageRolePermissions(permissionProfilesResult.canCustomize);

        if (showLoading) {
            setMessage('');
        }

        return true;
    }

    async function saveTechnicianProfile(
        memberId: string,
        draft: TechnicianProfileDraft
    ) {
        setActionLoadingKey(`${memberId}:public-profile`);
        setMessage('Saving the homeowner-facing technician profile...');

        try {
            const savedProfile = await saveCompanyTechnicianPublicProfile({
                company_user_id: memberId,
                display_name: draft.displayName,
                profile_photo_url: draft.profilePhotoUrl,
                short_bio: draft.shortBio,
                general_location: draft.generalLocation,
                family_note: draft.familyNote,
                hobbies: parseProfileList(draft.hobbies),
                specialties: parseProfileList(draft.specialties),
                languages: parseProfileList(draft.languages),
                certifications: parseProfileList(draft.certifications),
                years_experience: parseOptionalInteger(draft.yearsExperience),
                publication_status: draft.published ? 'published' : 'draft',
            });

            setTechnicianProfilesByMemberId((current) => ({
                ...current,
                [memberId]: savedProfile,
            }));
            setMessage(draft.published
                ? 'Technician profile approved and visible to assigned homeowners.'
                : 'Technician profile saved as a private company draft.');
        } catch (error) {
            setMessage(`Technician profile failed: ${getErrorMessage(error)}`);
        } finally {
            setActionLoadingKey(null);
        }
    }

    async function saveProfessionalContact(memberId: string, draft: StaffProfessionalContactDraft) {
        setActionLoadingKey(`${memberId}:professional-contact`);
        setMessage('Saving company-approved professional contact...');

        try {
            const savedContact = await saveStaffProfessionalContact({
                company_user_id: memberId,
                professional_title: draft.professionalTitle,
                department: draft.department,
                professional_phone: draft.professionalPhone,
                professional_email: draft.professionalEmail,
                extension: draft.extension,
                professional_website: draft.professionalWebsite,
                years_with_company: parseOptionalInteger(draft.yearsWithCompany),
                shared_fields: draft.sharedFields,
            });

            setProfessionalContactsByMemberId((current) => ({ ...current, [memberId]: savedContact }));
            setMessage('Professional contact and QR sharing choices saved.');
        } catch (error) {
            setMessage(`Professional contact failed: ${getErrorMessage(error)}`);
        } finally {
            setActionLoadingKey(null);
        }
    }

    function toggleRolePermission(permissionKey: CompanyPermissionKey, enabled: boolean) {
        setRolePermissions((current) => ({
            ...current,
            [selectedPermissionRole]: {
                ...current[selectedPermissionRole],
                [permissionKey]: enabled,
            },
        }));
    }

    function resetSelectedRolePermissions() {
        setRolePermissions((current) => ({
            ...current,
            [selectedPermissionRole]: getRoleDefaultPermissions(selectedPermissionRole),
        }));
    }

    async function saveSelectedRolePermissions() {
        if (!id || permissionSaving) return;

        setPermissionSaving(true);
        setMessage(`Saving ${formatRole(selectedPermissionRole)} permissions...`);

        const permissions = rolePermissions[selectedPermissionRole];
        const { error } = await supabase.rpc('set_company_role_permission_profile', {
            p_company_id: String(id),
            p_role: selectedPermissionRole,
            p_permissions: permissions,
        });

        setPermissionSaving(false);

        if (error) {
            setMessage(`Could not save role permissions: ${error.message}`);
            return;
        }

        setSavedRolePermissions((current) => ({
            ...current,
            [selectedPermissionRole]: { ...permissions },
        }));
        setMessage(`${formatRole(selectedPermissionRole)} permissions saved for ${companyName}.`);

        await recordCompanyAuditEvent({
            companyId: String(id),
            action: 'company_role_permissions_updated',
            targetType: 'company_role',
            targetId: null,
            targetLabel: formatRole(selectedPermissionRole),
            afterData: safeAuditRecord({
                role: selectedPermissionRole,
                permissions,
            }),
        });
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

        setSubmitStage('creating');
        setMessage(existingPendingInvite
            ? `A pending invite already exists for ${normalizedEmail}. Creating a new six-digit code...`
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
            setMessage('Invitation was created, but the app could not read its id. Refresh the pending invitations list and create the code there.');
            return;
        }

        const manualInvite = await requestManualInvite(invitationToSend.id);

        setSubmitStage('idle');
        await loadCompanyUsers(false);

        if (!manualInvite.inviteCode) {
            setMessage(manualInvite.warning || 'Invitation was created, but the six-digit code could not be prepared.');
            return;
        }

        setManualInvitesById((current) => ({
            ...current,
            [invitationToSend.id]: {
                status: 'ready',
                inviteCode: manualInvite.inviteCode,
                inviteUrl: manualInvite.inviteUrl,
                expiresAt: manualInvite.expiresAt,
                warning: manualInvite.warning,
                message: 'Six-digit invitation code is ready.',
            },
        }));

        setFullName('');
        setEmail('');
        setRole('technician');
        setInvitationResultToReveal({ invitationId: invitationToSend.id });
        setMessage(`Invitation code ready for ${normalizedEmail}: ${manualInvite.inviteCode}`);
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
        const loadingMessage = options?.loadingMessage || 'Creating six-digit invitation login code...';
        const successMessage = options?.successMessage || 'Six-digit invitation login code ready.';
        const failurePrefix = options?.failurePrefix || 'Login code creation failed';

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
            await loadCompanyUsers(false);
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
        setInvitationResultToReveal({ invitationId });
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
        ? 'Creating invitation code...'
        : 'Create Invitation Code';
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
        <ThemeContext.Provider value={{ ...themeContext, theme }}>
        <GlassPaletteProvider palette={companyGlassPalette}>
        <ScrollView
            ref={teamScrollRef}
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{
                padding: pagePadding,
                paddingBottom: 40,
                alignItems: 'center',
            }}
            contentInsetAdjustmentBehavior="automatic"
        >
            <View style={{ width: contentWidth, maxWidth: 900, minWidth: 0 }}>
                <AdminNavBar
                    companyId={String(id || '')}
                    backFallback={`/super-admin/company/${id}` as Href}
                />

                <Text style={[titleStyle, { color: theme.colors.text, fontSize: phone ? 30 : 34 }]}>Team / Technicians</Text>

                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    {canManageUsers
                        ? 'Manage company credentials, Dispatch access, technician access, and pending team invitations for TechOS.'
                        : 'View the active company roster for Dispatch assignments. Team access changes remain with the company owner, admin, or manager.'}
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

                        {canManageRolePermissions && (
                            <ThemedCard style={permissionsCardStyle}>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded: permissionsExpanded }}
                                    onPress={() => setPermissionsExpanded((current) => !current)}
                                    style={permissionsHeaderStyle}
                                >
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                                            Roles & Permissions
                                        </Text>
                                        <Text style={[helperTextStyle, { color: theme.colors.mutedText }]}>
                                            See exactly what each role can do and customize access for {companyName}.
                                        </Text>
                                    </View>
                                    <Text style={[permissionExpandTextStyle, { color: theme.colors.link }]}>
                                        {permissionsExpanded ? 'Close' : 'Review & edit'}
                                    </Text>
                                </Pressable>

                                {!permissionsExpanded ? (
                                    <View style={permissionSummaryRowStyle}>
                                        {CUSTOMIZABLE_ROLE_OPTIONS.map((option) => (
                                            <View
                                                key={option.value}
                                                style={[
                                                    permissionSummaryPillStyle,
                                                    {
                                                        backgroundColor: theme.colors.background,
                                                        borderColor: theme.colors.border,
                                                    },
                                                ]}
                                            >
                                                <Text style={[permissionSummaryTextStyle, { color: theme.colors.text }]}>
                                                    {option.label}: {formatPermissionCoverage(rolePermissions[option.value])}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                ) : (
                                    <View style={permissionEditorStyle}>
                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                        These settings apply to current and future team members with the selected role. Company
                                        owners always retain full access.
                                    </Text>

                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={permissionRoleTabsStyle}
                                    >
                                        {CUSTOMIZABLE_ROLE_OPTIONS.map((option) => {
                                            const selected = selectedPermissionRole === option.value;

                                            return (
                                                <Pressable
                                                    key={option.value}
                                                    accessibilityRole="tab"
                                                    accessibilityState={{ selected }}
                                                    onPress={() => setSelectedPermissionRole(option.value)}
                                                    style={[
                                                        permissionRoleTabStyle,
                                                        {
                                                            backgroundColor: selected
                                                                ? theme.colors.primary
                                                                : theme.colors.background,
                                                            borderColor: selected
                                                                ? theme.colors.primary
                                                                : theme.colors.border,
                                                        },
                                                    ]}
                                                >
                                                    <Text
                                                        style={[
                                                            permissionRoleTabTextStyle,
                                                            {
                                                                color: selected
                                                                    ? theme.colors.primaryText
                                                                    : theme.colors.text,
                                                            },
                                                        ]}
                                                    >
                                                        {option.label}
                                                    </Text>
                                                </Pressable>
                                            );
                                        })}
                                    </ScrollView>

                                    <View style={permissionToggleGridStyle}>
                                        {COMPANY_PERMISSION_KEYS.map((permissionKey) => {
                                            const enabled = rolePermissions[selectedPermissionRole][permissionKey];

                                            return (
                                                <View
                                                    key={permissionKey}
                                                    style={[
                                                        permissionToggleRowStyle,
                                                        {
                                                            backgroundColor: theme.colors.background,
                                                            borderColor: enabled ? theme.colors.link : theme.colors.border,
                                                        },
                                                    ]}
                                                >
                                                    <View style={{ flex: 1, minWidth: 0 }}>
                                                        <Text style={[permissionToggleTitleStyle, { color: theme.colors.text }]}>
                                                            {COMPANY_PERMISSION_LABELS[permissionKey]}
                                                        </Text>
                                                        <Text style={[permissionToggleHintStyle, { color: theme.colors.mutedText }]}>
                                                            {COMPANY_PERMISSION_DESCRIPTIONS[permissionKey]}
                                                        </Text>
                                                    </View>
                                                    <Switch
                                                        value={enabled}
                                                        onValueChange={(value) => toggleRolePermission(permissionKey, value)}
                                                        trackColor={{
                                                            false: theme.colors.border,
                                                            true: theme.colors.link,
                                                        }}
                                                        thumbColor={enabled ? theme.colors.primary : theme.colors.background}
                                                    />
                                                </View>
                                            );
                                        })}
                                    </View>

                                    <View style={permissionActionsStyle}>
                                        <ThemedButton
                                            title="Restore standard permissions"
                                            onPress={resetSelectedRolePermissions}
                                            variant="secondary"
                                            style={permissionActionButtonStyle}
                                        />
                                        <ThemedButton
                                            title={permissionSaving ? 'Saving...' : `Save ${formatRole(selectedPermissionRole)}`}
                                            onPress={saveSelectedRolePermissions}
                                            disabled={
                                                permissionSaving ||
                                                permissionSetsMatch(
                                                    rolePermissions[selectedPermissionRole],
                                                    savedRolePermissions[selectedPermissionRole]
                                                )
                                            }
                                            style={permissionActionButtonStyle}
                                        />
                                    </View>
                                    </View>
                                )}
                            </ThemedCard>
                        )}

                        <ThemedCard style={searchCardStyle}>
                            <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>Search Team</Text>
                            <DictationTextInput
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

                            <DictationTextInput
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

                            <DictationTextInput
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
                            <Text style={[helperTextStyle, { color: theme.colors.mutedText }]}>
                                {formatRole(role)} currently includes:{' '}
                                {summarizeEnabledPermissions(
                                    role === 'owner'
                                        ? getRoleDefaultPermissions('owner')
                                        : rolePermissions[role]
                                )}
                            </Text>

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
                ) : canViewTeam ? (
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
                                        canManage={canManageUsers}
                                        companyName={companyName}
                                        publicProfile={technicianProfilesByMemberId[member.id]}
                                        professionalContact={professionalContactsByMemberId[member.id]}
                                        onToggle={() => toggleRow(`member:${member.id}`)}
                                        onStatusChange={updateMemberStatus}
                                        onSavePublicProfile={saveTechnicianProfile}
                                        onSaveProfessionalContact={saveProfessionalContact}
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
                                        canManage={canManageUsers}
                                        companyName={companyName}
                                        publicProfile={technicianProfilesByMemberId[member.id]}
                                        professionalContact={professionalContactsByMemberId[member.id]}
                                        onToggle={() => toggleRow(`member:${member.id}`)}
                                        onStatusChange={updateMemberStatus}
                                        onSavePublicProfile={saveTechnicianProfile}
                                        onSaveProfessionalContact={saveProfessionalContact}
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
                                        canManage={canManageUsers}
                                        companyName={companyName}
                                        publicProfile={technicianProfilesByMemberId[member.id]}
                                        professionalContact={professionalContactsByMemberId[member.id]}
                                        onToggle={() => toggleRow(`member:${member.id}`)}
                                        onStatusChange={updateMemberStatus}
                                        onSavePublicProfile={saveTechnicianProfile}
                                        onSaveProfessionalContact={saveProfessionalContact}
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
                                        canManage={canManageUsers}
                                        companyName={companyName}
                                        publicProfile={technicianProfilesByMemberId[member.id]}
                                        professionalContact={professionalContactsByMemberId[member.id]}
                                        onToggle={() => toggleRow(`member:${member.id}`)}
                                        onStatusChange={updateMemberStatus}
                                        onSavePublicProfile={saveTechnicianProfile}
                                        onSaveProfessionalContact={saveProfessionalContact}
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
                                        manualInvite={manualInvitesById[invitation.id]}
                                        nowMs={nowMs}
                                        onToggle={() => toggleRow(`invitation:${invitation.id}`)}
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
        </GlassPaletteProvider>
        </ThemeContext.Provider>
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
    const { width } = useWindowDimensions();
    const phone = width < 700;

    return (
        <View style={compactSectionStyle}>
            <View style={[compactSectionHeaderStyle, phone && compactSectionHeaderPhoneStyle]}>
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
                    style={[sectionToggleButtonStyle, phone && sectionToggleButtonPhoneStyle]}
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
    const { width } = useWindowDimensions();
    const phone = width < 700;
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
                    backgroundColor: hovered ? theme.colors.surfaceAlt : theme.colors.surface,
                    borderColor: hovered ? theme.colors.primary : theme.colors.border,
                    shadowColor: theme.colors.text,
                },
                hovered && glassCardHoverStyle,
                phone && glassCardPhoneStyle,
                expanded && (phone ? glassCardExpandedPhoneStyle : glassCardExpandedStyle),
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
    canManage,
    companyName,
    publicProfile,
    professionalContact,
    onToggle,
    onStatusChange,
    onSavePublicProfile,
    onSaveProfessionalContact,
}: {
    member: CompanyUser;
    expanded: boolean;
    actionLoadingKey: string | null;
    canManage: boolean;
    companyName: string;
    publicProfile?: CompanyTechnicianPublicProfile;
    professionalContact?: StaffProfessionalContact;
    onToggle: () => void;
    onStatusChange: (memberId: string, nextStatus: MemberActionStatus) => void;
    onSavePublicProfile: (memberId: string, draft: TechnicianProfileDraft) => Promise<void>;
    onSaveProfessionalContact: (memberId: string, draft: StaffProfessionalContactDraft) => Promise<void>;
}) {
    const { theme } = useTheme();
    const status = normalizeStatus(member.status);
    const displayName = getMemberDisplayName(member, 'Unnamed member');
    const contactLine = getMemberContactLine(member);
    const permissions = resolveCompanyPermissions(member);
    const techOSAllowed = canAccessCompanyTechOS(member);
    const companyOwner = isCompanyOwnerRole(member.role);
    const [recoveryCode, setRecoveryCode] = useState('');
    const [recoveryMessage, setRecoveryMessage] = useState('');
    const [creatingRecoveryCode, setCreatingRecoveryCode] = useState(false);

    async function createRecoveryCode() {
        if (creatingRecoveryCode) return;

        setCreatingRecoveryCode(true);
        setRecoveryMessage('Creating a new login code...');
        const result = await requestMemberRecoveryCode(member.id);
        setCreatingRecoveryCode(false);

        if (!result.inviteCode) {
            setRecoveryCode('');
            setRecoveryMessage(result.warning || 'The login code could not be created.');
            return;
        }

        setRecoveryCode(result.inviteCode);
        setRecoveryMessage(`Code expires ${formatDate(result.expiresAt)}.`);
    }

    async function copyRecoveryCode() {
        if (!recoveryCode) return;

        try {
            await writeClipboardText(recoveryCode);
            setRecoveryMessage('Login code copied.');
        } catch {
            setRecoveryMessage(`Copy is unavailable. Login code: ${recoveryCode}`);
        }
    }

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
                            backgroundColor: expanded ? theme.colors.primary : theme.colors.surfaceAlt,
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
                        {expanded ? 'Close' : canManage ? 'Manage' : 'View'}
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
                        <Text style={[compactManageTitleStyle, { color: theme.colors.text }]}>
                            {canManage ? 'Manage Staff Member' : 'Team Member Details'}
                        </Text>
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

                    {canManage && <>
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

                    <StaffProfessionalContactEditor
                        companyName={companyName}
                        member={member}
                        contact={professionalContact}
                        saving={actionLoadingKey === `${member.id}:professional-contact`}
                        onSave={(draft) => onSaveProfessionalContact(member.id, draft)}
                    />

                    {isTechnicianRole(member.role) && (
                        <TechnicianPublicProfileEditor
                            member={member}
                            profile={publicProfile}
                            saving={actionLoadingKey === `${member.id}:public-profile`}
                            onSave={(draft) => onSavePublicProfile(member.id, draft)}
                        />
                    )}

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
                        <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText }]}>
                            If this member logged out before creating a password, generate a new six-digit code so they can sign in again.
                        </Text>
                        {!!recoveryCode && (
                            <>
                                <DetailLine label="Six-Digit Login Code" value={recoveryCode} />
                                <ThemedButton
                                    title="Copy Login Code"
                                    variant="secondary"
                                    onPress={copyRecoveryCode}
                                    style={actionButtonStyle}
                                />
                            </>
                        )}
                        {!!recoveryMessage && (
                            <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText }]}>{recoveryMessage}</Text>
                        )}
                        <ThemedButton
                            title={creatingRecoveryCode ? 'Creating...' : 'Generate New Login Code'}
                            variant="secondary"
                            onPress={createRecoveryCode}
                            disabled={creatingRecoveryCode || status !== 'active'}
                            style={actionButtonStyle}
                        />
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
                    </>}
                </View>
            )}
        </GlassGridCard>
    );
}

function TechnicianPublicProfileEditor({
    member,
    profile,
    saving,
    onSave,
}: {
    member: CompanyUser;
    profile?: CompanyTechnicianPublicProfile;
    saving: boolean;
    onSave: (draft: TechnicianProfileDraft) => Promise<void>;
}) {
    const { theme } = useTheme();
    const [draft, setDraft] = useState<TechnicianProfileDraft>(() => createTechnicianProfileDraft(member, profile));

    useEffect(() => {
        setDraft(createTechnicianProfileDraft(member, profile));
    }, [member, profile]);

    function updateDraft<K extends keyof TechnicianProfileDraft>(key: K, value: TechnicianProfileDraft[K]) {
        setDraft((current) => ({ ...current, [key]: value }));
    }

    return (
        <DetailPanelSection title="Technician Public Profile">
            <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText }]}>
                Homeowners assigned to this technician can tap their name to see only the information approved here. Personal email, phone, and street address are never shown.
            </Text>

            {!!profile?.pending_profile && (
                <View style={[publicProfileApprovalStyle, { borderColor: theme.colors.primary }]}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>Technician changes awaiting review</Text>
                        <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText, marginTop: 3 }]}>
                            The form below is prefilled with the technician’s submission. Review it, correct anything needed, then publish or keep it private.
                        </Text>
                    </View>
                </View>
            )}

            <View style={[publicProfileApprovalStyle, { borderColor: theme.colors.border }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>
                        Homeowner preview: {draft.displayName || getMemberDisplayName(member, 'Technician')}
                    </Text>
                    <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText, marginTop: 3 }]}>
                        {draft.shortBio || 'No biography entered yet.'}
                    </Text>
                    {!!draft.specialties && (
                        <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText, marginTop: 3 }]}>
                            Specialties: {draft.specialties}
                        </Text>
                    )}
                </View>
            </View>

            <ProfileField label="Public display name">
                <DictationTextInput
                    value={draft.displayName}
                    onChangeText={(value) => updateDraft('displayName', value)}
                    placeholder={getMemberDisplayName(member, 'Technician')}
                    accessibilityLabel="Public technician display name"
                    style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                />
            </ProfileField>

            <ProfileField label="Uniform portrait HTTPS address">
                <DictationTextInput
                    value={draft.profilePhotoUrl}
                    onChangeText={(value) => updateDraft('profilePhotoUrl', value)}
                    placeholder="https://..."
                    autoCapitalize="none"
                    keyboardType="url"
                    accessibilityLabel="Technician portrait address"
                    style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                />
            </ProfileField>

            <ProfileField label="Friendly biography">
                <DictationTextInput
                    value={draft.shortBio}
                    onChangeText={(value) => updateDraft('shortBio', value)}
                    placeholder="A short company-approved introduction..."
                    multiline
                    numberOfLines={4}
                    accessibilityLabel="Technician biography"
                    style={[inputStyle, publicProfileMultilineStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                />
            </ProfileField>

            <View style={publicProfileFieldGridStyle}>
                <ProfileField label="General location" compact>
                    <DictationTextInput
                        value={draft.generalLocation}
                        onChangeText={(value) => updateDraft('generalLocation', value)}
                        placeholder="Riverside area"
                        accessibilityLabel="Technician general location"
                        style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                </ProfileField>
                <ProfileField label="Years of experience" compact>
                    <DictationTextInput
                        value={draft.yearsExperience}
                        onChangeText={(value) => updateDraft('yearsExperience', value.replace(/\D/g, '').slice(0, 2))}
                        placeholder="10"
                        keyboardType="number-pad"
                        accessibilityLabel="Technician years of experience"
                        style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                </ProfileField>
            </View>

            <ProfileField label="Optional family note">
                <DictationTextInput
                    value={draft.familyNote}
                    onChangeText={(value) => updateDraft('familyNote', value)}
                    placeholder="For example: Proud father of five"
                    accessibilityLabel="Optional technician family note"
                    style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                />
            </ProfileField>

            {([
                ['specialties', 'Specialties', 'Leak detection, repiping, water heaters'],
                ['languages', 'Languages', 'English, Spanish'],
                ['certifications', 'Certifications', 'Backflow certified, OSHA 10'],
                ['hobbies', 'Hobbies', 'Soccer, drones, building projects'],
            ] as const).map(([key, label, placeholder]) => (
                <ProfileField key={key} label={`${label} — separate with commas`}>
                    <DictationTextInput
                        value={draft[key]}
                        onChangeText={(value) => updateDraft(key, value)}
                        placeholder={placeholder}
                        accessibilityLabel={`Technician ${label.toLowerCase()}`}
                        style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                </ProfileField>
            ))}

            <View style={[publicProfileApprovalStyle, { borderColor: theme.colors.border }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>Approved for homeowners</Text>
                    <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText, marginTop: 3 }]}>
                        Off keeps this as a private company draft. On publishes it only to homeowners with an assigned service request.
                    </Text>
                </View>
                <Switch
                    accessibilityLabel="Publish technician profile to assigned homeowners"
                    value={draft.published}
                    onValueChange={(value) => updateDraft('published', value)}
                    trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                />
            </View>

            <ThemedButton
                title={saving ? 'Saving Profile...' : draft.published ? 'Save & Publish Profile' : 'Save Private Draft'}
                disabled={saving}
                onPress={() => void onSave(draft)}
                style={actionButtonStyle}
            />
        </DetailPanelSection>
    );
}

function StaffProfessionalContactEditor({
    companyName,
    member,
    contact,
    saving,
    onSave,
}: {
    companyName: string;
    member: CompanyUser;
    contact?: StaffProfessionalContact;
    saving: boolean;
    onSave: (draft: StaffProfessionalContactDraft) => Promise<void>;
}) {
    const { theme } = useTheme();
    const [draft, setDraft] = useState<StaffProfessionalContactDraft>(() => createStaffProfessionalContactDraft(contact));

    useEffect(() => {
        setDraft(createStaffProfessionalContactDraft(contact));
    }, [contact]);

    function updateDraft<K extends keyof StaffProfessionalContactDraft>(
        key: K,
        value: StaffProfessionalContactDraft[K]
    ) {
        setDraft((current) => ({ ...current, [key]: value }));
    }

    function toggleSharedField(field: ProfessionalContactField) {
        updateDraft(
            'sharedFields',
            draft.sharedFields.includes(field)
                ? draft.sharedFields.filter((value) => value !== field)
                : [...draft.sharedFields, field]
        );
    }

    const qrValue = buildProfessionalVCard({
        displayName: getMemberDisplayName(member, 'Company professional'),
        companyName,
        contact: {
            professional_title: draft.professionalTitle,
            department: draft.department,
            professional_phone: draft.professionalPhone,
            professional_email: draft.professionalEmail,
            extension: draft.extension,
            professional_website: draft.professionalWebsite,
            years_with_company: parseOptionalInteger(draft.yearsWithCompany),
            shared_fields: draft.sharedFields,
        },
    });
    const shareableFields = PROFESSIONAL_CONTACT_FIELDS.filter((field) => {
        if (field === 'professional_title') return Boolean(draft.professionalTitle.trim());
        if (field === 'department') return Boolean(draft.department.trim());
        if (field === 'professional_phone') return Boolean(draft.professionalPhone.trim());
        if (field === 'professional_email') return Boolean(draft.professionalEmail.trim());
        if (field === 'extension') return Boolean(draft.extension.trim());
        if (field === 'professional_website') return Boolean(draft.professionalWebsite.trim());
        return Boolean(draft.yearsWithCompany.trim());
    });

    return (
        <DetailPanelSection title="Professional Staff Contact & QR Card">
            <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText }]}>
                Company-approved work information only. Personal phone numbers, personal email, home address, account credentials, and private HR information are never included.
            </Text>

            <View style={publicProfileFieldGridStyle}>
                <ProfileField label="Position / title" compact>
                    <DictationTextInput
                        value={draft.professionalTitle}
                        onChangeText={(value) => updateDraft('professionalTitle', value)}
                        placeholder={formatRole(member.role)}
                        accessibilityLabel="Professional position or title"
                        style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                </ProfileField>
                <ProfileField label="Department" compact>
                    <DictationTextInput
                        value={draft.department}
                        onChangeText={(value) => updateDraft('department', value)}
                        placeholder="Service, Dispatch, Office..."
                        accessibilityLabel="Professional department"
                        style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                </ProfileField>
            </View>

            <View style={publicProfileFieldGridStyle}>
                <ProfileField label="Work phone" compact>
                    <DictationTextInput
                        value={draft.professionalPhone}
                        onChangeText={(value) => updateDraft('professionalPhone', value)}
                        placeholder="Company-approved work number"
                        keyboardType="phone-pad"
                        accessibilityLabel="Professional work phone"
                        style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                </ProfileField>
                <ProfileField label="Extension" compact>
                    <DictationTextInput
                        value={draft.extension}
                        onChangeText={(value) => updateDraft('extension', value)}
                        placeholder="Optional"
                        accessibilityLabel="Professional phone extension"
                        style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                </ProfileField>
            </View>

            <ProfileField label="Work email">
                <DictationTextInput
                    value={draft.professionalEmail}
                    onChangeText={(value) => updateDraft('professionalEmail', value)}
                    placeholder="name@company.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    accessibilityLabel="Professional work email"
                    style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                />
            </ProfileField>

            <View style={publicProfileFieldGridStyle}>
                <ProfileField label="Professional website" compact>
                    <DictationTextInput
                        value={draft.professionalWebsite}
                        onChangeText={(value) => updateDraft('professionalWebsite', value)}
                        placeholder="https://company.com"
                        autoCapitalize="none"
                        keyboardType="url"
                        accessibilityLabel="Professional website"
                        style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                </ProfileField>
                <ProfileField label="Years with company" compact>
                    <DictationTextInput
                        value={draft.yearsWithCompany}
                        onChangeText={(value) => updateDraft('yearsWithCompany', value.replace(/\D/g, '').slice(0, 2))}
                        placeholder="5"
                        keyboardType="number-pad"
                        accessibilityLabel="Years with company"
                        style={[inputStyle, { borderColor: theme.colors.border, color: theme.colors.text }]}
                    />
                </ProfileField>
            </View>

            <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>Visible on public profile and QR contact card</Text>
            <View style={permissionGridStyle}>
                {PROFESSIONAL_CONTACT_FIELDS.map((field) => {
                    const selected = draft.sharedFields.includes(field);
                    const available = shareableFields.includes(field);

                    return (
                        <TouchableOpacity
                            key={field}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: selected, disabled: !available }}
                            disabled={!available}
                            onPress={() => toggleSharedField(field)}
                            style={[
                                permissionPillStyle,
                                {
                                    backgroundColor: selected ? theme.colors.secondaryButton : theme.colors.background,
                                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                                    opacity: available ? 1 : 0.45,
                                },
                            ]}
                        >
                            <Text style={[permissionPillTextStyle, { color: selected ? theme.colors.primary : theme.colors.mutedText }]}>
                                {formatProfessionalContactField(field)}: {selected ? 'Shared' : 'Private'}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {shareableFields.length > 0 && (
                <View style={[publicProfileApprovalStyle, { borderColor: theme.colors.border, alignItems: 'center' }]}>
                    <QRCode value={qrValue} size={132} color={theme.colors.text} backgroundColor={theme.colors.surface} />
                    <View style={{ flex: 1, minWidth: 180 }}>
                        <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>Professional contact QR preview</Text>
                        <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText, marginTop: 3 }]}>
                            Scanning creates a standard contact card containing only the professional fields marked Shared.
                        </Text>
                    </View>
                </View>
            )}

            <ThemedButton
                title={saving ? 'Saving Professional Contact...' : 'Save Professional Contact'}
                disabled={saving}
                onPress={() => void onSave(draft)}
                style={actionButtonStyle}
            />
        </DetailPanelSection>
    );
}

function ProfileField({ label, compact = false, children }: { label: string; compact?: boolean; children: ReactNode }) {
    const { theme } = useTheme();

    return (
        <View style={[publicProfileFieldStyle, compact && publicProfileCompactFieldStyle]}>
            <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>{label}</Text>
            {children}
        </View>
    );
}

function createTechnicianProfileDraft(
    member: CompanyUser,
    profile?: CompanyTechnicianPublicProfile
): TechnicianProfileDraft {
    const source = profile?.pending_profile || profile;

    return {
        displayName: source?.display_name || getMemberDisplayName(member, 'Technician'),
        profilePhotoUrl: source?.profile_photo_url || '',
        shortBio: source?.short_bio || '',
        generalLocation: source?.general_location || '',
        familyNote: source?.family_note || '',
        hobbies: formatProfileList(source?.hobbies || []),
        specialties: formatProfileList(source?.specialties || []),
        languages: formatProfileList(source?.languages || []),
        certifications: formatProfileList(source?.certifications || []),
        yearsExperience: source?.years_experience === null || source?.years_experience === undefined
            ? ''
            : String(source.years_experience),
        published: !profile?.pending_profile && profile?.publication_status === 'published',
    };
}

function createStaffProfessionalContactDraft(
    contact?: StaffProfessionalContact
): StaffProfessionalContactDraft {
    return {
        professionalTitle: contact?.professional_title || '',
        department: contact?.department || '',
        professionalPhone: contact?.professional_phone || '',
        professionalEmail: contact?.professional_email || '',
        extension: contact?.extension || '',
        professionalWebsite: contact?.professional_website || '',
        yearsWithCompany: contact?.years_with_company === null || contact?.years_with_company === undefined
            ? ''
            : String(contact.years_with_company),
        sharedFields: contact?.shared_fields ? [...contact.shared_fields] : [...PROFESSIONAL_CONTACT_FIELDS],
    };
}

function formatProfessionalContactField(field: ProfessionalContactField) {
    const labels: Record<ProfessionalContactField, string> = {
        professional_title: 'Position',
        department: 'Department',
        professional_phone: 'Work phone',
        professional_email: 'Work email',
        extension: 'Extension',
        professional_website: 'Website',
        years_with_company: 'Years with company',
    };

    return labels[field];
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
    manualInvite,
    nowMs,
    onToggle,
    onCreateManualInvite,
    onCopyManualInviteValue,
    onRevoke,
    onDeleteInvitation,
}: {
    invitation: CompanyInvitation;
    expanded: boolean;
    actionLoadingKey: string | null;
    manualInvite?: ManualInviteDetails;
    nowMs: number;
    onToggle: () => void;
    onCreateManualInvite: (invitationId: string) => void;
    onCopyManualInviteValue: (invitationId: string, label: string, value: string) => void;
    onRevoke: (invitationId: string) => void;
    onDeleteInvitation: (invitationId: string) => void;
}) {
    const { theme } = useTheme();
    const manualKey = `${invitation.id}:manual`;
    const revokeKey = `${invitation.id}:revoke`;
    const deleteKey = `${invitation.id}:delete`;
    const status = normalizeStatus(invitation.status);
    const expired = isInvitationExpired(invitation, nowMs);
    const displayStatus = expired ? 'expired' : status;
    const creatingManualInvite = actionLoadingKey === manualKey;
    const deletingInvitation = actionLoadingKey === deleteKey;
    const anyActionLoading = actionLoadingKey !== null;
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
                            backgroundColor: expanded ? theme.colors.primary : theme.colors.surfaceAlt,
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
                        Email: {formatDeliverySummary(invitation)}
                    </Text>

                    {status === 'pending' && (
                        <>
                            <View style={actionRowStyle}>
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

                            <DetailPanelSection title="Invitation Login Code">
                                <Text style={[detailBodyTextStyle, { color: theme.colors.mutedText }]}>
                                    Create or refresh the six-digit code, then share it directly with the invited person.
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
                                        <Text style={[manualInviteTitleStyle, { color: theme.colors.text }]}>Six-Digit Login Code</Text>
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
                                                <Text style={[manualInviteLabelStyle, { color: theme.colors.text }]}>Six-Digit Login Code</Text>
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
                                    title={creatingManualInvite ? 'Creating...' : 'Create / Copy Six-Digit Code'}
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
        inviteCode: (readStringField(record, 'invite_code') || '').replace(/\D/g, '').slice(0, 6),
        inviteUrl: readStringField(record, 'invite_url'),
        expiresAt: readStringField(record, 'expires_at'),
    };
}

async function requestManualInvite(invitationId: string): Promise<ManualInviteResult> {
    const { baseUrl, warning: baseUrlWarning } = getAppBaseUrl();
    const {
        data: { session },
        error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
        return {
            inviteCode: null,
            inviteUrl: null,
            expiresAt: null,
            warning: sessionError?.message || 'Sign in again before creating an invitation login code.',
        };
    }

    try {
        const response = await fetch(`${supabaseUrl}/functions/v1/send-company-user-invitation`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: supabaseAnonKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                invitation_id: invitationId,
                delivery_mode: 'code_only',
                app_base_url: baseUrl,
            }),
        });
        const text = await response.text();
        const data = text.trim() ? JSON.parse(text) as unknown : null;
        const record = data && typeof data === 'object' && !Array.isArray(data)
            ? data as Record<string, unknown>
            : {};
        const manualInvite = parseManualInviteResponse(record);

        if (!response.ok || !/^\d{6}$/.test(manualInvite.inviteCode || '')) {
            return {
                inviteCode: null,
                inviteUrl: null,
                expiresAt: null,
                warning: readStringField(record, 'message') || `Login code creation failed with status ${response.status}.`,
            };
        }

        const warning = baseUrlWarning || publicInviteUrlWarning(manualInvite.inviteUrl);

        return {
            ...manualInvite,
            warning,
        };
    } catch (error) {
        return {
            inviteCode: null,
            inviteUrl: null,
            expiresAt: null,
            warning: error instanceof Error ? error.message : 'Network error creating the invitation login code.',
        };
    }
}

async function requestMemberRecoveryCode(companyUserId: string): Promise<ManualInviteResult> {
    const {
        data: { session },
        error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
        return {
            inviteCode: null,
            inviteUrl: null,
            expiresAt: null,
            warning: sessionError?.message || 'Sign in again before creating a recovery login code.',
        };
    }

    try {
        const response = await fetch(`${supabaseUrl}/functions/v1/send-company-user-invitation`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: supabaseAnonKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                company_user_id: companyUserId,
                delivery_mode: 'recovery_code',
            }),
        });
        const text = await response.text();
        const data = text.trim() ? JSON.parse(text) as unknown : null;
        const record = data && typeof data === 'object' && !Array.isArray(data)
            ? data as Record<string, unknown>
            : {};
        const inviteCode = (readStringField(record, 'invite_code') || '').replace(/\D/g, '').slice(0, 6);

        if (!response.ok || !/^\d{6}$/.test(inviteCode)) {
            return {
                inviteCode: null,
                inviteUrl: null,
                expiresAt: null,
                warning: readStringField(record, 'message') || `Login code creation failed with status ${response.status}.`,
            };
        }

        return {
            inviteCode,
            inviteUrl: null,
            expiresAt: readStringField(record, 'expires_at'),
            warning: null,
        };
    } catch (error) {
        return {
            inviteCode: null,
            inviteUrl: null,
            expiresAt: null,
            warning: error instanceof Error ? error.message : 'Network error creating the recovery login code.',
        };
    }
}

function getBrowserOrigin() {
    const globalWithLocation = globalThis as unknown as {
        location?: { origin?: string };
        window?: { location?: { origin?: string } };
    };

    return normalizeBaseUrl(globalWithLocation.window?.location?.origin || globalWithLocation.location?.origin || null);
}

async function loadCompanyWorkspaceProfile(companyId: string): Promise<{
    name: string;
    brand: CompanyWorkspaceBrand | null;
}> {
    const { data, error } = await supabase
        .from('companies')
        .select('name, public_name, dba_name, primary_color, secondary_color, accent_color')
        .eq('id', companyId)
        .maybeSingle();

    if (error || !data) {
        return {
            name: 'Company',
            brand: null,
        };
    }

    const record = data as Record<string, unknown>;

    return {
        name:
            readStringField(record, 'public_name') ||
            readStringField(record, 'dba_name') ||
            readStringField(record, 'name') ||
            'Company',
        brand: {
            primary_color: readStringField(record, 'primary_color'),
            secondary_color: readStringField(record, 'secondary_color'),
            accent_color: readStringField(record, 'accent_color'),
        },
    };
}

async function loadCompanyUserManagementAccess(companyId: string): Promise<CompanyUserManagementAccessResult> {
    const rpcResult = await supabase.rpc('can_manage_company_users', {
        p_company_id: companyId,
    });

    if (!rpcResult.error && rpcResult.data === true) {
        return {
            canManage: true,
            canView: true,
            message: null,
        };
    }

    const permissionResult = await loadCurrentCompanyPermissionAccess('can_manage_company_users', {
        companyId,
    });

    if (permissionResult.access) {
        return { canManage: true, canView: true, message: null };
    }

    const dispatchAccessResult = await loadCurrentCompanyPermissionAccess('can_view_jobs', {
        companyId,
    });

    if (dispatchAccessResult.access) {
        return {
            canManage: false,
            canView: true,
            message: 'Viewing the active company roster for Dispatch assignments.',
        };
    }

    return {
        canManage: false,
        canView: false,
        message: dispatchAccessResult.error || permissionResult.error
            ? `Company team access unavailable: ${dispatchAccessResult.error || permissionResult.error}`
            : 'Team access requires active Dispatch or company management access.',
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

    const [directResult, dispatchRosterResult] = await Promise.all([
        supabase
            .from('company_users')
            .select('id, company_id, auth_user_id, full_name, email, role, status, created_at')
            .eq('company_id', companyId)
            .order('created_at', { ascending: false }),
        supabase.rpc('get_company_users_for_dispatch', {
            p_company_id: companyId,
        }),
    ]);

    if (directResult.error && dispatchRosterResult.error) {
        return {
            data: [],
            error: {
                message: `${directResult.error.message}. Management RPC failed: ${rpcResult.error.message}. Dispatch roster fallback also failed: ${dispatchRosterResult.error.message}`,
            },
        };
    }

    const directMembers = directResult.error ? [] : normalizeCompanyUsers(directResult.data);
    const dispatchRosterMembers = dispatchRosterResult.error ? [] : normalizeCompanyUsers(dispatchRosterResult.data);

    return {
        data: mergeCompanyTeamRosterMembers(directMembers, dispatchRosterMembers),
        error: null,
    };
}

async function loadCompanyRolePermissionProfiles(
    companyId: string
): Promise<{
    profiles: Record<CustomizableCompanyRole, CompanyPermissionSet>;
    canCustomize: boolean;
}> {
    const defaults = createDefaultRolePermissionProfiles();
    const { data, error } = await supabase.rpc('get_company_role_permission_profiles', {
        p_company_id: companyId,
    });

    if (error || !Array.isArray(data)) {
        return { profiles: defaults, canCustomize: false };
    }

    const profiles = { ...defaults };

    data.forEach((row) => {
        if (!row || typeof row !== 'object') return;

        const record = row as Record<string, unknown>;
        const profileRole = normalizeCompanyRole(readStringField(record, 'role')) as CustomizableCompanyRole;

        if (!CUSTOMIZABLE_ROLE_OPTIONS.some((option) => option.value === profileRole)) return;

        profiles[profileRole] = {
            ...getRoleDefaultPermissions(profileRole),
            ...(readPermissionOverrides(record, 'permissions') || {}),
        };
    });

    return { profiles, canCustomize: true };
}

function createDefaultRolePermissionProfiles(): Record<CustomizableCompanyRole, CompanyPermissionSet> {
    return CUSTOMIZABLE_ROLE_OPTIONS.reduce((profiles, option) => {
        profiles[option.value] = getRoleDefaultPermissions(option.value);
        return profiles;
    }, {} as Record<CustomizableCompanyRole, CompanyPermissionSet>);
}

function summarizeEnabledPermissions(permissions: CompanyPermissionSet) {
    const enabled = COMPANY_PERMISSION_KEYS
        .filter((permissionKey) => permissions[permissionKey])
        .map((permissionKey) => COMPANY_PERMISSION_LABELS[permissionKey]);

    return enabled.length > 0 ? enabled.join(', ') : 'No operational access';
}

function permissionSetsMatch(first: CompanyPermissionSet, second: CompanyPermissionSet) {
    return COMPANY_PERMISSION_KEYS.every((permissionKey) => first[permissionKey] === second[permissionKey]);
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
            hostname.endsWith('.local')
        );
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

function parseOptionalInteger(value: string) {
    const normalized = value.trim();

    if (!normalized) return null;

    const parsed = Number.parseInt(normalized, 10);

    return Number.isFinite(parsed) ? parsed : null;
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;

    return 'Unknown error';
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

function formatDeliverySummary(invitation: CompanyInvitation) {
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

const compactSectionHeaderPhoneStyle = {
    alignItems: 'stretch' as const,
    flexDirection: 'column' as const,
};

const compactSectionTitleWrapStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    flexBasis: 220,
    flexGrow: 1,
    flexShrink: 1,
    gap: 8,
    maxWidth: '100%' as const,
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

const sectionToggleButtonPhoneStyle = {
    alignSelf: 'flex-start' as const,
};

const sectionToggleTextStyle = {
    fontSize: 13,
};

const sectionHeadingStyle = {
    flexShrink: 1,
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 14,
    minWidth: 0,
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

const publicProfileFieldStyle = {
    gap: 7,
    marginTop: 12,
    minWidth: 0,
    width: '100%' as const,
};

const publicProfileCompactFieldStyle = {
    flexBasis: 240,
    flexGrow: 1,
};

const publicProfileFieldGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    width: '100%' as const,
};

const publicProfileMultilineStyle = {
    minHeight: 110,
    textAlignVertical: 'top' as const,
};

const publicProfileApprovalStyle = {
    alignItems: 'center' as const,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
    marginTop: 14,
    padding: 12,
    width: '100%' as const,
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

const glassCardPhoneStyle = {
    flexBasis: '100%' as const,
    maxWidth: '100%' as const,
    width: '100%' as const,
};

const glassCardExpandedPhoneStyle = {
    flexBasis: '100%' as const,
    maxWidth: '100%' as const,
    minHeight: 240,
    width: '100%' as const,
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

const permissionsCardStyle = {
    gap: 12,
};

const permissionsHeaderStyle = {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: 14,
    justifyContent: 'space-between' as const,
    minWidth: 0,
};

const permissionExpandTextStyle = {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '900' as const,
};

const permissionSummaryRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 7,
};

const permissionSummaryPillStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 6,
};

const permissionSummaryTextStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
};

const permissionEditorStyle = {
    gap: 14,
};

const permissionRoleTabsStyle = {
    gap: 8,
    paddingVertical: 2,
};

const permissionRoleTabStyle = {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
};

const permissionRoleTabTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
};

const permissionToggleGridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 9,
};

const permissionToggleRowStyle = {
    alignItems: 'center' as const,
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: 280,
    flexDirection: 'row' as const,
    flexGrow: 1,
    gap: 12,
    justifyContent: 'space-between' as const,
    minWidth: 0,
    padding: 12,
};

const permissionToggleTitleStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
};

const permissionToggleHintStyle = {
    fontSize: 11,
    fontWeight: '700' as const,
    lineHeight: 15,
    marginTop: 3,
};

const permissionActionsStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 9,
};

const permissionActionButtonStyle = {
    flexBasis: 220,
    flexGrow: 1,
    minWidth: 0,
};
