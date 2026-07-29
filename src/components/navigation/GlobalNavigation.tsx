import { router, useGlobalSearchParams, usePathname } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { providerModePath, readProviderModeParams } from '../../lib/providerMode';
import { resolveGlobalHomeRoute } from '../../lib/techosClientAccess';
import {
    shouldShowHomeownerActiveRequestStatus,
} from '../../lib/homeownerActiveRequests';
import { isStaffRole, loadCurrentUserRole } from '../../lib/roles';
import { useTheme } from '../../theme/useTheme';
import { orbitalGlassPalette } from '../../theme/glassPalette';
import { createCompanyGlassPalette, type GlassPalette } from '../../theme/glassPalette';
import { GlassPaletteProvider } from '../../theme/glass-palette-context';
import { CompanyGlassDepthProvider } from '../../theme/glass-depth';
import { supabase } from '../../lib/supabase';
import HomeownerActiveRequestStatus from '../serviceRequests/HomeownerActiveRequestStatus';
import ThemedButton from '../theme/ThemedButton';

type GlobalNavigationProps = {
    children: ReactNode;
};

type NavigationLink = {
    label: string;
    route: string;
    icon?: keyof typeof MaterialCommunityIcons.glyphMap;
    staffOnly?: boolean;
    preserveProvider?: boolean;
};

const hiddenRoutePrefixes = ['/auth', '/onboarding', '/super-admin', '/dispatch', '/job-workflow'];

const primaryTabs: NavigationLink[] = [
    { label: 'Home', route: '/', icon: 'home-outline' },
    { label: 'Equipment', route: '/equipment', icon: 'tools' },
    { label: 'Documents', route: '/documents', icon: 'file-document-outline' },
    { label: 'Profile', route: '/profile', icon: 'account-outline' },
];

