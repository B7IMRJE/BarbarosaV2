import { Slot, router, useGlobalSearchParams, usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import {
  clearSessionActivity,
  hasSessionTimedOut,
  recordSessionActivity,
} from '../lib/sessionSecurity';
import {
  FIRST_HOME_ONBOARDING_ROUTE,
  HOME_ROUTE,
  SUPER_ADMIN_ROUTE,
  TECHOS_ROUTE,
  resolveLoggedInUserRoute,
  type LoggedInUserRouteDecision,
} from '../lib/onboarding';
import { supabase } from '../lib/supabase';
import GlobalNavigation from '../components/navigation/GlobalNavigation';
import { ThemeProvider } from '../theme';

const LOGIN_ROUTE = '/auth/login';
const REGISTER_ROUTE = '/auth/register';
const AUTH_CONFIRM_ROUTE = '/auth/confirm';
const FORGOT_PASSWORD_ROUTE = '/auth/forgot-password';
const RESET_PASSWORD_ROUTE = '/auth/reset-password';
const COMPANY_INVITE_ROUTE = '/company-invite';
const CUSTOMER_INVITE_ROUTE = '/customer-invite';
const ONBOARDING_INVITE_ROUTE = '/onboarding/invite';
const COMPANY_INVITATIONS_ROUTE = '/onboarding/company-invitations';
const ONBOARDING_COMPLETE_ROUTE = '/onboarding/complete';
const ONBOARDING_THEME_ROUTE = '/onboarding/theme';
const PROFILE_CHANGE_PASSWORD_ROUTE = '/profile/change-password';
const DISPATCH_ROUTE = '/dispatch';
const SCHEDULE_ROUTE = '/schedule';
const ESTIMATE_ROUTE = '/estimate';
const HOMEOS_SERVICE_ERROR_MESSAGE = 'Could not reach HomeOS services. Check connection and try again.';
const PUBLIC_AUTH_ROUTES = new Set<string>([
  LOGIN_ROUTE,
  REGISTER_ROUTE,
  AUTH_CONFIRM_ROUTE,
  FORGOT_PASSWORD_ROUTE,
  RESET_PASSWORD_ROUTE,
]);

type ProviderModeRouteParams = {
  providerMode?: string | string[];
  companyId?: string | string[];
  propertyId?: string | string[];
};

export default function Layout() {
  const pathname = usePathname();
  const routeParams = useGlobalSearchParams<{
    providerMode?: string | string[];
    companyId?: string | string[];
    propertyId?: string | string[];
  }>();
  const pathnameRef = useRef(pathname);
  const routeParamsRef = useRef(routeParams);
  const checkRunRef = useRef(0);
  const initialCheckCompleteRef = useRef(false);
  const pendingRedirectRef = useRef<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [routeGuardError, setRouteGuardError] = useState('');

  useEffect(() => {
    pathnameRef.current = pathname;
    routeParamsRef.current = routeParams;
    const currentPath = normalizePath(pathname);

    if (pendingRedirectRef.current === currentPath) {
      pendingRedirectRef.current = null;
    }

    checkLogin(pathname, {
      showLoading: !initialCheckCompleteRef.current,
      routeParams,
    });
  }, [pathname, routeParams.providerMode, routeParams.companyId, routeParams.propertyId]);

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
          routeParams: routeParamsRef.current,
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
    options: { showLoading?: boolean; routeParams?: ProviderModeRouteParams } = {}
  ) {
    const runId = checkRunRef.current + 1;
    checkRunRef.current = runId;

    if (options.showLoading ?? !initialCheckCompleteRef.current) {
      setInitializing(true);
    }

    setRouteGuardError('');

    try {
      const sessionResult = await supabase.auth.getSession();
      if (runId !== checkRunRef.current) return;

      if (sessionResult.error) {
        showRouteGuardServiceError(runId, sessionResult.error.message);
        return;
      }

      const currentPath = normalizePath(currentPathname);
      const isPublicAuthPage = isPublicAuthPath(currentPath);
      const isLoggedIn = !!sessionResult.data.session;

      if (isPublicAuthPage || currentPath === COMPANY_INVITE_ROUTE || currentPath === CUSTOMER_INVITE_ROUTE) {
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

      const sessionUserId = sessionResult.data.session?.user.id || '';
      const routeDecision = await resolveLoggedInUserRoute(sessionUserId);

      if (runId !== checkRunRef.current) return;

      if (routeDecision.reason === 'service-unavailable') {
        showRouteGuardServiceError(runId, routeDecision.message);
        return;
      }

      const redirectRoute = resolveRedirectForPath(currentPath, routeDecision, options.routeParams || routeParamsRef.current);

      if (redirectRoute) {
        replaceIfNeeded(redirectRoute, currentPath);
      }

      finishCheck(runId);
    } catch (error) {
      showRouteGuardServiceError(runId, getServiceErrorMessage(error));
    }
  }

  return (
    <ThemeProvider>
      {routeGuardError ? (
        <View style={serviceErrorWrapStyle}>
          <Text style={serviceErrorTitleStyle}>HomeOS services unavailable</Text>
          <Text style={serviceErrorBodyStyle}>{routeGuardError}</Text>
          <TouchableOpacity activeOpacity={0.82} onPress={retryRouteGuard} style={retryButtonStyle}>
            <Text style={retryButtonTextStyle}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : initializing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <GlobalNavigation>
          <Slot />
        </GlobalNavigation>
      )}
    </ThemeProvider>
  );

  function finishCheck(runId: number) {
    if (runId !== checkRunRef.current) return;

    initialCheckCompleteRef.current = true;
    setRouteGuardError('');
    setInitializing(false);
  }

  function showRouteGuardServiceError(runId: number, message?: string | null) {
    if (runId !== checkRunRef.current) return;

    initialCheckCompleteRef.current = true;
    pendingRedirectRef.current = null;
    setRouteGuardError(normalizeServiceMessage(message));
    setInitializing(false);
  }

  function retryRouteGuard() {
    setRouteGuardError('');
    checkLogin(pathnameRef.current, { showLoading: true, routeParams: routeParamsRef.current });
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

function getServiceErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  return HOMEOS_SERVICE_ERROR_MESSAGE;
}

function normalizeServiceMessage(message?: string | null) {
  const cleanMessage = String(message || '').trim();

  if (!cleanMessage || isFetchFailureMessage(cleanMessage)) {
    return HOMEOS_SERVICE_ERROR_MESSAGE;
  }

  return cleanMessage;
}

function isFetchFailureMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('network request failed') ||
    normalizedMessage.includes('fetch failed') ||
    normalizedMessage.includes('load failed') ||
    normalizedMessage.includes('networkerror')
  );
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
    pathname === ONBOARDING_THEME_ROUTE ||
    pathname === ONBOARDING_INVITE_ROUTE ||
    pathname === COMPANY_INVITATIONS_ROUTE ||
    pathname === COMPANY_INVITE_ROUTE ||
    pathname === CUSTOMER_INVITE_ROUTE
  );
}

