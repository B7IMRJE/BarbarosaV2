export const REGULAR_SHIFT_SECONDS = 8 * 60 * 60;

export type TechnicianShiftTimeEntry = {
    clockedInAt: string;
    clockedOutAt: string | null;
    breakStartedAt: string | null;
    breakEndedAt: string | null;
    breakMinutes: number;
};

export type TechnicianShiftHourSummary = {
    regularSeconds: number;
    overtimeSeconds: number;
    workedSeconds: number;
};

export function getTechnicianShiftHourSummary(
    entry: TechnicianShiftTimeEntry,
    now = Date.now()
): TechnicianShiftHourSummary {
    const start = new Date(entry.clockedInAt).getTime();
    const recordedEnd = entry.clockedOutAt ? new Date(entry.clockedOutAt).getTime() : now;

    if (!Number.isFinite(start) || !Number.isFinite(recordedEnd)) {
        return { regularSeconds: 0, overtimeSeconds: 0, workedSeconds: 0 };
    }

    const elapsedSeconds = Math.max(0, Math.floor((recordedEnd - start) / 1000));
    const recordedLunchSeconds = Math.max(0, entry.breakMinutes) * 60;
    const activeLunchSeconds = getActiveLunchSeconds(entry, start, recordedEnd);
    const workedSeconds = Math.max(0, elapsedSeconds - recordedLunchSeconds - activeLunchSeconds);
    const regularSeconds = Math.min(workedSeconds, REGULAR_SHIFT_SECONDS);

    return {
        regularSeconds,
        overtimeSeconds: Math.max(0, workedSeconds - REGULAR_SHIFT_SECONDS),
        workedSeconds,
    };
}

export function formatTechnicianHours(seconds: number) {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function getActiveLunchSeconds(
    entry: TechnicianShiftTimeEntry,
    shiftStart: number,
    shiftEnd: number
) {
    if (entry.clockedOutAt || !entry.breakStartedAt || entry.breakEndedAt) return 0;

    const breakStart = new Date(entry.breakStartedAt).getTime();
    if (!Number.isFinite(breakStart)) return 0;

    const clampedBreakStart = Math.max(shiftStart, Math.min(breakStart, shiftEnd));
    return Math.max(0, Math.floor((shiftEnd - clampedBreakStart) / 1000));
}
