import { router } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabase';

const systems = [
  'Plumbing',
  'HVAC',
  'Electrical',
  'Water Quality',
  'Safety',
  'Appliances',
  'Gas',
  'Exterior',
  'Drains / Sewer',
  'Documents',
];

export default function HomeScreen() {
  useEffect(() => {
    saveRecoverySession();
  }, []);

  async function saveRecoverySession() {
    if (typeof window === 'undefined') return;

    const hash = new URLSearchParams(window.location.hash.replace('#', ''));

    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');

    if (accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      window.history.replaceState({}, document.title, '/');
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F3F6FA' }}
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
            color: '#637083',
            fontWeight: '600',
          }}
        >
          Welcome Home
        </Text>

        <Text
          style={{
            fontSize: 34,
            fontWeight: '900',
            color: '#071B33',
            marginTop: 6,
          }}
        >
          Home Health
        </Text>

        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 26,
            padding: 22,
            marginTop: 22,
            borderWidth: 1,
            borderColor: '#E3E8EF',
          }}
        >
          <Text
            style={{
              fontSize: 15,
              color: '#637083',
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
              color: '#071B33',
              marginBottom: 14,
            }}
          >
            Not enough data yet
          </Text>

          <View
            style={{
              height: 16,
              backgroundColor: '#E7ECF3',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: '0%',
                height: '100%',
                backgroundColor: '#9AA6B2',
              }}
            />
          </View>

          <Text
            style={{
              marginTop: 12,
              fontSize: 14,
              color: '#637083',
              lineHeight: 20,
            }}
          >
            Start by adding real equipment, fixtures, documents, and photos from
            your home.
          </Text>
        </View>

        <Text
          style={{
            fontSize: 20,
            fontWeight: '900',
            color: '#071B33',
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
            <TouchableOpacity
              key={system}
              onPress={() => {
                if (system === 'Documents') {
                  router.push('/documents' as any);
                  return;
                }

                if (system === 'Plumbing') {
                  router.push('/system/plumbing' as any);
                  return;
                }

                router.push({
                  pathname: '/system/[system]',
                  params: { system },
                } as any);
              }}
              style={{
                width: '48%',
                minHeight: 92,
                backgroundColor: '#FFFFFF',
                borderRadius: 20,
                padding: 16,
                borderWidth: 1,
                borderColor: '#E3E8EF',
                justifyContent: 'space-between',
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '900',
                  color: '#071B33',
                }}
              >
                {system}
              </Text>

              <Text
                style={{
                  fontSize: 13,
                  color: '#637083',
                  marginTop: 10,
                  fontWeight: '600',
                }}
              >
                No items added
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            padding: 20,
            marginTop: 26,
            borderWidth: 1,
            borderColor: '#E3E8EF',
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: '900',
              color: '#071B33',
              marginBottom: 8,
            }}
          >
            Needs Attention
          </Text>

          <Text
            style={{
              fontSize: 15,
              color: '#637083',
              lineHeight: 22,
            }}
          >
            No issues reported.
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => router.push('/contact' as any)}
          style={{
            backgroundColor: '#071B33',
            borderRadius: 22,
            padding: 18,
            marginTop: 24,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: '900',
            }}
          >
            Request Professional Help
          </Text>
        </TouchableOpacity>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            backgroundColor: '#FFFFFF',
            borderRadius: 26,
            paddingVertical: 16,
            marginTop: 28,
            borderWidth: 1,
            borderColor: '#E3E8EF',
          }}
        >
          <Text style={{ fontWeight: '900', color: '#071B33' }}>Home</Text>

          <Text
            onPress={() => router.push('/equipment' as any)}
            style={{ fontWeight: '800', color: '#637083' }}
          >
            Equipment
          </Text>

          <Text
            onPress={() => router.push('/documents' as any)}
            style={{ fontWeight: '800', color: '#637083' }}
          >
            Documents
          </Text>

          <Text
            onPress={() => router.push('/profile' as any)}
            style={{ fontWeight: '800', color: '#637083' }}
          >
            Profile
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}