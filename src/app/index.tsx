import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import SystemStatusCard from '../components/cards/SystemStatusCard';
import ThemedButton from '../components/theme/ThemedButton';
import ThemedCard from '../components/theme/ThemedCard';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/useTheme';

const systems = [
  { name: 'Plumbing', icon: '🚰' },
  { name: 'HVAC', icon: '❄️' },
  { name: 'Electrical', icon: '⚡' },
  { name: 'Water Quality', icon: '💧' },
  { name: 'Safety', icon: '🛡️' },
  { name: 'Appliances', icon: '🔌' },
  { name: 'Gas', icon: '🔥' },
  { name: 'Exterior', icon: '🏠' },
  { name: 'Drains / Sewer', icon: '🧰' },
  { name: 'Documents', icon: '📄' },
];

export default function HomeScreen() {
  const { theme } = useTheme();

  useEffect(() => {
    saveRecoverySession();
  }, []);

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
        <Text
          style={{
            marginTop: 20,
            fontSize: 18,
            color: theme.colors.mutedText,
            fontWeight: '600',
          }}
        >
          Welcome Home
        </Text>

        <Text
          style={{
            fontSize: 34,
            fontWeight: '900',
            color: theme.colors.text,
            marginTop: 6,
          }}
        >
          Home Health
        </Text>

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
            Not enough data yet
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
                width: '0%',
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
            Start by adding real equipment, fixtures, documents, and photos from
            your home.
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
          {systems.map((system) => (
            <SystemStatusCard
              key={system.name}
              title={system.name}
              icon={system.icon}
              onPress={() => {
                if (system.name === 'Documents') {
                  router.push('/documents' as any);
                  return;
                }

                if (system.name === 'Plumbing') {
                  router.push('/system/plumbing' as any);
                  return;
                }

                router.push({
                  pathname: '/system/[system]',
                  params: { system: system.name },
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

          <Text
            style={{
              fontSize: 15,
              color: theme.colors.mutedText,
              lineHeight: 22,
            }}
          >
            No issues reported.
          </Text>
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
