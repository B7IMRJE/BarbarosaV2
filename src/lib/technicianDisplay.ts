export type TechnicianDisplayIdentity = {
    full_name?: string | null;
    email?: string | null;
};

export function getTechnicianAssignmentDisplayName(
    technician?: TechnicianDisplayIdentity | null
) {
    const name = String(technician?.full_name || '').trim();

    return name || 'Technician';
}
