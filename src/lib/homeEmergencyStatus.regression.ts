import { getHomeEmergencyDisplayStatus } from './homeEmergencyStatus';

runHomeEmergencyStatusRegressions();

export function runHomeEmergencyStatusRegressions() {
    assert(
        getHomeEmergencyDisplayStatus('Reported', 'acknowledged') === 'Acknowledged',
        'Acknowledging a linked Dispatch request should update the emergency card.'
    );
    assert(
        getHomeEmergencyDisplayStatus('Reported', 'scheduled') === 'Scheduled',
        'Scheduling a linked Dispatch request should update the emergency card.'
    );
    assert(
        getHomeEmergencyDisplayStatus('Reported', 'on_my_way') === 'In Progress',
        'Active technician progress should update the emergency card.'
    );
    assert(
        getHomeEmergencyDisplayStatus('Resolved', 'scheduled') === 'Resolved',
        'A homeowner-resolved emergency should remain resolved.'
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
