export type JobWorkflowSchedulingReason =
    | 'waiting_for_parts'
    | 'permit_or_approval'
    | 'staffing_or_equipment'
    | 'customer_timing'
    | 'other';

export const JOB_WORKFLOW_SCHEDULING_REASONS: readonly {
    value: JobWorkflowSchedulingReason;
    label: string;
}[] = [
    { value: 'waiting_for_parts', label: 'Waiting for Parts' },
    { value: 'permit_or_approval', label: 'Permit / Approval' },
    { value: 'staffing_or_equipment', label: 'Staffing / Equipment' },
    { value: 'customer_timing', label: 'Customer Timing' },
    { value: 'other', label: 'Other' },
];

export const JOB_WORKFLOW_TIME_OPTIONS = Array.from({ length: 30 }, (_, index) => {
    const totalMinutes = 6 * 60 + index * 30;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const label = new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
    });

    return { value, label };
});

export function formatJobWorkflowDateInput(date: Date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

export function formatJobWorkflowMonthInput(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getEarliestJobWorkflowScheduleDate(input: {
    acceptedAt?: string | null;
    soldAt?: string | null;
    cancellationDays: number;
    now?: Date;
}) {
    const accepted = parseIsoDate(input.acceptedAt) || parseIsoDate(input.soldAt) || new Date(input.now || new Date());
    const businessDays = Math.max(0, Math.floor(input.cancellationDays || 0));
    const candidate = new Date(accepted.getFullYear(), accepted.getMonth(), accepted.getDate(), 12);
    let added = 0;

    while (added < businessDays) {
        candidate.setDate(candidate.getDate() + 1);
        const weekday = candidate.getDay();
        if (weekday !== 0 && weekday !== 6) added += 1;
    }

    candidate.setDate(candidate.getDate() + 1);

    const tomorrow = new Date(input.now || new Date());
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);

    return candidate < tomorrow ? tomorrow : candidate;
}

export function combineJobWorkflowScheduleDateTime(dateText: string, timeText: string) {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeText);

    if (!dateMatch || !timeMatch) return '';

    const date = new Date(
        Number(dateMatch[1]),
        Number(dateMatch[2]) - 1,
        Number(dateMatch[3]),
        Number(timeMatch[1]),
        Number(timeMatch[2]),
        0,
        0
    );

    if (Number.isNaN(date.getTime())) return '';
    if (formatJobWorkflowDateInput(date) !== dateText) return '';
    if (`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` !== timeText) return '';

    return date.toISOString();
}

export function formatJobWorkflowScheduleDate(dateText: string) {
    const date = parseDateText(dateText);

    return date
        ? date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
        : 'Choose a date';
}

export function formatJobWorkflowScheduleTime(timeText: string) {
    return JOB_WORKFLOW_TIME_OPTIONS.find((option) => option.value === timeText)?.label || 'Choose a time';
}

export function changeJobWorkflowCalendarMonth(monthText: string, offset: number) {
    const month = parseMonthText(monthText) || new Date();
    month.setDate(1);
    month.setMonth(month.getMonth() + offset);

    return formatJobWorkflowMonthInput(month);
}

export function getJobWorkflowCalendarDays(monthText: string) {
    const month = parseMonthText(monthText) || new Date();
    const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay());

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);

        return {
            dateText: formatJobWorkflowDateInput(date),
            inCurrentMonth: date.getMonth() === month.getMonth(),
            label: String(date.getDate()),
        };
    });
}

export function getJobWorkflowSchedulingReasonLabel(reason?: string | null) {
    return JOB_WORKFLOW_SCHEDULING_REASONS.find((option) => option.value === reason)?.label || 'Scheduling follow-up';
}

function parseIsoDate(value?: string | null) {
    if (!value) return null;
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

function parseDateText(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);

    return formatJobWorkflowDateInput(date) === value ? date : null;
}

function parseMonthText(value: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, 1, 12);

    return formatJobWorkflowMonthInput(date) === value ? date : null;
}
