import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { AreaContainer } from '../../components/homeos/HomeOSVisualFoundation';
import ThemedButton from '../../components/theme/ThemedButton';
import { activePropertyErrorMessage, requireActivePropertyMembership } from '../../lib/activeProperty';
import { activeAreasForScope, type PropertyAreaRecord, type PropertyAreaScope } from '../../lib/propertyAreas';
import { resolveHomeOSContainerGrid } from '../../lib/homeos-responsive-layout';
import { supabase } from '../../lib/supabase';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

export default function PropertyAreaScreen() {
    const { scope: rawScope } = useLocalSearchParams<{ scope?: string }>();
    const scope: Exclude<PropertyAreaScope, 'unclassified'> = rawScope === 'exterior' ? 'exterior' : 'interior';
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const { width } = useWindowDimensions();
    const [areas, setAreas] = useState<PropertyAreaRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const label = scope === 'interior' ? 'Home' : 'Exterior';

    const load = useCallback(async () => {
        setLoading(true); setMessage('');
        try {
            const property = await requireActivePropertyMembership();
            const { data, error } = await supabase.from('home_items').select('id, name, system, area_scope, archived').eq('property_id', property.propertyId).ilike('category', 'Area').or('archived.eq.false,archived.is.null').order('name');
            if (error) throw error;
            setAreas((data || []) as PropertyAreaRecord[]);
        } catch (error) { setMessage(activePropertyErrorMessage(error)); } finally { setLoading(false); }
    }, []);
    useFocusEffect(useCallback(() => { void load(); }, [load]));
    const active = useMemo(() => activeAreasForScope(areas, scope), [areas, scope]);
    const unclassified = useMemo(() => activeAreasForScope(areas, 'unclassified'), [areas]);
    const columns = resolveHomeOSContainerGrid(width, foundation.grid.areaMinimumWidth);

    function openArea(area: PropertyAreaRecord) {
        router.push({ pathname: '/home/area/[area]', params: { area: area.name || '' } } as never);
    }

    return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: foundation.spacing.comfortable, paddingBottom: scaleIcon(42), alignItems: 'center' }}>
        <View style={{ width: '100%', maxWidth: 960, gap: foundation.spacing.regular }}><HomeHeader />
            <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30) }]}>{label}</Text>
            <Text selectable style={foundation.typography.body}>{scope === 'interior' ? 'Select an active indoor area' : 'Select an active outdoor area'}</Text>
            <ThemedButton title="Add Area" onPress={() => router.push(`/home/${scope}/add-area` as never)} style={{ alignSelf: 'flex-start' }} />
            {loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: scaleIcon(32) }} /> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: foundation.grid.gap }}>{active.map((area) => <AreaContainer key={area.id} title={area.name || 'Area'} onPress={() => openArea(area)} style={{ flexGrow: 1, flexBasis: `${100 / columns - 2}%` }} />)}</View>}
            {!loading && active.length === 0 && <Text selectable style={foundation.typography.body}>No active {scope} areas yet. Add only the areas that exist at this property.</Text>}
            {unclassified.length > 0 && <View style={{ marginTop: foundation.spacing.spacious, gap: foundation.spacing.regular }}><Text selectable style={foundation.typography.containerTitle}>Other / Unclassified</Text><Text selectable style={foundation.typography.body}>These existing areas were not guessed or moved.</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: foundation.grid.gap }}>{unclassified.map((area) => <AreaContainer key={area.id} title={area.name || 'Area'} onPress={() => openArea(area)} style={{ flexGrow: 1, flexBasis: `${100 / columns - 2}%` }} />)}</View></View>}
            {!!message && <Text selectable style={{ color: theme.colors.danger }}>{message}</Text>}
        </View>
    </ScrollView>;
}
