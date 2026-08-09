import DictationTextInput from '@/components/input/DictationTextInput';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import AdminNavBar from '../../components/AdminNavBar';
import {
    loadAnnouncementHistory,
    loadCommunicationDirectory,
    sendPlatformAnnouncement,
    type CommunicationCategory,
    type CommunicationCustomer,
} from '../../lib/platformCommunications';

const categories: { value: CommunicationCategory; label: string; optional: boolean }[] = [
    { value: 'account_security', label: 'Account & security', optional: false },
    { value: 'job_update', label: 'Job update', optional: false },
    { value: 'company_announcement', label: 'Company announcement', optional: true },
    { value: 'product_news', label: 'HomeOS product news', optional: true },
    { value: 'promotion', label: 'Promotion / offer', optional: true },
];

export default function CommunicationsCenter() {
    const [customers, setCustomers] = useState<CommunicationCustomer[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [query, setQuery] = useState('');
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [category, setCategory] = useState<CommunicationCategory>('account_security');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const [directory, audit] = await Promise.all([loadCommunicationDirectory(), loadAnnouncementHistory()]);
            setCustomers(directory);
            setHistory(audit);
        } catch (error) {
            Alert.alert('Communications unavailable', error instanceof Error ? error.message : 'Please try again.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { void load(); }, []);

    const visibleCustomers = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return customers;
        return customers.filter((customer) =>
            [customer.display_name, customer.city, customer.state, customer.masked_email, customer.masked_phone]
                .some((value) => String(value || '').toLowerCase().includes(needle))
        );
    }, [customers, query]);

    function toggleCustomer(userId: string) {
        setSelected((current) => current.includes(userId)
            ? current.filter((id) => id !== userId)
            : [...current, userId]);
    }

    async function reviewAndSend() {
        if (!title.trim() || !body.trim() || selected.length === 0) {
            Alert.alert('Complete the message', 'Add a title, message, and at least one recipient.');
            return;
        }
        Alert.alert(
            'Review recipients',
            `Send “${title.trim()}” to exactly ${selected.length} selected HomeOS customer${selected.length === 1 ? '' : 's'}? Lock-screen push wording will remain neutral.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Send', onPress: () => void send() },
            ]
        );
    }

    async function send() {
        setSending(true);
        try {
            await sendPlatformAnnouncement({
                title: title.trim(), body: body.trim(), category,
                audienceType: selected.length === 1 ? 'individual' : 'selected',
                userIds: selected,
            });
            setTitle(''); setBody(''); setSelected([]);
            await load();
            Alert.alert('Announcement sent', 'The in-app message and delivery audit were created.');
        } catch (error) {
            Alert.alert('Message not sent', error instanceof Error ? error.message : 'Please try again.');
        } finally {
            setSending(false);
        }
    }

    return (
        <ScrollView style={{ flex: 1, backgroundColor: '#F3F6FA' }} contentContainerStyle={{ padding: 18, paddingBottom: 60 }}>
            <View style={{ width: '100%', maxWidth: 1100, alignSelf: 'center' }}>
                <AdminNavBar backFallback="/super-admin" />
                <Text style={styles.title}>Communications Center</Text>
                <Text style={styles.subtitle}>Privacy-controlled HomeOS announcements. Only masked contact and basic relationship details are shown.</Text>
                {loading ? <ActivityIndicator style={{ margin: 30 }} /> : (
                    <>
                        <View style={styles.panel}>
                            <Text style={styles.heading}>1. Choose recipients</Text>
                            <DictationTextInput value={query} onChangeText={setQuery} placeholder="Search name, city, state, or masked contact" style={styles.input} />
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                                <TouchableOpacity style={styles.smallButton} onPress={() => setSelected(visibleCustomers.map((item) => item.user_id))}>
                                    <Text style={styles.buttonText}>Select visible ({visibleCustomers.length})</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.secondaryButton} onPress={() => setSelected([])}>
                                    <Text style={styles.secondaryText}>Clear</Text>
                                </TouchableOpacity>
                            </View>
                            {visibleCustomers.map((customer) => {
                                const checked = selected.includes(customer.user_id);
                                return (
                                    <TouchableOpacity key={customer.user_id} onPress={() => toggleCustomer(customer.user_id)}
                                        style={[styles.customer, checked && styles.customerSelected]}>
                                        <Text style={styles.customerName}>{checked ? '✓ ' : ''}{customer.display_name}</Text>
                                        <Text style={styles.meta}>{[customer.city, customer.state].filter(Boolean).join(', ') || 'Location hidden'} · {customer.account_status}</Text>
                                        <Text style={styles.meta}>{customer.masked_email || customer.masked_phone || 'Contact hidden'} · {customer.connected_companies.map((company) => company.name).join(', ') || 'No active company'}</Text>
                                        <Text style={styles.meta}>Push {customer.preferences.push_enabled ? 'allowed' : 'off'} · {customer.unread_count} unread</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <View style={styles.panel}>
                            <Text style={styles.heading}>2. Compose and review</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                                {categories.map((item) => (
                                    <TouchableOpacity key={item.value} onPress={() => setCategory(item.value)}
                                        style={[styles.category, category === item.value && styles.categorySelected]}>
                                        <Text style={{ fontWeight: '800', color: category === item.value ? '#FFF' : '#17324D' }}>{item.label}{item.optional ? ' · opt-in' : ''}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <DictationTextInput value={title} onChangeText={setTitle} maxLength={100} placeholder="Clear title" style={styles.input} />
                            <DictationTextInput value={body} onChangeText={setBody} maxLength={1000} multiline placeholder="Short message—no address, payment, or sensitive home details" style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]} />
                            <Text style={styles.notice}>Push preview: “You have a new update from HomeOS.” Full details appear only after sign-in.</Text>
                            <TouchableOpacity disabled={sending} onPress={() => void reviewAndSend()} style={[styles.sendButton, sending && { opacity: 0.6 }]}>
                                <Text style={styles.buttonText}>{sending ? 'Sending…' : `Review ${selected.length} recipient${selected.length === 1 ? '' : 's'} & send`}</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.panel}>
                            <Text style={styles.heading}>Delivery audit</Text>
                            {history.length === 0 ? <Text style={styles.meta}>No announcements yet.</Text> : history.map((item) => (
                                <View key={item.id} style={styles.audit}>
                                    <Text style={styles.customerName}>{item.title}</Text>
                                    <Text style={styles.meta}>{item.category} · {item.recipient_count} recipients · {item.read_count} opened · {item.opted_out_count} opted out</Text>
                                    <Text style={styles.meta}>Created by {item.created_by_name} · {item.sent_at ? new Date(item.sent_at).toLocaleString() : 'Draft'}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}
            </View>
        </ScrollView>
    );
}

const styles = {
    title: { fontSize: 34, fontWeight: '900' as const, color: '#071B33', marginTop: 20 },
    subtitle: { color: '#637083', marginTop: 6, marginBottom: 18, lineHeight: 21 },
    panel: { backgroundColor: '#FFF', borderRadius: 20, borderWidth: 1, borderColor: '#DDE5ED', padding: 16, marginBottom: 16 },
    heading: { fontSize: 19, fontWeight: '900' as const, color: '#071B33', marginBottom: 12 },
    input: { borderWidth: 1, borderColor: '#CCD8E4', borderRadius: 13, padding: 13, marginBottom: 12, color: '#071B33', backgroundColor: '#FAFCFE' },
    smallButton: { backgroundColor: '#0A7563', padding: 11, borderRadius: 12 },
    secondaryButton: { borderColor: '#AFC0CF', borderWidth: 1, padding: 11, borderRadius: 12 },
    buttonText: { color: '#FFF', fontWeight: '900' as const, textAlign: 'center' as const },
    secondaryText: { color: '#17324D', fontWeight: '900' as const },
    customer: { borderWidth: 1, borderColor: '#D7E1E9', padding: 13, borderRadius: 14, marginBottom: 8 },
    customerSelected: { borderColor: '#10A37F', backgroundColor: '#EAF8F3' },
    customerName: { color: '#071B33', fontWeight: '900' as const, fontSize: 15 },
    meta: { color: '#637083', marginTop: 4, lineHeight: 18 },
    category: { borderWidth: 1, borderColor: '#B8C7D3', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
    categorySelected: { backgroundColor: '#0A7563', borderColor: '#0A7563' },
    notice: { backgroundColor: '#EDF6F3', borderRadius: 12, padding: 12, color: '#275A50', marginBottom: 12 },
    sendButton: { backgroundColor: '#071B33', borderRadius: 14, padding: 15 },
    audit: { borderTopWidth: 1, borderTopColor: '#E4EAF0', paddingVertical: 12 },
};
