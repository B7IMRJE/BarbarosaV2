export type HomeSystemKey =
    | 'Plumbing'
    | 'Gas'
    | 'Drains / Sewer'
    | 'HVAC'
    | 'Electrical'
    | 'Safety'
    | 'Appliances'
    | 'Water Quality'
    | 'Exterior'
    | 'Documents'
    | 'Irrigation'
    | 'Pool';

export type HomeSystemDefinition = {
    key: HomeSystemKey;
    label: string;
    icon: string;
    route: string;
    aliases: string[];
};

export type HomeSystemRecord = {
    name?: string | null;
    system?: string | null;
    category?: string | null;
    location?: string | null;
    parent_area?: string | null;
};

export const homeSystems: HomeSystemDefinition[] = [
    {
        key: 'Plumbing',
        label: 'Water Service',
        icon: '🚰',
        route: '/system/plumbing',
        aliases: ['Water Service', 'Water'],
    },
    {
        key: 'Gas',
        label: 'Gas Service',
        icon: '🔥',
        route: '/system/[system]',
        aliases: ['Gas Service'],
    },
    {
        key: 'Drains / Sewer',
        label: 'Sewer Service',
        icon: '🧰',
        route: '/system/[system]',
        aliases: ['Sewer Service', 'Drains', 'Sewer'],
    },
    {
        key: 'HVAC',
        label: 'AC Service',
        icon: '❄️',
        route: '/system/[system]',
        aliases: ['AC Service', 'Heating and Cooling'],
    },
    {
        key: 'Electrical',
        label: 'Electrical System',
        icon: '⚡',
        route: '/system/[system]',
        aliases: ['Electrical System'],
    },
    {
        key: 'Safety',
        label: 'Safety System',
        icon: '🛡️',
        route: '/system/[system]',
        aliases: ['Safety System'],
    },
    {
        key: 'Appliances',
        label: 'Appliances',
        icon: '🔌',
        route: '/system/[system]',
        aliases: [],
    },
    {
        key: 'Water Quality',
        label: 'Water Quality',
        icon: '💧',
        route: '/system/[system]',
        aliases: [],
    },
    {
        key: 'Exterior',
        label: 'Exterior',
        icon: '🏠',
        route: '/system/[system]',
        aliases: [],
    },
    {
        key: 'Documents',
        label: 'Documents',
        icon: '📄',
        route: '/documents',
        aliases: [],
    },
    {
        key: 'Irrigation',
        label: 'Irrigation System',
        icon: '🌿',
        route: '/system/[system]',
        aliases: ['Irrigation System'],
    },
    {
        key: 'Pool',
        label: 'Pool System',
        icon: '🏊',
        route: '/system/[system]',
        aliases: ['Pool System'],
    },
];

export const homeSystemOptions = homeSystems.filter(
    (system) => system.key !== 'Documents'
);

export function getSystemDefinition(value?: string | null) {
    if (!value) return null;

    return (
        homeSystems.find(
            (system) =>
                system.key === value ||
                system.label === value ||
                system.aliases.includes(value)
        ) || null
    );
}

export function getSystemLabel(value?: string | null) {
    return getSystemDefinition(value)?.label || value || 'System';
}

export function isCustomServiceRoot(row: HomeSystemRecord) {
    const systemName = normalizeSystemText(row.system);

    if (!systemName || getSystemDefinition(systemName)) return false;
    if (!sameSystemText(row.category, 'Area')) return false;
    if (normalizeSystemText(row.parent_area)) return false;

    return sameSystemText(row.name, 'Whole Home') || sameSystemText(row.location, 'Whole Home');
}

function sameSystemText(a?: string | null, b?: string | null) {
    return normalizeSystemText(a) === normalizeSystemText(b);
}

function normalizeSystemText(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
