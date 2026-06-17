import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

type PropertyMembership = {
    property_id: string;
};

type PropertyRecord = {
    id: string;
    name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
};

type GeneratedConnectionCode = {
    code_id: string;
    plain_code: string;
    code_last4: string;
    expires_at: string;
    can_view_documents: boolean;
    can_view_photos: boolean;
    can_view_service_history: boolean;
    can_view_quotes: boolean;
};

export default function CreateConnectionCodeScreen() {
    const { theme } = useTheme();
    const [properties, setProperties] = useState<PropertyRecord[]>([]);
    const [selectedPropertyId, setSelectedPropertyId] = useState('');
    const [canViewDocuments, setCanViewDocuments] = useState(false);
    const [canViewPhotos, setCanViewPhotos] = useState(true);
    const [canViewServiceHistory, setCanViewServiceHistory] = useState(false);
    const [canViewQuotes, setCanViewQuotes] = useState(false);
    const [generatedCode, setGeneratedCode] = useState<GeneratedConnectionCode | null>(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadProperties();
    }, []);

    const selectedProperty = useMemo(
        () => properties.find((property) => property.id === selectedPropertyId) || null,
        [properties, selectedPropertyId]
    );

    async function loadProperties() {
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

        const { data: memberships, error: membershipError } = await supabase
            .from('property_memberships')
            .select('property_id')
            .eq('user_id', user.id)
            .eq('status', 'active');

        if (membershipError) {
            setLoading(false);
            setMessage(`Could not load home memberships: ${membershipError.message}`);
            return;
        }

        const propertyIds = ((memberships || []) as PropertyMembership[])
            .map((membership) => membership.property_id)
            .filter(Boolean);

        if (propertyIds.length === 0) {
            setProperties([]);
            setSelectedPropertyId('');
            setLoading(false);
            return;
        }

        const { data: propertyRows, error: propertyError } = await supabase
            .from('properties')
            .select('id, name, address, city, state, zip')
            .in('id', propertyIds)
            .order('created_at', { ascending: false });

        if (propertyError) {
            setLoading(false);
            setMessage(`Could not load properties: ${propertyError.message}`);
            return;
        }

        const loadedProperties = (propertyRows || []) as PropertyRecord[];
        setProperties(loadedProperties);
        setSelectedPropertyId(loadedProperties[0]?.id || '');
        setLoading(false);
    }

    async function generateCode() {
        if (!selectedPropertyId) {
            setMessage('Select a property first.');
            return;
        }

        setCreating(true);
        setMessage('Generating code...');
        setGeneratedCode(null);

        const { data, error } = await supabase.rpc('generate_connection_code', {
            p_property_id: selectedPropertyId,
            p_can_view_documents: canViewDocuments,
            p_can_view_photos: canViewPhotos,
            p_can_view_service_history: canViewServiceHistory,
            p_can_view_quotes: canViewQuotes,
            p_expires_in_hours: 24,
        });

        setCreating(false);

        if (error) {
            setMessage(`Could not generate code: ${error.message}`);
            return;
        }

        const result = Array.isArray(data) ? data[0] : data;

        if (!result) {
            setMessage('Code generation returned no result.');
            return;
        }

        setGeneratedCode(result as GeneratedConnectionCode);
        setMessage('Connection code generated.');
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 40, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={[backTextStyle, { color: theme.colors.text }]} onPress={() => router.back()}>
                    Back
                </Text>

                <Text style={[titleStyle, { color: theme.colors.text }]}>Create Connection Code</Text>
                <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                    Generate a server-created code for a company. The plain code is shown once and expires in 24 hours.
                </Text>

                {generatedCode && (
                    <ThemedCard style={{ marginBottom: 24 }}>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Code Ready</Text>
                        <Text style={[codeTextStyle, { color: theme.colors.text }]}>
                            {generatedCode.plain_code}
                        </Text>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Last 4: {generatedCode.code_last4}
                        </Text>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Expires: {formatDateTime(generatedCode.expires_at)}
                        </Text>
                        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                            Property: {selectedProperty?.name || 'Property'}
                        </Text>
                        <View style={summaryListStyle}>
                            <PermissionSummary
                                label="Photos"
                                enabled={generatedCode.can_view_photos}
                            />
                            <PermissionSummary
                                label="Documents"
                                enabled={generatedCode.can_view_documents}
                            />
                            <PermissionSummary
                                label="Service History"
                                enabled={generatedCode.can_view_service_history}
                            />
                            <PermissionSummary
                                label="Quotes"
                                enabled={generatedCode.can_view_quotes}
                            />
                        </View>
                        <Text style={[helperTextStyle, { color: theme.colors.mutedText, marginTop: 14, marginBottom: 0 }]}>
                            This plain code is only returned when it is created.
                        </Text>
                    </ThemedCard>
                )}

                {loading ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>Loading properties...</Text>
                    </ThemedCard>
                ) : properties.length === 0 ? (
                    <ThemedCard>
                        <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>No Properties</Text>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                            Active homeowner property memberships are required before a connection code can be created.
                        </Text>
                    </ThemedCard>
                ) : (
                    <>
                        <ThemedCard style={{ marginBottom: 22 }}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Property</Text>
                            <Text style={[helperTextStyle, { color: theme.colors.mutedText }]}>
                                Choose which home record this company code will connect to.
                            </Text>

                            <View style={cardListStyle}>
                                {properties.map((property) => {
                                    const selected = property.id === selectedPropertyId;

                                    return (
                                        <TouchableOpacity
                                            key={property.id}
                                            onPress={() => setSelectedPropertyId(property.id)}
                                            activeOpacity={0.82}
                                            style={{
                                                ...propertyCardStyle,
                                                backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceAlt,
                                                borderColor: selected ? theme.colors.primary : theme.colors.border,
                                                borderRadius: theme.radii.card,
                                            }}
                                        >
                                            <Text
                                                style={{
                                                    color: selected ? theme.colors.primaryText : theme.colors.text,
                                                    fontSize: 18,
                                                    fontWeight: '900',
                                                }}
                                            >
                                                {property.name || 'Property'}
                                            </Text>
                                            <Text
                                                style={{
                                                    color: selected ? theme.colors.primaryText : theme.colors.mutedText,
                                                    fontSize: 14,
                                                    lineHeight: 20,
                                                    marginTop: 6,
                                                }}
                                            >
                                                {formatAddress(property) || 'No address'}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </ThemedCard>

                        <ThemedCard style={{ marginBottom: 22 }}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Permissions</Text>
                            <Text style={[helperTextStyle, { color: theme.colors.mutedText }]}>
                                Choose what the company will be allowed to see after later connection approval.
                            </Text>

                            <PermissionToggle
                                label="Photos"
                                detail="Share home and service photos."
                                enabled={canViewPhotos}
                                onToggle={() => setCanViewPhotos((value) => !value)}
                            />
                            <PermissionToggle
                                label="Documents"
                                detail="Share manuals, warranties, and records."
                                enabled={canViewDocuments}
                                onToggle={() => setCanViewDocuments((value) => !value)}
                            />
                            <PermissionToggle
                                label="Service History"
                                detail="Share maintenance and repair history."
                                enabled={canViewServiceHistory}
                                onToggle={() => setCanViewServiceHistory((value) => !value)}
                            />
                            <PermissionToggle
                                label="Quotes"
                                detail="Share proposals and estimate history."
                                enabled={canViewQuotes}
                                onToggle={() => setCanViewQuotes((value) => !value)}
                            />
                        </ThemedCard>

                        <ThemedCard style={{ marginBottom: 22 }}>
                            <Text style={[sectionTitleStyle, { color: theme.colors.text }]}>Expiration</Text>
                            <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                                Codes currently expire 24 hours after creation.
                            </Text>
                        </ThemedCard>

                        <ThemedButton
                            title={creating ? 'Generating...' : 'Generate Connection Code'}
                            onPress={generateCode}
                            disabled={creating}
                        />
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

function PermissionToggle({
    label,
    detail,
    enabled,
    onToggle,
}: {
    label: string;
    detail: string;
    enabled: boolean;
    onToggle: () => void;
}) {
    const { theme } = useTheme();

    return (
        <TouchableOpacity
            onPress={onToggle}
            activeOpacity={0.82}
            style={[
                permissionRowStyle,
                {
                    backgroundColor: enabled ? theme.colors.surfaceAlt : theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radii.card,
                },
            ]}
        >
            <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontSize: 17, fontWeight: '900' }}>
                    {label}
                </Text>
                <Text style={{ color: theme.colors.mutedText, fontSize: 14, lineHeight: 20, marginTop: 4 }}>
                    {detail}
                </Text>
            </View>
            <View
                style={{
                    backgroundColor: enabled ? theme.colors.primary : theme.colors.surfaceAlt,
                    borderRadius: theme.radii.pill,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    minWidth: 84,
                    alignItems: 'center',
                }}
            >
                <Text
                    style={{
                        color: enabled ? theme.colors.primaryText : theme.colors.mutedText,
                        fontWeight: '900',
                    }}
                >
                    {enabled ? 'Shared' : 'Private'}
                </Text>
            </View>
        </TouchableOpacity>
    );
}

function PermissionSummary({ label, enabled }: { label: string; enabled: boolean }) {
    const { theme } = useTheme();

    return (
        <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
            {label}: {enabled ? 'Shared' : 'Private'}
        </Text>
    );
}

function formatAddress(property?: PropertyRecord | null) {
    if (!property) return '';

    return [property.address, property.city, property.state, property.zip]
        .filter(Boolean)
        .join(', ');
}

function formatDateTime(value: string) {
    return new Date(value).toLocaleString();
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

const helperTextStyle = {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800' as const,
    marginBottom: 16,
};

const codeTextStyle = {
    fontSize: 28,
    fontWeight: '900' as const,
    letterSpacing: 1.2,
    marginTop: 8,
};

const metaTextStyle = {
    fontSize: 14,
    fontWeight: '800' as const,
    lineHeight: 20,
    marginTop: 6,
};

const cardListStyle = {
    gap: 12,
};

const propertyCardStyle = {
    padding: 18,
    borderWidth: 1,
};

const permissionRowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
};

const summaryListStyle = {
    marginTop: 12,
};
