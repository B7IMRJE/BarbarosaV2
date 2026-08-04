import { SERVICE_VISIT_CLOSEOUT_OPTIONS } from './serviceVisitCloseout';

runServiceVisitCloseoutRegressions();

export function runServiceVisitCloseoutRegressions() {
    homeownerUpdatesDefaultOnForEveryOutcome();
}

function homeownerUpdatesDefaultOnForEveryOutcome() {
    assert(
        SERVICE_VISIT_CLOSEOUT_OPTIONS.every((option) => option.homeownerDefault),
        'Every closeout outcome should default Update Homeowner to on.'
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
