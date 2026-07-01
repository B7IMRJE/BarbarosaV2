import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import AdminNavBar from '../../../../components/AdminNavBar';
import HomeHeader from '../../../../components/HomeHeader';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/useTheme';

type RedemptionResult = {
    connection_id: string;
    property_id: string;
    company_id: string;
    status: string;
};

type PlatformProfile = {
    role?: string | null;
    is_platform_admin?: boolean | null;
};

export default function CompanyRedeemCodeScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [result, setResult] = useState<RedemptionResult | null>(null);

    async function redeemCode() {
        const cleanCode = code.trim().toUpperCase();
        const companyId = id ? String(id) : '';

        if (!cleanCode) {
            setMessage('Enter a connection code.');
            return;
        }

        if (!companyId) {
            setMessage('Missing company id.');
            return;
        }

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            router.replace('/auth/login' as any);
            return;
        }

        const platformAdminCheck = await loadPlatformAdminStatus(user.id);

        if (!platformAdminCheck.isPlatformAdmin) {
            const { data: memberships, error: membershipError } = await supabase
                .from('company_users')
                .select('id')
                .eq('auth_user_id', user.id)
                .eq('company_id', companyId)
                .eq('status', 'active')
                .limit(1);

            if (membershipError) {
                setMessage(`Could not verify company access: ${membershipError.message}`);
                return;
            }

            if (!memberships || memberships.length === 0) {
                setMessage('No active membership found for this company.');
                return;
            }
        }

        setLoading(true);
        setMessage('Redeeming code...');
        setResult(null);

        const { data, error } = await supabase.rpc('redeem_connection_code', {
            p_code: cleanCode,
            p_company_id: companyId,
        });

        setLoading(false);

        if (error) {
            setMessage(`Redeem failed: ${error.message}`);
            return;
        }

        const redeemedRow = Array.isArray(data) ? (data[0] as RedemptionResult | undefined) : (data as RedemptionResult | null);

        if (!redeemedRow) {
            setMessage('Redeem failed: no connection returned.');
            return;
        }

        setCode('');
        setResult(redeemedRow);
        setMessage('Connection code redeemed. A pending connection was created.');
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900, minWidth: 0 }}>
                <HomeHeader />

                <AdminNavBar
                    companyId={String(id || '')}
                    backFallback={`/super-admin/company/${id}/connections` as Href}
                />

                <Text style={[titleStyle, { color: theme.colors.text }]}>Redeem Connection Code</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Enter a homeowner-generated code to create a pending property connection.
                </Text>

                <ThemedCard style={formCardStyle}>
                    <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Connection Code</Text>
                    <TextInput
                        autoCapitalize="characters"
                        autoCorrect={false}
                        placeholder="Enter code"
                        placeholderTextColor={theme.colors.mutedText}
                        value={code}
                        onChangeText={(value) => setCode(value.replace(/\s+/g, '').toUpperCase())}
                        style={[
                            inputStyle,
                            {
                                backgroundColor: theme.colors.background,
                                borderColor: theme.colors.border,
                                color: theme.colors.text,
                            },
                        ]}
                    />

                    <ThemedButton
                        title={loading ? 'Redeeming...' : 'Redeem Code'}
                        onPress={redeemCode}
                        disabled={loading}
                        style={{ marginTop: 8 }}
                    />

                    {!!message && (
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText, marginTop: 16 }]}>
                            {message}
                        </Text>
                    )}
                </ThemedCard>

                {result && (
                    <ThemedCard style={{ marginTop: 24 }}>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Success</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            Status: {result.status}
                        </Text>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Connection ID: {result.connection_id}
                        </Text>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Property ID: {result.property_id}
                        </Text>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Company ID: {result.company_id}
                        </Text>

                        <ThemedButton
                            title="Back to Connections"
                            onPress={() => router.push(`/super-admin/company/${id}/connections` as any)}
                            variant="secondary"
                            style={{ marginTop: 16 }}
                        />
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}

function isPlatformAdminProfile(profile?: PlatformProfile | null) {
    return (
        String(profile?.role || '').trim().toUpperCase() === 'SUPER_ADMIN' ||
        profile?.is_platform_admin === true
    );
}

async function loadPlatformAdminStatus(userId: string) {
    const primaryQuery = await supabase
        .from('profiles')
        .select('role, is_platform_admin')
        .eq('id', userId)
        .limit(1);

    if (!primaryQuery.error) {
        return {
            isPlatformAdmin: isPlatformAdminProfile((primaryQuery.data || [])[0] as PlatformProfile | undefined),
            error: null,
        };
    }

    const fallbackQuery = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .limit(1);

    return {
        isPlatformAdmin: isPlatformAdminProfile((fallbackQuery.data || [])[0] as PlatformProfile | undefined),
        error: fallbackQuery.error,
    };
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
    gap: 14,
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

const metaTextStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 6,
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
