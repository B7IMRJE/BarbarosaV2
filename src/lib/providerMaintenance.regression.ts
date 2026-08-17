import { providerMaintenanceContextArgs } from './providerMaintenanceCore';

const assigned = providerMaintenanceContextArgs({
    companyId: ' company-1 ', propertyId: ' property-1 ', serviceRequestId: ' request-1 ', scheduleSlotId: '', jobId: ' job-1 ',
});
assert(assigned.p_company_id === 'company-1' && assigned.p_property_id === 'property-1', 'Provider maintenance must preserve company/property scope.');
assert(assigned.p_service_request_id === 'request-1' && assigned.p_job_id === 'job-1', 'Provider maintenance must preserve assigned work context.');
assert(assigned.p_schedule_slot_id === null, 'Missing assignment identifiers must be explicit null values.');

const unassigned = providerMaintenanceContextArgs({ companyId: 'company-1', propertyId: 'property-1', serviceRequestId: '', scheduleSlotId: '', jobId: '' });
assert(!unassigned.p_service_request_id && !unassigned.p_schedule_slot_id && !unassigned.p_job_id, 'Client helpers must not invent assignment context.');

console.log('Provider maintenance RPC argument regression checks passed.');

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
