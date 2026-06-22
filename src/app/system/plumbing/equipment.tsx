import HomeHeader from '../../../components/HomeHeader';

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import SystemStatusCard from '../../../components/cards/SystemStatusCard';
import {
    activePropertyErrorMessage,
    isActivePropertyResolutionError,
    requireActivePropertyMembership,
} from '../../../lib/activeProperty';
import { scoreItems, statusForCard } from '../../../lib/homeHealth';
import { isStaffRole, loadCurrentUserRole } from '../../../lib/roles';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/useTheme';

type EquipmentItem = {
    id: string;
    name: string;
    item_slug: string;
    install_state: string | null;
    status: string | null;
    condition?: string | null;
    photo_url?: string | null;
    user_id?: string | null;
};

function getItemIcon(item: EquipmentItem) {
    const lowerName = item.name.toLowerCase();

    if (lowerName.includes('water heater')) return '🔥';
    if (lowerName.includes('expansion tank')) return '🛡️';
    if (lowerName.includes('prv') || lowerName.includes('pressure regulator')) return '🚰';
    if (lowerName.includes('main shutoff') || lowerName.includes('shutoff')) return '🛑';
    if (lowerName.includes('leak')) return '💧';

    return '🔧';
}

export default function PlumbingEquipmentScreen() {
    const { theme } = useTheme();
    const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
    const [canUseStaffTools, setCanUseStaffTools] = useState(false);
    const [message, setMessage] = useState('Loading equipment...');

    useEffect(() => {
        loadEquipment();
    }, []);

    async function loadEquipment() {
        setMessage('Loading equipment...');

        let activeProperty;

        try {
            activeProperty = await requireActivePropertyMembership();
        } catch (error) {
            setEquipment([]);
            setMessage(activePropertyErrorMessage(error));

            if (isActivePropertyResolutionError(error) && error.code === 'not_authenticated') {
                router.replace('/auth/login' as any);
            } else if (isActivePropertyResolutionError(error) && error.code === 'no_active_property') {
                router.replace('/onboarding/create-home' as any);
            }

            return;
        }

        setCanUseStaffTools(isStaffRole(await loadCurrentUserRole()));

        const { data, error } = await supabase
            .from('home_items')
            .select('*')
            .eq('property_id', activeProperty.propertyId)
            .eq('system', 'Plumbing')
            .eq('category', 'Equipment')
            .or('archived.eq.false,archived.is.null')
            .order('name', { ascending: true });

        if (error) {
            setMessage(`Error: ${error.message}`);
            return;
        }

        setEquipment(data || []);
        setMessage('');
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <HomeHeader />

                <View style={headerRowStyle}>
                    <View style={headerTitleBlockStyle}>
                        <Text style={[titleStyle, { color: theme.colors.text }]}>Plumbing Equipment</Text>
                        <Text style={[subtitleStyle, { color: theme.colors.mutedText }]}>
                            Main plumbing systems and equipment.
                        </Text>
                    </View>

                    <View style={headerActionsStyle}>
                        {canUseStaffTools && (
                            <TouchableOpacity
                                onPress={() => router.push('/estimate' as any)}
                                style={[
                                    secondaryButtonStyle,
                                    {
                                        backgroundColor: theme.colors.secondaryButton,
                                        borderColor: theme.colors.border,
                                        borderRadius: theme.radii.button,
                                    },
                                ]}
                            >
                                <Text style={[secondaryButtonTextStyle, { color: theme.colors.secondaryButtonText }]}>View Estimate</Text>
                            </TouchableOpacity>
                        )}

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
                            <Text style={[addButtonTextStyle, { color: theme.colors.primaryText }]}>+ Add Equipment</Text>
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
                    {equipment.map((item) => (
                        <SystemStatusCard
                            key={item.id}
                            title={item.name}
                            icon={getItemIcon(item)}
                            status={statusForCard(scoreItems([item]))}
                            onPress={() => router.push(`/item/${item.item_slug}` as any)}
                            style={cardStyle}
                        />
                    ))}
                </View>

                {equipment.length === 0 && !message && (
                    <View
                        style={[
                            messageBoxStyle,
                            {
                                backgroundColor: theme.colors.surface,
                                borderColor: theme.colors.border,
                            },
                        ]}
                    >
                        <Text style={[messageTextStyle, { color: theme.colors.text }]}>
                            No plumbing equipment found for this logged-in user.
                        </Text>
                    </View>
                )}
            </View>
        </ScrollView>
    );
}

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

const headerActionsStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end' as const,
    gap: 8,
    maxWidth: '100%' as const,
};

const secondaryButtonStyle = {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    marginTop: 4,
    maxWidth: '100%' as const,
    alignItems: 'center' as const,
};

const secondaryButtonTextStyle = {
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
