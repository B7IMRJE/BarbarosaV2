import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { providerModePath, readProviderModeParams } from '../../lib/providerMode';
import { resolveGlobalHomeRoute } from '../../lib/techosClientAccess';
import {
    shouldShowHomeownerActiveRequestStatus,
} from '../../lib/homeownerActiveRequests';
import { isStaffRole, loadCurrentUserRole } from '../../lib/roles';
import { useTheme } from '../../theme/useTheme';
import HomeownerActiveRequestStatus from '../serviceRequests/HomeownerActiveRequestStatus';
import ThemedButton from '../theme/ThemedButton';

type GlobalNavigationProps = {
    children: ReactNode;
};

type NavigationLink = {
    label: string;
    route: string;
    staffOnly?: boolean;
    preserveProvider?: boolean;
};

const hiddenRoutePrefixes = ['/auth', '/onboarding', '/super-admin', '/dispatch-wall'];

const primaryTabs: NavigationLink[] = [
    { label: 'Home', route: '/' },
    { label: 'Equipment', route: '/equipment' },
    { label: 'Documents', route: '/documents' },
    { label: 'Profile', route: '/profile' },
];

const drawerLinks: NavigationLink[] = [
    { label: 'ManagementOS', route: '/management', staffOnly: true },
    { label: 'Maintenance', route: '/maintenance' },
    { label: 'Jobs', route: '/jobs', staffOnly: true },
    { label: 'Theme & Sizes', route: '/profile/theme' },
    { label: 'Security', route: '/profile/security' },
    { label: 'Data', route: '/data' },
    { label: 'Connections', route: '/connections' },
    { label: 'Emergency', route: '/emergency' },
    { label: 'Contact', route: '/contact' },
];

