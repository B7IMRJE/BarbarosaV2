import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getStatusCardStyle } from '../../../../components/cards/SystemStatusCard';
import ThemedButton from '../../../../components/theme/ThemedButton';
import ThemedCard from '../../../../components/theme/ThemedCard';
import { getSystemLabel } from '../../../../lib/homeSystems';
import { supabase } from '../../../../lib/supabase';
import { useTheme } from '../../../../theme/useTheme';

type AreaHomeItem = {
    id?: string;
    name: string | null;
    system: string | null;
    item_slug: string | null;
    category: string | null;
    status: string | null;
    location: string | null;
    parent_area: string | null;
};

export default function AreaScreen() {
    const { theme } = useTheme();
    const { system, area, refresh } = useLocalSearchParams<{
        system: string;
        area: string;
        refresh?: string;
    }>();

    const systemName = system ? String(system) : 'System';
    const systemLabel = getSystemLabel(systemName);
    const areaName = area ? String(area) : 'Area';
    const refreshKey = String(refresh || '');
    const [items, setItems] = useState<AreaHomeItem[]>([]);
    const [message, setMessage] = useState('');
    const itemSections = groupItemsBySystem(items);

    useEffect(() => {
        loadAreaItems();
    }, [systemName, areaName, refreshKey]);

    async function loadAreaItems() {
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
            .select('id, name, system, item_slug, category, status, location, parent_area')
            .eq('user_id', user.id)
            .or('archived.eq.false,archived.is.null')
            .order('system', { ascending: true })
            .order('name', { ascending: true });

        if (error) {
            setMessage(`Could not load items: ${error.message}`);
            return;
        }

        setItems(
            sortAreaItems(
                areaName,
                ((data || []) as AreaHomeItem[]).filter(
                    (item) =>
                        !sameText(item.category, 'Area') &&
                        (sameText(item.location, areaName) || sameText(item.parent_area, areaName))
                )
            )
        );
        setMessage('');
    }

    function createSuggestedItem(category: string, name?: string) {
        router.push({
            pathname: '/item/create',
            params: {
                system: systemName,
                area: areaName,
                category,
                name: name || '',
            },
        } as any);
    }

    return (
        <ScrollView
            style={{
                flex: 1,
                backgroundColor: theme.colors.background,
            }}
            contentContainerStyle={{
                padding: 20,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View
                style={{
                    width: '100%',
                    maxWidth: 1200,
                }}
            >
                <Text
                    onPress={() => router.back()}
                    style={{
                        marginTop: 20,
                        marginBottom: 20,
                        fontSize: 18,
                        color: theme.colors.text,
                        fontWeight: '900',
                    }}
                >
                    Back
                </Text>

                <Text
                    style={{
                        fontSize: 34,
                        fontWeight: '900',
                        color: theme.colors.text,
                        marginBottom: 6,
                    }}
                >
                    {areaName}
                </Text>

                <Text
                    style={{
                        fontSize: 16,
                        color: theme.colors.mutedText,
                        marginBottom: 25,
                    }}
                >
                    {systemLabel}
                </Text>

                <ThemedButton
                    title="+ Add Item"
                    onPress={() => createSuggestedItem('Equipment')}
                    style={{ marginBottom: 24 }}
                />

                {items.length === 0 ? (
                    <ThemedCard style={{ marginBottom: 16 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '900' }}>
                            No items added yet.
                        </Text>
                    </ThemedCard>
                ) : (
                    <View style={sectionListStyle}>
                        {itemSections.map((section) => (
                            <View key={section.title} style={sectionBlockStyle}>
                                <Text style={[sectionHeaderStyle, { color: theme.colors.text }]}>
                                    {section.title}
                                </Text>

                                <View style={gridStyle}>
                                    {section.items.map((item) => (
                                        <AreaItemCard key={item.id || item.item_slug || item.name} item={item} />
                                    ))}
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {!!message && (
                    <ThemedCard style={{ marginBottom: 16 }}>
                        <Text style={{ color: theme.colors.mutedText, fontWeight: '900' }}>{message}</Text>
                    </ThemedCard>
                )}
            </View>
        </ScrollView>
    );
}

function sameText(a?: string | null, b?: string | null) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function AreaItemCard({ item }: { item: AreaHomeItem }) {
    const { theme } = useTheme();
    const itemName = item.name || 'Unnamed Item';
    const systemLabel = item.system ? getSystemLabel(item.system) : '';
    const itemSlug = item.item_slug || '';

    return (
        <TouchableOpacity
            onPress={() => itemSlug && router.push(`/item/${itemSlug}` as any)}
            activeOpacity={0.82}
            disabled={!itemSlug}
            style={[
                itemCardStyle,
                { borderRadius: theme.radii.card },
                getStatusCardStyle(item.status, theme),
            ]}
        >
            <View style={[iconCircleStyle, { backgroundColor: theme.colors.iconBackground }]}>
                <Text style={iconTextStyle}>{getItemIcon(item)}</Text>
            </View>

            <Text
                style={[itemTitleStyle, { color: theme.colors.text }]}
                numberOfLines={2}
                ellipsizeMode="tail"
            >
                {itemName}
            </Text>

            {!!systemLabel && (
                <Text style={[systemLabelStyle, { color: theme.colors.mutedText }]} numberOfLines={1}>
                    {systemLabel}
                </Text>
            )}
        </TouchableOpacity>
    );
}

function sortAreaItems(areaName: string, items: AreaHomeItem[]) {
    const preferredNames = getPreferredItemOrder(areaName);

    return [...items].sort((a, b) => {
        const aName = a.name || '';
        const bName = b.name || '';
        const aIndex = preferredNames.indexOf(normalize(aName));
        const bIndex = preferredNames.indexOf(normalize(bName));

        if (aIndex !== -1 || bIndex !== -1) {
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        }

        return aName.localeCompare(bName);
    });
}

function getPreferredItemOrder(areaName: string) {
    if (!sameText(areaName, 'Kitchen')) return [];

    return [
        'kitchen faucet',
        'garbage disposal',
        'dishwasher connection',
        'hot angle stop',
        'cold angle stop',
        'air gap',
        'refrigerator water line',
        'reverse osmosis',
        'sink drain',
        'p-trap',
        'stove',
        'dishwasher',
        'refrigerator',
        'gfci outlet',
        'garbage disposal switch',
    ];
}

function normalize(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function groupItemsBySystem(items: AreaHomeItem[]) {
    const grouped = new Map<string, AreaHomeItem[]>();

    items.forEach((item) => {
        const title = getAreaItemSectionTitle(item);
        grouped.set(title, [...(grouped.get(title) || []), item]);
    });

    const sortedSections = areaItemSectionOrder
        .map((title) => ({ title, items: grouped.get(title) || [] }))
        .filter((section) => section.items.length > 0);

    const remainingSections = [...grouped.entries()]
        .filter(([title]) => !areaItemSectionOrder.includes(title))
        .map(([title, sectionItems]) => ({ title, items: sectionItems }));

    return [...sortedSections, ...remainingSections];
}

function getAreaItemSectionTitle(item: AreaHomeItem) {
    const category = normalize(item.category || '');
    const system = normalize(item.system || '');

    if (category === 'work history') return 'Work History';
    if (category === 'documents' || system === 'documents') return 'Documents';
    if (system === 'plumbing' || system === 'water service' || system === 'water') return 'Water Service';
    if (system === 'electrical' || system === 'electrical system') return 'Electrical System';
    if (system === 'appliances') return 'Appliances';
    if (system === 'gas' || system === 'gas service') return 'Gas Service';
    if (system === 'hvac' || system === 'ac service' || system === 'heating and cooling') return 'HVAC / AC Service';
    if (
        system === 'drains / sewer' ||
        system === 'drains' ||
        system === 'sewer' ||
        system === 'sewer service'
    ) {
        return 'Sewer Service';
    }
    if (system === 'safety' || system === 'safety system') return 'Safety System';

    return item.system ? getSystemLabel(item.system) : 'Other Items';
}

function getItemIcon(item: AreaHomeItem) {
    const name = normalize(item.name || '');
    const system = normalize(item.system || '');

    if (name.includes('faucet')) return '🚰';
    if (name.includes('garbage disposal')) return '⚙️';
    if (name.includes('dishwasher')) return '🍽️';
    if (name.includes('angle stop') || name.includes('shutoff') || name.includes('valve')) return '🔘';
    if (name.includes('air gap')) return '↕️';
    if (name.includes('refrigerator')) return '🧊';
    if (name.includes('reverse osmosis') || system.includes('water quality')) return '💧';
    if (name.includes('drain') || name.includes('p-trap')) return '🔧';
    if (name.includes('stove')) return '🔥';
    if (name.includes('gfci') || name.includes('switch') || system.includes('electrical')) return '⚡';
    if (system.includes('appliance')) return '🔌';
    if (system.includes('drain')) return '🧰';

    return '🏠';
}

const areaItemSectionOrder = [
    'Water Service',
    'Electrical System',
    'Appliances',
    'Gas Service',
    'HVAC / AC Service',
    'Sewer Service',
    'Safety System',
    'Documents',
    'Work History',
];

const sectionListStyle = {
    gap: 28,
};

const sectionBlockStyle = {
    gap: 14,
};

const sectionHeaderStyle = {
    fontSize: 22,
    fontWeight: '900' as const,
};

const gridStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 14,
};

const itemCardStyle = {
    width: '18.8%' as const,
    minWidth: 160,
    minHeight: 170,
    padding: 18,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    flexGrow: 1,
};

const iconCircleStyle = {
    width: 76,
    height: 76,
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
};

const iconTextStyle = {
    fontSize: 36,
};

const itemTitleStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
    lineHeight: 20,
};

const systemLabelStyle = {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '800' as const,
    textAlign: 'center' as const,
};
