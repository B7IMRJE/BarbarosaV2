import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import ThemedButton from '../../components/theme/ThemedButton';
import ThemedCard from '../../components/theme/ThemedCard';
import { useHydratedRouteParamsReady } from '../../hooks/useHydratedRouteParamsReady';
import { selectActiveProperty } from '../../lib/activeProperty';
import { HOME_STORY_COUNT_OPTIONS } from '../../lib/homePropertyAccessValues';
import {
    buildHomeSetupPlan, chooseHomeSetup, finishHomeSetup, inspectHomeSetup, isHomeSetupComplete,
    readHomeSetup, resolveOwnedHomeSetupScope, saveHomeSetupStory,
    type HomeSetupChoices, type HomeSetupScope, type HomeSetupStatus,
} from '../../lib/home-setup-integrity';
import { useTheme } from '../../theme/useTheme';

const initialChoices: HomeSetupChoices = {
    bathrooms: 2, kitchen: true, laundry: true, garage: true, waterHeater: 'not_sure', hvac: 'not_sure',
    frontYard: true, backYard: true, pool: false,
};
const questions = [
    ['kitchen', 'Kitchen?'], ['laundry', 'Laundry?'], ['garage', 'Garage?'],
    ['waterHeater', 'Water heater?'], ['hvac', 'HVAC?'], ['frontYard', 'Front yard?'],
    ['backYard', 'Back yard?'], ['pool', 'Pool?'],
] as const;

