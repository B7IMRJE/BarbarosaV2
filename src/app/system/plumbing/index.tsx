


import HomeHeader from '../../../components/HomeHeader';
import SystemStatusCard from '../../../components/cards/SystemStatusCard';





import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import {
    scorePlumbingCategories,
    statusForCard,
    type HomeHealthItem,
} from '../../../lib/homeHealth';
import { getSystemLabel } from '../../../lib/homeSystems';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../theme/useTheme';

const plumbingSections = [
    {
        title: 'Areas',
        icon: '🏠',
        route: '/system/plumbing/areas',
    },
    {
        title: 'Fixtures',
        icon: '🚰',
        route: '/system/plumbing/fixtures',
    },
    {
        title: 'Equipment',
        icon: '🔧',
        route: '/system/plumbing/equipment',
    },
];

export default function PlumbingSystemScreen() {
    const { theme } = useTheme();
    const [items, setItems] = useState<HomeHealthItem[]>([]);

    useEffect(() => {
        loadPlumbingItems();
    }, []);

    const categorySummaries = useMemo(() => scorePlumbingCategories(items), [items]);

    async function loadPlumbingItems() {
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data } = await supabase
            .from('home_items')
            .select('*')
            .eq('user_id', user.id)
            .eq('system', 'Plumbing')
            .or('archived.eq.false,archived.is.null');

        setItems((data || []) as HomeHealthItem[]);
    }

    return (
        <ScrollView
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            contentContainerStyle={{
                padding: 20,
                paddingBottom: 40,
                alignItems: 'center',
            }}
        >
            <View style={{ width: '100%', maxWidth: 900 }}>
                <HomeHeader />

                <Text style={{ fontSize: 34, fontWeight: '900', color: theme.colors.text }}>
                    {getSystemLabel('Plumbing')}
                </Text>

                <Text
                    style={{
                        color: theme.colors.mutedText,
                        marginTop: 8,
                        marginBottom: 24,
                        fontSize: 16,
                        lineHeight: 22,
                    }}
                >
                    View water service by area, fixture, or equipment. Status is based on real
                    information entered into HomeOS.
                </Text>

                <View
                    style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: 14,
                    }}
                >
                    {plumbingSections.map((section) => (
                        <SystemStatusCard
                            key={section.title}
                            title={section.title}
                            icon={section.icon}
                            status={statusForCard(categorySummaries[section.title as keyof typeof categorySummaries])}
                            onPress={() => router.push(section.route as any)}
                            style={{ width: '31.8%', minWidth: 156, flexGrow: 1 }}
                        />
                    ))}
                </View>
            </View>
        </ScrollView>
    );
}
