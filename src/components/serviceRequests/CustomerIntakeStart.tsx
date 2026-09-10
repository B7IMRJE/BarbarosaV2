import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import VerifiedAddressPicker from '../address/VerifiedAddressPicker';
import DictationTextInput from '../input/DictationTextInput';
import ThemedButton from '../theme/ThemedButton';
import ThemedCard from '../theme/ThemedCard';
import { loadHomePropertyCollection, type HomePropertySummary } from '../../lib/homePropertyCollection';
import { intakeReasonLabel, saveCustomerIntake, type CustomerIntake } from '../../lib/customerCallIntake';
import { buildHomeIdentityRpcPayload, PROPERTY_TYPE_OPTIONS, type PropertyType, type VerifiedAddress } from '../../lib/homeIdentity';
import { selectActiveProperty } from '../../lib/activeProperty';
import { clearPendingCompanyInviteState } from '../../lib/companyInviteState';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../theme/useTheme';

export default function CustomerIntakeStart({ initialIntake }: { initialIntake: CustomerIntake }) {
    const { theme } = useTheme();
    const [intake, setIntake] = useState(initialIntake);
    const [contact, setContact] = useState(initialIntake.confirmed_contact || { name: initialIntake.invited_name || '', phone: initialIntake.invited_phone || '', email: initialIntake.invited_email || '' });
    const [homes, setHomes] = useState<HomePropertySummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [homeLoadFailed, setHomeLoadFailed] = useState(false);
    const [loadVersion, setLoadVersion] = useState(0);
    const [message, setMessage] = useState('');
    const [address, setAddress] = useState<VerifiedAddress | null>(null);
    const [propertyType, setPropertyType] = useState<PropertyType | null>(null);
    const busyRef = useRef(false);
    const textStyle = { color: theme.colors.text, fontSize: 16, lineHeight: 24 };
    useEffect(() => {
        let current = true;
        setLoading(true); setHomeLoadFailed(false);
        loadHomePropertyCollection().then(collection => { if (current) setHomes(collection.properties); })
            .catch(error => { if (current) { setMessage(error.message); setHomeLoadFailed(true); } })
            .finally(() => { if (current) setLoading(false); });
        return () => { current = false; };
    }, [loadVersion]);
    async function run(action: () => Promise<void>) {
        if (busyRef.current) return;
        busyRef.current = true; setBusy(true); setMessage('');
        try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Please try again. Your invitation is saved.'); }
        finally { busyRef.current = false; setBusy(false); }
    }
    async function openRequest(propertyId: string) {
        await saveCustomerIntake(intake.id, { propertyId });
        await selectActiveProperty(propertyId);
        clearPendingCompanyInviteState({ inviteCode: intake.invite_code });
        router.replace(`/request-service?propertyId=${encodeURIComponent(propertyId)}&intakeId=${encodeURIComponent(intake.id)}` as never);
    }
    return <View style={{ gap: 16 }}>
        <Text style={{ color: theme.colors.text, fontSize: 30, fontWeight: '900' }}>{intake.company_name}</Text>
        <Text style={textStyle}>{intakeReasonLabel(intake.service_reason)}{intake.urgency === 'emergency' ? ' · Emergency' : ''}</Text>
        <Text style={textStyle}>Continue in your browser. No app download is needed. Your invitation connects this home to {intake.company_name} as your preferred company.</Text>
        {!intake.contact_confirmed_at ? <ThemedCard style={{ gap: 12 }}>
            <Text style={{ ...textStyle, fontSize: 22, fontWeight: '800' }}>Confirm my information</Text>
            {(['name', 'phone', 'email'] as const).map(field => <View key={field} style={{ gap: 4 }}>
                <Text style={textStyle}>{field === 'name' ? 'Your name' : field === 'phone' ? 'Phone number' : 'Contact email'}</Text>
                <DictationTextInput value={contact[field]} accessibilityLabel={field} onChangeText={value => setContact(current => ({ ...current, [field]: value }))} autoCapitalize={field === 'name' ? 'words' : 'none'} keyboardType={field === 'phone' ? 'phone-pad' : field === 'email' ? 'email-address' : 'default'} style={{ color: theme.colors.text, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 14, fontSize: 16 }} />
            </View>)}
            <Text style={{ ...textStyle, color: theme.colors.mutedText }}>Corrections go to the office for review. They do not change the email used to sign in.</Text>
            <ThemedButton title={busy ? 'Saving...' : 'Confirm and continue'} disabled={busy} onPress={() => void run(async () => { setIntake(await saveCustomerIntake(intake.id, { contact })); })} />
        </ThemedCard> : <ThemedCard style={{ gap: 14 }}>
            <Text style={{ ...textStyle, fontSize: 22, fontWeight: '800' }}>Where do you need service?</Text>
            {!!intake.address_hint && <Text style={textStyle}>Address provided to the office: {intake.address_hint}</Text>}
            {loading ? <ActivityIndicator color={theme.colors.primary} /> : homeLoadFailed ? <ThemedButton title="Retry loading my homes" onPress={() => setLoadVersion(value => value + 1)} /> : homes.length ? <>
                <Text style={textStyle}>Choose your actual home. Your saved address will stay with this call.</Text>
                {homes.map(home => <ThemedButton key={home.propertyId} title={[home.name, home.address].filter(Boolean).join(' · ')} variant="secondary" disabled={busy} onPress={() => void run(() => openRequest(home.propertyId))} />)}
            </> : <>
                <VerifiedAddressPicker initialSearchText={intake.address_hint} disabled={busy} onAddressConfirmed={setAddress} />
                <Text style={textStyle}>Property type</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{PROPERTY_TYPE_OPTIONS.map(option => <ThemedButton key={option.value} title={option.label} variant={propertyType === option.value ? 'primary' : 'secondary'} disabled={busy} onPress={() => setPropertyType(option.value)} />)}</View>
                <Text style={{ ...textStyle, color: theme.colors.mutedText }}>Rooms, equipment and appearance can be set up after your request.</Text>
                <ThemedButton title={busy ? 'Saving your address...' : 'Save address and continue'} disabled={busy || !address || !propertyType} onPress={() => void run(async () => {
                    if (!address || !propertyType) return;
                    const { data, error } = await supabase.rpc('create_my_customer_intake_home', { p_intake_id: intake.id, p_home: buildHomeIdentityRpcPayload({ name: `${contact.name.trim() || 'My'} home`, address, propertyType }) });
                    if (error) throw new Error(error.message);
                    if (!data) throw new Error('The home could not be confirmed. Please retry.');
                    await openRequest(String(data));
                })} />
            </>}
        </ThemedCard>}
        {!!message && <ThemedCard><Text selectable style={textStyle}>{message}</Text></ThemedCard>}
    </View>;
}
