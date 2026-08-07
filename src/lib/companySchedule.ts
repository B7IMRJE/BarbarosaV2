export type CompanyScheduleCrewRole = 'lead' | 'technician' | 'helper' | 'observer';

export type CompanyScheduleSlotAssignment = {
    id: string;
    company_id: string;
    schedule_slot_id: string;
    company_user_id: string;
    role_on_schedule: CompanyScheduleCrewRole;
    status: string;
    display_name: string;
    email: string | null;
};

export type CompanyScheduleMeetingAttendee = {
    company_user_id: string;
    attendee_role: string;
    attendance_status: string;
    display_name: string;
    email: string | null;
};

export type CompanyScheduleMeeting = {
    id: string;
    company_id: string;
    title: string;
    notes: string | null;
    start_at: string;
    end_at: string;
    status: string;
    completed_at: string | null;
    attendees: CompanyScheduleMeetingAttendee[];
};

export type CompanyScheduleOverview = {
    slotAssignments: CompanyScheduleSlotAssignment[];
    meetings: CompanyScheduleMeeting[];
};

const CREW_ROLES: CompanyScheduleCrewRole[] = ['lead', 'technician', 'helper', 'observer'];

export function normalizeCompanyScheduleOverview(data: unknown): CompanyScheduleOverview {
    const record = isRecord(data) ? data : {};

    return {
        slotAssignments: normalizeSlotAssignments(record.slot_assignments),
        meetings: normalizeMeetings(record.meetings),
    };
}

export function getScheduleCrewForSlot(
    assignments: readonly CompanyScheduleSlotAssignment[],
    scheduleSlotId: string
) {
    return assignments
        .filter((assignment) => assignment.schedule_slot_id === scheduleSlotId && normalizeText(assignment.status) !== 'removed')
        .sort((first, second) => getCrewRoleRank(first.role_on_schedule) - getCrewRoleRank(second.role_on_schedule));
}

export function getScheduleAssignedSlotIds(
    assignments: readonly CompanyScheduleSlotAssignment[],
    companyUserIds: readonly string[]
) {
    const visibleUserIds = new Set(companyUserIds.map((id) => id.trim()).filter(Boolean));

    return Array.from(new Set(
        assignments
            .filter((assignment) => visibleUserIds.has(assignment.company_user_id) && normalizeText(assignment.status) !== 'removed')
            .map((assignment) => assignment.schedule_slot_id)
            .filter(Boolean)
    ));
}

export function getScheduleRoleForCompanyUsers(
    assignments: readonly CompanyScheduleSlotAssignment[],
    scheduleSlotId: string,
    companyUserIds: readonly string[]
) {
    const visibleUserIds = new Set(companyUserIds.map((id) => id.trim()).filter(Boolean));
    const matchingAssignment = getScheduleCrewForSlot(assignments, scheduleSlotId)
        .find((assignment) => visibleUserIds.has(assignment.company_user_id));

    return matchingAssignment?.role_on_schedule || null;
}

export function getCompanyScheduleCrewRoleLabel(role?: string | null) {
    switch (normalizeText(role)) {
        case 'lead':
        case 'primary':
            return 'Lead technician';
        case 'technician':
        case 'additional':
            return 'Technician';
        case 'helper':
            return 'Helper';
        case 'observer':
            return 'Observer';
        default:
            return 'Crew member';
    }
}

export function canScheduleCrewRoleControlWorkflow(role?: string | null) {
    return normalizeText(role) === 'lead' || normalizeText(role) === 'primary';
}

export function isOpenCompanyScheduleMeeting(meeting: Pick<CompanyScheduleMeeting, 'status'>) {
    return normalizeText(meeting.status) === 'scheduled';
}

function normalizeSlotAssignments(data: unknown): CompanyScheduleSlotAssignment[] {
    return (Array.isArray(data) ? data : [])
        .map((value) => {
            const record = isRecord(value) ? value : {};
            const rawRole = normalizeText(readString(record, 'role_on_schedule'));

            return {
                id: readString(record, 'id'),
                company_id: readString(record, 'company_id'),
                schedule_slot_id: readString(record, 'schedule_slot_id'),
                company_user_id: readString(record, 'company_user_id'),
                role_on_schedule: CREW_ROLES.includes(rawRole as CompanyScheduleCrewRole)
                    ? rawRole as CompanyScheduleCrewRole
                    : 'technician',
                status: readString(record, 'status') || 'assigned',
                display_name: readString(record, 'display_name') || 'Team member',
                email: readNullableString(record, 'email'),
            };
        })
        .filter((assignment) => (
            assignment.id &&
            assignment.company_id &&
            assignment.schedule_slot_id &&
            assignment.company_user_id
        ));
}

function normalizeMeetings(data: unknown): CompanyScheduleMeeting[] {
    return (Array.isArray(data) ? data : [])
        .map((value) => {
            const record = isRecord(value) ? value : {};

            return {
                id: readString(record, 'id'),
                company_id: readString(record, 'company_id'),
                title: readString(record, 'title') || 'Team meeting',
                notes: readNullableString(record, 'notes'),
                start_at: readString(record, 'start_at'),
                end_at: readString(record, 'end_at'),
                status: readString(record, 'status') || 'scheduled',
                completed_at: readNullableString(record, 'completed_at'),
                attendees: normalizeMeetingAttendees(record.attendees),
            };
        })
        .filter((meeting) => meeting.id && meeting.company_id && meeting.start_at && meeting.end_at)
        .sort((first, second) => new Date(first.start_at).getTime() - new Date(second.start_at).getTime());
}

function normalizeMeetingAttendees(data: unknown): CompanyScheduleMeetingAttendee[] {
    return (Array.isArray(data) ? data : [])
        .map((value) => {
            const record = isRecord(value) ? value : {};

            return {
                company_user_id: readString(record, 'company_user_id'),
                attendee_role: readString(record, 'attendee_role') || 'attendee',
                attendance_status: readString(record, 'attendance_status') || 'scheduled',
                display_name: readString(record, 'display_name') || 'Team member',
                email: readNullableString(record, 'email'),
            };
        })
        .filter((attendee) => attendee.company_user_id);
}

function getCrewRoleRank(role: CompanyScheduleCrewRole) {
    return CREW_ROLES.indexOf(role);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string) {
    const value = record[key];
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(record: Record<string, unknown>, key: string) {
    return readString(record, key) || null;
}

function normalizeText(value?: string | null) {
    return String(value || '').trim().toLowerCase();
}