export default function BaseHomeWizardScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const params = useLocalSearchParams<{ next?: string | string[]; propertyId?: string | string[] }>();
    const paramsReady = useHydratedRouteParamsReady();
    const propertyId = firstParam(params.propertyId);
    const nextRoute = resolveSafeNext(firstParam(params.next));
    const [scope, setScope] = useState<HomeSetupScope | null>(null);
    const [status, setStatus] = useState<HomeSetupStatus | null>(null);
    const [choices, setChoices] = useState(initialChoices);
    const [storyCount, setStoryCount] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [reload, setReload] = useState(0);
    const submitting = useRef(false);
    const plan = useMemo(() => buildHomeSetupPlan(choices), [choices]);
    const complete = !!status && isHomeSetupComplete(status);

    useEffect(() => {
        if (!paramsReady) return;
        let current = true;
        setLoading(true); setMessage(''); setStatus(null); setScope(null);
        void (async () => {
            const target = await resolveOwnedHomeSetupScope(propertyId);
            if (!target) throw new Error('Only the home owner can finish setup.');
            const saved = await readHomeSetup(target);
            if (!current) return;
            setScope(target); setStatus(saved); setStoryCount(saved.story_count || '');
            const compact = ['CONDO', 'APARTMENT'].includes(saved.property_type);
            setChoices({ ...initialChoices, bathrooms: compact ? 1 : 2, garage: !compact, frontYard: !compact, backYard: !compact });
            if (saved.can_retry) {
                const result = await inspectHomeSetup(target, reload > 0);
                if (current) setStatus(result);
            }
        })().catch(e => { if (current) setMessage(errorMessage(e)); })
            .finally(() => { if (current) setLoading(false); });
        return () => { current = false; };
    }, [propertyId, paramsReady, reload]);

    async function save(keepCurrent = false) {
        if (submitting.current || !scope || !status || loading) return;
        if (status.needs_details && !storyCount) { setMessage('Choose the number of stories first.'); return; }
        submitting.current = true; setSaving(true); setMessage('Saving this home’s setup…');
        try {
            let saved = status;
            if (saved.needs_details) saved = await saveHomeSetupStory(scope, storyCount);
            if (saved.needs_choice) saved = await chooseHomeSetup(scope, keepCurrent ? null : plan, keepCurrent);
            setStatus(saved);
            if (saved.can_retry) saved = await finishHomeSetup(scope);
            setStatus(saved);
            setMessage(isHomeSetupComplete(saved)
                ? `Home setup saved. ${saved.skipped_areas ? `${saved.skipped_areas} area(s) were outside this home’s enabled trades. ` : ''}Existing cards and customizations were kept.`
                : 'Your progress is saved. Complete the remaining choices below.');
        } catch (e) { setMessage(errorMessage(e)); }
        finally { submitting.current = false; setSaving(false); }
    }

    async function openHome() {
        if (!scope || saving) return;
        try {
            const current = await resolveOwnedHomeSetupScope(scope.propertyId);
            if (current?.userId !== scope.userId) throw new Error('Your account changed. Reopen this home.');
            await selectActiveProperty(scope.propertyId);
            router.replace((nextRoute || '/') as never);
        } catch (e) { setMessage(errorMessage(e)); }
    }

    return <ScrollView contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={{ padding: scaleIcon(20), alignItems: 'center', paddingBottom: 40 }}>
        <View style={{ width: '100%', maxWidth: 920, gap: scaleIcon(14) }}>
            <Text style={{ color: theme.colors.text, fontSize: scaleFont(34), fontWeight: '900' }}>Set Up Your Home Profile</Text>
            <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(16) }}>
                {status?.home_name || 'Your home'} · Answer a few questions, then choose starter cards or keep your current cards.
                {' '}Only enabled trades are added, marked Missing Information. Existing or archived areas are never rebuilt.
            </Text>
            {loading ? <ActivityIndicator color={theme.colors.primary} /> : status ? <>
                {status.needs_details ? <ThemedCard>
                    <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900', marginBottom: 10 }}>How many stories?</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {HOME_STORY_COUNT_OPTIONS.map(option => <ThemedButton key={option.value} title={option.label}
                            variant={storyCount === option.value ? 'primary' : 'secondary'} disabled={saving}
                            onPress={() => setStoryCount(option.value)} />)}
                    </View>
                </ThemedCard> : null}
                {status.needs_choice ? <>
                    {status.starter_state === 'legacy_review' ? <Text selectable style={{ color: theme.colors.mutedText }}>
                        This older home has no recorded starter choice. If you intentionally kept it empty or removed its cards, choose “Keep current cards” below.
                    </Text> : null}
                    <ThemedCard>
                        <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900', marginBottom: 10 }}>How many bathrooms?</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
                            {[0, 1, 2, 3, 4].map(value => <ThemedButton key={value} title={value === 4 ? '4+' : String(value)}
                                variant={choices.bathrooms === value ? 'primary' : 'secondary'} disabled={saving}
                                onPress={() => setChoices(c => ({ ...c, bathrooms: value }))} />)}
                        </View>
                        {questions.map(([key, title]) => <View key={key} style={{ marginBottom: 18 }}>
                            <Text style={{ color: theme.colors.text, fontSize: scaleFont(18), fontWeight: '900', marginBottom: 10 }}>{title}</Text>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                {(key === 'waterHeater' || key === 'hvac' ? [true, false, 'not_sure'] as const : [true, false] as const)
                                    .map(value => <ThemedButton key={String(value)} title={value === 'not_sure' ? 'Not sure' : value ? 'Yes' : 'No'} disabled={saving}
                                    variant={choices[key] === value ? 'primary' : 'secondary'}
                                    onPress={() => setChoices(c => ({ ...c, [key]: value }))} />)}
                            </View>
                        </View>)}
                    </ThemedCard>
                    <ThemedCard>
                        <Text style={{ color: theme.colors.text, fontWeight: '900' }}>Selected starter areas</Text>
                        {plan.map(area => <Text key={area.name} style={{ color: theme.colors.mutedText, marginTop: 6 }}>{area.name}</Text>)}
                        <Text style={{ color: theme.colors.mutedText, marginTop: 10 }}>Available published packs determine the final cards; disabled trades are not added.</Text>
                    </ThemedCard>
                </> : null}
                {!complete ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <ThemedButton title={saving ? 'Saving…' : status.needs_choice ? 'Create Starter Home Profile' : 'Finish saved setup'}
                        disabled={saving || (status.needs_choice && !plan.length)} onPress={() => void save()} />
                    {status.needs_choice ? <ThemedButton title="Keep current cards — no starter pack" variant="secondary"
                        disabled={saving} onPress={() => void save(true)} /> : null}
                </View> : null}
                <ThemedButton title={complete ? nextRoute ? 'Continue Invitation' : 'Open HomeOS' : 'Finish later'}
                    variant="secondary" disabled={saving} onPress={() => void openHome()} />
            </> : null}
            {!!message ? <ThemedCard><Text selectable accessibilityLiveRegion="polite" style={{ color: theme.colors.text }}>{message}</Text></ThemedCard> : null}
            {!loading && message && !complete ? <ThemedButton title="Retry setup check" disabled={saving} variant="secondary" onPress={() => setReload(n => n + 1)} /> : null}
        </View>
    </ScrollView>;
}

function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Could not finish setup. Your home is saved; please retry.'; }
function firstParam(value?: string | string[]) { return Array.isArray(value) ? value[0] : value; }
function resolveSafeNext(value?: string) {
    if (!value) return null;
    try {
        const parsed = new URL(value, 'https://app.local');
        if (parsed.pathname === '/customer-invite' && parsed.searchParams.get('code')?.trim()) return `${parsed.pathname}${parsed.search}`;
    } catch { /* Use the home destination. */ }
    return null;
}
