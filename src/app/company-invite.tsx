import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import { resolveLoggedInUserRoute } from '../lib/onboarding';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

type CompanyInvitation = {
    invitation_id: string;
    company_id: string | null;
    company_name: string | null;
    invited_role: string | null;
    full_name: string | null;
    email: string | null;
    status: string | null;
    expires_at: string | null;
    created_at: string | null;
};

type SessionUser = {
    id: string;
    email?: string | null;
};

type AcceptedCompanyUser = {
    company_id: string | null;
    role: string | null;
};

type ParsedInviteCode = {
    rawCode: string;
    invitationId: string | null;
    inviteCode: string;
};

const COMPANY_INVITE_ROUTE = '/company-invite';
const HOMEOS_SERVICE_ERROR_MESSAGE = 'Could not reach HomeOS services. Check connection and try again.';
const COMPANY_MANAGEMENT_ROLES = ['owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor'];

export default function CompanyInviteScreen() {
    const { theme } = useTheme();
    const params = useLocalSearchParams<{
        code?: string | string[];
        invitationId?: string | string[];
        inviteCode?: string | string[];
    }>();
    const parsedCode = useMemo(() => parseInviteCode(params), [params]);
    const [user, setUser] = useState<SessionUser | null>(null);
    const [invitation, setInvitation] = useState<CompanyInvitation | null>(null);
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [message, setMessage] = useState('');
    const [success, setSuccess] = useState(false);
    const [manualInviteCode, setManualInviteCode] = useState('');
    const autoAcceptKeyRef = useRef('');

    useEffect(() => {
        loadInvitation();
    }, [parsedCode?.rawCode]);

    useEffect(() => {
        if (loading || accepting || success || !user || !invitation || !parsedCode) return;
        if (normalizeStatus(invitation.status) !== 'pending') return;

        const autoAcceptKey = `${user.id}:${invitation.invitation_id}:${parsedCode.inviteCode}`;
        if (autoAcceptKeyRef.current === autoAcceptKey) return;

        autoAcceptKeyRef.current = autoAcceptKey;
        void acceptInvitation();
    }, [
        accepting,
        invitation?.invitation_id,
        invitation?.status,
        loading,
        parsedCode?.inviteCode,
        success,
        user?.id,
    ]);

    const nextPath = parsedCode ? `${COMPANY_INVITE_ROUTE}?code=${encodeURIComponent(parsedCode.rawCode)}` : COMPANY_INVITE_ROUTE;

    async function loadInvitation() {
        setLoading(true);
        setMessage('');
        setInvitation(null);
        setSuccess(false);

        let currentSessionUser: SessionUser | null = null;

        try {
            const {
                data: { user: currentUser },
            } = await supabase.auth.getUser();

            currentSessionUser = currentUser ? { id: currentUser.id, email: currentUser.email } : null;
            setUser(currentSessionUser);
        } catch (error) {
            setUser(null);
            setLoading(false);
            setMessage(normalizeServiceErrorMessage(getErrorMessage(error)));
            return;
        }

        if (!parsedCode) {
            setLoading(false);
            setMessage(
                currentSessionUser
                    ? 'Enter your company invite code to finish work account setup.'
                    : 'The invite code is missing. Ask your company admin for a fresh invitation link.'
            );
            return;
        }

        const lookupResult = await loadInvitationByCode(parsedCode.inviteCode);

        if (lookupResult.errorMessage) {
            setMessage(lookupResult.errorMessage);
        } else if (lookupResult.invitation) {
            setInvitation(lookupResult.invitation);
            setMessage(statusMessage(lookupResult.invitation.status));
        } else {
            setMessage('This invite link is invalid or no longer available. Ask the company admin to create a new manual invite link.');
        }

        setLoading(false);
    }

    async function acceptInvitation() {
        if (!parsedCode || accepting) return;

        if (!user) {
            setMessage('Sign in or create a work account with the invited email to accept this company invitation.');
            return;
        }

        if (!invitation?.invitation_id) {
            setMessage('This invite link is invalid or no longer available. Ask the company admin to create a new manual invite link.');
            return;
        }

        if (normalizeStatus(invitation.status) !== 'pending') {
            setMessage(statusMessage(invitation.status));
            return;
        }

        const signedInEmail = normalizeEmail(user.email);
        const invitedEmail = normalizeEmail(invitation.email);

        if (signedInEmail && invitedEmail && signedInEmail !== invitedEmail) {
            setMessage(`This invite is for ${invitation.email}. Sign in with that email or ask for a new invite.`);
            return;
        }

        setAccepting(true);
        setMessage('Accepting invitation...');

        let acceptErrorMessage = '';
        let acceptedCompanyUser: AcceptedCompanyUser | null = null;

        try {
            const { data, error } = await supabase.rpc('accept_company_user_invitation_by_code', {
                p_invitation_id: invitation.invitation_id,
                p_invite_code: parsedCode.inviteCode,
            });

            acceptErrorMessage = error?.message || '';
            acceptedCompanyUser = normalizeAcceptedCompanyUser(data);
        } catch (error) {
            acceptErrorMessage = normalizeServiceErrorMessage(getErrorMessage(error));
        }

        if (!acceptErrorMessage) {
            setSuccess(true);
            setMessage('Invitation accepted. Opening your company workspace...');
            const acceptedCompanyId = acceptedCompanyUser?.company_id || invitation.company_id;
            const acceptedRole = acceptedCompanyUser?.role || invitation.invited_role;
            const routeDecision = await resolveLoggedInUserRoute(user.id, {
                preferredCompanyId: acceptedCompanyId,
            });
            if (routeDecision.reason === 'service-unavailable') {
                setSuccess(false);
                setAccepting(false);
                setMessage(routeDecision.message || HOMEOS_SERVICE_ERROR_MESSAGE);
                return;
            }
            const acceptedInviteRoute = getAcceptedInviteRoute(acceptedCompanyId, acceptedRole, routeDecision.route);
            setAccepting(false);
            setTimeout(() => {
                router.replace(acceptedInviteRoute as any);
            }, 900);
            return;
        }

        setAccepting(false);
        setMessage(`Accept invitation failed: ${formatAcceptError(acceptErrorMessage)}`);
    }

    function openManualInviteCode() {
        const code = manualInviteCode.trim();

        if (!code) {
            setMessage('Enter invite code.');
            return;
        }

        router.replace(`${COMPANY_INVITE_ROUTE}?code=${encodeURIComponent(code)}` as any);
    }

    async function signOut() {
        await supabase.auth.signOut();
        setUser(null);
        setSuccess(false);
        setMessage('Signed out. Sign in with the invited email to accept this company invitation.');
    }

    async function backToLogin() {
        await supabase.auth.signOut();
        router.replace({
            pathname: '/auth/login',
            params: { mode: 'work' },
        } as any);
    }

    function goToLogin() {
        router.push({
            pathname: '/auth/login',
            params: buildWorkAuthParams(nextPath, invitation),
        } as any);
    }

    function goToRegister() {
        router.push({
            pathname: '/auth/register',
            params: buildWorkAuthParams(nextPath, invitation),
        } as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 760 }}>
                <HomeHeader />

                <Text style={[titleStyle, { color: theme.colors.text }]}>Company Invitation</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Review and accept your company access invitation.
                </Text>

                {loading ? (
                    <ThemedCard>
                        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginBottom: 16 }} />
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading invitation...</Text>
                    </ThemedCard>
                ) : (
                    <>
                        {!!message && (
                            <ThemedCard style={messageCardStyle}>
                                <Text style={[bodyTextStyle, { color: success ? theme.colors.primary : theme.colors.mutedText }]}>
                                    {message}
                                </Text>
                            </ThemedCard>
                        )}

                        {parsedCode ? (
                            <ThemedCard>
                                {invitation ? (
                                    <>
                                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                                            {invitation.company_name || 'Company invitation'}
                                        </Text>
                                        <DetailRow label="Invited email" value={invitation.email || 'Unavailable'} />
                                        <DetailRow label="Role" value={formatLabel(invitation.invited_role)} />
                                        <DetailRow label="Company" value={invitation.company_name || 'Unavailable'} />
                                        <DetailRow label="Status" value={formatLabel(invitation.status)} />
                                        <DetailRow label="Expiration" value={formatDate(invitation.expires_at)} />
                                    </>
                                ) : (
                                    <>
                                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Invitation link ready</Text>
                                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                            This invite link is invalid or no longer available. Ask the company admin to create a new manual invite link.
                                        </Text>
                                    </>
                                )}

                                {!user ? (
                                    <View style={actionGroupStyle}>
                                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                            Sign in or create a work account with the invited email to accept this company invitation.
                                        </Text>
                                        <View style={actionRowStyle}>
                                            <ThemedButton title="Sign In" onPress={goToLogin} style={actionButtonStyle} />
                                            <ThemedButton
                                                title="Create Work Account"
                                                variant="secondary"
                                                onPress={goToRegister}
                                                style={actionButtonStyle}
                                            />
                                        </View>
                                    </View>
                                ) : (
                                    <View style={actionGroupStyle}>
                                        <ThemedButton
                                            title={accepting ? 'Accepting...' : 'Accept Invitation'}
                                            disabled={accepting || success}
                                            onPress={acceptInvitation}
                                        />
                                        <ThemedButton
                                            title="Refresh"
                                            variant="secondary"
                                            disabled={accepting}
                                            onPress={loadInvitation}
                                            style={{ marginTop: 12 }}
                                        />
                                    </View>
                                )}
                            </ThemedCard>
                        ) : (
                            <ThemedCard>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Invite code missing</Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    Enter your company invite code, or ask your company admin to send the invitation link again.
                                </Text>

                                <TextInput
                                    placeholder="Invite code"
                                    value={manualInviteCode}
                                    onChangeText={setManualInviteCode}
                                    autoCapitalize="characters"
                                    autoCorrect={false}
                                    style={[
                                        inviteCodeInputStyle,
                                        {
                                            backgroundColor: theme.colors.surface,
                                            borderColor: theme.colors.border,
                                            color: theme.colors.text,
                                        },
                                    ]}
                                />

                                <View style={actionGroupStyle}>
                                    <ThemedButton title="Enter Invite Code" onPress={openManualInviteCode} />
                                    <View style={actionRowStyle}>
                                        {!!user && (
                                            <ThemedButton
                                                title="Sign Out"
                                                variant="secondary"
                                                onPress={signOut}
                                                style={actionButtonStyle}
                                            />
                                        )}
                                        <ThemedButton
                                            title="Back to Login"
                                            variant="ghost"
                                            onPress={backToLogin}
                                            style={actionButtonStyle}
                                        />
                                    </View>
                                </View>
                            </ThemedCard>
                        )}
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <View style={detailRowStyle}>
            <Text style={[detailLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <Text style={[detailValueStyle, { color: theme.colors.text }]}>{value}</Text>
        </View>
    );
}

async function loadInvitationByCode(inviteCode: string): Promise<{
    invitation: CompanyInvitation | null;
    errorMessage: string;
}> {
    let data: unknown = null;
    let errorMessage = '';

    try {
        const result = await supabase.rpc('get_company_user_invitation_by_code', {
            p_invite_code: inviteCode,
        });
        data = result.data;
        errorMessage = result.error?.message || '';
    } catch (error) {
        errorMessage = normalizeServiceErrorMessage(getErrorMessage(error));
    }

    if (errorMessage) {
        return {
            invitation: null,
            errorMessage: `Could not load this invite link: ${formatInviteLookupError(errorMessage)}`,
        };
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row || typeof row !== 'object') {
        return {
            invitation: null,
            errorMessage: '',
        };
    }

    return {
        invitation: normalizeInvitationRecord(row as Record<string, unknown>),
        errorMessage: '',
    };
}

function parseInviteCode(params: {
    code?: string | string[];
    invitationId?: string | string[];
    inviteCode?: string | string[];
}): ParsedInviteCode | null {
    const rawCode = firstParam(params.code)?.trim() || '';
    const explicitInvitationId = normalizeUuid(firstParam(params.invitationId));
    const explicitInviteCode = firstParam(params.inviteCode)?.trim() || '';

    if (explicitInvitationId && explicitInviteCode) {
        return {
            rawCode: rawCode || explicitInviteCode,
            invitationId: explicitInvitationId,
            inviteCode: explicitInviteCode,
        };
    }

    if (!rawCode) return null;

    const combined = rawCode.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[.:|_](.+)$/i);

    if (combined) {
        return {
            rawCode,
            invitationId: normalizeUuid(combined[1]),
            inviteCode: combined[2].trim(),
        };
    }

    return {
        rawCode,
        invitationId: normalizeUuid(rawCode),
        inviteCode: rawCode,
    };
}

