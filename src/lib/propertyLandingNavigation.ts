export const propertyLandingPrimaryDestinations = [
    {
        key: 'interior',
        title: 'My Home',
        description: 'Rooms, equipment, and everything inside your home',
        actionLabel: 'Open My Home',
        accessibilityLabel: 'Open My Home areas',
        route: '/home/interior',
    },
    {
        key: 'exterior',
        title: 'Exterior',
        description: 'Outdoor areas, equipment, and everything around your home',
        actionLabel: 'Open Exterior',
        accessibilityLabel: 'Open Exterior areas',
        route: '/home/exterior',
    },
] as const;

export const propertyLandingOtherAreasAction = {
    title: 'Other Areas / Needs Placement',
    accessibilityLabel: 'Open other areas that need placement',
    route: '/home/unclassified',
} as const;

export function shouldShowPropertyDestinations(providerRouteActive: boolean) {
    return !providerRouteActive;
}
