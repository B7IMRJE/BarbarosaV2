import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../../../components/HomeHeader';
import { addItemToEstimateDraft } from '../../../lib/estimateDraft';
import { supabase } from '../../../lib/supabase';

type FixtureItem = {
    id: string;
    name: string;
    item_slug: string;
    install_state: string | null;
    status: string | null;
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

function getItemIcon(item: FixtureItem) {
    const lowerName = item.name.toLowerCase();

    if (lowerName.includes('toilet')) return '??';
    if (lowerName.includes('faucet')) return '??';
    if (lowerName.includes('shower')) return '??';
    if (lowerName.includes('disposal')) return '???';

    return '??';
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
            .select('id, name, item_slug, install_state, status')
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

    async function handleAddToEstimate(fixture: FixtureItem) {
        await addItemToEstimateDraft({
            id: fixture.id,
            name: fixture.name,
            item_slug: fixture.item_slug,
            system: 'Plumbing',
            category: 'Fixture',
            status: fixture.status,
            install_state: fixture.install_state,
        });

        setMessage(`${fixture.name} added to estimate.`);
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
                            <Text style={addButtonTextStyle}>+ Add Fixture</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {!!message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>{message}</Text>
                    </View>
                )}

                <View style={gridStyle}>
                    {fixtures.map((fixture) => (
                        <View key={fixture.id} style={[cardStyle, getStatusCardStyle(fixture.status)]}>
                            <TouchableOpacity
                                onPress={() => router.push(`/item/${fixture.item_slug}` as any)}
                                style={cardOpenAreaStyle}
                            >
                                <View style={iconCircleStyle}>
                                    <Text style={iconTextStyle}>{getItemIcon(fixture)}</Text>
                                </View>

                                <Text style={cardTitleStyle} numberOfLines={2}>
                                    {fixture.name}
                                </Text>

                                <Text style={openTextStyle}>Open</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => handleAddToEstimate(fixture)}
                                style={estimateButtonStyle}
                            >
                                <Text style={estimateButtonTextStyle}>Add To Estimate</Text>
                            </TouchableOpacity>
                        </View>
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
