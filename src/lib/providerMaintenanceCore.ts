import type { ProviderModeParams } from './providerMode';

type Context = Pick<ProviderModeParams, 'companyId' | 'propertyId' | 'serviceRequestId' | 'scheduleSlotId' | 'jobId'>;

export function providerMaintenanceContextArgs(context: Context) {
    return {
        p_company_id: context.companyId.trim(),
        p_property_id: context.propertyId.trim(),
        p_service_request_id: optional(context.serviceRequestId),
        p_schedule_slot_id: optional(context.scheduleSlotId),
        p_job_id: optional(context.jobId),
    };
}

function optional(value?: string | null) {
    const result = String(value || '').trim();
    return result || null;
}
