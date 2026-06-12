export const STATUS = {
    GOOD: 'Good',
    MAINTENANCE_RECOMMENDED: 'Maintenance Recommended',
    NEEDS_ATTENTION: 'Needs Attention',
    EMERGENCY: 'Emergency',
    MISSING: 'Missing',
    NOT_INSPECTED: 'Not Inspected',
} as const;

export type EquipmentStatus = (typeof STATUS)[keyof typeof STATUS];

export function getStatusColor(status: EquipmentStatus) {
    if (status === STATUS.GOOD) return '#16A34A';
    if (status === STATUS.MAINTENANCE_RECOMMENDED) return '#FACC15';
    if (status === STATUS.NEEDS_ATTENTION) return '#F97316';
    if (status === STATUS.EMERGENCY) return '#DC2626';
    if (status === STATUS.MISSING) return '#6B7280';
    if (status === STATUS.NOT_INSPECTED) return '#2563EB';

    return '#111827';
}