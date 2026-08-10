import {
    combineJobWorkflowScheduleDateTime,
    formatJobWorkflowDateInput,
    getEarliestJobWorkflowScheduleDate,
    getJobWorkflowCalendarDays,
    JOB_WORKFLOW_TIME_OPTIONS,
} from './job-workflow-scheduling';

runJobWorkflowSchedulingRegressions();

export function runJobWorkflowSchedulingRegressions() {
    calendarAlwaysBuildsSixCompleteWeeks();
    localSelectionCreatesAnExactInstant();
    impossibleCalendarDatesAreRejected();
    cancellationWindowSetsTheEarliestReturnDate();
    appointmentTimesCoverMorningAndEvening();
}

function calendarAlwaysBuildsSixCompleteWeeks() {
    const days = getJobWorkflowCalendarDays('2026-08');
    assert(days.length === 42, 'The appointment calendar should always display six complete weeks.');
    assert(days.some((day) => day.dateText === '2026-08-10'), 'The selected month should include its actual dates.');
}

function localSelectionCreatesAnExactInstant() {
    const iso = combineJobWorkflowScheduleDateTime('2026-08-14', '09:30');
    const parsed = new Date(iso);

    assert(Boolean(iso) && !Number.isNaN(parsed.getTime()), 'A valid calendar and time selection should create an ISO appointment.');
    assert(formatJobWorkflowDateInput(parsed) === '2026-08-14', 'The appointment should preserve the technician’s local calendar date.');
    assert(parsed.getHours() === 9 && parsed.getMinutes() === 30, 'The appointment should preserve the selected local time.');
}

function impossibleCalendarDatesAreRejected() {
    assert(combineJobWorkflowScheduleDateTime('2026-02-31', '09:00') === '', 'Impossible dates must not create appointments.');
    assert(combineJobWorkflowScheduleDateTime('2026-08-10', '25:00') === '', 'Impossible times must not create appointments.');
}

function cancellationWindowSetsTheEarliestReturnDate() {
    const earliest = getEarliestJobWorkflowScheduleDate({
        acceptedAt: '2026-08-10T10:00:00-07:00',
        cancellationDays: 3,
        now: new Date('2026-08-10T11:00:00-07:00'),
    });

    assert(formatJobWorkflowDateInput(earliest) === '2026-08-14', 'Three business days from Monday should allow work starting Friday.');
}

function appointmentTimesCoverMorningAndEvening() {
    assert(JOB_WORKFLOW_TIME_OPTIONS[0]?.value === '06:00', 'The appointment list should begin at 6:00 AM.');
    assert(JOB_WORKFLOW_TIME_OPTIONS.at(-1)?.value === '20:30', 'The appointment list should include evening work through 8:30 PM.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
