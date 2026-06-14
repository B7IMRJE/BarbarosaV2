import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import HomeHeader from '../../../components/HomeHeader';
import SystemStatusCard from '../../../components/cards/SystemStatusCard';
import { isStaffRole, loadCurrentUserRole } from '../../../lib/roles';
import { supabase } from '../../../lib/supabase';

type FixtureItem = {
    id: string;
    name: string;
    item_slug: string;
    install_state: string | null;
    status: string | null;
};

function getItemIcon(item: FixtureItem) {
    const lowerName = item.name.toLowerCase();

    if (lowerName.includes('toilet')) return '🚽';
    if (lowerName.includes('faucet')) return '🚰';
    if (lowerName.includes('shower')) return '🚿';
    if (lowerName.includes('disposal')) return '🗑️';

    return '🧰';
}

export default function PlumbingFixturesScreen() {
    const [fixtures, setFixtures] = useState<FixtureItem[]>([]);
    const [canUseStaffTools, setCanUseStaffTools] = useState(false);
    const [message, setMessage] = useState('Loading fixtures...');

    useEffect(() => {
        loadFixtures();
    }, []);

    async function loadFixtures() {
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            setMessage('Not logged in.');
            router.replace('/auth/login' as any);
            return;
        }

        setCanUseStaffTools(isStaffRole(await loadCurrentUserRole()));

        const { data, error } = await supabase
            .from('home_items')
            .select('id, name, item_slug, install_state, status')
            .eq('user_id', user.id)
            .eq('system', 'Plumbing')
            .eq('category', 'Fixture')
            .or('archived.eq.false,archived.is.null')
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
                    <View style={headerTitleBlockStyle}>
                        <Text style={titleStyle}>Plumbing Fixtures</Text>
                        <Text style={subtitleStyle}>
                            Faucets, toilets, drains, showers, and fixture connections.
                        </Text>
                    </View>

                    <View style={headerActionsStyle}>
                        {canUseStaffTools && (
                            <TouchableOpacity
                                onPress={() => router.push('/estimate' as any)}
                                style={secondaryButtonStyle}
                            >
                                <Text style={secondaryButtonTextStyle}>View Estimate</Text>
                            </TouchableOpacity>
                        )}

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
                        <SystemStatusCard
                            key={fixture.id}
                            title={fixture.name}
                            icon={getItemIcon(fixture)}
                            status={fixture.status}
                            onPress={() => router.push(`/item/${fixture.item_slug}` as any)}
                            style={cardStyle}
                        />
                    ))}
                </View>

                {fixtures.length === 0 && !message && (
                    <View style={messageBoxStyle}>
                        <Text style={messageTextStyle}>
                            No plumbing fixtures have been added yet.
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
    maxWidth: '100%' as const,
    alignItems: 'center' as const,
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
    gap: 8,
    maxWidth: '100%' as const,
};

const secondaryButtonStyle = {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#E3E8EF',
    marginTop: 4,
    maxWidth: '100%' as const,
    alignItems: 'center' as const,
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
    minHeight: 190,
};
