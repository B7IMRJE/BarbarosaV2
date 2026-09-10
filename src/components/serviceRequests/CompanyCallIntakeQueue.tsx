import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { intakeProgressLabel, intakeReasonLabel, type CustomerIntake } from '../../lib/customerCallIntake';
import { useTheme } from '../../theme/useTheme';
import ThemedCard from '../theme/ThemedCard';
import ThemedButton from '../theme/ThemedButton';

export function useCompanyCallIntakes(companyId: string | null) {
    const [calls, setCalls] = useState<CustomerIntake[]>([]);
    const [error, setError] = useState('');
    const [version, setVersion] = useState(0);
    useEffect(() => {
        let current = true; let loading = false;
        setCalls([]); setError('');
        if (!companyId) return;
        async function load() {
            if (loading) return;
            loading = true;
            try {
                const result = await supabase.rpc('get_company_customer_intakes', { p_company_id: companyId });
                if (result.error) throw result.error;
                if (current) { setCalls(result.data || []); setError(''); }
            } catch { if (current) setError('Call intake could not refresh. Try Refresh.'); }
            finally { loading = false; }
        }
        void load();
        const timer = setInterval(() => void load(), 10000);
        return () => { current = false; clearInterval(timer); };
    }, [companyId, version]);
    return { calls, error, refresh: () => setVersion(value => value + 1) };
}
export function PendingCallCard({ call, compact = false }: { call: CustomerIntake; compact?: boolean }) {
    const { theme } = useTheme();
    const text = { color: compact ? '#FFFFFF' : theme.colors.text, fontSize: compact ? 14 : 16, lineHeight: compact ? 19 : 23 };
    return <View style={{ padding: 12, borderWidth: 1, borderColor: call.urgency === 'emergency' ? '#EF4444' : theme.colors.border, backgroundColor: compact ? '#153B4D' : theme.colors.surface, borderRadius: 12, gap: 6 }}>
        <Text style={{ ...text, fontWeight: '900' }}>Pending lead · {call.confirmed_contact?.name || call.invited_name}</Text>
        <Text style={text}>{call.customer_kind === 'existing' ? 'Existing customer' : 'New customer'} · {intakeReasonLabel(call.service_reason)} · {call.urgency === 'emergency' ? 'Emergency' : 'Regular'}</Text>
        <Text style={text}>{intakeProgressLabel(call)}</Text>
        {!!call.address_hint && <Text style={text}>{call.address_hint}</Text>}
        {!!call.customer_summary && <Text numberOfLines={compact ? 2 : undefined} style={text}>{call.customer_summary}</Text>}
        <ThemedButton title="Open lead" onPress={() => router.push({ pathname: '/dispatch/intake', params: { companyId: call.company_id, intakeId: call.id } } as never)} />
        {!compact && <>
            <Text selectable style={text}>Phone: {call.confirmed_contact?.phone || call.invited_phone} · Email: {call.confirmed_contact?.email || call.invited_email}</Text>
            {call.confirmed_contact && (call.confirmed_contact.email !== call.invited_email || call.confirmed_contact.phone !== call.invited_phone) ? <Text style={text}>Customer corrected contact details. Review before contacting them.</Text> : null}
            {!!call.previous_work_reference && <Text style={text}>Previous work: {call.previous_work_reference}</Text>}
            {!!call.office_note && <Text style={text}>Internal office note: {call.office_note}</Text>}
            {['expired', 'revoked'].includes(call.invitation_status || '') && <Text style={text}>Invitation {call.invitation_status}. Contact the customer and provide a fresh invitation if needed.</Text>}
            <Text style={text}>The office can contact the caller now. Scheduling becomes available when their address and request are confirmed.</Text>
        </>}
    </View>;
}
export default function CompanyCallIntakeQueue({ companyId }: { companyId: string }) {
    const { theme } = useTheme();
    const { calls, error, refresh } = useCompanyCallIntakes(companyId);
    if (!calls.length && !error) return null;
    return <ThemedCard style={{ gap: 12, marginBottom: 16 }}>
        <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '900' }}>Call intake · waiting for customer details</Text>
        <ThemedButton title="Refresh call intake" variant="secondary" onPress={refresh} />
        {!!error && <Text style={{ color: theme.colors.danger }}>{error}</Text>}
        {(['emergency','regular'] as const).map(urgency => {
            const group = calls.filter(call => call.urgency === urgency);
            return group.length ? <View key={urgency} style={{ gap: 10 }}><Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '800' }}>{urgency === 'emergency' ? 'Emergency Leads' : 'Regular Leads'} · {group.length}</Text>{group.map(call => <PendingCallCard key={call.id} call={call} />)}</View> : null;
        })}
    </ThemedCard>;
}
