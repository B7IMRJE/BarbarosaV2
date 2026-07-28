import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';
import {
    loadMyAnnouncements,
    loadMyCommunicationPreferences,
    markAnnouncementRead,
    saveMyCommunicationPreferences,
    type CommunicationPreferences,
    type HomeOSAnnouncement,
} from '../lib/platformCommunications';
import { registerHomeOSPushNotifications } from '../lib/pushNotifications';

const defaults: CommunicationPreferences = {
    job_updates: true,
    company_announcements: true,
    homeos_product_news: false,
    promotions: false,
    push_enabled: false,
    email_opt_in: false,
    sms_opt_in: false,
};

export default function NotificationsScreen() {
    const [messages, setMessages] = useState<HomeOSAnnouncement[]>([]);
    const [preferences, setPreferences] = useState(defaults);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const [nextMessages, nextPreferences] = await Promise.all([
                loadMyAnnouncements(), loadMyCommunicationPreferences(),
            ]);
            setMessages(nextMessages);
            setPreferences(nextPreferences || defaults);
        } catch (error) {
            Alert.alert('Updates unavailable', error instanceof Error ? error.message : 'Please try again.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { void load(); }, []);

    async function update(key: keyof CommunicationPreferences, value: boolean) {
        if (key === 'push_enabled' && value) {
            try {
                await registerHomeOSPushNotifications();
            } catch (error) {
                Alert.alert('Push not enabled', error instanceof Error ? error.message : 'Please try again.');
                return;
            }
        }
        const next = { ...preferences, [key]: value };
        setPreferences(next);
        setSaving(true);
        try {
            await saveMyCommunicationPreferences(next);
        } catch (error) {
            setPreferences(preferences);
            Alert.alert('Preference not saved', error instanceof Error ? error.message : 'Please try again.');
        } finally {
            setSaving(false);
        }
    }

    async function openMessage(message: HomeOSAnnouncement) {
        if (!message.read_at) {
            await markAnnouncementRead(message.id);
            setMessages((current) => current.map((item) =>
                item.id === message.id ? { ...item, read_at: new Date().toISOString() } : item
            ));
        }
        Alert.alert(message.title, `${message.body}\n\nFrom ${message.sender_name}`);
    }

    return (
        <ScrollView style={{ flex: 1, backgroundColor: '#061B2D' }} contentContainerStyle={{ padding: 18, paddingBottom: 90 }}>
            <View style={{ width: '100%', maxWidth: 850, alignSelf: 'center' }}>
                <Text style={{ color: '#FFF', fontSize: 31, fontWeight: '900', marginTop: 12 }}>Updates & privacy</Text>
                <Text style={{ color: '#9FC5BE', marginTop: 7, marginBottom: 18, lineHeight: 20 }}>
                    HomeOS keeps sensitive home and job details inside the signed-in app.
                </Text>
                {loading ? <ActivityIndicator color="#65D5B5" style={{ margin: 30 }} /> : (
                    <>
                        <View style={styles.panel}>
                            <Text style={styles.heading}>Inbox</Text>
                            {messages.length === 0 ? <Text style={styles.meta}>No announcements yet.</Text> : messages.map((message) => (
                                <TouchableOpacity key={message.id} onPress={() => void openMessage(message)}
                                    style={[styles.message, !message.read_at && styles.unread]}>
                                    <Text style={styles.messageTitle}>{!message.read_at ? '● ' : ''}{message.title}</Text>
                                    <Text numberOfLines={2} style={styles.meta}>{message.body}</Text>
                                    <Text style={styles.sender}>{message.sender_name} · {new Date(message.sent_at).toLocaleString()}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={styles.panel}>
                            <Text style={styles.heading}>Notification choices</Text>
                            <Text style={styles.explanation}>Account and security notices always remain available in the app. Optional announcements and promotions are off unless you choose them.</Text>
                            <Preference label="Job and appointment updates" value={preferences.job_updates} onChange={(value) => void update('job_updates', value)} />
                            <Preference label="Connected-company announcements" value={preferences.company_announcements} onChange={(value) => void update('company_announcements', value)} />
                            <Preference label="HomeOS product news" value={preferences.homeos_product_news} onChange={(value) => void update('homeos_product_news', value)} />
                            <Preference label="Promotions and offers" value={preferences.promotions} onChange={(value) => void update('promotions', value)} />
                            <Preference label="Push notifications" value={preferences.push_enabled} onChange={(value) => void update('push_enabled', value)} />
                            <Text style={styles.explanation}>Email and SMS delivery will become available only after separate consent and provider configuration. They are currently disabled.</Text>
                            {saving ? <Text style={styles.sender}>Saving…</Text> : null}
                        </View>
                    </>
                )}
            </View>
        </ScrollView>
    );
}

function Preference({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
    return (
        <View style={styles.preference}>
            <Text style={{ color: '#E9FFFA', fontWeight: '800', flex: 1, paddingRight: 12 }}>{label}</Text>
            <Switch value={value} onValueChange={onChange} trackColor={{ false: '#435B63', true: '#1F9E7D' }} />
        </View>
    );
}

const styles = {
    panel: { backgroundColor: '#103C38', borderColor: '#2D7568', borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 16 },
    heading: { color: '#FFF', fontSize: 20, fontWeight: '900' as const, marginBottom: 12 },
    message: { backgroundColor: '#133733', borderColor: '#2A6158', borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 9 },
    unread: { backgroundColor: '#155247', borderColor: '#65D5B5' },
    messageTitle: { color: '#FFF', fontWeight: '900' as const, fontSize: 16 },
    meta: { color: '#B9D5D0', marginTop: 5, lineHeight: 19 },
    sender: { color: '#72CDB7', marginTop: 7, fontSize: 12, fontWeight: '700' as const },
    explanation: { color: '#B9D5D0', lineHeight: 19, marginBottom: 10 },
    preference: { flexDirection: 'row' as const, alignItems: 'center' as const, minHeight: 50, borderTopWidth: 1, borderTopColor: '#2A6158' },
};
