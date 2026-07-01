import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import AdminNavBar from '../../../../components/AdminNavBar';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/useTheme';

type Homeowner = {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
};

const invitationStatuses = [
    {
        title: 'Pending',
        body: 'Invites waiting for a homeowner to accept will appear here after the invite Edge Function is connected.',
    },
    {
        title: 'Accepted',
        body: 'Accepted invitations will show the homeowner account and first-home setup state.',
    },
    {
        title: 'Revoked',
        body: 'Revoked invitations will stay visible for audit history.',
    },
    {
        title: 'Expired',
        body: 'Expired invitations will be available for resend once server-side invite handling is live.',
    },
];

export default function HomeownersScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();

    const [homeowners, setHomeowners] = useState<Homeowner[]>([]);
    const [inviteFullName, setInviteFullName] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');
    const [invitePhone, setInvitePhone] = useState('');
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('');
    const [inviteMessage, setInviteMessage] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadHomeowners();
    }, [id]);

    async function loadHomeowners() {
        if (!id) return;

        const { data, error } = await supabase
            .from('homeowners')
            .select('*')
            .eq('company_id', String(id))
            .order('created_at', { ascending: false });

        if (error) {
            setMessage(error.message);
            return;
        }

        setHomeowners(data || []);
    }

    function showInviteComingSoon() {
        setInviteMessage(
            'Invite sending requires the server-side Edge Function so HomeOS can create the invitation and send email securely.'
        );
    }

    async function addHomeowner() {
        if (!fullName.trim()) {
            setMessage('Enter homeowner name.');
            return;
        }

        setLoading(true);

        const { error } = await supabase
            .from('homeowners')
            .insert({
                company_id: String(id),
                full_name: fullName.trim(),
                email: email.trim(),
                phone: phone.trim(),
            });

        setLoading(false);

        if (error) {
            setMessage(error.message);
            return;
        }

        setFullName('');
        setEmail('');
        setPhone('');
        setMessage('');

        loadHomeowners();
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
            <View style={{ width: '100%', maxWidth: 900, minWidth: 0 }}>
                <AdminNavBar
                    companyId={String(id || '')}
                    backFallback={`/super-admin/company/${id}` as Href}
                />

                <Text style={[titleStyle, { color: theme.colors.text }]}>Homeowners</Text>

                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Invite homeowners and manage customer records for this company.
                </Text>

                <ThemedCard style={cardSpacingStyle}>
                    <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>Phase 1 shell</Text>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Invite Homeowner</Text>
                    <Text style={[helperTextStyle, { color: theme.colors.mutedText }]}>
                        This captures the invite UI only. Email sending and invitation creation will run through an
                        Edge Function in the next phase.
                    </Text>

                    <ThemedInput
                        label="Full Name"
                        placeholder="Homeowner name"
                        value={inviteFullName}
                        onChangeText={setInviteFullName}
                    />

                    <ThemedInput
                        label="Email"
                        placeholder="homeowner@example.com"
                        value={inviteEmail}
                        onChangeText={setInviteEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />

                    <ThemedInput
                        label="Phone"
                        placeholder="Phone number"
                        value={invitePhone}
                        onChangeText={setInvitePhone}
                        keyboardType="phone-pad"
                    />

                    <ThemedButton
                        title="Invite Sending Coming Soon"
                        onPress={showInviteComingSoon}
                        variant="secondary"
                        style={buttonSpacingStyle}
                    />

                    {!!inviteMessage && (
                        <Text style={[messageTextStyle, { color: theme.colors.mutedText }]}>
                            {inviteMessage}
                        </Text>
                    )}
                </ThemedCard>

                <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>Invitation Status</Text>

                <View style={statusGridStyle}>
                    {invitationStatuses.map((status) => (
                        <ThemedCard key={status.title} style={statusCardStyle}>
                            <Text style={[statusTitleStyle, { color: theme.colors.text }]}>{status.title}</Text>
                            <Text style={[statusBodyStyle, { color: theme.colors.mutedText }]}>
                                {status.body}
                            </Text>
                        </ThemedCard>
                    ))}
                </View>

                <ThemedCard style={cardSpacingStyle}>
                    <Text style={[eyebrowStyle, { color: theme.colors.mutedText }]}>Existing records</Text>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Manual Homeowner Record</Text>
                    <Text style={[helperTextStyle, { color: theme.colors.mutedText }]}>
                        This keeps the current customer-record flow available while invitation sending is built.
                    </Text>

                    <ThemedInput
                        label="Full Name"
                        placeholder="Homeowner name"
                        value={fullName}
                        onChangeText={setFullName}
                    />

                    <ThemedInput
                        label="Email"
                        placeholder="homeowner@example.com"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />

                    <ThemedInput
                        label="Phone"
                        placeholder="Phone number"
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                    />

                    <ThemedButton
                        title={loading ? 'Adding...' : 'Add Homeowner'}
                        onPress={addHomeowner}
                        disabled={loading}
                        style={buttonSpacingStyle}
                    />

                    {!!message && (
                        <Text style={[messageTextStyle, { color: theme.colors.mutedText }]}>
                            {message}
                        </Text>
                    )}
                </ThemedCard>

                <Text style={[sectionHeadingStyle, { color: theme.colors.text }]}>Homeowner List</Text>

                <View style={listStyle}>
                    {homeowners.map((homeowner) => (
                        <ThemedCard key={homeowner.id}>
                            <Text style={[homeownerNameStyle, { color: theme.colors.text }]}>
                                {homeowner.full_name}
                            </Text>

                            <Text style={[homeownerMetaStyle, { color: theme.colors.mutedText }]}>
                                {homeowner.email || 'No email'}
                            </Text>

                            <Text style={[homeownerMetaStyle, { color: theme.colors.mutedText }]}>
                                {homeowner.phone || 'No phone'}
                            </Text>
                        </ThemedCard>
                    ))}

                    {homeowners.length === 0 && (
                        <ThemedCard>
                            <Text style={[helperTextStyle, { color: theme.colors.mutedText, marginBottom: 0 }]}>
                                No homeowners added yet.
                            </Text>
                        </ThemedCard>
                    )}
                </View>
            </View>
        </ScrollView>
    );
}

