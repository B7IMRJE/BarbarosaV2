import {
    calculateCompanyLeadCounts,
    getCompanyLeadAlertKind,
    type CompanyDispatchRequest,
} from './companyLeadAlerts';

runCompanyLeadAlertRegressions();

export function runCompanyLeadAlertRegressions() {
    regularLeadUsesRegularRing();
    emergencyLeadUsesEmergencyRing();
    existingRowsDoNotRingAgain();
    emergencyEscalationUsesEmergencyRing();
}

function regularLeadUsesRegularRing() {
    const previous = calculateCompanyLeadCounts([]);
    const current = calculateCompanyLeadCounts([request({ id: 'lead-1' })]);

    assert(getCompanyLeadAlertKind(previous, current) === 'lead', 'A new regular lead should use the regular lead ring.');
}

function emergencyLeadUsesEmergencyRing() {
    const previous = calculateCompanyLeadCounts([]);
    const current = calculateCompanyLeadCounts([request({
        id: 'emergency-1',
        request_type: 'emergency',
        priority: 'emergency',
    })]);

    assert(getCompanyLeadAlertKind(previous, current) === 'emergency', 'A new emergency should use the emergency ring.');
}

function existingRowsDoNotRingAgain() {
    const snapshot = calculateCompanyLeadCounts([request({ id: 'lead-1' })]);

    assert(getCompanyLeadAlertKind(snapshot, snapshot) === null, 'Refreshing an existing lead should not ring again.');
}

function emergencyEscalationUsesEmergencyRing() {
    const previous = calculateCompanyLeadCounts([request({ id: 'lead-1' })]);
    const current = calculateCompanyLeadCounts([request({
        id: 'lead-1',
        request_type: 'emergency',
        priority: 'emergency',
    })]);

    assert(getCompanyLeadAlertKind(previous, current) === 'emergency', 'Escalating an active lead to emergency should use the emergency ring.');
}

function request(overrides: Partial<CompanyDispatchRequest> = {}): CompanyDispatchRequest {
    return {
        id: 'lead-1',
        display_sequence: null,
        display_code: null,
        company_id: 'company-1',
        property_id: 'property-1',
        company_property_client_id: null,
        request_type: 'regular',
        status: 'new',
        priority: 'normal',
        issue_summary: 'Service needed',
        customer_display_name: null,
        property_display_name: null,
        property_address: null,
        property_city: null,
        property_state: null,
        property_postal_code: null,
        created_at: null,
        acknowledged_at: null,
        converted_job_id: null,
        converted_at: null,
        ...overrides,
    };
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
