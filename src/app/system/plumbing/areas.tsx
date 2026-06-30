import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { getStatusCardStyle } from '../../../components/cards/SystemStatusCard';
import ThemedButton from '../../../components/theme/ThemedButton';
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

export default function PlumbingAreasScreen() {
    const { theme } = useTheme();
    const [areas, setAreas] = useState<AreaItem[]>(fallbackAreas);
    const [homeItems, setHomeItems] = useState<HomeHealthItem[]>([]);
    const [archivingAreaId, setArchivingAreaId] = useState<string | null>(null);
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

    function confirmArchiveArea(area: AreaItem) {
        const title = getAreaLabel(area);

        Alert.alert(
            `Archive ${title}?`,
            'This hides the area from HomeOS without deleting your home or account.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Archive',
                    style: 'destructive',
                    onPress: () => {
                        void archiveArea(area);
                    },
                },
            ]
        );
    }

    async function archiveArea(area: AreaItem) {
        const areaLabel = getAreaLabel(area);
        const archiveKey = area.id || area.item_slug || areaLabel;

        setArchivingAreaId(archiveKey);
        setMessage('Checking area before archiving...');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
            setArchivingAreaId(null);

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        const { data, error } = await supabase
            .from('home_items')
            .select('id, name, item_slug, system, status, category, location, parent_area, archived')
            .eq('property_id', activeProperty.propertyId)
            .eq('system', 'Plumbing')
            .or('archived.eq.false,archived.is.null');

        if (error) {
            setMessage(`Could not check area: ${error.message}`);
            setArchivingAreaId(null);
            return;
        }

        const rows = (data || []) as AreaItem[];
        const childCount = rows.filter((row) =>
            row.id !== area.id && isChildOfArea(row, areaLabel)
        ).length;

        if (childCount > 0) {
            setMessage('Move or archive the items inside this area before archiving it.');
            setArchivingAreaId(null);
            return;
        }

        if (area.id) {
            const { error: archiveError } = await supabase
                .from('home_items')
                .update({ archived: true })
                .eq('id', area.id)
                .eq('property_id', activeProperty.propertyId);

            if (archiveError) {
                setMessage(`Archive failed: ${archiveError.message}`);
                setArchivingAreaId(null);
                return;
            }
        } else {
            const { error: markerError } = await supabase
                .from('home_items')
                .insert({
                    user_id: activeProperty.userId,
                    property_id: activeProperty.propertyId,
                    item_slug: makeArchiveMarkerSlug(activeProperty.propertyId, areaLabel),
                    name: areaLabel,
                    system: 'Plumbing',
                    category: 'Area',
                    location: areaLabel,
                    parent_area: '',
                    status: 'Missing Information',
                    install_state: 'Unknown',
                    archived: true,
                });

            if (markerError) {
                setMessage(`Archive failed: ${markerError.message}`);
                setArchivingAreaId(null);
                return;
            }
        }

        setMessage(`${areaLabel} archived.`);
        setArchivingAreaId(null);
        await loadAreas();
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
                                onArchive={() => confirmArchiveArea(area)}
                                archiveTitle={archivingAreaId === archiveKey ? 'Archiving...' : 'Archive Area'}
                                archiveDisabled={!!archivingAreaId}
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

function isChildOfArea(item: AreaItem, areaName: string) {
    if (item.category === 'Area') {
        return sameText(item.parent_area, areaName);
    }

    return sameText(item.parent_area, areaName) ||
        (sameText(item.location, areaName) && !String(item.parent_area || '').trim());
}

function sameText(a?: string | null, b?: string | null) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function makeArchiveMarkerSlug(propertyId: string, areaName: string) {
    return `archived-area-${propertyId}-plumbing-${makeSlug(areaName)}`;
}

function makeSlug(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

function PlumbingAreaCard({
    area,
    status,
    onPress,
    onArchive,
    archiveTitle,
    archiveDisabled,
}: {
    area: AreaItem;
    status: string | null;
    onPress: () => void;
    onArchive: () => void;
    archiveTitle: string;
    archiveDisabled: boolean;
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

            <ThemedButton
                title={archiveTitle}
                variant="danger"
                disabled={archiveDisabled}
                onPress={onArchive}
                style={archiveButtonStyle}
                textStyle={archiveButtonTextStyle}
            />
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
    borderWidth: 1,
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

const archiveButtonStyle = {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    width: '100%' as const,
};

const archiveButtonTextStyle = {
    fontSize: 13,
};
