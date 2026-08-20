import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { EquipmentContainer } from '../../components/homeos/HomeOSVisualFoundation';
import { resolveHomeOSEquipmentVisual } from '../../components/homeos/homeos-visual-assets';
import { activePropertyErrorMessage, requireActivePropertyMembership } from '../../lib/activeProperty';
import { resolveHomeOSContainerGrid } from '../../lib/homeos-responsive-layout';
import { supabase } from '../../lib/supabase';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

type AreaItem = { id: string; name: string | null; item_slug: string | null; system: string | null; category: string | null; location: string | null; parent_area: string | null; photo_url?: string | null };

export default function PropertyAreaDetailScreen() {
    const { area } = useLocalSearchParams<{ area?: string }>();
    const areaName = decodeURIComponent(String(area || '')).trim();
    const { scaleFont, scaleIcon, theme } = useTheme();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
    const { width } = useWindowDimensions();
    const [items, setItems] = useState<AreaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const property = await requireActivePropertyMembership();
            const { data, error } = await supabase.from('home_items').select('id, name, item_slug, system, category, location, parent_area, photo_url').eq('property_id', property.propertyId).or('archived.eq.false,archived.is.null').order('system').order('name');
            if (error) throw error;
            setItems((data || []).filter((item) => String(item.category || '').toLowerCase() !== 'area' && (item.location === areaName || item.parent_area === areaName)) as AreaItem[]);
        } catch (error) { setMessage(activePropertyErrorMessage(error)); } finally { setLoading(false); }
    }, [areaName]);
    useFocusEffect(useCallback(() => { void load(); }, [load]));
    const columns = resolveHomeOSContainerGrid(width, foundation.grid.equipmentMinimumWidth);

    return <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: foundation.spacing.comfortable, paddingBottom: scaleIcon(42), alignItems: 'center' }}><View style={{ width: '100%', maxWidth: 960, gap: foundation.spacing.regular }}><HomeHeader />
        <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30) }]}>{areaName || 'Area'}</Text>
        <Text selectable style={foundation.typography.body}>Existing equipment and items in this area</Text>
        {loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: scaleIcon(28) }} /> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: foundation.grid.gap }}>{items.map((item) => <EquipmentContainer key={item.id} title={item.name || 'Unnamed item'} detail={[item.system, item.category].filter(Boolean).join(' · ')} visual={resolveHomeOSEquipmentVisual(item.photo_url)} onPress={() => router.push({ pathname: '/item/[slug]', params: { slug: item.item_slug || item.id } } as never)} style={{ flexGrow: 1, flexBasis: `${100 / columns - 2}%` }} />)}</View>}
        {!loading && items.length === 0 && <Text selectable style={foundation.typography.body}>No equipment or items are currently stored in this area.</Text>}
        {!!message && <Text selectable style={{ color: theme.colors.danger }}>{message}</Text>}
    </View></ScrollView>;
}
