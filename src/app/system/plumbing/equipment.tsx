





import HomeHeader from '../../../components/HomeHeader';


import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';



import { supabase } from '../../../lib/supabase';




type EquipmentItem = {
    id: string;
    name: string;
    item_slug: string;
    install_state: string | null;
    status: string | null;
    photo_url?: string | null;
};

export default function PlumbingEquipmentScreen() {
    const [equipment, setEquipment] = useState<EquipmentItem[]>([]);
    const [message, setMessage] = useState('Loading equipment...');

    useEffect(() => {
        loadEquipment();
    }, []);

    async function loadEquipment() {
        const { data, error } = await supabase
            .from('home_items')
            .select('id, name, item_slug, install_state, status, photo_url')
            .eq('system', 'Plumbing')
            .eq('category', 'Equipment')
            .eq('archived', false)
            .order('name', { ascending: true });

        if (error) {
            setMessage(`Could not load equipment: ${error.message}`);
            return;
        }

        setEquipment(data || []);
        setMessage('');
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

                    <TouchableOpacity
                        onPress={() => router.push('/item/create' as any)}
                        style={addButtonStyle}
                    >
                        <Text style={addButtonTextStyle}>+ Add Equipment</Text>
                    </TouchableOpacity>
                </View>

                {!!message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                <View style={gridStyle}>
                    {equipment.map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            onPress={() => router.push(`/item/${item.item_slug}` as any)}
                            style={cardStyle}
                        >
                            <View style={photoBoxStyle}>
                                {item.photo_url ? (
                                    <Image
                                        source={{ uri: item.photo_url }}
                                        style={cardImageStyle}
                                        resizeMode="contain"
                                    />
                                ) : (
                                    <>
                                        <Text style={photoIconStyle}>📷</Text>
                                        <Text style={photoTextStyle}>No Photo</Text>
                                    </>
                                )}
                            </View>

                            <Text style={cardTitleStyle} numberOfLines={2}>
                                {item.name}
                            </Text>

                            <View style={badgeRowStyle}>
                                <View style={installBadgeStyle}>
                                    <Text style={installBadgeTextStyle}>
                                        {item.install_state || 'Unknown'}
                                    </Text>
                                </View>

                                <View style={statusBadgeStyle}>
                                    <Text style={statusBadgeTextStyle}>
                                        {item.status || 'Missing Information'}
                                    </Text>
                                </View>
                            </View>

                            <Text style={openTextStyle}>Open →</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {equipment.length === 0 && !message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>
                            No plumbing equipment found. Use + Add Equipment to create one.
                        </Text>
                    </View>
                )}
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

const photoBoxStyle = {
    height: 90,
    backgroundColor: '#E7ECF3',
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: 12,
};

const cardImageStyle = {
    width: '100%' as const,
    height: '100%' as const,
    borderRadius: 14,
};


const photoIconStyle = {
    fontSize: 24,
    marginBottom: 4,
};

const photoTextStyle = {
    color: '#637083',
    fontSize: 12,
    fontWeight: '900' as const,
};

const cardTitleStyle = {
    fontSize: 16,
    fontWeight: '900' as const,
    color: '#071B33',
    minHeight: 42,
};

const badgeRowStyle = {
    marginTop: 10,
    gap: 6,
};

const installBadgeStyle = {
    backgroundColor: '#E7ECF3',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignSelf: 'flex-start' as const,
};

const installBadgeTextStyle = {
    color: '#637083',
    fontSize: 12,
    fontWeight: '900' as const,
};

const statusBadgeStyle = {
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