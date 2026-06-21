import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { resolveLoggedInUserRoute } from '../../lib/onboarding';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type CompanyInvitation = {
    invitation_id: string;
    company_id: string;
    company_name: string | null;
    invited_role: string | null;
    full_name: string | null;
    email: string | null;
    status: string | null;
    created_at: string | null;
};

export default function CompanyInvitationsScreen() {
    const { theme } = useTheme();
    const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [acceptedCompanyName, setAcceptedCompanyName] = useState('');
    const [acceptingInvitationId, setAcceptingInvitationId] = useState<string | null>(null);
    const [continuing, setContinuing] = useState(false);

    useEffect(() => {
        loadInvitations();
    }, []);

    const pendingInvitations = useMemo(
        () => invitations.filter((invitation) => normalizeStatus(invitation.status) === 'pending'),
        [invitations]
    );

    async function loadInvitations() {
        setLoading(true);
        setMessage('');

        const { data, error } = await supabase.rpc('get_my_company_user_invitations');

        setLoading(false);

        if (error) {
            setInvitations([]);
            setMessage(`Could not load invitations: ${error.message}`);
            return;
        }

        setInvitations((data || []) as CompanyInvitation[]);
    }

    async function acceptInvitation(invitation: CompanyInvitation) {
        if (acceptingInvitationId) return;

        setAcceptingInvitationId(invitation.invitation_id);
        setAcceptedCompanyName('');
        setMessage('Accepting invitation...');

        const { error } = await supabase.rpc('accept_company_user_invitation', {
            p_invitation_id: invitation.invitation_id,
        });

        setAcceptingInvitationId(null);

        if (error) {
            setMessage(`Accept invitation failed: ${error.message}`);
            return;
        }

        const companyName = invitation.company_name || 'your company';
        setAcceptedCompanyName(companyName);
        await loadInvitations();
        setMessage(`Invitation accepted for ${companyName}.`);
    }

    async function continueInApp() {
        if (continuing) return;

        setContinuing(true);

        const {
            data: { user },
            error,
        } = await supabase.auth.getUser();

        if (error || !user) {
            setContinuing(false);
            router.replace('/auth/login' as any);
            return;
        }

        const routeDecision = await resolveLoggedInUserRoute(user.id);
        setContinuing(false);
        router.replace(routeDecision.route as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={[titleStyle, { color: theme.colors.text }]}>Company Invitations</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Accept pending company access for your signed-in account.
                </Text>

                {!!message && (
                    <ThemedCard style={messageCardStyle}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>

                        {!!acceptedCompanyName && (
                            <ThemedButton
                                title={continuing ? 'Opening...' : 'Continue'}
                                disabled={continuing}
                                onPress={continueInApp}
                                style={{ marginTop: 16 }}
                            />
                        )}
                    </ThemedCard>
                )}

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading invitations...</Text>
                    </ThemedCard>
                ) : (
                    <>
                        {pendingInvitations.length === 0 ? (
                            <ThemedCard>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                                    No pending company invitations
                                </Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    Sign in with the email address that was invited.
                                </Text>

                                <ThemedButton
                                    title="Refresh"
                                    variant="secondary"
                                    onPress={loadInvitations}
                                    style={{ marginTop: 16 }}
                                />
                            </ThemedCard>
                        ) : (
                            <View style={listStyle}>
                                {pendingInvitations.map((invitation) => {
                                    const accepting = acceptingInvitationId === invitation.invitation_id;

                                    return (
                                        <ThemedCard key={invitation.invitation_id}>
                                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                                                {invitation.company_name || 'Company'}
                                            </Text>
                                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                                Role: {formatLabel(invitation.invited_role)}
                                            </Text>
                                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                                Email: {invitation.email || 'No email'}
                                            </Text>
                                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                                Status: {formatLabel(invitation.status)}
                                            </Text>
                                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                                Created: {formatDate(invitation.created_at)}
                                            </Text>

                                            <View style={actionRowStyle}>
                                                <ThemedButton
                                                    title={accepting ? 'Accepting...' : 'Accept Invitation'}
                                                    disabled={acceptingInvitationId !== null}
                                                    onPress={() => acceptInvitation(invitation)}
                                                    style={actionButtonStyle}
                                                />
                                                <ThemedButton
                                                    title="Refresh"
                                                    variant="secondary"
                                                    disabled={acceptingInvitationId !== null}
                                                    onPress={loadInvitations}
                                                    style={actionButtonStyle}
                                                />
                                            </View>
                                        </ThemedCard>
                                    );
                                })}
                            </View>
                        )}
                    </>
                )}
            </View>
        </ScrollView>
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
    fontSize: 20,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};

const metaTextStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    marginTop: 6,
};

const listStyle = {
    gap: 12,
};

const actionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 16,
};

const actionButtonStyle = {
    flexGrow: 1,
    minWidth: 160,
    paddingVertical: 14,
};
