import {
    getEmergencyAssignmentAcceptanceLabel,
    isEmergencyAssignmentAwaitingTechnician,
} from './emergencyAssignment';

run();

function run() {
    assignmentAloneDoesNotMeanReady();
    explicitAcceptanceUnlocksReadyState();
    operationalLegacyStateCountsAsPriorAcceptanceEvidence();
    regularAssignmentsRemainUnchanged();
    console.log('Emergency assignment acceptance regression checks passed.');
}

function assignmentAloneDoesNotMeanReady() {
    const request = { request_type: 'emergency', priority: 'emergency' };
    const slot = {
        technician_company_user_id: 'tech-1',
        status: 'scheduled',
        technician_acknowledged_at: null,
    };

    assert(isEmergencyAssignmentAwaitingTechnician(request, slot), 'Assigning an emergency must remain pending until the technician explicitly accepts it.');
    assert(getEmergencyAssignmentAcceptanceLabel(request, slot).includes('Awaiting Tech Acceptance'), 'Pending emergency assignments need an unambiguous Dispatch label.');
}

function explicitAcceptanceUnlocksReadyState() {
    const request = { request_type: 'emergency', priority: 'emergency' };
    const slot = {
        technician_company_user_id: 'tech-1',
        status: 'scheduled',
        technician_acknowledged_at: '2026-08-16T20:00:00.000Z',
    };

    assert(!isEmergencyAssignmentAwaitingTechnician(request, slot), 'A persisted technician acceptance must release the emergency from its pending state.');
    assert(getEmergencyAssignmentAcceptanceLabel(request, slot).includes('Technician Accepted'), 'Accepted emergency assignments need a positive confirmation label.');
}

function operationalLegacyStateCountsAsPriorAcceptanceEvidence() {
    const request = { priority: 'emergency' };
    const slot = {
        technician_company_user_id: 'tech-1',
        status: 'on_my_way',
        technician_acknowledged_at: null,
    };

    assert(!isEmergencyAssignmentAwaitingTechnician(request, slot), 'A legacy On My Way emergency must not regress into pending acceptance.');
}

function regularAssignmentsRemainUnchanged() {
    const request = { request_type: 'regular', priority: 'normal' };
    const slot = {
        technician_company_user_id: 'tech-1',
        status: 'scheduled',
        technician_acknowledged_at: null,
    };

    assert(!isEmergencyAssignmentAwaitingTechnician(request, slot), 'Regular scheduled work must not gain an emergency acceptance gate.');
    assert(getEmergencyAssignmentAcceptanceLabel(request, slot) === '', 'Regular work must not show emergency wording.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
