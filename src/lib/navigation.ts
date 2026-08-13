import type { Href } from 'expo-router';

type BackRouter = {
    back: () => void;
    canGoBack: () => boolean;
    replace: (href: Href) => void;
};

export function safeBack(router: BackRouter, fallbackRoute: Href) {
    if (router.canGoBack()) {
        router.back();
        return;
    }

    router.replace(fallbackRoute);
}

export function shouldShowGlobalBackButton(pathname?: string | null) {
    const pathOnly = String(pathname || '/').split(/[?#]/, 1)[0] || '/';
    const normalizedPath = pathOnly.replace(/\/+$/, '') || '/';

    return normalizedPath !== '/';
}
