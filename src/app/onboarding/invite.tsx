import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type HomeownerInvitation = {
    id: string;
    email: string;
    full_name: string | null;
    phone: string | null;
    status: string | null;
    intended_membership_role: string | null;
    property_id: string | null;
    expires_at: string | null;
    accepted_at: string | null;
    revoked_at: string | null;
    created_at: string | null;
};

export default function InviteOnboardingScreen() {
    const { theme } = useTheme();
    const [invitations, setInvitations] = useState<HomeownerInvitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadInvitations();
    }, []);

    const pendingInvites = useMemo(
        () => invitations.filter((invite) => inviteState(invite) === 'pending'),
        [invitations]
    );
    const acceptedInvites = useMemo(
        () => invitations.filter((invite) => inviteState(invite) === 'accepted'),
        [invitations]
    );
    const unavailableInvites = useMemo(
        () =>
            invitations.filter((invite) => {
                const state = inviteState(invite);

                return state === 'expired' || state === 'revoked';
            }),
        [invitations]
    );

    async function loadInvitations() {
        setLoading(true);
        setMessage('');

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setLoading(false);
            router.replace('/auth/login' as any);
            return;
        }

        const selectFields =
            'id, email, full_name, phone, status, intended_membership_role, property_id, expires_at, accepted_at, revoked_at, created_at';
        const byUser = await supabase
            .from('homeowner_invitations')
            .select(selectFields)
            .eq('auth_user_id', user.id)
            .order('created_at', { ascending: false });

        const normalizedEmail = user.email?.trim().toLowerCase() || '';
        const byEmail = normalizedEmail
            ? await supabase
                .from('homeowner_invitations')
                .select(selectFields)
                .ilike('email', normalizedEmail)
                .order('created_at', { ascending: false })
            : { data: [], error: null };

        setLoading(false);

        if (byUser.error || byEmail.error) {
            setMessage(byUser.error?.message || byEmail.error?.message || 'Could not load invitations.');
            return;
        }

        setInvitations(mergeInvitations(byUser.data || [], byEmail.data || []));
    }

    function continueToCreateHome() {
        router.push('/onboarding/create-home' as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={[titleStyle, { color: theme.colors.text }]}>Homeowner Invitation</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Review your HomeOS invitation and continue to first-home setup.
                </Text>

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading invitations...</Text>
                    </ThemedCard>
                ) : (
                    <>
                        {pendingInvites.length > 0 && (
                            <InviteSection
                                title="Pending Invites"
                                invitations={pendingInvites}
                                actionLabel="Continue to Create Home"
                                onAction={continueToCreateHome}
                            />
                        )}

                        {acceptedInvites.length > 0 && (
                            <InviteSection
                                title="Accepted Invites"
                                invitations={acceptedInvites}
                                actionLabel="Continue to Create Home"
                                onAction={continueToCreateHome}
                            />
                        )}

                        {unavailableInvites.length > 0 && (
                            <InviteSection
                                title="Expired or Revoked"
                                invitations={unavailableInvites}
                                message="This invitation is no longer available. Ask your HomeOS admin to send a new invite."
                            />
                        )}

                        {invitations.length === 0 && (
                            <ThemedCard>
                                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>No invitation found.</Text>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    Sign in with the email address that received the HomeOS invitation.
                                </Text>
                            </ThemedCard>
                        )}
                    </>
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

function InviteSection({
    title,
    invitations,
    actionLabel,
    onAction,
    message,
}: {
    title: string;
    invitations: HomeownerInvitation[];
    actionLabel?: string;
    onAction?: () => void;
    message?: string;
}) {
    const { theme } = useTheme();

    return (
        <View style={sectionStyle}>
            <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>{title}</Text>
            <View style={listStyle}>
                {invitations.map((invite) => (
                    <ThemedCard key={invite.id}>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                            {invite.full_name || invite.email}
                        </Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            {invite.email}
                        </Text>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Role: {invite.intended_membership_role || 'OWNER'}
                        </Text>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Status: {inviteState(invite)}
                        </Text>

                        {!!message && (
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText, marginTop: 12 }]}>
                                {message}
                            </Text>
                        )}

                        {!!actionLabel && !!onAction && (
                            <ThemedButton
                                title={actionLabel}
                                onPress={onAction}
                                style={{ marginTop: 16 }}
                            />
                        )}
                    </ThemedCard>
                ))}
            </View>
        </View>
    );
}

function mergeInvitations(...groups: HomeownerInvitation[][]) {
    const invitationsById = new Map<string, HomeownerInvitation>();

    groups.flat().forEach((invite) => {
        invitationsById.set(invite.id, invite);
    });

    return Array.from(invitationsById.values());
}

function inviteState(invite: HomeownerInvitation) {
    const status = String(invite.status || 'pending').toLowerCase();

    if (invite.revoked_at || status === 'revoked') return 'revoked';
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) return 'expired';
    if (invite.accepted_at || status === 'accepted') return 'accepted';

    return 'pending';
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

const sectionStyle = {
    marginBottom: 24,
};

const sectionHeadingStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 14,
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
