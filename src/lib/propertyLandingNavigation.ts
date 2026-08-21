export const propertyLandingPrimaryDestinations = [
    {
        key: 'interior',
        title: 'My Home',
        description: 'Rooms and indoor areas',
        actionLabel: 'Open My Home',
        accessibilityLabel: 'Open My Home areas',
        route: '/home',
    },
] as const;

/** Exterior stays part of the My Home flow instead of competing on the landing. */
export const myHomeAreaDestinations = [
    {
        key: 'interior',
        title: 'Interior',
        description: 'Rooms and indoor areas',
        actionLabel: 'View interior areas',
        accessibilityLabel: 'Open interior areas',
        route: '/home/interior',
    },
    {
        key: 'exterior',
        title: 'Exterior',
        description: 'Yards and outdoor areas',
        actionLabel: 'View exterior areas',
        accessibilityLabel: 'Open exterior areas',
        route: '/home/exterior',
    },
] as const;

/** Existing workflow destinations; these remain links to the established sources. */
export const propertyLandingWorkflowDestinations = [
    {
        key: 'emergency',
        title: 'Emergency Center',
        description: 'View active emergency updates and report an urgent issue.',
        actionLabel: 'Open Emergency Center',
        accessibilityLabel: 'Open Emergency Center',
        route: '/emergency',
        icon: '🚨',
    },
    {
        key: 'requests',
        title: 'Service Requests',
        description: 'Review regular requests, leads, and active job updates.',
        actionLabel: 'Open Service Requests',
        accessibilityLabel: 'Open Service Requests',
        route: '/services',
        icon: '📝',
    },
    {
        key: 'maintenance',
        title: 'Maintenance Center',
        description: 'Review maintenance work, history, and upcoming care.',
        actionLabel: 'Open Maintenance Center',
        accessibilityLabel: 'Open Maintenance Center',
        route: '/maintenance',
        icon: '🧰',
    },
    {
        key: 'connections',
        title: 'Company Connections',
        description: 'Review connected companies and pending access requests.',
        actionLabel: 'Open Connections',
        accessibilityLabel: 'Open Connections',
        route: '/connections',
        icon: '🔗',
    },
] as const;

export const propertyLandingIdentityPresentation = {
    showMap: false,
    showHomeMotif: true,
    showAreaSections: false,
} as const;

export function resolvePropertyLandingIdentity(input: {
    name?: string | null;
    address?: string | null;
}) {
    const name = String(input.name || '').trim();
    const address = String(input.address || '').trim();
    const title = name || address || 'My property';

    return {
        eyebrow: 'Your Property',
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
