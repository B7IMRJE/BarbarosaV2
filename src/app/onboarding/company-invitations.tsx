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

const HOMEOS_SERVICE_ERROR_MESSAGE = 'Could not reach HomeOS services. Check connection and try again.';

export default function CompanyInvitationsScreen() {
    const { theme } = useTheme();
    const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [signedInEmail, setSignedInEmail] = useState('');
    const [acceptedCompanyName, setAcceptedCompanyName] = useState('');
    const [acceptedRoute, setAcceptedRoute] = useState('');
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

        let userEmail = '';

        try {
            const {
                data: { user },
                error: userError,
            } = await supabase.auth.getUser();

            if (userError || !user) {
                setSignedInEmail('');
                setLoading(false);
                setInvitations([]);
                setMessage('Sign in with the email address that was invited to review company invitations.');
                return;
            }

            userEmail = user.email || '';
        } catch (error) {
            setSignedInEmail('');
            setLoading(false);
            setInvitations([]);
            setMessage(normalizeServiceErrorMessage(getErrorMessage(error)));
            return;
        }

        setSignedInEmail(userEmail);

        let data: unknown = [];
        let errorMessage = '';

        try {
            const result = await supabase.rpc('get_my_company_user_invitations');
            data = result.data || [];
            errorMessage = result.error?.message || '';
        } catch (error) {
            errorMessage = normalizeServiceErrorMessage(getErrorMessage(error));
        }

        setLoading(false);

        if (errorMessage) {
            setInvitations([]);
            setMessage(`Could not load invitations: ${normalizeServiceErrorMessage(errorMessage)}`);
            return;
        }

        setInvitations((data || []) as CompanyInvitation[]);
    }

    async function acceptInvitation(invitation: CompanyInvitation) {
        if (acceptingInvitationId) return;

        setAcceptingInvitationId(invitation.invitation_id);
        setAcceptedCompanyName('');
        setAcceptedRoute('');
        setMessage('Accepting invitation...');

        let userId = '';

        try {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            userId = user?.id || '';
        } catch (error) {
            setAcceptingInvitationId(null);
            setMessage(normalizeServiceErrorMessage(getErrorMessage(error)));
            return;
        }

        let acceptErrorMessage = '';

        try {
            const { error } = await supabase.rpc('accept_company_user_invitation', {
                p_invitation_id: invitation.invitation_id,
            });

            acceptErrorMessage = error?.message || '';
        } catch (error) {
            acceptErrorMessage = normalizeServiceErrorMessage(getErrorMessage(error));
        }

        setAcceptingInvitationId(null);

        if (acceptErrorMessage) {
            setMessage(`Accept invitation failed: ${normalizeServiceErrorMessage(acceptErrorMessage)}`);
            return;
        }

        const companyName = invitation.company_name || 'your company';
        const routeDecision = userId
            ? await resolveLoggedInUserRoute(userId, {
                preferredCompanyId: invitation.company_id,
            })
            : null;

        if (routeDecision?.reason === 'service-unavailable') {
            setAcceptedCompanyName(companyName);
            setAcceptedRoute('');
            await loadInvitations();
            setMessage(routeDecision.message || HOMEOS_SERVICE_ERROR_MESSAGE);
            return;
        }

        setAcceptedCompanyName(companyName);
        setAcceptedRoute(routeDecision?.route || '');
        await loadInvitations();
        setMessage(`Invitation accepted for ${companyName}. Opening your company workspace...`);

        if (routeDecision) {
            setTimeout(() => {
                router.replace(routeDecision.route as any);
            }, 900);
        }
    }

    async function continueInApp() {
        if (continuing) return;

        setContinuing(true);

        let userId = '';

        try {
            const {
                data: { user },
                error,
            } = await supabase.auth.getUser();

            if (error || !user) {
                setContinuing(false);
                router.replace('/auth/login' as any);
                return;
            }

            userId = user.id;
        } catch (error) {
            setContinuing(false);
            setMessage(normalizeServiceErrorMessage(getErrorMessage(error)));
            return;
        }

        const routeDecision = acceptedRoute
            ? null
            : await resolveLoggedInUserRoute(userId);

        if (routeDecision?.reason === 'service-unavailable') {
            setContinuing(false);
            setMessage(routeDecision.message || HOMEOS_SERVICE_ERROR_MESSAGE);
            return;
        }

        setContinuing(false);
        router.replace((acceptedRoute || routeDecision?.route || '/') as any);
    }

    function goBack() {
        if (router.canGoBack()) {
            router.back();
            return;
        }

        router.replace('/' as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <View style={topActionRowStyle}>
                    <ThemedButton
                        title="Back"
                        variant="secondary"
                        onPress={goBack}
                        style={topActionButtonStyle}
                    />
                    <ThemedButton
                        title="Home"
                        variant="secondary"
                        onPress={() => router.replace('/' as any)}
                        style={topActionButtonStyle}
                    />
                </View>

                <Text style={[titleStyle, { color: theme.colors.text }]}>Company Invitations</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Accept pending company access for your signed-in HomeOS account.
                </Text>
                <ThemedCard style={messageCardStyle}>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        Checking invitations for: {signedInEmail || 'No signed-in email'}
                    </Text>
                </ThemedCard>

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

const topActionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginBottom: 18,
};

const topActionButtonStyle = {
    minWidth: 120,
    paddingVertical: 12,
};
