import AdminNavBar from '@/components/AdminNavBar';
import ServiceRequestMediaGallery from '@/components/serviceRequests/ServiceRequestMediaGallery';
import ThemedButton from '@/components/theme/ThemedButton';
import ThemedCard from '@/components/theme/ThemedCard';
import { intakeReasonLabel, type CustomerIntake } from '@/lib/customerCallIntake';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/useTheme';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';

type Lead = Pick<CustomerIntake, 'id' | 'company_id' | 'customer_kind' | 'service_reason' | 'urgency' | 'customer_summary' | 'address_hint' | 'previous_work_reference' | 'service_request_id' | 'invited_name' | 'invited_phone' | 'invited_email' | 'confirmed_contact' | 'office_note' | 'invitation_status' | 'started_at' | 'contact_confirmed_at' | 'submitted_at' | 'media_completed_at'> & {
    display_code: string | null; request_status: string | null; property_name: string | null;
    service_address: string | null; customer_issue: string | null; customer_location: string | null;
    cancelled_at: string | null; can_close: boolean;
};

export default function DispatchIntakeScreen() {
    const params = useLocalSearchParams<{ companyId?: string; intakeId?: string }>();
    const companyId = typeof params.companyId === 'string' ? params.companyId : '';
    const intakeId = typeof params.intakeId === 'string' ? params.intakeId : '';
    return <LeadDetail key={`${companyId}:${intakeId}`} companyId={companyId} intakeId={intakeId} />;
}

