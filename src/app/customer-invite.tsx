import CustomerIntakeStart from '../components/serviceRequests/CustomerIntakeStart';
import { loadCustomerIntake, type CustomerIntake } from '../lib/customerCallIntake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import {
    clearPendingCompanyInviteState,
    replacePendingCompanyInviteFromNextPath,
} from '../lib/companyInviteState';
import {
    isCustomerInviteTerminal,
    isExpiredCustomerInvite,
    normalizeCustomerInviteStatus,
} from '../lib/customerInviteStatus';
import { useHydratedRouteParamsReady } from '../hooks/useHydratedRouteParamsReady';
import { connectCustomerInvitationToHome } from '../lib/customerInvitationConnection';
import { selectActiveProperty } from '../lib/activeProperty';
import { resolveLoggedInUserRoute } from '../lib/onboarding';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

type CustomerInvite = {
    invitation_id: string;
    company_id: string;
    company_name: string | null;
    invited_email: string | null;
    invited_phone: string | null;
    invited_name: string | null;
    note: string | null;
    status: string | null;
    expires_at: string | null;
    created_at: string | null;
};

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

type SessionUser = {
    id: string;
    email?: string | null;
};

const CUSTOMER_INVITE_ROUTE = '/customer-invite';

export default function CustomerInviteScreen() {
    const { theme } = useTheme();
    const params = useLocalSearchParams<{ code?: string | string[] }>();
    const paramsReady = useHydratedRouteParamsReady();
    const connecting = useRef(false);
    const inviteCode = useMemo(() => firstParam(params.code).trim(), [params.code]);
    const [callIntake, setCallIntake] = useState<CustomerIntake | null>(null);
    const [user, setUser] = useState<SessionUser | null>(null);
    const [invite, setInvite] = useState<CustomerInvite | null>(null);
    const [homes, setHomes] = useState<HomeOption[]>([]);
    const [selectedHomeId, setSelectedHomeId] = useState('');
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [redirectingForInvitedEmail, setRedirectingForInvitedEmail] = useState(false);
    const [message, setMessage] = useState('');
    const [success, setSuccess] = useState(false);
    const loadInviteEvent = useEffectEvent(loadInvite);

    const nextPath = `${CUSTOMER_INVITE_ROUTE}?code=${encodeURIComponent(inviteCode)}`;
    const emailMismatch =
        !!user &&
        !!invite?.invited_email &&
        normalizeEmail(invite.invited_email) !== normalizeEmail(user.email);
    const emailMismatchMessage = emailMismatch
        ? `This invitation was sent to ${invite?.invited_email}. You are signed in as ${user?.email || 'this account'}.`
        : '';

    useEffect(() => {
        if (paramsReady) void loadInviteEvent();
    }, [inviteCode, paramsReady]);

    useEffect(() => {
        if (emailMismatch && selectedHomeId) {
            setSelectedHomeId('');
        }
    }, [emailMismatch, selectedHomeId]);

    async function loadInvite() {
        setLoading(true);
        setInvite(null);
        setHomes([]);
        setSelectedHomeId('');
        setSuccess(false);
        setRedirectingForInvitedEmail(false);
        setMessage('');

        const {
            data: { user: currentUser },
        } = await supabase.auth.getUser();

        setUser(currentUser ? { id: currentUser.id, email: currentUser.email } : null);

        if (!inviteCode) {
            setMessage('The company invitation code is missing. Ask the company for a fresh invite link.');
            setLoading(false);
            return;
        }

        const { data, error } = await supabase.rpc('get_customer_invite_by_code', {
            p_invite_code: inviteCode,
        });

        if (error) {
            setMessage(`Could not load company invitation: ${formatHomeownerInviteError(formatMissingBackendError(error.message))}`);
            setLoading(false);
            return;
        }

        const loadedInvite = firstRow<CustomerInvite>(data);

        if (!loadedInvite) {
            clearPendingCompanyInviteState({ inviteCode });
            const unavailableMessage = 'This company invitation link is invalid or no longer available.';

            if (currentUser) {
                const routeDecision = await resolveLoggedInUserRoute(currentUser.id);

                setSuccess(true);
                setMessage(`${unavailableMessage} Opening HomeOS...`);
                setLoading(false);
                setTimeout(() => router.replace(routeDecision.route as never), 700);
                return;
            }

            setMessage(`${unavailableMessage} Sign in normally to continue to HomeOS.`);
            setLoading(false);
            return;
        }

        setInvite(loadedInvite);
        if (currentUser && !isWrongSignedInEmail(currentUser.email, loadedInvite.invited_email)) {
            try {
                const intake = await loadCustomerIntake({ inviteCode });
                if (intake && intake.service_reason !== 'setup') {
                    setCallIntake(intake);
                    setLoading(false);
                    return;
                }
            } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Could not load the service invitation.');
                setLoading(false);
                return;
            }
        }


        if (isInactiveInvite(loadedInvite)) {
            clearPendingCompanyInviteState({ inviteCode });
            const inactiveMessage = statusMessage(loadedInvite.status, loadedInvite.expires_at);

            if (currentUser) {
                const routeDecision = await resolveLoggedInUserRoute(currentUser.id);

                setSuccess(true);
                setMessage(`${inactiveMessage} Opening HomeOS...`);
                setLoading(false);
                setTimeout(() => router.replace(routeDecision.route as never), 700);
                return;
            }

            setMessage(`${inactiveMessage} Sign in normally to continue to HomeOS.`);
            setLoading(false);
            return;
        }

        replacePendingCompanyInviteFromNextPath(nextPath, loadedInvite.invited_email);
        setMessage(statusMessage(loadedInvite.status, loadedInvite.expires_at));

        if (currentUser && isWrongSignedInEmail(currentUser.email, loadedInvite.invited_email)) {
            await continueWithInvitedEmail(loadedInvite.invited_email, true);
            setLoading(false);
            return;
        }

        if (currentUser) {
            const availableHomes = await loadHomes(currentUser.id);
            if (availableHomes?.length === 0) {
                router.replace(`/onboarding/create-home?next=${encodeURIComponent(nextPath)}` as never);
            } else if (availableHomes?.length === 1) {
                setSelectedHomeId(availableHomes[0].id);
                await connectHome(availableHomes[0].id, currentUser, loadedInvite);
            }
        }

        setLoading(false);
    }

    async function loadHomes(userId: string) {
        const { data: memberships, error: membershipError } = await supabase
            .from('property_memberships')
            .select('property_id')
            .eq('user_id', userId)
            .eq('status', 'active');

        if (membershipError) {
            setMessage(`Invite loaded, but your HomeOS homes could not be loaded: ${membershipError.message}`);
            return null;
        }

        const propertyIds = Array.from(
            new Set(((memberships || []) as { property_id?: string | null }[]).map((row) => row.property_id).filter(Boolean))
        ) as string[];

        if (propertyIds.length === 0) {
            setHomes([]);
            return [];
        }

        const { data, error } = await supabase
            .from('properties')
            .select('id, name, address, address_line_1, city, state, zip, postal_code')
            .in('id', propertyIds);

        if (error) {
            setMessage(`Invite loaded, but home details could not be loaded: ${error.message}`);
            return null;
        }

        const loadedHomes = (data || []) as HomeOption[];
        setHomes(loadedHomes);
        return loadedHomes;
    }

    async function switchAccount() {
        if (invite && isInactiveInvite(invite)) {
            clearPendingCompanyInviteState({ inviteCode });
            setMessage('Signing out...');
            await supabase.auth.signOut();
            router.replace('/auth/login' as never);
            return;
        }

        await continueWithInvitedEmail(invite?.invited_email, false);
    }

    async function continueWithInvitedEmail(invitedEmail?: string | null, automatic = false) {
        const cleanInvitedEmail = normalizeEmail(invitedEmail);

        replacePendingCompanyInviteFromNextPath(nextPath, cleanInvitedEmail);
        setRedirectingForInvitedEmail(true);
        setMessage(
            automatic && cleanInvitedEmail
                ? `This invitation was sent to ${cleanInvitedEmail}. We signed out the other account so you can continue with the correct email.`
                : 'Signing out...'
        );
        await supabase.auth.signOut();
        setUser(null);
        setHomes([]);
        setSelectedHomeId('');
        setMessage(cleanInvitedEmail
            ? `Continue with ${cleanInvitedEmail} to connect this home with the service company.`
            : 'Signed out. Sign in or create an account to continue this company invitation.');
        const loginRoute = {
            pathname: '/auth/login',
            params: buildAuthParams(nextPath, cleanInvitedEmail),
        } as never;

        if (automatic) {
            setTimeout(() => router.replace(loginRoute), 900);
            return;
        }

        router.replace(loginRoute);
    }

    async function connectHome(homeId: string, signedInUser: SessionUser, currentInvite: CustomerInvite) {
        if (!inviteCode || !homeId || connecting.current) return;
        if (isWrongSignedInEmail(signedInUser.email, currentInvite.invited_email)) return;
        connecting.current = true;
        setAccepting(true);
        setMessage('Connecting your home to the company that invited you...');
        try {
            const connection = await connectCustomerInvitationToHome(nextPath, homeId);
            await selectActiveProperty(connection.propertyId);

            if (currentInvite.invited_phone) {
                const { data: existingProfile } = await supabase
                    .from('profiles')
                    .select('phone')
                    .eq('id', signedInUser.id)
                    .maybeSingle();
                if (!String(existingProfile?.phone || '').trim()) {
                    await supabase
                        .from('profiles')
                        .update({ phone: currentInvite.invited_phone })
                        .eq('id', signedInUser.id);
                }
            }

            clearPendingCompanyInviteState({ inviteCode });
            setSuccess(true);
            setMessage(`Your home is now connected with ${currentInvite.company_name || 'the service company'}. Opening HomeOS...`);
            setTimeout(() => router.replace('/' as never), 900);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Could not connect the inviting company. Please retry.');
        } finally {
            connecting.current = false;
            setAccepting(false);
        }
    }

    function goToLogin() {
        replacePendingCompanyInviteFromNextPath(nextPath, invite?.invited_email);
        router.push({
            pathname: '/auth/login',
            params: buildAuthParams(nextPath, invite?.invited_email),
        } as never);
    }

    function goToRegister() {
        replacePendingCompanyInviteFromNextPath(nextPath, invite?.invited_email);
        router.push({
            pathname: '/auth/register',
            params: buildAuthParams(nextPath, invite?.invited_email, invite?.invited_phone),
        } as never);
    }

    if (callIntake) return <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 20, alignItems: 'center' }}><View style={{ width: '100%', maxWidth: 800 }}><CustomerIntakeStart key={callIntake.id} initialIntake={callIntake} /></View></ScrollView>;

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 760 }}>
                <HomeHeader />

                <Text style={[titleStyle, { color: theme.colors.text }]}>Company Invitation</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Connect your HomeOS home with a service company.
                </Text>

                {loading ? (
                    <ThemedCard>
                        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginBottom: 16 }} />
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading invitation...</Text>
                    </ThemedCard>
                ) : (
                    <>
                        {!!message && (
                            <ThemedCard style={{ marginBottom: 16 }}>
                                <Text style={[bodyTextStyle, { color: success ? theme.colors.primary : theme.colors.mutedText }]}>
                                    {message}
                                </Text>
                            </ThemedCard>
                        )}

                        <ThemedCard>
                            <View style={sessionBannerStyle}>
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    Signed in as: {user?.email || 'Not signed in'}
                                </Text>
                                {!!user && !!invite && !isInactiveInvite(invite) && (
                                    <ThemedButton
                                        title="Switch Account / Sign Out"
                                        variant="secondary"
                                        onPress={switchAccount}
                                        style={{ marginTop: 10, alignSelf: 'flex-start' }}
                                    />
                                )}
                            </View>

                            {emailMismatch && (
                                <View
                                    style={[
                                        warningBoxStyle,
                                        {
                                            backgroundColor: theme.colors.status.needsAttention.background,
                                            borderColor: theme.colors.status.needsAttention.border,
                                        },
                                    ]}
                                >
                                    <Text style={[bodyTextStyle, { color: theme.colors.text }]}>
                                        {redirectingForInvitedEmail
                                            ? 'Signing out so you can continue with the invited email.'
                                            : `${emailMismatchMessage} Continue with ${invite?.invited_email || 'the invited email'} to connect your home.`}
                                    </Text>
                                    {!redirectingForInvitedEmail && (
                                        <ThemedButton
                                            title={`Continue with ${invite?.invited_email || 'Invited Email'}`}
                                            variant="secondary"
                                            onPress={() => continueWithInvitedEmail(invite?.invited_email, false)}
                                            style={{ marginTop: 12, alignSelf: 'flex-start' }}
                                        />
                                    )}
                                </View>
                            )}

                            {invite ? (
                                <>
                                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>
                                        {invite.company_name || 'Company invite'}
                                    </Text>
                                    <DetailRow label="Company" value={invite.company_name || 'Unavailable'} />
                                    <DetailRow label="Homeowner" value={invite.invited_name || 'Not specified'} />
                                    <DetailRow label="Email" value={invite.invited_email || 'Not specified'} />
                                    <DetailRow label="Phone" value={invite.invited_phone || 'Not specified'} />
                                    <DetailRow label="Status" value={formatLabel(invite.status)} />
                                    <DetailRow label="Expiration" value={formatDate(invite.expires_at)} />
                                </>
                            ) : (
                                <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                    This company invitation link is invalid or no longer available.
                                </Text>
                            )}

                            {!user && (!invite || isInactiveInvite(invite)) ? (
                                <View style={actionGroupStyle}>
                                    <ThemedButton
                                        title="Go to HomeOS Login"
                                        onPress={() => {
                                            clearPendingCompanyInviteState({ inviteCode });
                                            router.replace('/auth/login' as never);
                                        }}
                                    />
                                </View>
                            ) : !user ? (
                                <View style={actionGroupStyle}>
                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                        Sign in or create an account to connect your HomeOS home with this service company.
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
                                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Choose HomeOS Home</Text>
                                    {homes.length === 0 ? (
                                        <>
                                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                                Create your HomeOS home before connecting with this service company.
                                            </Text>
                                            <ThemedButton
                                                title="Create Home"
                                                variant="secondary"
                                                onPress={() =>
                                                    router.push(`/onboarding/create-home?next=${encodeURIComponent(nextPath)}` as never)
                                                }
                                                style={{ marginTop: 12 }}
                                            />
                                        </>
                                    ) : (
                                        <View style={{ gap: 10 }}>
                                            {homes.map((home) => (
                                                <Pressable
                                                    key={home.id}
                                                    disabled={emailMismatch || accepting}
                                                    onPress={() => {
                                                        if (!emailMismatch && user && invite) {
                                                            setSelectedHomeId(home.id);
                                                            void connectHome(home.id, user, invite);
                                                        }
                                                    }}
                                                    style={{
                                                        backgroundColor: theme.colors.background,
                                                        borderColor: selectedHomeId === home.id ? theme.colors.primary : theme.colors.border,
                                                        borderRadius: 14,
                                                        borderWidth: 2,
                                                        opacity: emailMismatch ? 0.6 : 1,
                                                        padding: 14,
                                                    }}
                                                >
                                                    <Text style={[sectionTitleStyle, { color: theme.colors.text, marginBottom: 4 }]}>
                                                        {home.name || 'Home'}
                                                    </Text>
                                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                                        {formatAddress(home) || 'Address not available'}
                                                    </Text>
                                                    <Text style={[bodyTextStyle, { color: selectedHomeId === home.id ? theme.colors.primary : theme.colors.mutedText, marginTop: 6 }]}>
                                                        {emailMismatch
                                                            ? 'Switch accounts to select a home'
                                                            : selectedHomeId === home.id
                                                                ? 'Selected'
                                                                : 'Connect this home'}
                                                    </Text>
                                                </Pressable>
                                            ))}
                                        </View>
                                    )}
                                    {accepting ? (
                                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Connecting your invited company...</Text>
                                    ) : selectedHomeId && user && invite ? (
                                        <ThemedButton title="Retry Company Connection" onPress={() => void connectHome(selectedHomeId, user, invite)} disabled={emailMismatch} />
                                    ) : null}
                                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText, marginTop: 12 }]}>
                                        This connects only basic home/customer information. Photos, documents, and private HomeOS history are not shared here.
                                    </Text>
                                </View>
                            )}
                        </ThemedCard>
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

