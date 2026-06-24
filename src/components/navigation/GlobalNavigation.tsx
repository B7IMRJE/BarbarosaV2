import { router, usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/useTheme';

type GlobalNavigationProps = {
    children: ReactNode;
};

const hiddenRoutePrefixes = ['/auth', '/onboarding', '/super-admin'];

const primaryTabs = [
    { label: 'Home', route: '/' },
    { label: 'Equipment', route: '/equipment' },
    { label: 'Documents', route: '/documents' },
    { label: 'Profile', route: '/profile' },
];

const drawerLinks = [
    { label: 'ManagementOS', route: '/management' },
    { label: 'Maintenance', route: '/maintenance' },
    { label: 'Jobs', route: '/jobs' },
    { label: 'Theme & Sizes', route: '/profile/theme' },
    { label: 'Security', route: '/profile/security' },
    { label: 'Data', route: '/data' },
    { label: 'Connections', route: '/connections' },
    { label: 'Emergency', route: '/emergency' },
    { label: 'Contact', route: '/contact' },
];

export default function GlobalNavigation({ children }: GlobalNavigationProps) {
    const pathname = usePathname();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const { scaleFont, scaleIcon, theme } = useTheme();
    const insets = useSafeAreaInsets();

    const currentPath = normalizePath(pathname);
    const canUseBack = currentPath !== '/';
    const shouldHideNavigation = hiddenRoutePrefixes.some((prefix) => currentPath.startsWith(prefix));

    if (shouldHideNavigation) {
        return <>{children}</>;
    }

    function goTo(route: string) {
        setDrawerOpen(false);

        if (normalizePath(route) === currentPath) {
            return;
        }

        router.push(route as any);
    }

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
                            onPress={() => goTo('/')}
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
                        HomeOS
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
                    {primaryTabs.map((tab) => {
                        const active = isActiveTab(tab.route);

                        return (
                            <TouchableOpacity
                                key={tab.route}
                                activeOpacity={0.82}
                                onPress={() => goTo(tab.route)}
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
                            {drawerLinks.map((link) => {
                                const active = isActiveTab(link.route);

                                return (
                                    <TouchableOpacity
                                        key={link.route}
                                        activeOpacity={0.82}
                                        onPress={() => goTo(link.route)}
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
    const withoutTrailingSlash = pathname.replace(/\/+$/, '');

    return withoutTrailingSlash || '/';
}
