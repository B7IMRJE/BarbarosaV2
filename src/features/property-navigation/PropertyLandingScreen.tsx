import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import HomeHeader from '../../components/HomeHeader';
import { MainDestinationCard } from '../../components/homeos/HomeOSVisualFoundation';
import { activePropertyErrorMessage, requireActivePropertyMembership } from '../../lib/activeProperty';
import { formatSingleLineAddress, loadActiveHomeIdentity, type HomeIdentity } from '../../lib/homeIdentity';
import { resolveHomeOSContainerGrid } from '../../lib/homeos-responsive-layout';
import { getHomeOSVisualFoundation } from '../../theme/homeos-visual-foundation';
import { useTheme } from '../../theme/useTheme';

export default function PropertyLandingScreen() {
    const { scaleFont, scaleIcon, theme } = useTheme();
    const { width } = useWindowDimensions();
    const foundation = getHomeOSVisualFoundation(theme, scaleIcon, scaleFont);
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
    const columns = resolveHomeOSContainerGrid(width, foundation.grid.areaMinimumWidth * 2);

    return (
        <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: foundation.spacing.comfortable, paddingBottom: scaleIcon(42), alignItems: 'center' }}>
            <View style={{ width: '100%', maxWidth: 960, gap: foundation.spacing.regular }}>
                <HomeHeader />
                <Text selectable style={foundation.typography.label}>{propertyLabel}</Text>
                <Text selectable style={[foundation.typography.destinationTitle, { fontSize: scaleFont(30) }]}>Your property</Text>
                {loading ? <ActivityIndicator color={theme.colors.primary} style={{ marginTop: scaleIcon(32) }} /> : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: foundation.grid.gap }}>
                        <MainDestinationCard title="Home" description="Everything inside your home" onPress={() => router.push('/home/interior' as never)} style={{ flexGrow: 1, flexBasis: columns > 1 ? scaleIcon(330) : '100%', maxWidth: columns > 1 ? scaleIcon(460) : undefined }} />
                        <MainDestinationCard title="Exterior" description="Everything outside your home" onPress={() => router.push('/home/exterior' as never)} style={{ flexGrow: 1, flexBasis: columns > 1 ? scaleIcon(330) : '100%', maxWidth: columns > 1 ? scaleIcon(460) : undefined }} />
                    </View>
                )}
                <Text selectable style={foundation.typography.body}>Services are available from the secondary navigation.</Text>
                {!!message && <Text selectable style={{ color: theme.colors.danger, fontSize: scaleFont(14) }}>{message}</Text>}
            </View>
        </ScrollView>
    );
}
