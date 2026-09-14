import { DISPATCH_TIME_OPTIONS, durationForEnd, scheduleEnd } from './scheduleTime';
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
check(DISPATCH_TIME_OPTIONS.length === 48, 'The wheel must cover the full day in half-hour increments.');
check(DISPATCH_TIME_OPTIONS[1].value === '00:30' && DISPATCH_TIME_OPTIONS[47].value === '23:30', 'Half hours and the final slot must be available.');
check(durationForEnd('2026-09-15', '09:00', '10:30') === 90, 'Choosing an end must update duration.');
check(durationForEnd('2026-09-15', '23:30', '00:30') === 60, 'An earlier end must continue into the next day.');
check(durationForEnd('2026-09-15', '09:00', '09:00') === 1440, 'Equal times must represent next day, not zero duration.');
check(durationForEnd('', '09:00', '10:00') === null, 'Invalid date must not update duration.');
check(scheduleEnd('2026-09-15', '23:30', 60).time === '00:30' && scheduleEnd('2026-09-15', '23:30', 60).nextDay, 'End display must match persisted elapsed duration.');
check(scheduleEnd('2026-09-15', '14:30', 90).time === '16:00', 'Changing start while keeping duration must move end.');
if (Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/Los_Angeles') {
    check(durationForEnd('2026-03-08', '00:30', '03:30') === 120, 'Spring-forward must use elapsed minutes, as persistence does.');
    check(durationForEnd('2026-11-01', '00:30', '02:30') === 180, 'Fall-back must use elapsed minutes, as persistence does.');
}
