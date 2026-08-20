import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { AreaContainer } from '../../components/homeos/HomeOSVisualFoundation';
import { activePropertyErrorMessage, requireActivePropertyMembership } from '../../lib/activeProperty';
import { activeAreasForScope, areaSlug, catalogForScope, type PropertyAreaRecord, type PropertyAreaScope } from '../../lib/propertyAreas';
import { resolveHomeOSContainerGrid } from '../../lib/homeos-responsive-layout';
import { supabase } from '../../lib/supabase';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

export default function AddPropertyAreaScreen() {
    const { scope: rawScope } = useLocalSearchParams<{ scope?: string }>();
    const scope: Exclude<PropertyAreaScope, 'unclassified'> = rawScope === 'exterior' ? 'exterior' : 'interior';
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const { width } = useWindowDimensions();
    const [areas, setAreas] = useState<PropertyAreaRecord[]>([]); const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(''); const [message, setMessage] = useState('');
    const inFlight = useRef(false);
    const load = useCallback(async () => { setLoading(true); try { const property = await requireActivePropertyMembership(); const { data, error } = await supabase.from('home_items').select('id, name, system, area_scope, archived').eq('property_id', property.propertyId).ilike('category', 'Area').or('archived.eq.false,archived.is.null'); if (error) throw error; setAreas((data || []) as PropertyAreaRecord[]); } catch (error) { setMessage(activePropertyErrorMessage(error)); } finally { setLoading(false); } }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));
    const cards = useMemo(() => catalogForScope(scope, activeAreasForScope(areas, scope)).filter((card) => card.name.toLowerCase().includes(search.trim().toLowerCase())), [areas, scope, search]);
    const columns = resolveHomeOSContainerGrid(width, foundation.grid.areaMinimumWidth);

    async function addArea(name: string) {
        if (inFlight.current || saving) return;
        inFlight.current = true; setSaving(name); setMessage('');
        try {
            const property = await requireActivePropertyMembership();
            const { data: existing, error: existingError } = await supabase.from('home_items').select('id').eq('property_id', property.propertyId).ilike('category', 'Area').ilike('name', name).or('archived.eq.false,archived.is.null').limit(1);
            if (existingError) throw existingError;
            if (existing?.length) { router.replace(`/home/${scope}` as never); return; }
            const { error } = await supabase.from('home_items').insert({ user_id: property.userId, property_id: property.propertyId, item_slug: `area-${areaSlug(name)}-${Date.now()}`, name, system: 'Structural', category: 'Area', location: '', parent_area: '', area_scope: scope, status: 'Missing Information', install_state: 'Unknown', archived: false });
            if (error) { if (error.code === '23505') { router.replace(`/home/${scope}` as never); return; } throw error; }
            router.replace(`/home/${scope}` as never);
        } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add this area. Please try again.'); } finally { inFlight.current = false; setSaving(''); }
    }

    return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: foundation.spacing.comfortable, paddingBottom: scaleIcon(42), alignItems: 'center' }}><View style={{ width: '100%', maxWidth: 960, gap: foundation.spacing.regular }}><HomeHeader />
        <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30) }]}>Add {scope === 'interior' ? 'an indoor area' : 'an outdoor area'}</Text>
        <TextInput accessibilityLabel="Search areas" value={search} onChangeText={setSearch} placeholder="Search areas" placeholderTextColor={theme.colors.mutedText} style={{ color: theme.colors.text, borderColor: theme.colors.border, borderWidth: 1, borderRadius: foundation.radii.container, padding: scaleIcon(14), fontSize: scaleFont(16) }} />
        {loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: scaleIcon(32) }} /> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: foundation.grid.gap }}>{cards.map((card) => <AreaContainer key={card.name} title={saving === card.name ? 'Adding…' : card.name} onPress={() => void addArea(card.name)} disabled={Boolean(saving)} style={{ flexGrow: 1, flexBasis: `${100 / columns - 2}%` }} />)}</View>}
        {!loading && cards.length === 0 && <Text selectable style={foundation.typography.body}>No unused areas match that search.</Text>}
        {!!message && <Text selectable style={{ color: theme.colors.danger }}>{message}</Text>}
    </View></ScrollView>;
}
