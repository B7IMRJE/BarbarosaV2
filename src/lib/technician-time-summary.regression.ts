import {
    formatTechnicianHours,
    getTechnicianShiftHourSummary,
    type TechnicianShiftTimeEntry,
} from './technician-time-summary';

runTechnicianTimeSummaryRegressions();

export function runTechnicianTimeSummaryRegressions() {
    shiftBelowEightHoursStaysRegular();
    shiftAboveEightHoursSplitsOvertime();
    recordedLunchIsExcluded();
    activeLunchStopsWorkedTimeFromAdvancing();
    completedShiftUsesRecordedClockOut();
    invalidDatesFailSafely();
    hoursUseCompactReadableFormatting();
}

function shiftBelowEightHoursStaysRegular() {
    const summary = getTechnicianShiftHourSummary(createEntry(), atHour(7.5));

    assert(summary.regularSeconds === 7.5 * 60 * 60, 'Worked time below eight hours should remain regular.');
    assert(summary.overtimeSeconds === 0, 'Worked time below eight hours should not create overtime.');
}

function shiftAboveEightHoursSplitsOvertime() {
    const summary = getTechnicianShiftHourSummary(createEntry(), atHour(10));

    assert(summary.regularSeconds === 8 * 60 * 60, 'Regular time should stop at eight worked hours.');
    assert(summary.overtimeSeconds === 2 * 60 * 60, 'Worked time after eight hours should appear as overtime.');
}

function recordedLunchIsExcluded() {
    const summary = getTechnicianShiftHourSummary(createEntry({ breakMinutes: 30 }), atHour(9));

    assert(summary.regularSeconds === 8 * 60 * 60, 'Recorded lunch should not reduce the first eight worked hours incorrectly.');
    assert(summary.overtimeSeconds === 30 * 60, 'A nine-hour shift with a recorded 30-minute lunch should show 30 overtime minutes.');
}

function activeLunchStopsWorkedTimeFromAdvancing() {
    const entry = createEntry({ breakStartedAt: isoAtHour(4) });
    const summary = getTechnicianShiftHourSummary(entry, atHour(4.5));

    assert(summary.workedSeconds === 4 * 60 * 60, 'An active unpaid lunch should stop worked time from advancing.');
}

function completedShiftUsesRecordedClockOut() {
    const entry = createEntry({ clockedOutAt: isoAtHour(9) });
    const summary = getTechnicianShiftHourSummary(entry, atHour(20));

    assert(summary.workedSeconds === 9 * 60 * 60, 'A completed shift should not keep accumulating after clock-out.');
}

function invalidDatesFailSafely() {
    const summary = getTechnicianShiftHourSummary(createEntry({ clockedInAt: 'not-a-date' }), atHour(9));

    assert(summary.workedSeconds === 0, 'Invalid time-entry dates should display zero instead of corrupt totals.');
}

function hoursUseCompactReadableFormatting() {
    assert(formatTechnicianHours(9 * 60 * 60 + 5 * 60) === '9h 05m', 'Hours should use a compact hours-and-minutes label.');
}

function createEntry(overrides: Partial<TechnicianShiftTimeEntry> = {}): TechnicianShiftTimeEntry {
    return {
        clockedInAt: isoAtHour(0),
        clockedOutAt: null,
        breakStartedAt: null,
        breakEndedAt: null,
        breakMinutes: 0,
        ...overrides,
    };
}

function atHour(hour: number) {
    return Date.UTC(2026, 7, 3, 8, 0, 0) + hour * 60 * 60 * 1000;
}

function isoAtHour(hour: number) {
    return new Date(atHour(hour)).toISOString();
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
