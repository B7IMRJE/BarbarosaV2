import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getStatusCardStyle } from '../../../components/cards/SystemStatusCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../../lib/activeProperty';
import {
    scoreAreaHealth,
    statusForCard,
    type HomeHealthItem,
} from '../../../lib/homeHealth';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/useTheme';

type AreaItem = {
    id?: string;
    name: string | null;
    item_slug?: string | null;
    system?: string | null;
    status?: string | null;
    category?: string | null;
    location?: string | null;
    parent_area?: string | null;
    archived?: boolean | null;
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
    return getAreaLabel(area).trim().toLowerCase();
}

function getAreaLabel(area: AreaItem) {
    return area.name || area.location || 'Unnamed Area';
}

function getItemIcon(item: AreaItem) {
    const lowerName = getAreaLabel(item).toLowerCase();

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

function isBathroomArea(area: AreaItem) {
    return getAreaLabel(area).toLowerCase().includes('bathroom');
}

function nextBathroomName(areas: AreaItem[]) {
    const usedNumbers = areas
        .map((area) => getAreaLabel(area).match(/^bathroom\s+(\d+)$/i))
        .filter((match): match is RegExpMatchArray => !!match)
        .map((match) => Number(match[1]));
    let number = 1;

    while (usedNumbers.includes(number)) number += 1;

    return `Bathroom ${number}`;
}

export default function PlumbingAreasScreen() {
    const { theme } = useTheme();
    const [areas, setAreas] = useState<AreaItem[]>(fallbackAreas);
    const [homeItems, setHomeItems] = useState<HomeHealthItem[]>([]);
    const [message, setMessage] = useState('');

    useEffect(() => {
        loadAreas();
    }, []);

    async function loadAreas() {
        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
            setAreas(fallbackAreas);
            setHomeItems([]);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const { data, error } = await supabase
            .from('home_items')
            .select('*')
            .eq('property_id', activeProperty.propertyId)
            .order('name', { ascending: true });

        if (error) {
            setMessage(`Could not load areas: ${error.message}`);
            return;
        }

        const allItems = (data || []) as AreaItem[];
        const activeItems = allItems.filter((item) => !item.archived);
        setHomeItems(activeItems as HomeHealthItem[]);

        const areaItems = activeItems.filter(
            (item) => item.category === 'Area' && item.system === 'Plumbing' && !item.parent_area?.trim()
        );
        const activeAreaKeys = new Set(areaItems.map(getAreaKey));
        const archivedAreaKeys = new Set(
            allItems
                .filter((item) => item.archived && item.category === 'Area' && item.system === 'Plumbing' && !item.parent_area?.trim())
                .map(getAreaKey)
        );
        const visibleFallbackAreas = fallbackAreas.filter((area) => {
            const key = getAreaKey(area);
            return !archivedAreaKeys.has(key) || activeAreaKeys.has(key);
        });

        setAreas(mergeAreaRecords(visibleFallbackAreas, areaItems));

        setMessage('');
    }

    function openArea(area: AreaItem) {
        router.push({
            pathname: '/system/[system]/area/[area]',
            params: {
                system: 'Plumbing',
                area: getAreaLabel(area),
            },
        } as any);
    }

    function openBathroomTemplate(area: AreaItem, duplicate: boolean) {
        router.push({
            pathname: '/area/create',
            params: {
                system: 'Plumbing',
                templateId: 'bathroom',
                areaName: duplicate ? nextBathroomName(areas) : getAreaLabel(area),
                ...(duplicate ? {} : { fillExisting: 'true' }),
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
                            onPress={() =>
                                router.push({
                                    pathname: '/area/create',
                                    params: {
                                        system: 'Plumbing',
                                    },
                                } as any)
                            }
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
                    {areas.map((area) => {
                        const archiveKey = area.id || area.item_slug || getAreaLabel(area);

                        return (
                            <PlumbingAreaCard
                                key={archiveKey}
                                area={area}
                                status={statusForCard(scoreAreaHealth(homeItems, getAreaLabel(area)))}
                                onPress={() => openArea(area)}
                                onAddMissingCards={isBathroomArea(area) ? () => openBathroomTemplate(area, false) : undefined}
                                onDuplicate={isBathroomArea(area) ? () => openBathroomTemplate(area, true) : undefined}
                            />
                        );
                    })}
                </View>
            </View>
        </ScrollView>
    );
}

function mergeAreaRecords(fallbackItems: AreaItem[], savedItems: AreaItem[]) {
    const recordsByKey = new Map<string, AreaItem>();

    fallbackItems.forEach((area) => {
        recordsByKey.set(getAreaKey(area), area);
    });

    savedItems.forEach((area) => {
        const key = getAreaKey(area);
        const fallback = recordsByKey.get(key);

        recordsByKey.set(key, {
            ...fallback,
            ...area,
            name: getAreaLabel(area),
            icon: area.icon || fallback?.icon,
        });
    });

    return [...recordsByKey.values()];
}

function PlumbingAreaCard({
    area,
    status,
    onPress,
    onAddMissingCards,
    onDuplicate,
}: {
    area: AreaItem;
    status: string | null;
    onPress: () => void;
    onAddMissingCards?: () => void;
    onDuplicate?: () => void;
}) {
    const { theme } = useTheme();
    const areaName = getAreaLabel(area);

    return (
        <View
            style={[
                cardStyle,
                {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderRadius: theme.radii.card,
                    borderTopColor: 'rgba(255, 255, 255, 0.96)',
                    borderBottomColor: theme.colors.primary,
                    borderBottomWidth: 7,
                    boxShadow: '0 10px 20px rgba(7, 27, 51, 0.23), inset 0 2px 0 rgba(255, 255, 255, 0.94)',
                },
                getStatusCardStyle(status, theme),
            ]}
        >
            <TouchableOpacity
                onPress={onPress}
                activeOpacity={0.82}
                style={cardOpenAreaStyle}
            >
                <View
                    style={[
                        iconCircleStyle,
                        {
                            backgroundColor: theme.colors.iconBackground,
                        },
                    ]}
                >
                    <Text style={iconTextStyle}>{getItemIcon(area)}</Text>
                </View>
                <Text style={[cardTitleStyle, { color: theme.colors.text }]} numberOfLines={2}>
                    {areaName}
                </Text>
            </TouchableOpacity>

            {!!onAddMissingCards && !!onDuplicate && (
                <View style={bathroomActionRowStyle}>
                    <TouchableOpacity
                        onPress={onAddMissingCards}
                        style={[bathroomActionStyle, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                    >
                        <Text style={[bathroomActionTextStyle, { color: theme.colors.text }]}>Add missing cards</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={onDuplicate}
                        style={[bathroomActionStyle, { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceAlt }]}
                    >
                        <Text style={[bathroomActionTextStyle, { color: theme.colors.primary }]}>Duplicate</Text>
                    </TouchableOpacity>
                </View>
            )}

        </View>
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
    padding: 18,
    borderWidth: 2,
    borderCurve: 'continuous' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    flexGrow: 1,
};

const cardOpenAreaStyle = {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    width: '100%' as const,
    flex: 1,
};

const bathroomActionRowStyle = {
    width: '100%' as const,
    gap: 8,
    marginTop: 10,
};

const bathroomActionStyle = {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: 'center' as const,
};

const bathroomActionTextStyle = {
    fontSize: 12,
    fontWeight: '900' as const,
    textAlign: 'center' as const,
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

const cardTitleStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    lineHeight: 20,
    textAlign: 'center' as const,
};