export default function GlobalNavigation({ children }: GlobalNavigationProps) {
    const pathname = usePathname();
    const routeParams = useGlobalSearchParams<{
        providerMode?: string | string[];
        companyId?: string | string[];
        propertyId?: string | string[];
        returnTo?: string | string[];
    }>();
    const providerModeContext = readProviderModeParams(routeParams);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [canUseStaffTools, setCanUseStaffTools] = useState(false);
    const { scaleFont, scaleIcon, theme } = useTheme();
    const { width: viewportWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const compactBottomNavigation = viewportWidth <= 480;

    const currentPath = normalizePath(pathname);
    const canUseBack = currentPath !== '/';
    const isTechOSRoute = currentPath === '/techos' || currentPath.startsWith('/techos/');
    const techOSCompanyId = firstRouteParam(routeParams.companyId);
    const homeRoute = resolveGlobalHomeRoute({ pathname: currentPath, companyId: techOSCompanyId });
    const appLabel = isTechOSRoute ? 'TechOS' : providerModeContext ? 'Client HomeOS' : 'HomeOS';
    const shouldHideNavigation = hiddenRoutePrefixes.some((prefix) => currentPath.startsWith(prefix));
    const shouldShowActiveRequestStatus = shouldShowHomeownerActiveRequestStatus({
        pathname: currentPath,
        providerModeActive: Boolean(providerModeContext),
    });

    useEffect(() => {
        loadDrawerAccess();
    }, []);

    async function loadDrawerAccess() {
        const role = await loadCurrentUserRole();

        setCanUseStaffTools(isStaffRole(role));
    }

    if (shouldHideNavigation) {
        return <>{children}</>;
    }

    function goTo(link: NavigationLink | string) {
        setDrawerOpen(false);

        const route = typeof link === 'string' ? link : link.route;
        const shouldPreserveProvider = typeof link === 'string'
            ? true
            : link.preserveProvider !== false;
        const nextRoute = providerModeContext && shouldPreserveProvider && isProviderModeNavigationRoute(route)
            ? String(providerModePath(route, providerModeContext))
            : route;

        if (normalizePath(nextRoute) === currentPath) {
            return;
        }

        router.push(nextRoute as never);
    }

    const activePrimaryTabs = providerModeContext
        ? providerPrimaryTabs(providerModeContext.companyId, providerModeContext.propertyId)
        : primaryTabs;
    const activeDrawerLinks = providerModeContext
        ? providerDrawerLinks(providerModeContext.companyId, providerModeContext.propertyId)
        : drawerLinks;
    const visibleDrawerLinks = activeDrawerLinks.filter((link) => !link.staffOnly || canUseStaffTools);

    function isActiveTab(route: string) {
        const normalizedRoute = normalizePath(route);

        if (normalizedRoute === '/') {
            return currentPath === '/';
        }

        return currentPath === normalizedRoute || currentPath.startsWith(`${normalizedRoute}/`);
    }

    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <View
                style={{
                    backgroundColor: theme.colors.surface,
                    borderBottomColor: theme.colors.border,
                    borderBottomWidth: 1,
                    paddingHorizontal: scaleIcon(14),
                    paddingTop: insets.top + scaleIcon(8),
                    paddingBottom: scaleIcon(10),
                }}
            >
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: scaleIcon(10),
                    }}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scaleIcon(10) }}>
                        <ThemedButton
                            title="Back"
                            variant="secondary"
                            disabled={!canUseBack}
                            onPress={() => {
                                if (canUseBack) {
                                    router.back();
                                }
                            }}
                            style={{
                                borderRadius: theme.radii.pill,
                                paddingHorizontal: scaleIcon(14),
                                minHeight: scaleIcon(46),
                            }}
                        />

                        <ThemedButton
                            title="Home"
                            onPress={() => goTo({ label: 'Home', route: homeRoute })}
                            style={{
                                borderRadius: theme.radii.pill,
                                paddingHorizontal: scaleIcon(14),
                                minHeight: scaleIcon(46),
                            }}
                        />
                    </View>

                    <Text
                        numberOfLines={1}
                        style={{
                            color: theme.colors.text,
                            flex: 1,
                            fontSize: scaleFont(15),
                            fontWeight: '900',
                            textAlign: 'right',
                        }}
                    >
                        {appLabel}
                    </Text>
                </View>
            </View>

            <View style={{ flex: 1 }}>
                {children}
            </View>

            {shouldShowActiveRequestStatus && (
                <HomeownerActiveRequestStatus bottomOffset={insets.bottom + scaleIcon(78)} />
            )}

            {!isTechOSRoute && (
                <View
                    style={{
                        backgroundColor: theme.colors.surface,
                        borderTopColor: theme.colors.border,
                        borderTopWidth: 1,
                        paddingHorizontal: scaleIcon(8),
                        paddingTop: scaleIcon(8),
                        paddingBottom: insets.bottom + scaleIcon(8),
                    }}
                >
                    <View
                        style={{
                            flexDirection: 'row',
                            gap: compactBottomNavigation ? 3 : scaleIcon(6),
                        }}
                    >
                        {activePrimaryTabs.map((tab) => {
                            const active = isActiveTab(tab.route);

                            return (
                                <ThemedButton
                                    key={tab.route}
                                    title={tab.label}
                                    variant={active ? 'primary' : 'secondary'}
                                    onPress={() => goTo(tab)}
                                    style={{
                                        borderRadius: theme.radii.pill,
                                        flex: 1,
                                        paddingHorizontal: compactBottomNavigation ? 2 : scaleIcon(8),
                                        minHeight: compactBottomNavigation ? 42 : scaleIcon(50),
                                    }}
                                    textStyle={compactBottomNavigation ? {
                                        fontSize: 11,
                                        lineHeight: 13,
                                        letterSpacing: 0,
                                    } : undefined}
                                />
                            );
                        })}

                        <ThemedButton
                            title="More"
                            variant="secondary"
                            onPress={() => setDrawerOpen(true)}
                            style={{
                                borderRadius: theme.radii.pill,
                                flex: 1,
                                paddingHorizontal: compactBottomNavigation ? 2 : scaleIcon(8),
                                minHeight: compactBottomNavigation ? 42 : scaleIcon(50),
                            }}
                            textStyle={compactBottomNavigation ? {
                                fontSize: 11,
                                lineHeight: 13,
                                letterSpacing: 0,
                            } : undefined}
                        />
                    </View>
                </View>
            )}

            <Modal transparent visible={drawerOpen} animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
                <View style={{ flex: 1 }}>
                    <Pressable
                        onPress={() => setDrawerOpen(false)}
                        style={{
                            backgroundColor: 'rgba(0,0,0,0.28)',
                            bottom: 0,
                            left: 0,
                            position: 'absolute',
                            right: 0,
                            top: 0,
                        }}
                    />

                    <View
                        style={{
                            backgroundColor: theme.colors.surface,
                            borderColor: theme.colors.border,
                            borderLeftWidth: 1,
                            bottom: 0,
                            paddingHorizontal: scaleIcon(18),
                            paddingTop: insets.top + scaleIcon(18),
                            paddingBottom: insets.bottom + scaleIcon(18),
                            position: 'absolute',
                            right: 0,
                            top: 0,
                            width: '82%',
                            maxWidth: scaleIcon(360),
                        }}
                    >
                        <View
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: scaleIcon(12),
                                marginBottom: scaleIcon(18),
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.colors.text,
                                    fontSize: scaleFont(24),
                                    fontWeight: '900',
                                }}
                            >
                                More
                            </Text>

                            <TouchableOpacity onPress={() => setDrawerOpen(false)} activeOpacity={0.82}>
                                <Text
                                    style={{
                                        color: theme.colors.link,
                                        fontSize: scaleFont(15),
                                        fontWeight: '900',
                                    }}
                                >
                                    Close
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView contentContainerStyle={{ gap: scaleIcon(10), paddingBottom: scaleIcon(30) }}>
                            {visibleDrawerLinks.map((link) => {
                                const active = isActiveTab(link.route);

                                return (
                                    <ThemedButton
                                        key={link.route}
                                        title={link.label}
                                        variant={active ? 'primary' : 'secondary'}
                                        onPress={() => goTo(link)}
                                        style={{
                                            borderRadius: theme.radii.button,
                                            paddingHorizontal: scaleIcon(16),
                                        }}
                                    />
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

function normalizePath(pathname: string) {
    const pathOnly = pathname.split(/[?#]/, 1)[0] || '/';
    const withoutTrailingSlash = pathOnly.replace(/\/+$/, '');

    return withoutTrailingSlash || '/';
}

function firstRouteParam(value?: string | string[]) {
    return Array.isArray(value) ? value[0] || '' : value || '';
}

function providerPrimaryTabs(companyId: string, propertyId: string): NavigationLink[] {
    return [
        { label: 'Home', route: '/' },
        { label: 'Equipment', route: '/equipment' },
        { label: 'Documents', route: '/documents' },
        {
            label: 'Customer',
            route: customerDetailRoute(companyId, propertyId),
            preserveProvider: false,
        },
    ];
}

function providerDrawerLinks(companyId: string, propertyId: string): NavigationLink[] {
    return [
        { label: 'Client Home', route: '/' },
        { label: 'Equipment', route: '/equipment' },
        { label: 'Documents', route: '/documents' },
        { label: 'Estimate Draft', route: '/estimate' },
        {
            label: 'Customer Detail',
            route: customerDetailRoute(companyId, propertyId),
            preserveProvider: false,
        },
        {
            label: 'Company Dashboard',
            route: companyDashboardRoute(companyId),
            preserveProvider: false,
        },
    ];
}

function customerDetailRoute(companyId: string, propertyId: string) {
    return `/super-admin/company/${encodeURIComponent(companyId)}/client/${encodeURIComponent(propertyId)}`;
}

function companyDashboardRoute(companyId: string) {
    return `/super-admin/company/${encodeURIComponent(companyId)}`;
}

function isProviderModeNavigationRoute(route: string) {
    const normalizedRoute = normalizePath(route);

    return (
        normalizedRoute === '/' ||
        normalizedRoute === '/equipment' ||
        normalizedRoute === '/documents' ||
        normalizedRoute === '/estimate' ||
        normalizedRoute.startsWith('/item/') ||
        normalizedRoute.startsWith('/system/')
    );
}
