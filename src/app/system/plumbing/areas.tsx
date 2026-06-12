


import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../../lib/supabase';








type AreaItem = {
    id?: string;
    name: string;
    item_slug?: string;
    status?: string;
    icon?: string;
};

const fallbackAreas: AreaItem[] = [
    { name: 'Kitchen', item_slug: 'kitchen-area', status: 'Missing Information', icon: '🍳' },
    { name: 'Master Bathroom', item_slug: 'master-bathroom-area', status: 'Missing Information', icon: '🚿' },
    { name: 'Bathroom 2', item_slug: 'bathroom-2-area', status: 'Missing Information', icon: '🚽' },
    { name: 'Laundry', item_slug: 'laundry-area', status: 'Missing Information', icon: '🧺' },
    { name: 'Garage', item_slug: 'garage-area', status: 'Missing Information', icon: '🚗' },
    { name: 'Exterior', item_slug: 'exterior-area', status: 'Missing Information', icon: '🏡' },
    { name: 'Water Heater Area', item_slug: 'water-heater-area', status: 'Missing Information', icon: '🔥' },
    { name: 'Main Water Shutoff', item_slug: 'main-water-shutoff', status: 'Missing Information', icon: '💧' },
];

function getAreaIcon(name: string) {
    const lower = name.toLowerCase();

    if (lower.includes('kitchen')) return '🍳';
    if (lower.includes('bath') || lower.includes('shower')) return '🚿';
    if (lower.includes('laundry')) return '🧺';
    if (lower.includes('garage')) return '🚗';
    if (lower.includes('exterior') || lower.includes('outside')) return '🏡';
    if (lower.includes('water heater')) return '🔥';
    if (lower.includes('shutoff') || lower.includes('main')) return '💧';

    return '🏠';
}



function getAreaIconName(name: string) {
    const lower = name.toLowerCase();

    if (lower.includes('kitchen')) return 'silverware-fork-knife';
    if (lower.includes('bathroom')) return 'shower';
    if (lower.includes('laundry')) return 'washing-machine';
    if (lower.includes('garage')) return 'garage';
    if (lower.includes('exterior')) return 'home-outline';
    if (lower.includes('water heater')) return 'water-boiler';
    if (lower.includes('shutoff') || lower.includes('main')) return 'pipe-valve';

    return 'floor-plan';
}






export default function PlumbingAreasScreen() {
    const [areas, setAreas] = useState<AreaItem[]>(fallbackAreas);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadAreas();
    }, []);

    async function loadAreas() {
        const { data, error } = await supabase
            .from('home_items')
            .select('id, name, item_slug, status')
            .eq('system', 'Plumbing')
            .eq('category', 'Area')
            .order('name', { ascending: true });

        if (error) {
            setMessage(`Could not load areas: ${error.message}`);
            return;
        }

        if (data && data.length > 0) {
            const mergedAreas = [...fallbackAreas, ...data];

            const uniqueAreas = mergedAreas.filter(
                (area, index, self) =>
                    index ===
                    self.findIndex(
                        (a) =>
                            (a.item_slug || a.name) ===
                            (area.item_slug || area.name)
                    )
            );

            setAreas(uniqueAreas);
            setMessage('');
        }
    }

    function openArea(area: AreaItem) {
        if (area.name === 'Kitchen') {
            router.push('/item/kitchen-faucet' as any)
            return;
        }

        if (area.item_slug) {
            router.push(`/item/${area.item_slug}` as any);
        }
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <Text
                    onPress={() => router.push('/system/plumbing' as any)}
                    style={backStyle}
                >
                    ← Back
                </Text>

                <View style={headerRowStyle}>
                    <View>
                        <Text style={titleStyle}>Plumbing Areas</Text>

                        <Text style={subtitleStyle}>
                            Plumbing organized by rooms and locations.
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={() => router.push('/item/create' as any)}
                        style={addButtonStyle}
                    >
                        <Text style={addButtonTextStyle}>+ Add Area</Text>
                    </TouchableOpacity>
                </View>

                {!!message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                <View style={gridStyle}>
                    {areas.map((area) => (
                        <TouchableOpacity
                            key={area.id || area.name}
                            onPress={() => openArea(area)}
                            style={cardStyle}
                        >
                            <View style={iconBoxStyle}>
                                <MaterialCommunityIcons
                                    name={getAreaIconName(area.name) as any}
                                    size={52}
                                    color="#071B33"
                                />

 


                            </View>
                            <Text style={cardTitleStyle} numberOfLines={2}>
                                {area.name}
                            </Text>

                            <View style={statusBadgeStyle}>
                                <Text style={statusBadgeTextStyle}>
                                    {area.status || 'Missing Information'}
                                </Text>
                            </View>

                            <Text style={openTextStyle}>Open →</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}

const backStyle = {
    fontSize: 18,
    fontWeight: '900' as const,
    color: '#071B33',
    marginTop: 20,
    marginBottom: 20,
};

const headerRowStyle = {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: 16,
    marginBottom: 24,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
    color: '#071B33',
};

const subtitleStyle = {
    color: '#637083',
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
};

const addButtonStyle = {
    backgroundColor: '#071B33',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginTop: 4,
};

const addButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900' as const,
};

const messageBoxStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    marginBottom: 14,
};

const messageTextStyle = {
    color: '#637083',
    fontSize: 14,
};

const gridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 14,
};

const cardStyle = {
    width: '18.8%' as const,
    minWidth: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E3E8EF',
};

const iconBoxStyle = {
    height: 90,
    backgroundColor: '#E7ECF3',
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
};






const cardTitleStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    color: '#071B33',
    minHeight: 42,
};

const statusBadgeStyle = {
    marginTop: 10,
    backgroundColor: '#FFF4D6',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start' as const,
};

const statusBadgeTextStyle = {
    color: '#B7791F',
    fontSize: 12,
    fontWeight: '900' as const,
};

const openTextStyle = {
    color: '#0B5FFF',
    marginTop: 12,
    fontWeight: '900' as const,
};