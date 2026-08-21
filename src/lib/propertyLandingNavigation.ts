export const propertyLandingPrimaryDestinations = [
    {
        key: 'interior',
        title: 'My Home',
        description: 'Rooms and indoor areas',
        actionLabel: 'Open My Home',
        accessibilityLabel: 'Open My Home areas',
        route: '/home/interior',
    },
    {
        key: 'exterior',
        title: 'Exterior',
        description: 'Yards and outdoor areas',
        actionLabel: 'Open Exterior',
        accessibilityLabel: 'Open Exterior areas',
        route: '/home/exterior',
    },
] as const;

export function resolvePropertyLandingIdentity(input: {
    name?: string | null;
    address?: string | null;
}) {
    const name = String(input.name || '').trim();
    const address = String(input.address || '').trim();
    const title = name || address || 'My property';

    return {
        eyebrow: 'Your property',
        title,
        address: address && address !== title ? address : '',
    } as const;
}

export const propertyLandingOtherAreasAction = {
    title: 'Other Areas / Needs Placement',
    accessibilityLabel: 'Open other areas that need placement',
    route: '/home/unclassified',
} as const;

export function shouldShowPropertyDestinations(providerRouteActive: boolean) {
    return !providerRouteActive;
}
