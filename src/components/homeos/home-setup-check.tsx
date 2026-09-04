import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import ThemedButton from '../theme/ThemedButton';
import ThemedCard from '../theme/ThemedCard';
import {
    homeSetupRoute, inspectHomeSetup, isHomeSetupComplete, resolveOwnedHomeSetupScope,
    type HomeSetupStatus,
} from '../../lib/home-setup-integrity';

/** Only mounted outside provider mode. A network error is not an empty home. */
export default function HomeSetupCheck({ propertyId, onRecovered }: {
    propertyId?: string; onRecovered?: () => void;
}) {
    const { theme } = useTheme();
    const [status, setStatus] = useState<HomeSetupStatus | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const [retry, setRetry] = useState(0);
    const consumedRetry = useRef(0);
    useFocusEffect(useCallback(() => {
        let current = true;
        setLoading(true); setError(''); setStatus(null);
        void (async () => {
            const scope = await resolveOwnedHomeSetupScope();
            if (!scope || !current || (propertyId && scope.propertyId !== propertyId)) return;
            const manualRetry = retry > consumedRetry.current;
            consumedRetry.current = retry;
            const result = await inspectHomeSetup(scope, manualRetry);
            if (current) { setStatus(result); if (result.recovered) onRecovered?.(); }
        })().catch(e => { if (current) setError(e instanceof Error ? e.message : 'Could not verify home setup.'); })
            .finally(() => { if (current) setLoading(false); });
        return () => { current = false; };
    }, [propertyId, retry, onRecovered]));
    if (!loading && !error && (!status || isHomeSetupComplete(status))) return null;
    return <ThemedCard style={{ marginVertical: 12 }}>
        {loading ? <View style={{ flexDirection: 'row', gap: 10 }}><ActivityIndicator color={theme.colors.primary} />
            <Text style={{ color: theme.colors.mutedText }}>Checking home setup…</Text></View>
            : <>
                <Text selectable style={{ color: theme.colors.text, fontWeight: '900', fontSize: 18 }}>
                    {error ? 'Home setup could not be checked' : `Finish setup for ${status?.home_name || 'this home'}`}
                </Text>
                <Text selectable style={{ color: theme.colors.mutedText, marginVertical: 10 }}>
                    {error || (status?.can_retry ? 'Your saved starter selection is waiting to finish. Retry without creating another home.'
                        : 'Confirm the missing home details or choose starter areas. You can also choose to keep your current cards. Nothing has been replaced.')}
                </Text>
                {error || status?.can_retry ? <ThemedButton title="Retry setup check" onPress={() => setRetry(n => n + 1)} />
                    : status ? <ThemedButton title="Finish setup" onPress={() => router.push(homeSetupRoute(status.property_id) as never)} /> : null}
            </>}
    </ThemedCard>;
}
