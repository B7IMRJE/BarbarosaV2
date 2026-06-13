import { Slot, router, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../lib/supabase';

export default function Layout() {
  const segments = useSegments();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkLogin();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      checkLogin();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [segments]);

  async function checkLogin() {
    const { data } = await supabase.auth.getSession();

    const isAuthPage = segments[0] === 'auth';
    const isLoggedIn = !!data.session;

    if (!isLoggedIn && !isAuthPage) {
      router.replace('/auth/login' as any);
    }

    if (isLoggedIn && isAuthPage) {
      router.replace('/' as any);
    }

    setChecking(false);
  }

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Slot />;
}