function normalizeInvitationRecord(record: Record<string, unknown>): CompanyInvitation {
    return {
        invitation_id: readStringField(record, 'invitation_id') || readStringField(record, 'id') || '',
        company_id: readStringField(record, 'company_id'),
        company_name: readStringField(record, 'company_name'),
        invited_role: readStringField(record, 'role') || readStringField(record, 'invited_role'),
        full_name: readStringField(record, 'full_name'),
        email: readStringField(record, 'invited_email') || readStringField(record, 'email'),
        status: readStringField(record, 'status'),
        expires_at: readStringField(record, 'manual_invite_expires_at') || readStringField(record, 'expires_at'),
        created_at: readStringField(record, 'created_at'),
    };
}

function readStringField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeAcceptedCompanyUser(data: unknown): AcceptedCompanyUser | null {
    const row = Array.isArray(data) ? data[0] : data;

    if (!row || typeof row !== 'object') return null;

    const record = row as Record<string, unknown>;

    return {
        company_id: readStringField(record, 'company_id'),
        role: readStringField(record, 'role'),
    };
}

function firstParam(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

function normalizeUuid(value: string | undefined | null) {
    const normalized = String(value || '').trim().toLowerCase();

    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)
        ? normalized
        : null;
}

function formatLabel(value: string | null) {
    return String(value || 'unknown')
        .trim()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function normalizeEmail(value: string | null | undefined) {
    return String(value || '').trim().toLowerCase();
}

function normalizeStatus(value: string | null) {
    return String(value || '').trim().toLowerCase();
}

function buildWorkAuthParams(nextPath: string, invitation: CompanyInvitation | null) {
    const authParams: Record<string, string> = {
        next: nextPath,
        mode: 'work',
    };
    const invitedEmail = normalizeEmail(invitation?.email);

    if (invitedEmail) authParams.email = invitedEmail;

    return authParams;
}

function getAcceptedInviteRoute(companyIdValue: string | null, roleValue: string | null, resolvedRoute: string) {
    const companyId = String(companyIdValue || '').trim();
    const invitedRole = normalizeInviteRole(roleValue);

    if (!companyId) {
        return resolvedRoute;
    }

    if (invitedRole === 'technician') {
        return `/techos?companyId=${encodeURIComponent(companyId)}`;
    }

    if (COMPANY_MANAGEMENT_ROLES.includes(invitedRole)) {
        return `/super-admin/company/${encodeURIComponent(companyId)}`;
    }

    if (resolvedRoute === '/onboarding/create-home' || resolvedRoute === '/') {
        return `/techos?companyId=${encodeURIComponent(companyId)}`;
    }

    return resolvedRoute;
}

function normalizeInviteRole(role?: string | null) {
    const normalizedRole = String(role || '').trim().toLowerCase();

    if (['tech', 'field_tech', 'field-tech', 'field technician'].includes(normalizedRole)) return 'technician';
    if (normalizedRole === 'dispatch') return 'dispatcher';

    return normalizedRole;
}

function statusMessage(status: string | null) {
    const normalized = normalizeStatus(status);

    if (!normalized || normalized === 'pending') return '';

    if (normalized === 'expired') {
        return 'This invite link has expired. Ask the company admin to create a new manual invite link.';
    }

    if (normalized === 'revoked') {
        return 'This invite link has been revoked. Ask the company admin to create a new manual invite link.';
    }

    if (normalized === 'accepted' || normalized === 'used') {
        return 'This invite link has already been used.';
    }

    return 'This invite link is not active. Ask the company admin to create a new manual invite link.';
}

function formatInviteLookupError(message: string) {
    if (isFetchFailureMessage(message) || message === HOMEOS_SERVICE_ERROR_MESSAGE) {
        return HOMEOS_SERVICE_ERROR_MESSAGE;
    }

    if (message.toLowerCase().includes('invite code is required')) {
        return 'The invite code is missing. Ask your company admin for a fresh invitation link.';
    }

    return 'This invite link is invalid or no longer available. Ask the company admin to create a new manual invite link.';
}

function formatAcceptError(message: string) {
    if (isFetchFailureMessage(message) || message === HOMEOS_SERVICE_ERROR_MESSAGE) {
        return HOMEOS_SERVICE_ERROR_MESSAGE;
    }

    return message || 'The invite code could not be accepted.';
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

function formatDate(value: string | null) {
    if (!value) return 'Unavailable';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unavailable';

    return date.toLocaleDateString();
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

const messageCardStyle = {
    marginBottom: 16,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 12,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};

const detailRowStyle = {
    marginTop: 10,
};

const detailLabelStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    marginBottom: 3,
};

const detailValueStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    lineHeight: 22,
};

const actionGroupStyle = {
    marginTop: 18,
};

const inviteCodeInputStyle = {
    borderRadius: 14,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '900' as const,
    marginTop: 16,
    padding: 14,
};

const actionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginTop: 14,
};

const actionButtonStyle = {
    flexGrow: 1,
    flexBasis: 180,
};
