import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
    loadPendingCustomerInvitesForCurrentUser,
    type PendingCustomerInvite,
} from '../lib/customerInvites';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';
import ThemedButton from './theme/ThemedButton';
import ThemedCard from './theme/ThemedCard';

type HomeOption = {
    id: string;
    name: string | null;
    address?: string | null;
    address_line_1?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    postal_code?: string | null;
};

type AcceptedCustomerInvite = {
    invitation_id?: string | null;
    company_id?: string | null;
    property_id?: string | null;
    company_property_client_id?: string | null;
    property_connection_id?: string | null;
    status?: string | null;
};

type PendingCustomerInvitesCardProps = {
    compact?: boolean;
    showSetupMessage?: boolean;
    onAccepted?: () => void | Promise<void>;
};

export default function PendingCustomerInvitesCard({
    compact = false,
    showSetupMessage = false,
    onAccepted,
}: PendingCustomerInvitesCardProps) {
    const { theme } = useTheme();
    const [loading, setLoading] = useState(true);
    const [invites, setInvites] = useState<PendingCustomerInvite[]>([]);
    const [homes, setHomes] = useState<HomeOption[]>([]);
    const [selectedHomeByInviteId, setSelectedHomeByInviteId] = useState<Record<string, string>>({});
    const [signedInEmail, setSignedInEmail] = useState('');
    const [message, setMessage] = useState('');
    const [backendMissing, setBackendMissing] = useState(false);
    const [acceptingInviteId, setAcceptingInviteId] = useState('');

    useEffect(() => {
        void loadInvites();
    }, []);

    async function loadInvites() {
        setLoading(true);
        setMessage('');
        setBackendMissing(false);

        const result = await loadPendingCustomerInvitesForCurrentUser();
        setSignedInEmail(result.signedInEmail);
        setBackendMissing(result.backendMissing);

        if (result.error) {
            setInvites([]);
            setHomes([]);
            setMessage(result.backendMissing ? 'Customer invite detection is not configured yet.' : result.error);
            setLoading(false);
            return;
        }

        setInvites(result.invites);

        if (result.invites.length > 0) {
            await loadHomes(result.userId, result.invites);
        } else {
            setHomes([]);
            setSelectedHomeByInviteId({});
        }

        setLoading(false);
    }

    async function loadHomes(userId: string, pendingInvites: PendingCustomerInvite[]) {
        const { data: memberships, error: membershipError } = await supabase
            .from('property_memberships')
            .select('property_id')
            .eq('user_id', userId)
            .eq('status', 'active');

        if (membershipError) {
            setHomes([]);
            setMessage(`Customer invite found, but your HomeOS homes could not be loaded: ${membershipError.message}`);
            return;
        }

        const propertyIds = Array.from(
            new Set(
                ((memberships || []) as Array<{ property_id?: string | null }>)
                    .map((membership) => membership.property_id)
                    .filter((propertyId): propertyId is string => Boolean(propertyId))
            )
        );

        if (propertyIds.length === 0) {
            setHomes([]);
            setSelectedHomeByInviteId({});
            return;
        }

        const { data, error } = await supabase
            .from('properties')
            .select('id, name, address, address_line_1, city, state, zip, postal_code')
            .in('id', propertyIds);

        if (error) {
            setHomes([]);
            setMessage(`Customer invite found, but home details could not be loaded: ${error.message}`);
            return;
        }

        const loadedHomes = (data || []) as HomeOption[];
        setHomes(loadedHomes);

        if (loadedHomes.length === 1) {
            const [home] = loadedHomes;
            const nextSelectedHomes = pendingInvites.reduce<Record<string, string>>((selectedHomes, invite) => {
                selectedHomes[invite.invitation_id] = home.id;
                return selectedHomes;
            }, {});
            setSelectedHomeByInviteId(nextSelectedHomes);
        } else {
            setSelectedHomeByInviteId({});
        }
    }

    async function acceptInvite(invite: PendingCustomerInvite) {
        if (acceptingInviteId) return;

        if (!invite.invite_code) {
            setMessage('This customer invite is missing an invite code. Ask the company for a fresh invite.');
            return;
        }

        if (homes.length === 0) {
            goCreateHome(invite);
            return;
        }

        const selectedHomeId = selectedHomeByInviteId[invite.invitation_id] || '';

        if (!selectedHomeId) {
            setMessage('Choose a HomeOS home before accepting this customer invite.');
            return;
        }

        setAcceptingInviteId(invite.invitation_id);
        setMessage('Accepting customer invite...');

        const { data, error } = await supabase.rpc('accept_customer_invite_by_code', {
            p_invite_code: invite.invite_code,
            p_property_id: selectedHomeId,
        });

        setAcceptingInviteId('');

        if (error) {
            setMessage(`Could not accept customer invite: ${error.message}`);
            return;
        }

        const acceptedInvite = firstRow<AcceptedCustomerInvite>(data);

        if (!acceptedInvite?.company_id || !acceptedInvite.property_id) {
            setMessage('Customer invite accepted, but HomeOS could not confirm the provider connection. Refresh HomeOS and try again.');
            return;
        }

        setInvites((currentInvites) =>
            currentInvites.filter((currentInvite) => currentInvite.invitation_id !== invite.invitation_id)
        );
        setMessage(`${invite.company_name || 'The company'} is now connected to your HomeOS home. Opening Connections...`);
        await onAccepted?.();
        setTimeout(() => router.replace('/connections' as never), 900);
    }

    function goCreateHome(invite: PendingCustomerInvite) {
        const nextRoute = invite.invite_code ? `/customer-invite?code=${encodeURIComponent(invite.invite_code)}` : '/';
        router.push(`/onboarding/create-home?next=${encodeURIComponent(nextRoute)}` as never);
    }

    if (loading) {
        return showSetupMessage ? (
            <ThemedCard style={compact ? compactCardStyle : undefined}>
                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Checking customer invitations...</Text>
            </ThemedCard>
        ) : null;
    }

    if (backendMissing && !showSetupMessage) return null;
    if (!backendMissing && invites.length === 0 && !message) return null;

    if (backendMissing) {
        return (
            <ThemedCard style={compact ? compactCardStyle : undefined}>
                <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Customer Invites</Text>
                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                    In-app customer invite detection needs the review SQL proposal before it can show pending invites here.
                </Text>
            </ThemedCard>
        );
    }

    if (invites.length === 0) {
        return null;
    }

    return (
        <ThemedCard style={compact ? compactCardStyle : undefined}>
            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Pending Customer Invite</Text>
            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                Checking invites for {signedInEmail || 'this account'}.
            </Text>

            <View style={inviteListStyle}>
                {invites.map((invite) => {
                    const selectedHomeId = selectedHomeByInviteId[invite.invitation_id] || '';
                    const accepting = acceptingInviteId === invite.invitation_id;

                    return (
                        <View
                            key={invite.invitation_id}
                            style={[
                                inviteBoxStyle,
                                {
                                    backgroundColor: theme.colors.background,
                                    borderColor: theme.colors.border,
                                },
                            ]}
                        >
                            <Text style={[cardTitleStyle, { color: theme.colors.text }]}>
                                {invite.company_name || 'Company'}
                            </Text>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                {invite.company_name || 'A company'} invited you to connect your home.
                            </Text>
                            {!!invite.invited_name && (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Invited customer: {invite.invited_name}
                                </Text>
                            )}
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                Expires: {formatDate(invite.expires_at)}
                            </Text>

                            {homes.length === 0 ? (
                                <ThemedButton
                                    title="Create Home"
                                    variant="secondary"
                                    onPress={() => goCreateHome(invite)}
                                    style={{ marginTop: 12 }}
                                />
                            ) : homes.length === 1 ? (
                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                    Home selected: {homes[0].name || formatAddress(homes[0]) || 'Home'}
                                </Text>
                            ) : (
                                <View style={homePickerStyle}>
                                    {homes.map((home) => {
                                        const selected = selectedHomeId === home.id;

                                        return (
                                            <Pressable
                                                key={home.id}
                                                onPress={() =>
                                                    setSelectedHomeByInviteId((current) => ({
                                                        ...current,
                                                        [invite.invitation_id]: home.id,
                                                    }))
                                                }
                                                style={[
                                                    homeOptionStyle,
                                                    {
                                                        backgroundColor: selected ? theme.colors.secondaryButton : theme.colors.surface,
                                                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                                                    },
                                                ]}
                                            >
                                                <Text style={[homeNameStyle, { color: theme.colors.text }]}>
                                                    {home.name || 'Home'}
                                                </Text>
                                                <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                                    {formatAddress(home) || 'Address not available'}
                                                </Text>
                                            </Pressable>
                                        );
                                    })}
                                </View>
                            )}

                            <ThemedButton
                                title={accepting ? 'Accepting...' : 'Accept Invite'}
                                onPress={() => acceptInvite(invite)}
                                disabled={accepting || (homes.length > 0 && !selectedHomeId)}
                                style={{ marginTop: 12 }}
                            />
                        </View>
                    );
                })}
            </View>

            {!!message && (
                <Text style={[bodyTextStyle, { color: theme.colors.mutedText, marginTop: 12 }]}>
                    {message}
                </Text>
            )}
        </ThemedCard>
    );
}

function firstRow<T>(data: unknown): T | null {
    if (Array.isArray(data)) return (data[0] as T | undefined) || null;
    return (data as T | null) || null;
}

function formatAddress(property?: HomeOption) {
    if (!property) return '';

    const street = property.address || property.address_line_1;
    const postalCode = property.zip || property.postal_code;

    return [street, property.city, property.state, postalCode].filter(Boolean).join(', ');
}

function formatDate(value?: string | null) {
    if (!value) return 'Not available';

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
}

const compactCardStyle = {
    marginBottom: 18,
};

const sectionTitleStyle = {
    fontSize: 20,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const cardTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    marginBottom: 6,
};

const bodyTextStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
};

const metaTextStyle = {
    fontSize: 13,
    fontWeight: '800' as const,
    lineHeight: 19,
    marginTop: 5,
};

const inviteListStyle = {
    gap: 12,
    marginTop: 14,
};

const inviteBoxStyle = {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
};

const homePickerStyle = {
    gap: 8,
    marginTop: 10,
};

const homeOptionStyle = {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
};

const homeNameStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};
