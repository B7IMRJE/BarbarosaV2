import { useEffect, useMemo, useState } from 'react';
import { loadLoggedInUserCompanyAccess, type CompanyRouteAccessRow } from '../../lib/onboarding';
import { supabase } from '../../lib/supabase';
import DispatchChatOverlay from './DispatchChatOverlay';

type GlobalDispatchChatOverlayProps = {
    pathname: string;
    preferredCompanyId?: string | null;
};

const DISPATCH_CHAT_ROLES = new Set([
    'owner',
    'admin',
    'manager',
    'office',
    'dispatcher',
    'supervisor',
]);

/**
 * Keeps the Dispatch conversation available while an authorized office user
 * moves between the company workspace, provider-mode HomeOS, and job tools.
 */
export default function GlobalDispatchChatOverlay({
    pathname,
    preferredCompanyId,
}: GlobalDispatchChatOverlayProps) {
    const [companyId, setCompanyId] = useState('');
    const resolvedPreferredCompanyId = useMemo(
        () => resolvePreferredCompanyId(pathname, preferredCompanyId),
        [pathname, preferredCompanyId]
    );
    const canShowOnRoute = canShowGlobalDispatchChat(pathname);

    useEffect(() => {
        let active = true;

        if (!canShowOnRoute) {
            setCompanyId('');
            return () => {
                active = false;
            };
        }

        async function loadDispatchCompany() {
            const sessionResult = await supabase.auth.getSession();
            const userId = sessionResult.data.session?.user.id || '';

            if (!active || !userId || sessionResult.error) {
                if (active) setCompanyId('');
                return;
            }

            const access = await loadLoggedInUserCompanyAccess(userId);

            if (!active) return;

            setCompanyId(selectDispatchChatCompanyId(access.data, resolvedPreferredCompanyId));
        }

        void loadDispatchCompany();

        return () => {
            active = false;
        };
    }, [canShowOnRoute, resolvedPreferredCompanyId]);

    if (!companyId) return null;

    return <DispatchChatOverlay companyId={companyId} bottomOffset={86} />;
}

export function selectDispatchChatCompanyId(
    companyAccess: CompanyRouteAccessRow[],
    preferredCompanyId?: string | null
) {
    const allowed = companyAccess.filter((access) => (
        normalizeStatus(access.status) === 'active' &&
        DISPATCH_CHAT_ROLES.has(normalizeRole(access.role))
    ));
    const preferredId = String(preferredCompanyId || '').trim();

    if (preferredId) {
        return allowed.find((access) => access.company_id === preferredId)?.company_id || '';
    }

    return allowed[0]?.company_id || '';
}

export function canShowGlobalDispatchChat(pathname: string) {
    const normalizedPath = normalizePath(pathname);

    return !(
        normalizedPath === '/dispatch-wall' ||
        normalizedPath.startsWith('/dispatch-wall/') ||
        normalizedPath === '/auth' ||
        normalizedPath.startsWith('/auth/') ||
        normalizedPath === '/company-invite' ||
        normalizedPath === '/customer-invite'
    );
}

function resolvePreferredCompanyId(pathname: string, preferredCompanyId?: string | null) {
    const routeCompanyId = String(preferredCompanyId || '').trim();

    if (routeCompanyId) return routeCompanyId;

    const match = normalizePath(pathname).match(/^\/super-admin\/company\/([^/]+)/);

    return match ? decodeURIComponent(match[1]) : '';
}

function normalizePath(pathname: string) {
    const withoutTrailingSlash = String(pathname || '').replace(/\/+$/, '');

    return withoutTrailingSlash || '/';
}

function normalizeStatus(status?: string | null) {
    return String(status || '').trim().toLowerCase();
}

function normalizeRole(role?: string | null) {
    const normalizedRole = String(role || '').trim().toLowerCase();

    return normalizedRole === 'dispatch' ? 'dispatcher' : normalizedRole;
}