function isSuperAdminPath(pathname: string) {
  return pathname === SUPER_ADMIN_ROUTE || pathname.startsWith(`${SUPER_ADMIN_ROUTE}/`);
}

function isCompanyManagementPath(pathname: string) {
  return pathname.startsWith(`${SUPER_ADMIN_ROUTE}/company/`);
}

function isAllowedCompanyManagementPath(
  pathname: string,
  allowedCompanyIds: string[] | undefined
) {
  if (!isCompanyManagementPath(pathname)) return false;

  const companyId = extractCompanyIdFromManagementPath(pathname);
  if (!companyId) return false;

  return (allowedCompanyIds || []).includes(companyId);
}

function isAllowedCompanyClientPath(
  pathname: string,
  allowedCompanyIds: string[] | undefined
) {
  if (!pathname.match(/^\/super-admin\/company\/[^/]+\/client\//)) return false;

  const companyId = extractCompanyIdFromManagementPath(pathname);
  if (!companyId) return false;

  return (allowedCompanyIds || []).includes(companyId);
}

function isTechOSPath(pathname: string) {
  return pathname === TECHOS_ROUTE || pathname.startsWith(`${TECHOS_ROUTE}/`);
}

function isDispatchPath(pathname: string) {
  return pathname === DISPATCH_ROUTE || pathname.startsWith(`${DISPATCH_ROUTE}/`);
}

function isSchedulePath(pathname: string) {
  return pathname === SCHEDULE_ROUTE || pathname.startsWith(`${SCHEDULE_ROUTE}/`);
}

function isEstimatePath(pathname: string) {
  return pathname === ESTIMATE_ROUTE || pathname.startsWith(`${ESTIMATE_ROUTE}/`);
}

function hasValidProviderModeRouteParams(
  routeParams: ProviderModeRouteParams,
  allowedCompanyIds?: string[]
) {
  if (!isProviderModeValue(firstRouteParam(routeParams.providerMode))) return false;

  const companyId = firstRouteParam(routeParams.companyId);
  const propertyId = firstRouteParam(routeParams.propertyId);

  if (!companyId || !propertyId) return false;

  if (allowedCompanyIds && !allowedCompanyIds.includes(companyId)) {
    return false;
  }

  return true;
}

function isProviderModeHomeOsPath(
  pathname: string,
  routeParams: ProviderModeRouteParams,
  allowedCompanyIds?: string[]
) {
  if (!hasValidProviderModeRouteParams(routeParams, allowedCompanyIds)) return false;

  return (
    pathname === HOME_ROUTE ||
    pathname === '/equipment' ||
    pathname === '/documents' ||
    pathname === '/area/create' ||
    pathname === '/item/create' ||
    pathname === '/item/edit' ||
    pathname.startsWith('/item/') ||
    pathname.startsWith('/system/')
  );
}

function isProviderModeEstimatePath(
  pathname: string,
  routeParams: ProviderModeRouteParams,
  allowedCompanyIds?: string[]
) {
  return isEstimatePath(pathname) && hasValidProviderModeRouteParams(routeParams, allowedCompanyIds);
}

function resolveRedirectForPath(
  pathname: string,
  routeDecision: LoggedInUserRouteDecision,
  routeParams: ProviderModeRouteParams
) {
  if (isPublicAuthPath(pathname)) {
    return null;
  }

  if (pathname === COMPANY_INVITE_ROUTE || pathname === CUSTOMER_INVITE_ROUTE) {
    return null;
  }

  if (isAuthPath(pathname)) {
    return routeDecision.route;
  }

  if (routeDecision.reason === 'super-admin') {
    if (
      isSuperAdminPath(pathname) ||
      isProviderModeHomeOsPath(pathname, routeParams) ||
      isProviderModeEstimatePath(pathname, routeParams) ||
      isTechOSPath(pathname) ||
      isDispatchPath(pathname) ||
      isSchedulePath(pathname) ||
      pathname === PROFILE_CHANGE_PASSWORD_ROUTE
    ) {
      return null;
    }

    return SUPER_ADMIN_ROUTE;
  }

  if (routeDecision.reason === 'company-management') {
    if (
      isAllowedCompanyManagementPath(pathname, routeDecision.allowedCompanyIds) ||
      isProviderModeHomeOsPath(pathname, routeParams, routeDecision.allowedCompanyIds) ||
      isTechOSPath(pathname) ||
      isDispatchPath(pathname) ||
      isSchedulePath(pathname) ||
      isEstimatePath(pathname) ||
      pathname === COMPANY_INVITATIONS_ROUTE ||
      pathname === PROFILE_CHANGE_PASSWORD_ROUTE
    ) {
      return null;
    }

    return routeDecision.route;
  }

  if (routeDecision.reason === 'company-technician') {
    if (
      isAllowedCompanyClientPath(pathname, routeDecision.allowedCompanyIds) ||
      isProviderModeHomeOsPath(pathname, routeParams, routeDecision.allowedCompanyIds) ||
      isTechOSPath(pathname) ||
      isEstimatePath(pathname) ||
      pathname === COMPANY_INVITATIONS_ROUTE ||
      pathname === PROFILE_CHANGE_PASSWORD_ROUTE
    ) {
      return null;
    }

    return routeDecision.route;
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

function firstRouteParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function isProviderModeValue(value: string) {
  const normalizedValue = value.trim().toLowerCase();

  return normalizedValue === '1' || normalizedValue === 'true' || normalizedValue === 'yes';
}

function extractCompanyIdFromManagementPath(pathname: string) {
  const match = pathname.match(/^\/super-admin\/company\/([^/]+)/);

  return match ? decodeURIComponent(match[1]) : null;
}

const serviceErrorWrapStyle = {
  flex: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  padding: 24,
  backgroundColor: '#F8FAFC',
};

const serviceErrorTitleStyle = {
  color: '#0F172A',
  fontSize: 24,
  fontWeight: '900' as const,
  textAlign: 'center' as const,
  marginBottom: 10,
};

const serviceErrorBodyStyle = {
  color: '#475569',
  fontSize: 16,
  lineHeight: 23,
  textAlign: 'center' as const,
  maxWidth: 420,
};

const retryButtonStyle = {
  marginTop: 18,
  backgroundColor: '#0B5FFF',
  borderRadius: 14,
  paddingHorizontal: 22,
  paddingVertical: 12,
};

const retryButtonTextStyle = {
  color: '#FFFFFF',
  fontSize: 15,
  fontWeight: '900' as const,
};
