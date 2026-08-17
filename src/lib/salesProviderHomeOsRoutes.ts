export function isSalesProviderHomeOsRouteAllowed(
    pathname: string,
    hasAssignedWorkContext: boolean
) {
    if (!hasAssignedWorkContext) return false;

    if (pathname === '/' || pathname === '/equipment' || pathname.startsWith('/system/')) {
        return true;
    }

    if (pathname === '/item/create') return true;
    if (pathname === '/maintenance/wizard') return true;
    if (pathname === '/item/edit') return false;

    return pathname.startsWith('/item/');
}
