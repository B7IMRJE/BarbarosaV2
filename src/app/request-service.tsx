import DictationTextInput from '@/components/input/DictationTextInput';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../components/HomeHeader';
import ServiceRequestMediaPicker from '../components/serviceRequests/ServiceRequestMediaPicker';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import { activePropertyErrorMessage, requireActivePropertyMembership } from '../lib/activeProperty';
import { createHomeownerServiceRequest, ensureHomeEmergencyForServiceRequest, formatServiceRequestReference } from '../lib/homeServiceRequests';
import { loadPreferredProviderForProperty, type PreferredProvider } from '../lib/preferredProviders';
import { hasUnresolvedServiceRequestMedia, uploadPendingServiceRequestMedia, type ServiceRequestMediaDraft } from '../lib/serviceRequestMedia';
import { broadcastServiceRequestRefresh, companyServiceRequestTopic } from '../lib/serviceRequestRealtime';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

type ServicePath = 'areas' | 'fixtures' | 'equipment' | 'other';
type HomeItem = { id: string; name: string; category: string | null; system: string | null; parent_area: string | null };

const paths: { key: ServicePath; title: string; description: string; icon: string }[] = [
    { key: 'areas', title: 'Areas', description: 'Kitchen, bathroom, garage, exterior, and more.', icon: '⌂' },
    { key: 'fixtures', title: 'Fixtures', description: 'Faucets, sinks, toilets, showers, and tubs.', icon: '🔧' },
    { key: 'equipment', title: 'Equipment', description: 'Water heater, filtration, pump, and more.', icon: '▣' },
    { key: 'other', title: 'Something else', description: 'Continue even if you are not sure what the item is.', icon: '?' },
];

