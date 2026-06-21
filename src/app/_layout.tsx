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
const REGISTER_ROUTE = '/auth/register';
const AUTH_CONFIRM_ROUTE = '/auth/confirm';
const FORGOT_PASSWORD_ROUTE = '/auth/forgot-password';
const RESET_PASSWORD_ROUTE = '/auth/reset-password';
const ONBOARDING_INVITE_ROUTE = '/onboarding/invite';
const COMPANY_INVITATIONS_ROUTE = '/onboarding/company-invitations';
const ONBOARDING_COMPLETE_ROUTE = '/onboarding/complete';
const PROFILE_CHANGE_PASSWORD_ROUTE = '/profile/change-password';
const PUBLIC_AUTH_ROUTES = new Set<string>([
  LOGIN_ROUTE,
  REGISTER_ROUTE,
  AUTH_CONFIRM_ROUTE,
  FORGOT_PASSWORD_ROUTE,
  RESET_PASSWORD_ROUTE,
]);

export default function Layout() {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const checkRunRef = useRef(0);
  const initialCheckCompleteRef = useRef(false);
  const pendingRedirectRef = useRef<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    pathnameRef.current = pathname;
    const currentPath = normalizePath(pathname);

    if (pendingRedirectRef.current === currentPath) {
      pendingRedirectRef.current = null;
    }

    checkLogin(pathname, {
      showLoading: !initialCheckCompleteRef.current,
    });
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
        checkLogin(pathnameRef.current, {
          showLoading: !initialCheckCompleteRef.current,
        });
      }, 0);
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        clearPendingCheck();
        initialCheckCompleteRef.current = true;
        setInitializing(false);
        replaceIfNeeded(RESET_PASSWORD_ROUTE, pathnameRef.current);
        return;
      }

      if (event === 'SIGNED_IN' && isPublicAuthPath(normalizePath(pathnameRef.current))) {
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

  async function checkLogin(
    currentPathname = pathnameRef.current,
    options: { showLoading?: boolean } = {}
  ) {
    const runId = checkRunRef.current + 1;
    checkRunRef.current = runId;

    if (options.showLoading ?? !initialCheckCompleteRef.current) {
      setInitializing(true);
    }

    const { data } = await supabase.auth.getSession();

    if (runId !== checkRunRef.current) return;

    const currentPath = normalizePath(currentPathname);
    const isPublicAuthPage = isPublicAuthPath(currentPath);
    const isLoggedIn = !!data.session;

    if (isPublicAuthPage) {
      finishCheck(runId);
      return;
    }

    if (isLoggedIn) {
      const timedOut = await hasSessionTimedOut();

      if (runId !== checkRunRef.current) return;

      if (timedOut) {
        await supabase.auth.signOut();
        await clearSessionActivity();
        replaceIfNeeded(LOGIN_ROUTE, currentPath);
        finishCheck(runId);
        return;
      }

      if (!isAuthPath(currentPath)) {
        await recordSessionActivity();
      }
    }

    if (!isLoggedIn) {
      replaceIfNeeded(LOGIN_ROUTE, currentPath);
      finishCheck(runId);
      return;
    }

    const routeDecision = await resolveLoggedInUserRoute(data.session.user.id);

    if (runId !== checkRunRef.current) return;

    const redirectRoute = resolveRedirectForPath(currentPath, routeDecision);

    if (redirectRoute) {
      replaceIfNeeded(redirectRoute, currentPath);
    }

    finishCheck(runId);
  }

  return (
    <ThemeProvider>
      {initializing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <Slot />
      )}
    </ThemeProvider>
  );

  function finishCheck(runId: number) {
    if (runId !== checkRunRef.current) return;

    initialCheckCompleteRef.current = true;
    setInitializing(false);
  }

  function replaceIfNeeded(route: string, pathname: string) {
    const currentPath = normalizePath(pathname);

    if (currentPath === route) {
      if (pendingRedirectRef.current === route) {
        pendingRedirectRef.current = null;
      }

      return;
    }

    if (pendingRedirectRef.current === route) {
      return;
    }

    pendingRedirectRef.current = route;
    router.replace(route as any);
  }
}

function normalizePath(pathname: string) {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');

  return withoutTrailingSlash || HOME_ROUTE;
}

function isAuthPath(pathname: string) {
  return pathname === '/auth' || pathname.startsWith('/auth/');
}

function isPublicAuthPath(pathname: string) {
  return PUBLIC_AUTH_ROUTES.has(pathname);
}

function isAllowedFirstHomeOnboardingPath(pathname: string) {
  return (
    pathname === FIRST_HOME_ONBOARDING_ROUTE ||
    pathname === ONBOARDING_INVITE_ROUTE ||
    pathname === COMPANY_INVITATIONS_ROUTE
  );
}

function isSuperAdminPath(pathname: string) {
  return pathname === SUPER_ADMIN_ROUTE || pathname.startsWith(`${SUPER_ADMIN_ROUTE}/`);
}

function resolveRedirectForPath(
  pathname: string,
  routeDecision: LoggedInUserRouteDecision
) {
  if (isPublicAuthPath(pathname)) {
    return null;
  }

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
