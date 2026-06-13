import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import SystemStatusCard from '../../../components/cards/SystemStatusCard';
import { supabase } from '../../../lib/supabase';

type AreaItem = {
    id?: string;
    name: string;
    item_slug?: string;
    status?: string | null;
    icon?: string;
};

const fallbackAreas: AreaItem[] = [
    { name: 'Kitchen', item_slug: 'kitchen-area', icon: '🍳' },
    { name: 'Master Bathroom', item_slug: 'master-bathroom-area', icon: '🚿' },
    { name: 'Bathroom 2', item_slug: 'bathroom-2-area', icon: '🚽' },
    { name: 'Laundry', item_slug: 'laundry-area', icon: '🧺' },
    { name: 'Garage', item_slug: 'garage-area', icon: '🚗' },
    { name: 'Exterior', item_slug: 'exterior-area', icon: '🏡' },
    { name: 'Water Heater Area', item_slug: 'water-heater-area', icon: '🔥' },
    { name: 'Main Water Shutoff', item_slug: 'main-water-shutoff', icon: '💧' },
];

function getItemIcon(item: AreaItem) {
    const lowerName = item.name.toLowerCase();

    if (item.icon) return item.icon;
    if (lowerName.includes('kitchen')) return '🍳';
    if (lowerName.includes('bath') || lowerName.includes('shower')) return '🚿';
    if (lowerName.includes('laundry')) return '🧺';
    if (lowerName.includes('garage')) return '🚗';
    if (lowerName.includes('exterior')) return '🏡';
    if (lowerName.includes('water heater')) return '🔥';
    if (lowerName.includes('shutoff')) return '💧';

    return '🏠';
}

export default function PlumbingAreasScreen() {
    const [areas, setAreas] = useState<AreaItem[]>(fallbackAreas);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadAreas();
    }, []);

    async function loadAreas() {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setMessage('Not logged in.');
            router.replace('/auth/login' as any);
            return;
        }

        const { data, error } = await supabase
            .from('home_items')
            .select('id, name, item_slug, status')
            .eq('user_id', user.id)
            .eq('system', 'Plumbing')
            .eq('category', 'Area')
            .or('archived.eq.false,archived.is.null')
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
                        (candidate) =>
                            (candidate.item_slug || candidate.name) ===
                            (area.item_slug || area.name)
                    )
            );

            setAreas(uniqueAreas);
        }

        setMessage('');
    }

    function openArea(area: AreaItem) {
        if (area.name === 'Kitchen') {
            router.push('/item/kitchen-faucet' as any);
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
                    Back
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
                        <SystemStatusCard
                            key={area.id || area.name}
                            title={area.name}
                            icon={getItemIcon(area)}
                            status={area.status}
                            onPress={() => openArea(area)}
                            style={cardStyle}
                        />
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
    minHeight: 190,
};