function firstParam(value?: string | string[]) {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
}

function firstRow<T>(data: unknown): T | null {
    if (Array.isArray(data)) return (data[0] as T | undefined) || null;
    return (data as T | null) || null;
}

function normalizeStatus(value?: string | null) {
    return normalizeCustomerInviteStatus(value);
}

function normalizeEmail(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}

function statusMessage(status?: string | null, expiresAt?: string | null) {
    if (isExpiredDate(expiresAt)) return 'This company invitation expired. Ask the company for a fresh invite link.';

    const normalized = normalizeStatus(status);

    if (normalized === 'pending') return 'This company invitation is ready to accept.';
    if (normalized === 'accepted') return 'This company invitation has already been accepted.';
    if (normalized === 'revoked') return 'This company invitation was revoked. Ask the company for a fresh invite link.';
    if (normalized === 'expired') return 'This company invitation expired. Ask the company for a fresh invite link.';

    return '';
}

function isInactiveInvite(invite: CustomerInvite) {
    return isCustomerInviteTerminal(invite);
}

function isExpiredDate(value?: string | null) {
    return isExpiredCustomerInvite(value);
}

function isWrongSignedInEmail(currentEmail?: string | null, invitedEmail?: string | null) {
    const cleanInvitedEmail = normalizeEmail(invitedEmail);

    return !!cleanInvitedEmail && normalizeEmail(currentEmail) !== cleanInvitedEmail;
}