const drawerLinks: NavigationLink[] = [
    { label: 'Updates & Privacy', route: '/notifications', icon: 'bell-outline' },
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
    const [companyPalette, setCompanyPalette] = useState<GlassPalette | null>(null);
    const [companyGlassDepth, setCompanyGlassDepth] = useState<number | null>(null);
    const { appearance, scaleFont, scaleIcon, theme } = useTheme();
    const { width: viewportWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const compactBottomNavigation = viewportWidth <= 480;
    const homeownerPalette = useMemo(
        () =>
            createCompanyGlassPalette({
                id: 'homeowner-custom',
                label: 'Homeowner Glass',
                primary: appearance.glassPrimary,
                secondary: appearance.glassSecondary,
                accent: appearance.glassAccent,
                panel: appearance.glassPanelColor,
                panelOpacity: appearance.glassPanelOpacity,
            }),
        [
            appearance.glassAccent,
            appearance.glassPanelColor,
            appearance.glassPanelOpacity,
            appearance.glassPrimary,
            appearance.glassSecondary,
        ]
    );

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

    useEffect(() => {
        const companyId = firstRouteParam(routeParams.companyId);

        if (!companyId) {
            setCompanyPalette(null);
            setCompanyGlassDepth(null);
            return;
        }

        void supabase
            .from('companies')
            .select('id, public_name, dba_name, name, primary_color, secondary_color, accent_color, glass_depth')
            .eq('id', companyId)
            .maybeSingle()
            .then(({ data }) => {
                if (!data) return;
                setCompanyPalette(createCompanyGlassPalette({
                    id: `company-${data.id}`,
                    label: data.public_name || data.dba_name || data.name || 'Company Glass',
                    primary: data.primary_color,
                    secondary: data.secondary_color,
                    accent: data.accent_color,
                }));
                setCompanyGlassDepth(Number(data.glass_depth) || null);
            });
    }, [routeParams.companyId]);

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
        <GlassPaletteProvider palette={companyPalette || homeownerPalette}>
        <CompanyGlassDepthProvider value={companyGlassDepth}>
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <View
                style={{
                    backgroundColor: theme.colors.surface,
                    borderBottomColor: 'rgba(104, 202, 246, 0.34)',
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
                            variant="glass"
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
                            color: orbitalGlassPalette.text,
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
                        paddingHorizontal: scaleIcon(8),
                        paddingTop: scaleIcon(8),
                        paddingBottom: insets.bottom + scaleIcon(8),
                    }}
                >
                    <View
                        style={{
                            flexDirection: 'row',
                            gap: compactBottomNavigation ? 3 : scaleIcon(6),
                            backgroundColor: theme.colors.surfaceAlt,
                            borderColor: 'rgba(174, 205, 229, 0.5)',
                            borderRadius: 24,
                            borderWidth: 1,
                            boxShadow: '0 10px 28px rgba(0, 8, 18, 0.42), inset 0 2px 0 rgba(255,255,255,0.16)',
                            overflow: 'hidden',
                            padding: compactBottomNavigation ? 4 : scaleIcon(6),
                        }}
                    >
                        {activePrimaryTabs.map((tab) => {
                            const active = isActiveTab(tab.route);

                            return (
                                <ThemedButton
                                    key={tab.route}
                                    variant="glass"
                                    onPress={() => goTo(tab)}
                                    style={{
                                        borderRadius: theme.radii.pill,
                                        backgroundColor: active ? 'rgba(42, 115, 156, 0.74)' : 'rgba(3, 24, 42, 0.5)',
                                        borderColor: active ? 'rgba(139, 221, 255, 0.82)' : 'rgba(174, 205, 229, 0.35)',
                                        flex: 1,
                                        minWidth: 0,
                                        paddingHorizontal: compactBottomNavigation ? 2 : scaleIcon(8),
                                        minHeight: compactBottomNavigation ? 42 : scaleIcon(50),
                                    }}
                                >
                                    <View style={{ alignItems: 'center', flexDirection: compactBottomNavigation ? 'column' : 'row', gap: compactBottomNavigation ? 2 : 5, minWidth: 0 }}>
                                        <MaterialCommunityIcons name={tab.icon || 'circle-outline'} size={compactBottomNavigation ? 17 : scaleIcon(18)} color={orbitalGlassPalette.text} />
                                        <Text
                                            numberOfLines={1}
                                            adjustsFontSizeToFit={compactBottomNavigation}
                                            minimumFontScale={0.8}
                                            style={{ color: orbitalGlassPalette.text, fontSize: compactBottomNavigation ? 10 : scaleFont(13), fontWeight: '900' }}
                                        >
                                            {tab.label}
                                        </Text>
                                    </View>
                                </ThemedButton>
                            );
                        })}

                        <ThemedButton
                            variant="glass"
                            onPress={() => setDrawerOpen(true)}
                            style={{
                                borderRadius: theme.radii.pill,
                                flex: 1,
                                minWidth: 0,
                                paddingHorizontal: compactBottomNavigation ? 2 : scaleIcon(8),
                                minHeight: compactBottomNavigation ? 42 : scaleIcon(50),
                            }}
                        >
                            <View style={{ alignItems: 'center', flexDirection: compactBottomNavigation ? 'column' : 'row', gap: compactBottomNavigation ? 2 : 5, minWidth: 0 }}>
                                <MaterialCommunityIcons name="dots-horizontal" size={compactBottomNavigation ? 17 : scaleIcon(18)} color={orbitalGlassPalette.text} />
                                <Text numberOfLines={1} style={{ color: orbitalGlassPalette.text, fontSize: compactBottomNavigation ? 10 : scaleFont(13), fontWeight: '900' }}>More</Text>
                            </View>
                        </ThemedButton>
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
        </CompanyGlassDepthProvider>
        </GlassPaletteProvider>
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
        { label: 'Home', route: '/', icon: 'home-outline' },
        { label: 'Equipment', route: '/equipment', icon: 'tools' },
        { label: 'Documents', route: '/documents', icon: 'file-document-outline' },
        {
            label: 'Customer',
            route: customerDetailRoute(companyId, propertyId),
            preserveProvider: false,
            icon: 'account-outline',
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
