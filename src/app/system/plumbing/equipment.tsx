import HomeHeader from '../../../components/HomeHeader';

import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { addItemToEstimateDraft } from '../../../lib/estimateDraft';
import { supabase } from '../../../lib/supabase';

type EquipmentItem = {
    id: string;
    name: string;
    item_slug: string;
    install_state: string | null;
    status: string | null;
    photo_url?: string | null;
    user_id?: string | null;
};

function getStatusCardStyle(status?: string | null) {
    const normalizedStatus = (status || '').trim().toLowerCase();

    if (normalizedStatus === 'good') {
        return { backgroundColor: '#EAF8EF', borderColor: '#BFE8CC' };
    }

    if (normalizedStatus === 'not inspected') {
        return { backgroundColor: '#FFF8DB', borderColor: '#F4E6A0' };
    }

    if (normalizedStatus === 'needs attention') {
        return { backgroundColor: '#FFF0DD', borderColor: '#F2C28F' };
    }

    if (normalizedStatus === 'emergency') {
        return { backgroundColor: '#FFEAEA', borderColor: '#F1B8B8' };
    }

    if (normalizedStatus === 'active leak' || normalizedStatus === 'active emergency') {
        return { backgroundColor: '#FFD6D6', borderColor: '#E25C5C' };
    }

    return { backgroundColor: '#FFFFFF', borderColor: '#E3E8EF' };
}

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
    const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
    const [message, setMessage] = useState('Loading equipment...');

    useEffect(() => {
        loadEquipment();
    }, []);

    async function loadEquipment() {
        setMessage('Loading equipment...');

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
            .select('id, name, item_slug, install_state, status, photo_url, user_id')
            .eq('user_id', user.id)
            .eq('system', 'Plumbing')
            .eq('category', 'Equipment')
            .or('archived.eq.false,archived.is.null')
            .order('name', { ascending: true });

        if (error) {
            setMessage(`Error: ${error.message} | Logged in user: ${user.id}`);
            return;
        }

        setEquipment(data || []);
        setMessage(`Logged in user: ${user.id} | Equipment found: ${(data || []).length}`);
    }

    async function handleAddToEstimate(item: EquipmentItem) {
        await addItemToEstimateDraft({
            id: item.id,
            name: item.name,
            item_slug: item.item_slug,
            system: 'Plumbing',
            category: 'Equipment',
            status: item.status,
            install_state: item.install_state,
        });

        setMessage(`${item.name} added to estimate.`);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: '#F3F6FA' }}
            contentContainerStyle={{ padding: 20, alignItems: 'center' }}
        >
            <View style={{ width: '100%', maxWidth: 1200 }}>
                <HomeHeader />

                <View style={headerRowStyle}>
                    <View>
                        <Text style={titleStyle}>Plumbing Equipment</Text>
                        <Text style={subtitleStyle}>
                            Main plumbing systems and equipment.
                        </Text>
                    </View>

                    <View style={headerActionsStyle}>
                        <TouchableOpacity
                            onPress={() => router.push('/estimate' as any)}
                            style={secondaryButtonStyle}
                        >
                            <Text style={secondaryButtonTextStyle}>View Estimate</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => router.push('/item/create' as any)}
                            style={addButtonStyle}
                        >
                            <Text style={addButtonTextStyle}>+ Add Equipment</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {!!message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                <View style={gridStyle}>
                    {equipment.map((item) => (
                        <View key={item.id} style={[cardStyle, getStatusCardStyle(item.status)]}>
                            <TouchableOpacity
                                onPress={() => router.push(`/item/${item.item_slug}` as any)}
                                style={cardOpenAreaStyle}
                            >
                                <View style={iconCircleStyle}>
                                    <Text style={iconTextStyle}>{getItemIcon(item)}</Text>
                                </View>

                                <Text style={cardTitleStyle} numberOfLines={2}>
                                    {item.name}
                                </Text>

                                <Text style={openTextStyle}>Open</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => handleAddToEstimate(item)}
                                style={estimateButtonStyle}
                            >
                                <Text style={estimateButtonTextStyle}>Add To Estimate</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>

                {equipment.length === 0 && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>
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

const headerActionsStyle = {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    justifyContent: 'flex-end' as const,
    gap: 10,
};

const secondaryButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    marginTop: 4,
};

const secondaryButtonTextStyle = {
    color: '#071B33',
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
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: 220,
};

const cardOpenAreaStyle = {
    width: '100%' as const,
    alignItems: 'center' as const,
};

const iconCircleStyle = {
    width: 82,
    height: 82,
    backgroundColor: '#E7ECF3',
    borderRadius: 999,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 14,
};

const iconTextStyle = {
    fontSize: 40,
};

const cardTitleStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    color: '#071B33',
    minHeight: 44,
    textAlign: 'center' as const,
};
const openTextStyle = {
    color: '#0B5FFF',
    marginTop: 12,
    fontWeight: '900' as const,
};

const estimateButtonStyle = {
    backgroundColor: '#071B33',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center' as const,
    marginTop: 12,
};

const estimateButtonTextStyle = {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900' as const,
};