function LeadDetail({ companyId, intakeId }: { companyId: string; intakeId: string }) {
    const { theme } = useTheme();
    const [lead, setLead] = useState<Lead | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [revision, setRevision] = useState(0);
    const [confirmClose, setConfirmClose] = useState(false);
    const [closing, setClosing] = useState(false);
    const dispatchRoute = `/dispatch?companyId=${encodeURIComponent(companyId)}` as const;
    const text = { color: theme.colors.text, fontSize: 16, lineHeight: 24 };

    useEffect(() => {
        let current = true;
        let fetching = false;
        async function load() {
            if (fetching) return;
            fetching = true;
            try {
                if (!companyId || !intakeId) throw new Error('Open a lead from your company Dispatch board.');
                const result = await supabase.rpc('get_company_customer_intake', { p_company_id: companyId, p_intake_id: intakeId });
                if (result.error) throw result.error;
                if (!result.data) throw new Error('This lead is not available for this company.');
                if (current) { setLead(result.data as Lead); setError(''); }
            } catch (cause) {
                if (current) { setLead(null); setError(cause instanceof Error ? cause.message : 'This lead could not be loaded. Retry or return to Dispatch.'); }
            } finally { fetching = false; if (current) setLoading(false); }
        }
        void load();
        const timer = setInterval(() => void load(), 10000);
        return () => { current = false; clearInterval(timer); };
    }, [companyId, intakeId, revision]);

    async function closeLead() {
        if (closing || !lead?.can_close) return;
        setClosing(true);
        try {
            const result = await supabase.rpc('cancel_company_customer_intake', { p_intake_id: intakeId });
            if (result.error) throw result.error;
            setConfirmClose(false); setRevision(value => value + 1);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The lead could not be closed. It may already have a service request.');
        } finally { setClosing(false); }
    }

    return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: 18, paddingBottom: 50, alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 1000, gap: 16 }}>
            <AdminNavBar companyId={companyId} backFallback={dispatchRoute} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <ThemedButton title="Back to Dispatch" variant="secondary" onPress={() => router.replace(dispatchRoute)} />
                <ThemedButton title="Refresh lead" variant="secondary" onPress={() => setRevision(value => value + 1)} />
            </View>
            {loading && <ActivityIndicator accessibilityLabel="Loading lead" />}
            {!!error && <Text accessibilityRole="alert" style={{ ...text, color: theme.colors.danger }}>{error}</Text>}
            {lead && <>
                <ThemedCard style={{ gap: 12 }}>
                    <Text style={{ ...text, fontSize: 28, lineHeight: 34, fontWeight: '900' }}>{lead.display_code ? `Job ${lead.display_code}` : 'Pending lead'} · {lead.confirmed_contact?.name || lead.invited_name}</Text>
                    <Text style={text}>Customer: {lead.customer_kind === 'new' ? 'New customer' : 'Existing customer'}</Text>
                    <Text style={text}>Reason: {intakeReasonLabel(lead.service_reason)}</Text>
                    <Text style={text}>Urgency: {lead.urgency === 'emergency' ? 'Emergency' : 'Regular'}</Text>
                    <Text style={{ ...text, fontWeight: '800' }}>{lead.cancelled_at ? 'Closed without service' : lead.submitted_at ? `Request submitted · ${(lead.request_status || '').replaceAll('_', ' ')}` : lead.service_address ? 'Address confirmed · waiting for request details' : lead.contact_confirmed_at ? 'Contact confirmed · waiting for service address' : lead.started_at ? 'Customer is completing details' : 'Waiting for customer to open invitation'}</Text>
                    {!lead.submitted_at && !lead.cancelled_at && <Text style={text}>The job number is assigned when the homeowner submits the request. You can review this lead and contact the customer now.</Text>}
                    {!!lead.invitation_status && ['revoked', 'expired'].includes(lead.invitation_status) && <Text style={text}>Invitation {lead.invitation_status}. The customer needs a fresh invitation to continue.</Text>}
                </ThemedCard>
                <ThemedCard style={{ gap: 10 }}>
                    <Text style={{ ...text, fontSize: 22, fontWeight: '800' }}>Customer and service address</Text>
                    <Text selectable style={text}>Phone: {lead.confirmed_contact?.phone || lead.invited_phone}</Text>
                    <Text selectable style={text}>Email: {lead.confirmed_contact?.email || lead.invited_email}</Text>
                    <Text style={text}>{lead.service_address || (lead.address_hint ? `Office address note (not yet confirmed): ${lead.address_hint}` : 'The customer has not confirmed a service address yet.')}</Text>
                </ThemedCard>
                <ThemedCard style={{ gap: 10 }}>
                    <Text style={{ ...text, fontSize: 22, fontWeight: '800' }}>What needs service</Text>
                    <Text style={text}>{lead.customer_issue || lead.customer_summary || 'No problem details yet.'}</Text>
                    {!!lead.customer_location && <Text style={text}>Location: {lead.customer_location}</Text>}
                    {!!lead.previous_work_reference && <Text style={text}>Previous work: {lead.previous_work_reference}</Text>}
                </ThemedCard>
                {lead.service_request_id ? <ServiceRequestMediaGallery key={`${lead.service_request_id}:${lead.media_completed_at}`} serviceRequestId={lead.service_request_id} title="Request photos and videos" /> : <ThemedCard><Text style={text}>Photos and videos will appear here after the customer submits them with the request.</Text></ThemedCard>}
                {!!lead.office_note && <ThemedCard style={{ gap: 8 }}><Text style={{ ...text, fontWeight: '800' }}>Internal office note</Text><Text style={text}>{lead.office_note}</Text></ThemedCard>}
                {lead.can_close && <ThemedCard style={{ gap: 12 }}>
                    <Text style={text}>Only close this lead if no service is needed. This cancels the intake.</Text>
                    {confirmClose ? <>
                        <ThemedButton title="Keep lead open" disabled={closing} onPress={() => setConfirmClose(false)} />
                        <ThemedButton title={closing ? 'Closing...' : 'Confirm: close without service'} variant="danger" disabled={closing} onPress={() => void closeLead()} />
                    </> : <ThemedButton title="Close call without service" variant="secondary" onPress={() => setConfirmClose(true)} />}
                </ThemedCard>}
            </>}
        </View>
    </ScrollView>;
}
