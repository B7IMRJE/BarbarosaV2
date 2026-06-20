import { Slot, router, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import {
  clearSessionActivity,
  hasSessionTimedOut,
  recordSessionActivity,
} from '../lib/sessionSecurity';
import {
  FIRST_HOME_ONBOARDING_ROUTE,
  HOME_ROUTE,
  SUPER_ADMIN_ROUTE,
  resolveLoggedInUserRoute,
  type LoggedInUserRouteDecision,
} from '../lib/onboarding';
import { supabase } from '../lib/supabase';
import { ThemeProvider } from '../theme';

const LOGIN_ROUTE = '/auth/login';
const RESET_PASSWORD_ROUTE = '/auth/reset-password';
const ONBOARDING_INVITE_ROUTE = '/onboarding/invite';
const ONBOARDING_COMPLETE_ROUTE = '/onboarding/complete';
const PROFILE_CHANGE_PASSWORD_ROUTE = '/profile/change-password';

export default function Layout() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const checkRunRef = useRef(0);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    pathnameRef.current = pathname;
    checkLogin(pathname);
  }, [pathname]);

  useEffect(() => {
    let pendingCheck: ReturnType<typeof setTimeout> | null = null;

    function clearPendingCheck() {
      if (pendingCheck) {
        clearTimeout(pendingCheck);
        pendingCheck = null;
      }
    }

    function scheduleCheckLogin() {
      clearPendingCheck();
      pendingCheck = setTimeout(() => {
        pendingCheck = null;
        checkLogin(pathnameRef.current);
      }, 0);
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        clearPendingCheck();
        setChecking(false);
        replaceIfNeeded(RESET_PASSWORD_ROUTE, pathnameRef.current);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        scheduleCheckLogin();
      }
    });

    return () => {
      clearPendingCheck();
      listener.subscription.unsubscribe();
    };
  }, []);

  async function checkLogin(currentPathname = pathnameRef.current) {
    const runId = checkRunRef.current + 1;
    checkRunRef.current = runId;
    setChecking(true);

    const { data } = await supabase.auth.getSession();

    if (runId !== checkRunRef.current) return;

    const currentPath = normalizePath(currentPathname);
    const isAuthPage = isAuthPath(currentPath);
    const isResetPasswordPage = currentPath === RESET_PASSWORD_ROUTE;
    const isLoggedIn = !!data.session;

    if (isLoggedIn) {
      const timedOut = await hasSessionTimedOut();

      if (runId !== checkRunRef.current) return;

      if (timedOut) {
        await supabase.auth.signOut();
        await clearSessionActivity();
        replaceIfNeeded(LOGIN_ROUTE, currentPath);
        setChecking(false);
        return;
      }

      if (!isAuthPage) {
        await recordSessionActivity();
      }
    }

    if (!isLoggedIn && !isAuthPage) {
      replaceIfNeeded(LOGIN_ROUTE, currentPath);
      setChecking(false);
      return;
    }

    if (!isLoggedIn || isResetPasswordPage) {
      setChecking(false);
      return;
    }

    const routeDecision = await resolveLoggedInUserRoute(data.session.user.id);

    if (runId !== checkRunRef.current) return;

    const redirectRoute = resolveRedirectForPath(currentPath, routeDecision);

    if (redirectRoute) {
      replaceIfNeeded(redirectRoute, currentPath);
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

  return (
    <ThemeProvider>
      <Slot />
    </ThemeProvider>
  );
}

function normalizePath(pathname: string) {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');

  return withoutTrailingSlash || HOME_ROUTE;
}

function isAuthPath(pathname: string) {
  return pathname === '/auth' || pathname.startsWith('/auth/');
}

function isAllowedFirstHomeOnboardingPath(pathname: string) {
  return pathname === FIRST_HOME_ONBOARDING_ROUTE || pathname === ONBOARDING_INVITE_ROUTE;
}

function isSuperAdminPath(pathname: string) {
  return pathname === SUPER_ADMIN_ROUTE || pathname.startsWith(`${SUPER_ADMIN_ROUTE}/`);
}

function resolveRedirectForPath(
  pathname: string,
  routeDecision: LoggedInUserRouteDecision
) {
  if (isAuthPath(pathname)) {
    return routeDecision.route;
  }

  if (routeDecision.reason === 'super-admin') {
    if (isSuperAdminPath(pathname) || pathname === PROFILE_CHANGE_PASSWORD_ROUTE) {
      return null;
    }

    return SUPER_ADMIN_ROUTE;
  }

  if (routeDecision.reason === 'homeowner-needs-first-home') {
    if (isAllowedFirstHomeOnboardingPath(pathname)) {
      return null;
    }

    return FIRST_HOME_ONBOARDING_ROUTE;
  }

  if (
    routeDecision.reason === 'homeowner-active-membership' &&
    pathname === FIRST_HOME_ONBOARDING_ROUTE
  ) {
    return HOME_ROUTE;
  }

  if (pathname === ONBOARDING_COMPLETE_ROUTE) {
    return null;
  }

  return null;
}

function replaceIfNeeded(route: string, pathname: string) {
  if (normalizePath(pathname) !== route) {
    router.replace(route as any);
  }
}
