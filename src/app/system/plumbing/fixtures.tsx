import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../../../components/HomeHeader';
import { supabase } from '../../../lib/supabase';

type FixtureItem = {
    id: string;
    name: string;
    item_slug: string;
    status: string | null;
};

function getFixtureIconName(name: string) {
    const lower = name.toLowerCase();

    if (lower.includes('faucet')) return 'faucet';
    if (lower.includes('drain')) return 'pipe';
    if (lower.includes('disposal')) return 'cog';
    if (lower.includes('dishwasher')) return 'dishwasher';
    if (lower.includes('toilet')) return 'toilet';
    if (lower.includes('shower')) return 'shower';
    if (lower.includes('tub')) return 'bathtub';
    if (lower.includes('laundry')) return 'washing-machine';
    if (lower.includes('hose')) return 'water-pump';

    return 'tools';
}

export default function PlumbingFixturesScreen() {
    const [fixtures, setFixtures] = useState<FixtureItem[]>([]);
    const [message, setMessage] = useState('Loading fixtures...');

    useEffect(() => {
        loadFixtures();
    }, []);

    async function loadFixtures() {
        const { data, error } = await supabase
            .from('home_items')
            .select('id, name, item_slug, status')
            .eq('system', 'Plumbing')
            .eq('category', 'Fixture')
            .eq('archived', false)
            .order('name', { ascending: true });

        if (error) {
            setMessage(`Could not load fixtures: ${error.message}`);
            return;
        }

        setFixtures(data || []);
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
                        <Text style={titleStyle}>Plumbing Fixtures</Text>
                        <Text style={subtitleStyle}>
                            Faucets, toilets, drains, showers, and fixture connections.
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={() => router.push('/item/create' as any)}
                        style={addButtonStyle}
                    >
                        <Text style={addButtonTextStyle}>+ Add Fixture</Text>
                    </TouchableOpacity>
                </View>

                {!!message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                <View style={gridStyle}>
                    {fixtures.map((fixture) => (
                        <TouchableOpacity
                            key={fixture.id}
                            onPress={() => router.push(`/item/${fixture.item_slug}` as any)}
                            style={cardStyle}
                        >
                            <View style={iconBoxStyle}>
                                <MaterialCommunityIcons
                                    name={getFixtureIconName(fixture.name) as any}
                                    size={44}
                                    color="#071B33"
                                />
                            </View>

                            <Text style={cardTitleStyle} numberOfLines={2}>
                                {fixture.name}
                            </Text>

                            <View style={statusBadgeStyle}>
                                <Text style={statusBadgeTextStyle}>
                                    {fixture.status || 'Missing Information'}
                                </Text>
                            </View>

                            <Text style={openTextStyle}>Open →</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {fixtures.length === 0 && !message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>
                            No plumbing fixtures found. Use + Add Fixture to create one.
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