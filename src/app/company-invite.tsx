import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
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

type ParsedInviteCode = {
    rawCode: string;
    invitationId: string | null;
    inviteCode: string;
};

const COMPANY_INVITE_ROUTE = '/company-invite';

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
    const [candidateInvitations, setCandidateInvitations] = useState<CompanyInvitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [message, setMessage] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        loadInvitation();
    }, [parsedCode?.rawCode]);

    const nextPath = parsedCode ? `${COMPANY_INVITE_ROUTE}?code=${encodeURIComponent(parsedCode.rawCode)}` : COMPANY_INVITE_ROUTE;

    async function loadInvitation() {
        setLoading(true);
        setMessage('');
        setInvitation(null);
        setCandidateInvitations([]);
        setSuccess(false);

        const {
            data: { user: currentUser },
        } = await supabase.auth.getUser();

        setUser(currentUser ? { id: currentUser.id, email: currentUser.email } : null);

        if (!parsedCode) {
            setLoading(false);
            setMessage('The invite code is missing. Ask your company admin for a fresh invitation link.');
            return;
        }

        const directInvitation = await loadDirectInvitation(parsedCode);

        if (directInvitation) {
            setInvitation(directInvitation);
        }

        if (currentUser) {
            const myInvitations = await loadMyInvitations();
            setCandidateInvitations(myInvitations);

            if (!directInvitation && parsedCode.invitationId) {
                const matchingInvitation = myInvitations.find((item) => item.invitation_id === parsedCode.invitationId);
                if (matchingInvitation) {
                    setInvitation(matchingInvitation);
                }
            }

            if (!directInvitation && !parsedCode.invitationId && myInvitations.length === 1) {
                setInvitation(myInvitations[0]);
            }
        }

        setLoading(false);
    }

    async function acceptInvitation() {
        if (!parsedCode || accepting) return;

        if (!user) {
            setMessage('Sign in or create an account to accept this company invitation.');
            return;
        }

        const invitationIds = buildAcceptInvitationIds(parsedCode.invitationId, invitation, candidateInvitations);

        if (invitationIds.length === 0) {
            setMessage('We could not find a pending invitation for this code. Sign in with the invited email address, then try again.');
            return;
        }

        setAccepting(true);
        setMessage('Accepting invitation...');

        let lastError = '';

        for (const invitationId of invitationIds) {
            const { error } = await supabase.rpc('accept_company_user_invitation_by_code', {
                p_invitation_id: invitationId,
                p_invite_code: parsedCode.inviteCode,
            });

            if (!error) {
                setSuccess(true);
                setMessage('Invitation accepted. Opening your company workspace...');
                const routeDecision = await resolveLoggedInUserRoute(user.id);
                setAccepting(false);
                setTimeout(() => {
                    router.replace(routeDecision.route as any);
                }, 900);
                return;
            }

            lastError = error.message;
        }

        setAccepting(false);
        setMessage(`Accept invitation failed: ${lastError || 'The invite code could not be accepted.'}`);
    }

    function goToLogin() {
        router.push({
            pathname: '/auth/login',
            params: { next: nextPath },
        } as any);
    }

    function goToRegister() {
        router.push({
            pathname: '/auth/register',
            params: { next: nextPath },
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
                                            Sign in with the invited email address to securely load and accept this company invitation.
                                        </Text>
                                    </>
                                )}

                                {!user ? (
                                    <View style={actionGroupStyle}>
                                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                            Sign in or create an account to accept this company invitation.
                                        </Text>
                                        <View style={actionRowStyle}>
                                            <ThemedButton title="Sign In" onPress={goToLogin} style={actionButtonStyle} />
                                            <ThemedButton
                                                title="Create Account"
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
                                    Ask your company admin to send the invitation link again.
                                </Text>
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

async function loadDirectInvitation(parsedCode: ParsedInviteCode) {
    const invitationId = parsedCode.invitationId;

    if (invitationId) {
        const byId = await supabase
            .from('company_user_invitations')
            .select(
                'id, company_id, email, full_name, role, status, expires_at, created_at, manual_invite_token_expires_at, companies(name)'
            )
            .eq('id', invitationId)
            .maybeSingle();

        if (!byId.error && byId.data) {
            return normalizeInvitationRecord(byId.data as Record<string, unknown>);
        }
    }

    const tokenHash = await sha256Hex(parsedCode.inviteCode.trim().toUpperCase());
    if (!tokenHash) return null;

    const byHash = await supabase
        .from('company_user_invitations')
        .select(
            'id, company_id, email, full_name, role, status, expires_at, created_at, manual_invite_token_expires_at, companies(name)'
        )
        .eq('manual_invite_token_hash', tokenHash)
        .eq('status', 'pending')
        .maybeSingle();

    if (byHash.error || !byHash.data) return null;

    return normalizeInvitationRecord(byHash.data as Record<string, unknown>);
}

async function loadMyInvitations() {
    const { data, error } = await supabase.rpc('get_my_company_user_invitations');

    if (error) return [];

    return ((data || []) as Record<string, unknown>[]).map((row) => ({
        invitation_id: readStringField(row, 'invitation_id') || '',
        company_id: readStringField(row, 'company_id'),
        company_name: readStringField(row, 'company_name'),
        invited_role: readStringField(row, 'invited_role'),
        full_name: readStringField(row, 'full_name'),
        email: readStringField(row, 'email'),
        status: readStringField(row, 'status'),
        expires_at: readStringField(row, 'expires_at'),
        created_at: readStringField(row, 'created_at'),
    })).filter((invitation) => invitation.invitation_id);
}

function buildAcceptInvitationIds(
    parsedInvitationId: string | null,
    invitation: CompanyInvitation | null,
    candidateInvitations: CompanyInvitation[]
) {
    const ids = new Set<string>();

    if (parsedInvitationId) ids.add(parsedInvitationId);
    if (invitation?.invitation_id) ids.add(invitation.invitation_id);
    candidateInvitations.forEach((candidate) => {
        if (candidate.invitation_id) ids.add(candidate.invitation_id);
    });

    return Array.from(ids);
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
    const manualExpiresAt = readStringField(record, 'manual_invite_token_expires_at');

    return {
        invitation_id: readStringField(record, 'id') || '',
        company_id: readStringField(record, 'company_id'),
        company_name: readCompanyName(record.companies),
        invited_role: readStringField(record, 'role'),
        full_name: readStringField(record, 'full_name'),
        email: readStringField(record, 'email'),
        status: readStringField(record, 'status'),
        expires_at: manualExpiresAt || readStringField(record, 'expires_at'),
        created_at: readStringField(record, 'created_at'),
    };
}

function readCompanyName(value: unknown) {
    const company = Array.isArray(value) ? value[0] : value;

    if (company && typeof company === 'object') {
        return readStringField(company as Record<string, unknown>, 'name');
    }

    return null;
}

function readStringField(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' && value.trim() ? value : null;
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

async function sha256Hex(value: string) {
    const subtle = globalThis.crypto?.subtle;

    if (!subtle || typeof TextEncoder === 'undefined') return null;

    const buffer = await subtle.digest('SHA-256', new TextEncoder().encode(value));

    return Array.from(new Uint8Array(buffer))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
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
