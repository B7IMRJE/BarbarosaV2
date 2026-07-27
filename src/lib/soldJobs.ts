import { supabase } from './supabase';
import type { PersistableEstimateChoice } from './estimateOptionPersistence';

export type SoldJobRecord = {
    id: string;
    companyId: string;
    serviceRequestId: string | null;
    scheduleSlotId: string | null;
    jobId: string | null;
    propertyId: string | null;
    status: string;
    selectedOptions: PersistableEstimateChoice[];
    selectedTotal: number;
    homeownerName: string | null;
    soldAt: string | null;
    executionTiming: string | null;
    scheduledFor: string | null;
    storeName: string | null;
    issueSummary: string | null;
    paymentStatus: string;
};

const soldJobColumns = [
    'id',
    'company_id',
    'service_request_id',
    'schedule_slot_id',
    'job_id',
    'property_id',
    'status',
    'selected_options_snapshot',
    'selected_total',
    'homeowner_name',
    'sold_at',
    'execution_timing',
    'scheduled_for',
    'store_name',
    'issue_summary',
    'payment_status',
].join(', ');

export async function loadRecentSoldJobs(companyId: string, limit = 20) {
    const { data, error } = await supabase
        .from('company_job_workflows')
        .select(soldJobColumns)
        .eq('company_id', companyId)
        .not('sold_at', 'is', null)
        .order('sold_at', { ascending: false })
        .limit(limit);

    if (error) throw error;

    return (data || []).map(normalizeSoldJobRecord);
}

export async function loadSoldJobForScheduleSlot(scheduleSlotId: string) {
    const { data, error } = await supabase
        .from('company_job_workflows')
        .select(soldJobColumns)
        .eq('schedule_slot_id', scheduleSlotId)
        .not('sold_at', 'is', null)
        .order('sold_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;

    return data ? normalizeSoldJobRecord(data) : null;
}

export async function loadSoldJobsForTechnician(companyId: string, technicianCompanyUserId: string) {
    const { data: slots, error: slotError } = await supabase
        .from('job_schedule_slots')
        .select('id')
        .eq('company_id', companyId)
        .eq('technician_company_user_id', technicianCompanyUserId);

    if (slotError) throw slotError;

    const slotIds = (slots || []).map((slot) => String(slot.id));
    if (slotIds.length === 0) return [];

    const { data, error } = await supabase
        .from('company_job_workflows')
        .select(soldJobColumns)
        .eq('company_id', companyId)
        .in('schedule_slot_id', slotIds)
        .not('sold_at', 'is', null)
        .order('sold_at', { ascending: false })
        .limit(50);

    if (error) throw error;

    return (data || []).map(normalizeSoldJobRecord);
}

export function normalizeSoldJobRecord(value: unknown): SoldJobRecord {
    const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};

    return {
        id: text(record.id),
        companyId: text(record.company_id),
        serviceRequestId: nullableText(record.service_request_id),
        scheduleSlotId: nullableText(record.schedule_slot_id),
        jobId: nullableText(record.job_id),
        propertyId: nullableText(record.property_id),
        status: text(record.status),
        selectedOptions: Array.isArray(record.selected_options_snapshot)
            ? record.selected_options_snapshot as PersistableEstimateChoice[]
            : [],
        selectedTotal: finiteNumber(record.selected_total),
        homeownerName: nullableText(record.homeowner_name),
        soldAt: nullableText(record.sold_at),
        executionTiming: nullableText(record.execution_timing),
        scheduledFor: nullableText(record.scheduled_for),
        storeName: nullableText(record.store_name),
        issueSummary: nullableText(record.issue_summary),
        paymentStatus: text(record.payment_status),
    };
}

export function getSoldJobNextAction(record: SoldJobRecord) {
    const labels: Record<string, string> = {
        sold: 'Schedule work after the cancellation period.',
        scheduled_later: `Return visit scheduled${record.scheduledFor ? ` for ${new Date(record.scheduledFor).toLocaleString()}` : ''}.`,
        prework: 'Capture before photos and confirm site condition.',
        store_trip: `Store trip${record.storeName ? ` to ${record.storeName}` : ''}.`,
        returning_to_job: 'Return to the job site and record arrival.',
        work_in_progress: 'Continue the authorized work.',
        issue_found: 'Review the issue and obtain any required change approval.',
        work_complete: 'Collect the homeowner completion signature.',
        customer_completed: 'Send the invoice.',
        collection_pending: 'Office payment collection is pending.',
        closed: 'No further action.',
    };

    return labels[record.status] || 'Open the sold job and review the next workflow step.';
}

function text(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function nullableText(value: unknown) {
    return text(value) || null;
}

function finiteNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}