function ThemedInput({
    label,
    value,
    onChangeText,
    placeholder,
    keyboardType,
    autoCapitalize,
}: {
    label: string;
    value: string;
    onChangeText: (value: string) => void;
    placeholder: string;
    keyboardType?: 'default' | 'email-address' | 'phone-pad';
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
    const { theme } = useTheme();

    return (
        <View style={inputGroupStyle}>
            <Text style={[fieldLabelStyle, { color: theme.colors.text }]}>{label}</Text>
            <TextInput
                placeholder={placeholder}
                placeholderTextColor={theme.colors.mutedText}
                value={value}
                onChangeText={onChangeText}
                keyboardType={keyboardType}
                autoCapitalize={autoCapitalize}
                style={{
                    backgroundColor: theme.colors.surfaceAlt,
                    borderRadius: theme.radii.button,
                    color: theme.colors.text,
                    fontSize: 16,
                    minWidth: 0,
                    paddingHorizontal: 16,
                    paddingVertical: 16,
                }}
            />
        </View>
    );
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

const cardSpacingStyle = {
    marginBottom: 24,
};

const eyebrowStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const sectionTitleStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginTop: 6,
    marginBottom: 10,
};

const helperTextStyle = {
    fontSize: 15,
    fontWeight: '800' as const,
    lineHeight: 22,
    marginBottom: 16,
};

const inputGroupStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    marginBottom: 14,
};

const fieldLabelStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
    marginBottom: 8,
};

const buttonSpacingStyle = {
    marginTop: 4,
};

const messageTextStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 14,
};

const sectionHeadingStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
    marginBottom: 14,
};

const statusGridStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    marginBottom: 24,
};

const statusCardStyle = {
    maxWidth: '100%' as const,
    flexGrow: 1,
    flexBasis: 220,
    flexShrink: 1,
    minWidth: 0,
};

const statusTitleStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
};

const statusBodyStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 8,
};

const listStyle = {
    width: '100%' as const,
    maxWidth: '100%' as const,
    minWidth: 0,
    gap: 12,
};

const homeownerNameStyle = {
    fontSize: 19,
    fontWeight: '900' as const,
    flexShrink: 1,
};

const homeownerMetaStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    marginTop: 6,
};
