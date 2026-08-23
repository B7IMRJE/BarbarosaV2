import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import { loadCurrentCompanyPermissionAccess } from '../../lib/companyPermissions';
import { supabase } from '../../lib/supabase';

type Metrics = {
    activeReminders: number;
    dueSoon: number;
    completedRecently: number;
    estimateDrafts: number;
    presentedEstimates: number;
};

const EMPTY: Metrics = {
    activeReminders: 0,
    dueSoon: 0,
    completedRecently: 0,
    estimateDrafts: 0,
    presentedEstimates: 0,
};

function countRows(value: unknown) {
    return Array.isArray(value) ? value.length : 0;
}

export default function CompanyAnalyticsScreen() {
    const { id } = useLocalSearchParams<{ id?: string | string[] }>();
    const companyId = Array.isArray(id) ? id[0] : id;
    const { width } = useWindowDimensions();
    const [metrics, setMetrics] = useState<Metrics>(EMPTY);
    const [message, setMessage] = useState('Loading current metrics...');
    const [allowed, setAllowed] = useState(false);

    useEffect(() => {
        if (!companyId) return;
        void loadMetrics(companyId);
    }, [companyId]);

    async function loadMetrics(activeCompanyId: string) {
        const [userManagement, profileManagement] = await Promise.all([
            loadCurrentCompanyPermissionAccess('can_manage_company_users', { companyId: activeCompanyId }),
            loadCurrentCompanyPermissionAccess('can_manage_company_profile', { companyId: activeCompanyId }),
        ]);
        const canView = Boolean(userManagement.access || profileManagement.access);
        setAllowed(canView);
        if (!canView) {
            setMessage('Analytics is limited to company management.');
            return;
        }

        const today = new Date();
        const soon = new Date(today);
        soon.setDate(today.getDate() + 30);
        const recent = new Date(today);
        recent.setDate(today.getDate() - 30);

        const [estimates, reminders, completions] = await Promise.all([
            supabase.from('company_estimate_option_sessions').select('status').eq('company_id', activeCompanyId),
            supabase.from('home_item_maintenance_tasks').select('id, next_due_date, reminder_status').eq('reminder_status', 'active').lte('next_due_date', soon.toISOString().slice(0, 10)),
            supabase.from('home_item_maintenance_completions').select('id').gte('completed_on', recent.toISOString().slice(0, 10)),
        ]);

        const estimateRows = Array.isArray(estimates.data) ? estimates.data : [];
        setMetrics({
            activeReminders: countRows(reminders.data),
            dueSoon: countRows((reminders.data || []).filter((row: any) => row.next_due_date >= today.toISOString().slice(0, 10))),
            completedRecently: countRows(completions.data),
            estimateDrafts: estimateRows.filter((row: any) => row.status === 'draft').length,
            presentedEstimates: estimateRows.filter((row: any) => row.status === 'presented').length,
        });
        setMessage('Current operational metrics. Campaign attribution will appear once reminder-to-sale tracking is enabled.');
    }

    const cards = [
        ['Active reminders', metrics.activeReminders],
        ['Due in 30 days', metrics.dueSoon],
        ['Completed in 30 days', metrics.completedRecently],
        ['Estimate drafts', metrics.estimateDrafts],
        ['Presented estimates', metrics.presentedEstimates],
    ];

    return (
        <ScrollView style={{ flex: 1, backgroundColor: '#F3F6FA' }} contentContainerStyle={{ padding: width <= 640 ? 16 : 24, paddingBottom: 48 }}>
            <View style={{ width: '100%', maxWidth: 1000, alignSelf: 'center' }}>
                <AdminNavBar showBack />
                <Text style={{ color: '#637083', fontSize: 15, fontWeight: '700', marginTop: 22 }}>Management analytics</Text>
                <Text style={{ color: '#071B33', fontSize: width <= 640 ? 30 : 38, fontWeight: '900', marginTop: 6 }}>Analytics</Text>
                <Text style={{ color: '#637083', fontSize: 16, lineHeight: 24, marginTop: 10, marginBottom: 22 }}>
                    A secure starting point for understanding maintenance demand and estimate activity.
                </Text>
                {!allowed ? <Text style={{ color: '#B42318', fontWeight: '800' }}>{message}</Text> : null}
                {allowed ? (
                    <>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                            {cards.map(([label, value]) => (
                                <View key={String(label)} style={{ width: width <= 640 ? '100%' : '31%', minWidth: 170, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E3E8EF' }}>
                                    <Text style={{ color: '#637083', fontWeight: '700' }}>{label}</Text>
                                    <Text style={{ color: '#071B33', fontWeight: '900', fontSize: 32, marginTop: 8 }}>{value}</Text>
                                </View>
                            ))}
                        </View>
                        <View style={{ backgroundColor: '#E7F7F5', borderRadius: 18, padding: 18, marginTop: 20 }}>
                            <Text style={{ color: '#075E68', fontWeight: '900', fontSize: 16 }}>Next analytics layer</Text>
                            <Text style={{ color: '#24545A', lineHeight: 22, marginTop: 6 }}>{message}</Text>
                        </View>
                    </>
                ) : null}
            </View>
        </ScrollView>
    );
}
