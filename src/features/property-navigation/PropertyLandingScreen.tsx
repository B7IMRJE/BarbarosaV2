import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import ThemedCard from '../../components/theme/ThemedCard';
import { activePropertyErrorMessage, requireActivePropertyMembership } from '../../lib/activeProperty';
import { formatSingleLineAddress, loadActiveHomeIdentity, type HomeIdentity } from '../../lib/homeIdentity';
import { useTheme } from '../../theme/useTheme';

export default function PropertyLandingScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const { width } = useWindowDimensions();
    const [identity, setIdentity] = useState<HomeIdentity | null>(null);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            await requireActivePropertyMembership();
            setIdentity(await loadActiveHomeIdentity());
        } catch (error) {
            setMessage(activePropertyErrorMessage(error));
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(useCallback(() => { void load(); }, [load]));
    const propertyLabel = formatSingleLineAddress(identity?.address) || identity?.name || 'My property';
    const cardWidth = width >= 760 ? '48.8%' : '100%';

    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: scaleIcon(20), paddingBottom: scaleIcon(42), alignItems: 'center' }}>
            <View style={{ width: '100%', maxWidth: 960 }}>
                <HomeHeader />
                <Text selectable style={{ color: theme.colors.mutedText, fontSize: scaleFont(15), fontWeight: '800', marginTop: scaleIcon(10) }}>{propertyLabel}</Text>
                <Text style={{ color: theme.colors.text, fontSize: scaleFont(32), fontWeight: '900', marginTop: scaleIcon(5) }}>Your property</Text>
                {loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: scaleIcon(32) }} /> : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scaleIcon(14), marginTop: scaleIcon(24) }}>
                        <ThemedCard onPress={() => router.push('/home/interior' as any)} style={{ width: cardWidth, flexGrow: 1, minHeight: scaleIcon(210), justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: scaleFont(44) }}>⌂</Text>
                            <View><Text style={{ color: theme.colors.text, fontSize: scaleFont(25), fontWeight: '900' }}>My Home</Text><Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(16), fontWeight: '700', marginTop: scaleIcon(6) }}>Rooms and indoor areas</Text></View>
                        </ThemedCard>
                        <ThemedCard onPress={() => router.push('/home/exterior' as any)} style={{ width: cardWidth, flexGrow: 1, minHeight: scaleIcon(210), justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: scaleFont(44) }}>⌂</Text>
                            <View><Text style={{ color: theme.colors.text, fontSize: scaleFont(25), fontWeight: '900' }}>Exterior</Text><Text style={{ color: theme.colors.mutedText, fontSize: scaleFont(16), fontWeight: '700', marginTop: scaleIcon(6) }}>Yards and outdoor areas</Text></View>
                        </ThemedCard>
                    </View>
                )}
                {!!message && <Text selectable style={{ color: theme.colors.danger, fontSize: scaleFont(14), marginTop: scaleIcon(18) }}>{message}</Text>}
            </View>
        </ScrollView>
    );
}