export default function RequestServiceScreen() {
    const { theme } = useTheme();
    const [propertyId, setPropertyId] = useState('');
    const [provider, setProvider] = useState<PreferredProvider | null>(null);
    const [items, setItems] = useState<HomeItem[]>([]);
    const [path, setPath] = useState<ServicePath>('areas');
    const [selectedItem, setSelectedItem] = useState<HomeItem | null>(null);
    const [requestType, setRequestType] = useState<'regular' | 'emergency'>('regular');
    const [issue, setIssue] = useState('');
    const [accessInstructions, setAccessInstructions] = useState('');
    const [media, setMedia] = useState<ServiceRequestMediaDraft[]>([]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => { void load(); }, []);

    async function load() {
        try {
            const active = await requireActivePropertyMembership();
            const [preferred, itemResult] = await Promise.all([
                loadPreferredProviderForProperty(active.propertyId),
                supabase.from('home_items').select('id, name, category, system, parent_area').eq('property_id', active.propertyId).or('archived.eq.false,archived.is.null').order('name'),
            ]);
            if (itemResult.error) throw itemResult.error;
            setPropertyId(active.propertyId);
            setProvider(preferred);
            setItems((itemResult.data || []) as HomeItem[]);
            setMessage(preferred ? '' : 'Choose a service provider in Company Connections before sending a request.');
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }

    const choices = useMemo(() => {
        if (path === 'other') return [];
        const category = path === 'areas' ? 'area' : path === 'fixtures' ? 'fixture' : 'equipment';
        return items.filter((item) => String(item.category || '').toLowerCase() === category);
    }, [items, path]);

    const selectedPath = paths.find((candidate) => candidate.key === path)!;

    async function send() {
        const summary = issue.trim();
        if (!provider || !propertyId) return setMessage('Choose a service provider before sending a request.');
        if (!summary) return setMessage('Briefly describe the issue before continuing.');
        if (hasUnresolvedServiceRequestMedia(media)) return setMessage('Wait for the current photo or video action to finish.');
        setSending(true); setMessage('Sending service request...');
        try {
            const location = selectedItem ? `${selectedItem.name}: ` : path === 'other' ? '' : `${selectedPath.title}: `;
            const request = await createHomeownerServiceRequest({ propertyId, companyId: provider.companyId, requestType, priority: requestType === 'emergency' ? 'emergency' : 'normal', issueSummary: `${location}${summary}`, accessInstructions });
            if (requestType === 'emergency') await ensureHomeEmergencyForServiceRequest(request.id);
            if (media.length) await uploadPendingServiceRequestMedia({ companyId: request.companyId, propertyId: request.propertyId, serviceRequestId: request.id, items: media, onItemChange: (localId, updates) => setMedia((current) => current.map((item) => item.localId === localId ? { ...item, ...updates } : item)) });
            void broadcastServiceRequestRefresh(companyServiceRequestTopic(request.companyId), { reason: 'homeowner_request_created', serviceRequestId: request.id });
            setMessage(`Service request sent. ${formatServiceRequestReference(request)}.`);
        } catch (error) {
            setMessage(error instanceof Error ? `Could not send service request: ${error.message}` : 'Could not send service request.');
        } finally { setSending(false); }
    }

    if (loading) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: theme.colors.background }}><ActivityIndicator color={theme.colors.primary} /></View>;

    return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, alignItems: 'center' }}><View style={{ width: '100%', maxWidth: 900 }}>
        <HomeHeader />
        <TouchableOpacity accessibilityRole="button" onPress={() => router.back()} style={{ alignSelf: 'flex-start', paddingVertical: 12 }}><Text style={{ color: theme.colors.primary, fontWeight: '900' }}>← Back to Home</Text></TouchableOpacity>
        <Text style={{ color: theme.colors.mutedText, fontWeight: '900', fontSize: 13 }}>WATER SERVICE · SERVICE REQUEST</Text>
        <Text style={{ color: theme.colors.text, fontWeight: '900', fontSize: 34, marginTop: 8 }}>What needs service?</Text>
        <Text style={{ color: theme.colors.mutedText, fontSize: 16, lineHeight: 23, marginTop: 8, marginBottom: 18 }}>Choose where the issue is. Your service team will see the item you select.</Text>
        <ThemedCard style={{ gap: 14 }}>
            <Text style={{ color: theme.colors.text, fontSize: 21, fontWeight: '900' }}>Where is the issue?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{paths.map((candidate) => <ThemedButton key={candidate.key} title={`${candidate.icon} ${candidate.title}`} variant={path === candidate.key ? 'primary' : 'secondary'} onPress={() => { setPath(candidate.key); setSelectedItem(null); }} style={{ flexGrow: 1, flexBasis: 180 }} />)}</View>
            {choices.length > 0 && <><Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Choose the item</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{choices.map((item) => <ThemedButton key={item.id} title={item.name} variant={selectedItem?.id === item.id ? 'primary' : 'secondary'} onPress={() => setSelectedItem(item)} style={{ flexGrow: 1, flexBasis: 180 }} />)}</View></>}
            <Text style={{ color: theme.colors.mutedText, fontWeight: '800' }}>Provider: {provider?.companyName || 'Not selected'}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}><ThemedButton title="Regular" variant={requestType === 'regular' ? 'primary' : 'secondary'} onPress={() => setRequestType('regular')} /><ThemedButton title="Emergency" variant={requestType === 'emergency' ? 'primary' : 'secondary'} onPress={() => setRequestType('emergency')} /></View>
            <DictationTextInput value={issue} onChangeText={setIssue} multiline placeholder="What is happening?" placeholderTextColor={theme.colors.mutedText} style={{ minHeight: 96, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.card, padding: 12, color: theme.colors.text, textAlignVertical: 'top' }} />
            <DictationTextInput dictationEnabled={false} value={accessInstructions} onChangeText={(value) => setAccessInstructions(value.slice(0, 1000))} secureTextEntry placeholder="Gate code or access instructions (optional)" placeholderTextColor={theme.colors.mutedText} style={{ borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radii.card, padding: 12, color: theme.colors.text }} />
            <ServiceRequestMediaPicker items={media} disabled={sending} onChange={setMedia} onMessage={setMessage} />
            <ThemedButton title={sending ? 'Sending...' : requestType === 'emergency' ? 'Request Emergency Service' : 'Request Service'} disabled={sending || !provider || hasUnresolvedServiceRequestMedia(media)} onPress={() => void send()} />
            {!!message && <Text style={{ color: theme.colors.mutedText, lineHeight: 20 }}>{message}</Text>}
        </ThemedCard>
    </View></ScrollView>;
}
