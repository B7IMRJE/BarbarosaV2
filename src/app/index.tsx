import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import HomeIdentityCard from '../components/HomeIdentityCard';
import SystemStatusCard from '../components/cards/SystemStatusCard';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import {
  scoreAllSystems,
  scoreHomeItem,
  scoreOverallHomeHealth,
  statusForCard,
  type HomeHealthEmergency,
  type HomeHealthItem,
} from '../lib/homeHealth';
import { homeSystems } from '../lib/homeSystems';
import { loadActiveHomeIdentity, type HomeIdentity } from '../lib/homeIdentity';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

type HomeDashboardItem = HomeHealthItem & {
  name?: string | null;
  item_slug?: string | null;
  system?: string | null;
  area?: string | null;
  location?: string | null;
  parent_area?: string | null;
  status?: string | null;
  condition?: string | null;
  install_state?: string | null;
  category?: string | null;
};

export default function HomeScreen() {
  const { theme } = useTheme();
  const [homeIdentity, setHomeIdentity] = useState<HomeIdentity | null>(null);
  const [homeIdentityLoading, setHomeIdentityLoading] = useState(true);
  const [homeItems, setHomeItems] = useState<HomeDashboardItem[]>([]);
  const [activeEmergencies, setActiveEmergencies] = useState<HomeHealthEmergency[]>([]);

  const loadHomeHealthData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setHomeIdentity(null);
      setHomeIdentityLoading(false);
      return;
    }

    setHomeIdentityLoading(true);

    try {
      setHomeIdentity(await loadActiveHomeIdentity());
    } catch {
      setHomeIdentity(null);
    } finally {
      setHomeIdentityLoading(false);
    }

    const { data: items } = await supabase
      .from('home_items')
      .select('*')
      .eq('user_id', user.id)
      .or('archived.eq.false,archived.is.null');

    const { data: emergencies } = await supabase
      .from('home_emergencies')
      .select('id, status, emergency_type')
      .eq('user_id', user.id)
      .neq('status', 'Resolved');

    setHomeItems((items || []) as HomeDashboardItem[]);
    setActiveEmergencies((emergencies || []) as HomeHealthEmergency[]);
  }, []);

  useEffect(() => {
    saveRecoverySession();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHomeHealthData();
    }, [loadHomeHealthData])
  );

  const issueItems = useMemo(() => {
    return homeItems
      .map((item) => ({
        item,
        health: scoreHomeItem(item),
      }))
      .filter(
        ({ item, health }) =>
          !sameText(item.category, 'Area') &&
          (health.status === 'critical' || health.status === 'needs_attention')
      )
      .sort((a, b) => {
        const severityDifference =
          issueSeverity(a.health.status) - issueSeverity(b.health.status);

        if (severityDifference !== 0) return severityDifference;

        return issueItemName(a.item).localeCompare(issueItemName(b.item));
      });
  }, [homeItems]);

  const healthSummary = useMemo(
    () => scoreOverallHomeHealth(homeItems, activeEmergencies),
    [homeItems, activeEmergencies]
  );
  const systemSummaries = useMemo(
    () => scoreAllSystems(homeItems, homeSystems.map((system) => system.key)),
    [homeItems]
  );
  const progressWidth = `${healthSummary.score ?? 0}%` as `${number}%`;

  async function saveRecoverySession() {
    if (typeof window === 'undefined') return;

    const hash = new URLSearchParams(window.location.hash.replace('#', ''));

    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    const authType = hash.get('type');

    if (accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (authType === 'recovery') {
        window.history.replaceState({}, document.title, '/auth/reset-password');
        router.replace('/auth/reset-password' as any);
        return;
      }

      window.history.replaceState({}, document.title, '/');
    }
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
        <HomeIdentityCard
          identity={homeIdentity}
          loading={homeIdentityLoading}
          onEdit={() => router.push('/home/edit' as any)}
        />

        <ThemedCard
          style={{
            marginTop: 22,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              color: theme.colors.mutedText,
              fontWeight: '700',
              marginBottom: 10,
            }}
          >
            Home Health Status
          </Text>

          <Text
            style={{
              fontSize: 26,
              fontWeight: '900',
              color: theme.colors.text,
              marginBottom: 14,
            }}
          >
            {healthSummary.label}
          </Text>

          <View
            style={{
              height: 16,
              backgroundColor: theme.colors.progressTrack,
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: progressWidth,
                height: '100%',
                backgroundColor: theme.colors.progressFill,
              }}
            />
          </View>

          <Text
            style={{
              marginTop: 12,
              fontSize: 14,
              color: theme.colors.mutedText,
              lineHeight: 20,
            }}
          >
            {healthSummary.score === null
              ? 'Start by adding real equipment, fixtures, documents, and photos from your home.'
              : `${healthSummary.score}/100 based on ${healthSummary.itemCount} home item${healthSummary.itemCount === 1 ? '' : 's'}.`}
          </Text>
        </ThemedCard>

        <Text
          style={{
            fontSize: 20,
            fontWeight: '900',
            color: theme.colors.text,
            marginTop: 26,
            marginBottom: 14,
          }}
        >
          Health Breakdown
        </Text>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {homeSystems.map((system) => (
            <SystemStatusCard
              key={system.key}
              title={system.label}
              icon={system.icon}
              status={statusForCard(systemSummaries[system.key])}
              onPress={() => {
                if (system.key === 'Documents') {
                  router.push('/documents' as any);
                  return;
                }

                if (system.key === 'Plumbing') {
                  router.push('/system/plumbing' as any);
                  return;
                }

                router.push({
                  pathname: '/system/[system]',
                  params: { system: system.key },
                } as any);
              }}
              style={{
                width: '48%',
              }}
            />
          ))}
        </View>

        <ThemedCard
          style={{
            marginTop: 26,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: '900',
              color: theme.colors.text,
              marginBottom: 8,
            }}
          >
            Needs Attention
          </Text>

          {issueItems.length === 0 ? (
            <Text
              style={{
                fontSize: 15,
                color: theme.colors.mutedText,
                lineHeight: 22,
              }}
            >
              No issues reported.
            </Text>
          ) : (
            <View style={{ gap: 12 }}>
              {issueItems.map(({ item, health }) => {
                const itemSlug = firstText(item.item_slug);
                const isCritical = health.status === 'critical';

                return (
                  <View
                    key={item.id || itemSlug || issueItemName(item)}
                    style={{
                      borderWidth: 1,
                      borderColor: isCritical
                        ? theme.colors.status.activeEmergency.border
                        : theme.colors.border,
                      backgroundColor: isCritical
                        ? theme.colors.status.activeEmergency.background
                        : theme.colors.surface,
                      borderRadius: theme.radii.card,
                      padding: 14,
                      gap: 10,
                    }}
                  >
                    <View style={{ gap: 5 }}>
                      <Text
                        style={{
                          fontSize: 17,
                          fontWeight: '900',
                          color: theme.colors.text,
                        }}
                      >
                        {issueItemName(item)}
                      </Text>

                      <Text
                        style={{
                          fontSize: 14,
                          color: theme.colors.mutedText,
                          lineHeight: 20,
                        }}
                      >
                        System: {firstText(item.system) || 'System not set'}
                      </Text>

                      <Text
                        style={{
                          fontSize: 14,
                          color: theme.colors.mutedText,
                          lineHeight: 20,
                        }}
                      >
                        Location:{' '}
                        {firstText(item.area, item.location, item.parent_area) ||
                          'Location not set'}
                      </Text>

                      <Text
                        style={{
                          fontSize: 14,
                          color: theme.colors.mutedText,
                          lineHeight: 20,
                        }}
                      >
                        Status: {issueStatusLabel(item, health.status)}
                      </Text>
                    </View>

                    {!!itemSlug && (
                      <ThemedButton
                        title="Open Item"
                        variant="secondary"
                        onPress={() => router.push(`/item/${itemSlug}` as any)}
                        style={{
                          alignSelf: 'flex-start',
                          paddingVertical: 12,
                          paddingHorizontal: 16,
                        }}
                        textStyle={{
                          fontSize: 14,
                        }}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ThemedCard>

        <ThemedCard
          style={{
            marginTop: 18,
            borderColor: theme.colors.status.activeEmergency.border,
            backgroundColor: theme.colors.status.activeEmergency.background,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: '900',
              color: theme.colors.text,
              marginBottom: 8,
            }}
          >
            Emergency Center
          </Text>

          <Text
            style={{
              fontSize: 15,
              color: theme.colors.mutedText,
              lineHeight: 22,
              marginBottom: 14,
            }}
          >
            Report urgent home issues with photos, notes, and status history.
          </Text>

          <ThemedButton
            title="Open Emergency Center"
            onPress={() => router.push('/emergency' as any)}
          />
        </ThemedCard>

        <ThemedCard
          style={{
            marginTop: 18,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: '900',
              color: theme.colors.text,
              marginBottom: 8,
            }}
          >
            Maintenance Center
          </Text>

          <Text
            style={{
              fontSize: 15,
              color: theme.colors.mutedText,
              lineHeight: 22,
              marginBottom: 14,
            }}
          >
            Track service history, photos, documents, and next maintenance dates.
          </Text>

          <ThemedButton
            title="Open Maintenance Center"
            variant="secondary"
            onPress={() => router.push('/maintenance' as any)}
          />
        </ThemedCard>

        <ThemedCard
          style={{
            marginTop: 18,
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: '900',
              color: theme.colors.text,
              marginBottom: 8,
            }}
          >
            Company Connections
          </Text>

          <Text
            style={{
              fontSize: 15,
              color: theme.colors.mutedText,
              lineHeight: 22,
              marginBottom: 14,
            }}
          >
            Review connected companies and pending access requests for your home.
          </Text>

          <ThemedButton
            title="Open Connections"
            variant="secondary"
            onPress={() => router.push('/connections' as any)}
          />
        </ThemedCard>

        <ThemedButton
          title="Request Professional Help"
          onPress={() => router.push('/contact' as any)}
          style={{
            marginTop: 24,
          }}
        />

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            backgroundColor: theme.colors.surface,
            borderRadius: 26,
            paddingVertical: 16,
            marginTop: 28,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        >
          <Text style={{ fontWeight: '900', color: theme.colors.text }}>Home</Text>

          <Text
            onPress={() => router.push('/equipment' as any)}
            style={{ fontWeight: '800', color: theme.colors.mutedText }}
          >
            Equipment
          </Text>

          <Text
            onPress={() => router.push('/documents' as any)}
            style={{ fontWeight: '800', color: theme.colors.mutedText }}
          >
            Documents
          </Text>

          <Text
            onPress={() => router.push('/profile' as any)}
            style={{ fontWeight: '800', color: theme.colors.mutedText }}
          >
            Profile
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function firstText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const text = String(value || '').trim();

    if (text) return text;
  }

  return '';
}

function sameText(a?: string | null, b?: string | null) {
  return firstText(a).toLowerCase() === firstText(b).toLowerCase();
}

function issueSeverity(status: string) {
  return status === 'critical' ? 0 : 1;
}

function issueItemName(item: HomeDashboardItem) {
  return firstText(item.name) || 'Unnamed Item';
}

function issueStatusLabel(item: HomeDashboardItem, status: string) {
  return (
    firstText(item.status, item.condition, item.install_state) ||
    (status === 'critical' ? 'Emergency' : 'Needs Attention')
  );
}
