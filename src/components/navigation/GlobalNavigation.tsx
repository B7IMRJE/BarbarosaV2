import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { providerModePath, readProviderModeParams } from '../../lib/providerMode';
import { isStaffRole, loadCurrentUserRole } from '../../lib/roles';
import { useTheme } from '../../theme/useTheme';

type GlobalNavigationProps = {
    children: ReactNode;
};

type NavigationLink = {
    label: string;
    route: string;
    staffOnly?: boolean;
    preserveProvider?: boolean;
};

const hiddenRoutePrefixes = ['/auth', '/onboarding', '/super-admin'];

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
    const insets = useSafeAreaInsets();

    const currentPath = normalizePath(pathname);
    const canUseBack = currentPath !== '/';
    const shouldHideNavigation = hiddenRoutePrefixes.some((prefix) => currentPath.startsWith(prefix));

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
                        <TouchableOpacity
                            activeOpacity={0.82}
                            disabled={!canUseBack}
                            onPress={() => {
                                if (canUseBack) {
                                    router.back();
                                }
                            }}
                            style={{
                                opacity: canUseBack ? 1 : 0.45,
                                backgroundColor: theme.colors.secondaryButton,
                                borderColor: theme.colors.border,
                                borderRadius: theme.radii.pill,
                                borderWidth: 1,
                                paddingHorizontal: scaleIcon(14),
                                paddingVertical: scaleIcon(9),
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.colors.secondaryButtonText,
                                    fontSize: scaleFont(14),
                                    fontWeight: '900',
                                }}
                            >
                                Back
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            activeOpacity={0.82}
                            onPress={() => goTo({ label: 'Home', route: '/' })}
                            style={{
                                backgroundColor: theme.colors.primary,
                                borderRadius: theme.radii.pill,
                                paddingHorizontal: scaleIcon(14),
                                paddingVertical: scaleIcon(9),
                            }}
                        >
                            <Text
                                style={{
                                    color: theme.colors.primaryText,
                                    fontSize: scaleFont(14),
                                    fontWeight: '900',
                                }}
                            >
                                Home
                            </Text>
                        </TouchableOpacity>
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
                        {providerModeContext ? 'Client HomeOS' : 'HomeOS'}
                    </Text>
                </View>
            </View>

            <View style={{ flex: 1 }}>
                {children}
            </View>

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
                        gap: scaleIcon(6),
                    }}
                >
                    {activePrimaryTabs.map((tab) => {
                        const active = isActiveTab(tab.route);

                        return (
                            <TouchableOpacity
                                key={tab.route}
                                activeOpacity={0.82}
                                onPress={() => goTo(tab)}
                                style={{
                                    alignItems: 'center',
                                    backgroundColor: active ? theme.colors.primary : theme.colors.secondaryButton,
                                    borderColor: active ? theme.colors.primary : theme.colors.border,
                                    borderRadius: theme.radii.pill,
                                    borderWidth: 1,
                                    flex: 1,
                                    paddingHorizontal: scaleIcon(8),
                                    paddingVertical: scaleIcon(10),
                                }}
                            >
                                <Text
                                    numberOfLines={1}
                                    style={{
                                        color: active ? theme.colors.primaryText : theme.colors.secondaryButtonText,
                                        fontSize: scaleFont(12),
                                        fontWeight: '900',
                                    }}
                                >
                                    {tab.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}

                    <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => setDrawerOpen(true)}
                        style={{
                            alignItems: 'center',
                            backgroundColor: theme.colors.secondaryButton,
                            borderColor: theme.colors.border,
                            borderRadius: theme.radii.pill,
                            borderWidth: 1,
                            flex: 0.8,
                            paddingHorizontal: scaleIcon(8),
                            paddingVertical: scaleIcon(10),
                        }}
                    >
                        <Text
                            numberOfLines={1}
                            style={{
                                color: theme.colors.secondaryButtonText,
                                fontSize: scaleFont(12),
                                fontWeight: '900',
                            }}
                        >
                            More
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

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
                                    <TouchableOpacity
                                        key={link.route}
                                        activeOpacity={0.82}
                                        onPress={() => goTo(link)}
                                        style={{
                                            backgroundColor: active
                                                ? theme.colors.secondaryButton
                                                : theme.colors.surfaceAlt,
                                            borderColor: active ? theme.colors.primary : theme.colors.border,
                                            borderRadius: theme.radii.button,
                                            borderWidth: 1,
                                            paddingHorizontal: scaleIcon(16),
                                            paddingVertical: scaleIcon(14),
                                        }}
                                    >
                                        <Text
                                            style={{
                                                color: active ? theme.colors.primary : theme.colors.text,
                                                fontSize: scaleFont(16),
                                                fontWeight: '900',
                                            }}
                                        >
                                            {link.label}
                                        </Text>
                                    </TouchableOpacity>
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
    const pathOnly = pathname.split('?')[0] || '/';
    const withoutTrailingSlash = pathOnly.replace(/\/+$/, '');

    return withoutTrailingSlash || '/';
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
