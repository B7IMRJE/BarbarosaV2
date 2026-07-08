import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import AdminNavBar from '../../../../components/AdminNavBar';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import {
    getCompanyAuditLogs,
    type CompanyAuditLog,
} from '../../../../lib/companyAuditLogs';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/useTheme';

type CompanySummary = {
    id: string;
    name: string | null;
    public_name: string | null;
    dba_name: string | null;
};

export default function CompanyAuditLogScreen() {
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const companyId = normalizeRouteParam(id);
    const { theme } = useTheme();
    const [company, setCompany] = useState<CompanySummary | null>(null);
    const [logs, setLogs] = useState<CompanyAuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    useEffect(() => {
        void loadAuditLog();
    }, [companyId]);

    async function loadAuditLog() {
        if (!companyId) {
            setLoading(false);
            setMessage('Missing company id.');
            return;
        }

        setLoading(true);
        setMessage('Loading audit log...');

        try {
            const [companyResult, logRows] = await Promise.all([
                supabase
                    .from('companies')
                    .select('id, name, public_name, dba_name')
                    .eq('id', companyId)
                    .maybeSingle(),
                getCompanyAuditLogs(companyId),
            ]);

            if (companyResult.error) {
                setMessage(`Company loaded with audit warning: ${companyResult.error.message}`);
            } else {
                setMessage('');
            }

            setCompany(normalizeCompanySummary(companyResult.data));
            setLogs(logRows);
        } catch (error) {
            setLogs([]);
            setMessage(`Audit log unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    }

    const companyName = company?.public_name || company?.dba_name || company?.name || 'Company';

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, paddingBottom: 44, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 980 }}>
                <AdminNavBar
                    companyId={companyId}
                    backFallback={companyId ? (`/super-admin/company/${companyId}` as Href) : '/super-admin'}
                />

                <ThemedCard style={{ marginBottom: 16 }}>
                    <Text style={[kickerStyle, { color: theme.colors.primary }]}>ManagementOS</Text>
                    <Text style={[titleStyle, { color: theme.colors.text }]}>Activity / Audit Log</Text>
                    <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>
                        {companyName} actions are listed newest first. Only owner, admin, manager, and platform admin access can view this log.
                    </Text>
                    <View style={buttonRowStyle}>
                        <ThemedButton title={loading ? 'Refreshing...' : 'Refresh'} onPress={loadAuditLog} style={buttonStyle} />
                        <ThemedButton
                            title="Company Dashboard"
                            variant="secondary"
                            onPress={() => {
                                if (companyId) {
                                    router.push(`/super-admin/company/${companyId}` as Href);
                                }
                            }}
                            style={buttonStyle}
                        />
                    </View>
                </ThemedCard>

                {!!message && (
                    <ThemedCard style={{ marginBottom: 16 }}>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>{message}</Text>
                    </ThemedCard>
                )}

                {!loading && logs.length === 0 ? (
                    <ThemedCard>
                        <Text style={[bodyTextStyle, { color: theme.colors.mutedText }]}>No audit events yet.</Text>
                    </ThemedCard>
                ) : null}

                {logs.map((log) => (
                    <ThemedCard key={log.id} style={{ marginBottom: 12 }}>
                        <TouchableOpacity
                            activeOpacity={0.84}
                            onPress={() => setExpandedLogId((current) => (current === log.id ? null : log.id))}
                        >
                            <View style={logHeaderStyle}>
                                <View style={{ flex: 1, minWidth: 220 }}>
                                    <Text style={[logActionStyle, { color: theme.colors.text }]}>{formatAction(log.action)}</Text>
                                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                        {log.target_label || formatTarget(log)}
                                    </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end', minWidth: 180 }}>
                                    <Text style={[metaTextStyle, { color: theme.colors.text }]}>{log.actor_email || shortId(log.actor_user_id)}</Text>
                                    <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>{formatDateTime(log.created_at)}</Text>
                                </View>
                            </View>
                            <Text style={[metaTextStyle, { color: theme.colors.mutedText }]}>
                                Role: {log.actor_role || 'platform/admin override'} / Target: {formatTarget(log)}
                            </Text>
                        </TouchableOpacity>

                        {expandedLogId === log.id && (
                            <View style={[detailsBoxStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                                <DetailLine label="Audit id" value={log.id} />
                                <DetailLine label="Actor user" value={shortId(log.actor_user_id)} />
                                <DetailLine label="Company user" value={log.actor_company_user_id ? shortId(log.actor_company_user_id) : 'none'} />
                                <DetailLine label="Before" value={compactJson(log.before_data)} />
                                <DetailLine label="After" value={compactJson(log.after_data)} />
                                <DetailLine label="Metadata" value={compactJson(log.metadata)} />
                            </View>
                        )}
                    </ThemedCard>
                ))}
            </View>
        </ScrollView>
    );
}

function DetailLine({ label, value }: { label: string; value: string }) {
    const { theme } = useTheme();

    return (
        <View style={{ marginBottom: 8 }}>
            <Text style={[detailLabelStyle, { color: theme.colors.mutedText }]}>{label}</Text>
            <Text style={[detailValueStyle, { color: theme.colors.text }]}>{value}</Text>
        </View>
    );
}

function normalizeRouteParam(value?: string | string[] | null) {
    const text = Array.isArray(value) ? value[0] || '' : value || '';

    return text.trim();
}

function normalizeCompanySummary(value: unknown): CompanySummary | null {
    if (!value || typeof value !== 'object') return null;

    const record = value as Record<string, unknown>;
    const id = readString(record.id);

    if (!id) return null;

    return {
        id,
        name: readOptionalString(record.name),
        public_name: readOptionalString(record.public_name),
        dba_name: readOptionalString(record.dba_name),
    };
}

function formatAction(action: string) {
    return action
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTarget(log: CompanyAuditLog) {
    const target = formatAction(log.target_type);
    const id = log.target_id ? ` ${shortId(log.target_id)}` : '';

    return `${target}${id}`;
}

function formatDateTime(value: string | null) {
    if (!value) return 'Unknown time';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function compactJson(value: unknown) {
    if (!value) return 'none';

    try {
        return JSON.stringify(value);
    } catch {
        return 'unavailable';
    }
}

function shortId(value: string) {
    const text = value.trim();

    return text.length <= 8 ? text : `...${text.slice(-8)}`;
}

function readString(value: unknown) {
    return String(value || '').trim();
}

function readOptionalString(value: unknown) {
    const text = readString(value);

    return text || null;
}

const kickerStyle = {
    fontSize: 13,
    fontWeight: '900' as const,
    letterSpacing: 0,
    textTransform: 'uppercase' as const,
};

const titleStyle = {
    fontSize: 30,
    fontWeight: '900' as const,
    marginTop: 6,
};

const bodyTextStyle = {
    fontSize: 15,
    fontWeight: '700' as const,
    lineHeight: 22,
    marginTop: 8,
};

const metaTextStyle = {
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 18,
};

const buttonRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 10,
    marginTop: 16,
};

const buttonStyle = {
    minWidth: 150,
};

const logHeaderStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 12,
    justifyContent: 'space-between' as const,
};

const logActionStyle = {
    fontSize: 17,
    fontWeight: '900' as const,
};

const detailsBoxStyle = {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
    padding: 12,
};

const detailLabelStyle = {
    fontSize: 11,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
};

const detailValueStyle = {
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 18,
};
