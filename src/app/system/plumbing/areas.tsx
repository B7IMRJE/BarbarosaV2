import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import SystemStatusCard from '../../../components/cards/SystemStatusCard';
import {
    scoreAreaHealth,
    statusForCard,
    type HomeHealthItem,
} from '../../../lib/homeHealth';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/useTheme';

type AreaItem = {
    id?: string;
    name: string;
    status?: string | null;
    category?: string | null;
    icon?: string;
};

const fallbackAreas: AreaItem[] = [
    { name: 'Kitchen', icon: '🍳' },
    { name: 'Master Bathroom', icon: '🚿' },
    { name: 'Bathroom 2', icon: '🚽' },
    { name: 'Laundry', icon: '🧺' },
    { name: 'Garage', icon: '🚗' },
    { name: 'Exterior', icon: '🏡' },
    { name: 'Water Heater Area', icon: '🔥' },
    { name: 'Main Shutoff Area', icon: '💧' },
];

function getAreaKey(area: AreaItem) {
    return area.name.trim().toLowerCase();
}

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
    const { theme } = useTheme();
    const [areas, setAreas] = useState<AreaItem[]>(fallbackAreas);
    const [plumbingItems, setPlumbingItems] = useState<HomeHealthItem[]>([]);
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
            .select('*')
            .eq('user_id', user.id)
            .eq('system', 'Plumbing')
            .or('archived.eq.false,archived.is.null')
            .order('name', { ascending: true });

        if (error) {
            setMessage(`Could not load areas: ${error.message}`);
            return;
        }

        const allItems = (data || []) as AreaItem[];
        setPlumbingItems(allItems as HomeHealthItem[]);

        const areaItems = allItems.filter((item) => item.category === 'Area');

        if (areaItems.length > 0) {
            const mergedAreas = [...fallbackAreas, ...areaItems];
            const uniqueAreas = mergedAreas.filter(
                (area, index, self) =>
                    index ===
                    self.findIndex((candidate) => getAreaKey(candidate) === getAreaKey(area))
            );

            setAreas(uniqueAreas);
        }

        setMessage('');
    }

    function openArea(area: AreaItem) {
        router.push({
            pathname: '/system/[system]/area/[area]',
            params: {
                system: 'Plumbing',
                area: area.name,
            },
        } as any);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <Text
                    onPress={() => router.push('/system/plumbing' as any)}
                    style={[backStyle, { color: theme.colors.text }]}
                >
                    Back
                </Text>

                <View style={headerRowStyle}>
                    <View style={headerTitleBlockStyle}>
                        <Text style={[titleStyle, { color: theme.colors.text }]}>Plumbing Areas</Text>

                        <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                            Plumbing organized by rooms and locations.
                        </Text>
                    </View>

                    <View style={headerActionsStyle}>
                        <TouchableOpacity
                            onPress={() => router.push('/item/create' as any)}
                            style={[
                                addButtonStyle,
                                {
                                    backgroundColor: theme.colors.primary,
                                    borderRadius: theme.radii.button,
                                },
                            ]}
                        >
                            <Text style={[addButtonTextStyle, { color: theme.colors.primaryText }]}>+ Add Area</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {!!message && (
                    <View
                        style={[
                            messageBoxStyle,
                            {
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                            },
                        ]}
                    >
                        <Text style={[messageTextStyle, { color: theme.colors.text }]}>{message}</Text>
                    </View>
                )}

                <View style={gridStyle}>
                    {areas.map((area) => (
                        <SystemStatusCard
                            key={area.id || area.name}
                            title={area.name}
                            icon={getItemIcon(area)}
                            status={statusForCard(scoreAreaHealth(plumbingItems, area.name))}
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
    marginTop: 20,
    marginBottom: 20,
};

const headerRowStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: 12,
    marginBottom: 24,
};

const headerTitleBlockStyle = {
    flexBasis: 280,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%' as const,
};

const headerActionsStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end' as const,
    gap: 8,
    maxWidth: '100%' as const,
};

const titleStyle = {
    fontSize: 34,
    fontWeight: '900' as const,
};

const subtitleStyle = {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
};

const addButtonStyle = {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginTop: 4,
    maxWidth: '100%' as const,
    alignItems: 'center' as const,
};

const addButtonTextStyle = {
    fontSize: 15,
    fontWeight: '900' as const,
};

const messageBoxStyle = {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    marginBottom: 14,
};

const messageTextStyle = {
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
