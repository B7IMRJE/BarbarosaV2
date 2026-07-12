import { supabase } from './supabase';

export type ServiceVisitOutcome =
    | 'completed_successfully'
    | 'follow_up_required'
    | 'return_visit_required'
    | 'waiting_for_parts'
    | 'paused_on_hold'
    | 'customer_no_show'
    | 'cancelled'
    | 'unable_to_complete'
    | 'duplicate_or_void';

export type ServiceVisitCloseoutOption = {
    outcome: ServiceVisitOutcome;
    label: string;
    description: string;
    technicianAllowed: boolean;
    homeownerDefault: boolean;
};

export type CloseServiceVisitInput = {
    companyId: string;
    serviceRequestId: string;
    scheduleSlotId: string;
    outcome: ServiceVisitOutcome;
    notes?: string | null;
    homeownerNote?: string | null;
    nextActionAt?: string | null;
    notifyHomeowner?: boolean;
    metadata?: Record<string, unknown>;
};

export type CloseServiceVisitResult = {
    service_request_id: string;
    service_request_status: string;
    schedule_slot_id: string;
    schedule_slot_status: string;
    visit_outcome: ServiceVisitOutcome | string;
    homeowner_event_recorded: boolean;
};

export const SERVICE_VISIT_CLOSEOUT_OPTIONS: ServiceVisitCloseoutOption[] = [
    {
        outcome: 'completed_successfully',
        label: 'Completed Successfully',
        description: 'The visit is finished and the overall request is resolved.',
        technicianAllowed: true,
        homeownerDefault: true,
    },
    {
        outcome: 'follow_up_required',
        label: 'Follow-Up Required',
        description: 'The visit ended, but Dispatch needs to follow up before closing.',
        technicianAllowed: true,
        homeownerDefault: false,
    },
    {
        outcome: 'return_visit_required',
        label: 'Return Visit Required',
        description: 'The visit ended and another appointment should be scheduled.',
        technicianAllowed: true,
        homeownerDefault: true,
    },
    {
        outcome: 'waiting_for_parts',
        label: 'Waiting for Parts',
        description: 'The visit ended while parts or materials are being sourced.',
        technicianAllowed: true,
        homeownerDefault: false,
    },
    {
        outcome: 'paused_on_hold',
        label: 'Pause / Put On Hold',
        description: 'The visit ended or paused and the request needs a resume action later.',
        technicianAllowed: true,
        homeownerDefault: false,
    },
    {
        outcome: 'customer_no_show',
        label: 'Customer No-Show',
        description: 'The appointment was missed, but the request may still be rescheduled.',
        technicianAllowed: true,
        homeownerDefault: false,
    },
    {
        outcome: 'cancelled',
        label: 'Cancel Appointment',
        description: 'The request is cancelled and leaves active Dispatch.',
        technicianAllowed: false,
        homeownerDefault: true,
    },
    {
        outcome: 'unable_to_complete',
        label: 'Unable to Complete',
        description: 'The visit ended, and Dispatch must decide the next action.',
        technicianAllowed: true,
        homeownerDefault: false,
    },
    {
        outcome: 'duplicate_or_void',
        label: 'Duplicate / Void',
        description: 'The record should be archived as a duplicate, test, or void request.',
        technicianAllowed: false,
        homeownerDefault: false,
    },
];

export function getServiceVisitOutcomeLabel(outcome?: string | null) {
    const normalized = normalizeOutcome(outcome);
    const option = SERVICE_VISIT_CLOSEOUT_OPTIONS.find((item) => item.outcome === normalized);

    return option?.label || formatLabel(outcome);
}

export function getServiceVisitOutcomeOption(outcome?: string | null) {
    const normalized = normalizeOutcome(outcome);

    return SERVICE_VISIT_CLOSEOUT_OPTIONS.find((item) => item.outcome === normalized) || null;
}

export function getTechnicianCloseoutOptions() {
    return SERVICE_VISIT_CLOSEOUT_OPTIONS.filter((option) => option.technicianAllowed);
}

export async function closeServiceVisit(input: CloseServiceVisitInput): Promise<CloseServiceVisitResult> {
    const companyId = input.companyId.trim();
    const serviceRequestId = input.serviceRequestId.trim();
    const scheduleSlotId = input.scheduleSlotId.trim();

    if (!companyId || !serviceRequestId || !scheduleSlotId) {
        throw new Error('Company, request, and scheduled visit are required.');
    }

    const { data, error } = await supabase.rpc('close_service_visit', {
        p_company_id: companyId,
        p_service_request_id: serviceRequestId,
        p_schedule_slot_id: scheduleSlotId,
        p_outcome: input.outcome,
        p_notes: input.notes?.trim() || null,
        p_homeowner_note: input.homeownerNote?.trim() || null,
        p_next_action_at: input.nextActionAt || null,
        p_notify_homeowner: Boolean(input.notifyHomeowner),
        p_metadata: input.metadata || {},
    });

    if (error) {
        throw new Error(error.message);
    }

    const row = normalizeCloseServiceVisitResult(data)[0];

    if (!row) {
        throw new Error('Close visit did not return an updated request.');
    }

    return row;
}

function normalizeCloseServiceVisitResult(data: unknown): CloseServiceVisitResult[] {
    return (Array.isArray(data) ? data : data ? [data] : [])
        .map((row) => {
            const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

            return {
                service_request_id: readString(record, 'service_request_id'),
                service_request_status: readString(record, 'service_request_status'),
                schedule_slot_id: readString(record, 'schedule_slot_id'),
                schedule_slot_status: readString(record, 'schedule_slot_status'),
                visit_outcome: readString(record, 'visit_outcome'),
                homeowner_event_recorded: readBoolean(record, 'homeowner_event_recorded'),
            };
        })
        .filter((row) => row.service_request_id && row.schedule_slot_id);
}

function normalizeOutcome(value?: string | null) {
    return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function readString(record: Record<string, unknown>, key: string) {
    const value = record[key];

    return typeof value === 'string' ? value.trim() : '';
}

function readBoolean(record: Record<string, unknown>, key: string) {
    return record[key] === true;
}

function formatLabel(value?: string | null) {
    const normalized = String(value || '').trim();

    if (!normalized) return 'Not set';

    return normalized
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