function buildAuthParams(nextPath: string, invitedEmail?: string | null, invitedPhone?: string | null) {
    const params: Record<string, string> = {
        next: nextPath,
    };
    const cleanInvitedEmail = normalizeEmail(invitedEmail);

    if (cleanInvitedEmail) {
        params.email = cleanInvitedEmail;
    }
    const cleanInvitedPhone = String(invitedPhone || '').trim();
    if (cleanInvitedPhone) params.phone = cleanInvitedPhone;

    return params;
}

function formatMissingBackendError(message: string) {
    const normalized = normalizeStatus(message);

    if (normalized.includes('schema cache') || normalized.includes('function') || normalized.includes('does not exist')) {
        return `${message}. Customer invite backend is not installed yet; review SQL 584.`;
    }

    return message;
}

function formatHomeownerInviteError(message: string) {
    return message
        .replace(/customer invite/gi, 'company invitation')
        .replace(/Customer invite/g, 'Company invitation');
}

function formatLabel(value?: string | null) {
    const normalized = normalizeStatus(value);
    if (!normalized) return 'Unknown';

    return normalized
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function formatDate(value?: string | null) {
    if (!value) return 'Not available';

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleDateString();
}

function formatAddress(property?: HomeOption) {
    if (!property) return '';

    const street = property.address || property.address_line_1;
    const postalCode = property.zip || property.postal_code;

    return [street, property.city, property.state, postalCode].filter(Boolean).join(', ');
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

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
};

const detailRowStyle = {
    borderBottomWidth: 1,
    borderBottomColor: '#D6DEE8',
    paddingVertical: 10,
};

const detailLabelStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    marginBottom: 2,
};

const detailValueStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
};

const actionGroupStyle = {
    marginTop: 18,
    gap: 12,
};

const sessionBannerStyle = {
    borderBottomColor: '#D6DEE8',
    borderBottomWidth: 1,
    marginBottom: 16,
    paddingBottom: 14,
};

const warningBoxStyle = {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16,
    padding: 14,
};

const actionRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
};

const actionButtonStyle = {
    flexBasis: 180,
    flexGrow: 1,
};
