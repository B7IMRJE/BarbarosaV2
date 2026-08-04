import { getTechnicianAssignmentDisplayName } from './technicianDisplay';

runTechnicianDisplayRegressions();

export function runTechnicianDisplayRegressions() {
    assignmentCardUsesTechnicianNameOnly();
    missingNameNeverFallsBackToEmail();
}

function assignmentCardUsesTechnicianNameOnly() {
    const label = getTechnicianAssignmentDisplayName({
        full_name: 'Selene Velez',
    });

    assert(label === 'Selene Velez', 'Assignment cards should display the technician name.');
}

function missingNameNeverFallsBackToEmail() {
    const label = getTechnicianAssignmentDisplayName({
        full_name: '   ',
        email: 'technician-with-a-very-long-address@example.com',
    });

    assert(label === 'Technician', 'Assignment cards should use a neutral fallback instead of an email address.');
    assert(!label.includes('@'), 'Assignment labels must never contain an email address.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
