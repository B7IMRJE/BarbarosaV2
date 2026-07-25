import { findConflictingScheduleSlot, type DispatchScheduleConflictSlot } from './dispatchScheduling';

runDispatchSchedulingRegression();

function runDispatchSchedulingRegression() {
    retryCanRescheduleTheSameRequest();
    anotherRequestStillBlocksAnOverlap();
}

function retryCanRescheduleTheSameRequest() {
    const conflict = findConflictingScheduleSlot(
        [slot('appointment-1', 'request-1')],
        'company-1',
        'request-1',
        'tech-1',
        new Date('2026-07-24T17:00:00.000Z'),
        new Date('2026-07-24T18:00:00.000Z')
    );

    assert(conflict === null, 'The active appointment for the same request must be reschedulable.');
}

function anotherRequestStillBlocksAnOverlap() {
    const competingSlot = slot('appointment-2', 'request-2');
    const conflict = findConflictingScheduleSlot(
        [slot('appointment-1', 'request-1'), competingSlot],
        'company-1',
        'request-1',
        'tech-1',
        new Date('2026-07-24T17:00:00.000Z'),
        new Date('2026-07-24T18:00:00.000Z')
    );

    assert(conflict === competingSlot, 'An overlapping appointment for another request must remain blocked.');
}

function slot(id: string, serviceRequestId: string): DispatchScheduleConflictSlot & { id: string } {
    return {
        id,
        company_id: 'company-1',
        service_request_id: serviceRequestId,
        technician_company_user_id: 'tech-1',
        start_at: '2026-07-24T16:30:00.000Z',
        end_at: '2026-07-24T17:30:00.000Z',
        status: 'scheduled',
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
