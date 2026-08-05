import type * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import type { PersistableEstimateChoice } from './estimateOptionPersistence';
import type { JobReturnHandoffMaterial } from './jobReturnHandoff';

export type JobWorkflowStatus =
    | 'presenting' | 'accepted' | 'sold' | 'scheduled_later' | 'prework'
    | 'store_trip' | 'returning_to_job' | 'work_in_progress' | 'issue_found'
    | 'work_complete' | 'customer_completed' | 'invoice_sent'
    | 'collection_pending' | 'closed';

export type JobWorkflow = {
    id: string;
    company_id: string;
    estimate_session_id: string;
    service_request_id: string | null;
    schedule_slot_id: string | null;
    job_id: string | null;
    property_id: string | null;
    selected_source_choice_id: string | null;
    selected_option_snapshot: PersistableEstimateChoice | null;
    selected_source_choice_ids: string[];
    selected_options_snapshot: PersistableEstimateChoice[];
    status: JobWorkflowStatus;
    homeowner_name: string | null;
    homeowner_accepted_at: string | null;
    cancellation_rule_snapshot: ContractRule | null;
    sold_at: string | null;
    execution_timing: 'now' | 'later' | 'same_day_service_repair' | 'same_day_standard' | 'same_day_emergency' | null;
    selected_total: number | null;
    scheduled_for: string | null;
    same_day_service_repair_reason: string | null;
    same_day_service_repair_homeowner_name: string | null;
    same_day_service_repair_acknowledgment: Record<string, unknown> | null;
    same_day_service_repair_acknowledged_at: string | null;
    same_day_service_repair_technician_confirmed_at: string | null;
    same_day_start_type: 'standard_same_day' | 'service_and_repair' | 'emergency_immediate_protection' | null;
    same_day_start_reason: string | null;
    same_day_start_homeowner_name: string | null;
    same_day_start_acknowledgment: Record<string, unknown> | null;
    same_day_start_acknowledged_at: string | null;
    same_day_start_technician_confirmed_at: string | null;
    same_day_emergency_waived_at: string | null;
    store_name: string | null;
    store_address: string | null;
    issue_summary: string | null;
    resolution_summary: string | null;
    return_visit_work_summary: string | null;
    return_visit_remaining_work: string | null;
    return_visit_materials: JobReturnHandoffMaterial[];
    return_visit_no_materials_needed: boolean;
    return_visit_pickup_notes: string | null;
    return_visit_handoff_at: string | null;
    return_visit_handoff_by_user_id: string | null;
    technician_completed_at: string | null;
    completion_homeowner_name: string | null;
    completion_accepted_at: string | null;
    invoice_sent_at: string | null;
    payment_status: string;
    closed_at: string | null;
};

export type ContractRule = {
    jurisdiction_label: string;
    cancellation_days: number;
    cancellation_notice_title: string;
    cancellation_notice_text: string;
    requires_homeowner_acknowledgment: boolean;
};

export type JobWorkflowAttachment = {
    id: string;
    workflow_id: string;
    stage: 'before' | 'receipt' | 'purchased_item' | 'issue' | 'handoff' | 'after';
    visibility: 'company' | 'homeowner';
    storage_path: string;
    file_name: string;
    created_at: string;
};

export type CreateJobReturnHandoffInput = {
    workflowId: string;
    scheduledFor: string;
    workSummary: string;
    remainingWork: string;
    materials: JobReturnHandoffMaterial[];
    noMaterialsNeeded: boolean;
    pickupNotes: string;
};

export type JobWorkflowBundle = {
    workflow: JobWorkflow;
    contract_rule: ContractRule;
    options: PersistableEstimateChoice[];
    attachments: JobWorkflowAttachment[];
    events: { id: string; title: string; detail: string | null; created_at: string }[];
};

export async function loadOrCreateJobWorkflow(estimateSessionId: string): Promise<JobWorkflowBundle> {
    const { data, error } = await supabase.rpc('get_or_create_company_job_workflow', {
        p_estimate_session_id: estimateSessionId,
    });
    if (error) throw error;
    return data as JobWorkflowBundle;
}

export async function advanceJobWorkflow(
    workflowId: string,
    action: string,
    payload: Record<string, unknown> = {}
): Promise<JobWorkflow> {
    const { data, error } = await supabase.rpc('advance_company_job_workflow', {
        p_workflow_id: workflowId,
        p_action: action,
        p_payload: payload,
    });
    if (error) throw error;
    return data as JobWorkflow;
}

export async function startSameDayWork(input: {
    workflowId: string;
    reason: string;
    homeownerName: string;
    homeownerSignature: string;
    signedContractConfirmed: boolean;
    technicianConfirmed: boolean;
}): Promise<JobWorkflow> {
    const { data, error } = await supabase.rpc('start_company_job_workflow_same_day', {
        p_workflow_id: input.workflowId,
        p_start_type: 'standard_same_day',
        p_reason: input.reason,
        p_homeowner_name: input.homeownerName,
        p_homeowner_signature: input.homeownerSignature,
        p_customer_initiated: true,
        p_signed_contract_confirmed: input.signedContractConfirmed,
        p_technician_confirmed: input.technicianConfirmed,
        p_short_notice_requested: false,
        p_scope_limited_to_repair: false,
        p_no_payment_before_completion: false,
        p_immediate_protection_confirmed: false,
        p_emergency_waiver_signature: null,
    });
    if (error) throw error;
    return data as JobWorkflow;
}

export async function closeJobWorkflow(
    workflowId: string,
    paymentHandling: 'paid_externally' | 'balance_due_to_office'
): Promise<JobWorkflow> {
    const { data, error } = await supabase.rpc('close_company_job_workflow', {
        p_workflow_id: workflowId,
        p_payment_handling: paymentHandling,
    });
    if (error) throw error;
    return data as JobWorkflow;
}

export async function recordCloseoutPayment(workflowId: string): Promise<JobWorkflow> {
    const { data, error } = await supabase.rpc('record_company_job_workflow_closeout_payment', {
        p_workflow_id: workflowId,
    });
    if (error) throw error;
    return data as JobWorkflow;
}

export async function createJobReturnHandoff(
    input: CreateJobReturnHandoffInput
): Promise<JobWorkflow> {
    const { data, error } = await supabase.rpc('create_company_job_return_handoff', {
        p_workflow_id: input.workflowId,
        p_scheduled_for: input.scheduledFor,
        p_work_summary: input.workSummary,
        p_remaining_work: input.remainingWork,
        p_materials: input.materials,
        p_no_materials_needed: input.noMaterialsNeeded,
        p_pickup_notes: input.pickupNotes || null,
    });
    if (error) throw error;
    return data as JobWorkflow;
}

export async function createJobWorkflowAttachmentUrl(attachment: JobWorkflowAttachment) {
    const { data, error } = await supabase.storage
        .from('company-job-files')
        .createSignedUrl(attachment.storage_path, 60 * 15);

    if (error || !data?.signedUrl) throw error || new Error('Job media could not be opened.');

    return data.signedUrl;
}

export async function completeJobWorkflowFromTechOS(
    workflowId: string,
    scheduleSlotId: string
): Promise<JobWorkflow> {
    const { data, error } = await supabase.rpc('complete_company_job_workflow_from_techos', {
        p_workflow_id: workflowId,
        p_schedule_slot_id: scheduleSlotId,
    });
    if (error) throw error;
    return data as JobWorkflow;
}

export async function acceptJobWorkflowQuote(input: {
    workflowId: string;
    selectedChoiceIds: string[];
    cancellationName: string;
    cancellationSignature: string;
    homeownerName: string;
    homeownerSignature: string;
}) {
    const { data, error } = await supabase.rpc('accept_company_job_workflow_quote_v2', {
        p_workflow_id: input.workflowId,
        p_selected_choice_ids: input.selectedChoiceIds,
        p_cancellation_name: input.cancellationName,
        p_cancellation_signature: input.cancellationSignature,
        p_homeowner_name: input.homeownerName,
        p_homeowner_signature: input.homeownerSignature,
    });
    if (error) throw error;
    return data as JobWorkflow;
}

export async function uploadJobWorkflowMedia(input: {
    workflow: JobWorkflow;
    stage: JobWorkflowAttachment['stage'];
    asset: ImagePicker.ImagePickerAsset;
}) {
    const mimeType = input.asset.mimeType
        || (input.asset.type === 'video' || input.asset.type === 'pairedVideo' ? 'video/mp4' : 'image/jpeg');
    const extension = fileExtension(input.asset.fileName || '', mimeType);
    const fileName = sanitizeName(input.asset.fileName || `${input.stage}-${Date.now()}.${extension}`);
    const storagePath = [
        'companies', input.workflow.company_id, 'workflows', input.workflow.id,
        input.stage, `${Date.now()}-${fileName}`,
    ].join('/');
    const body = await fetch(input.asset.uri).then((response) => response.blob());
    const { error: uploadError } = await supabase.storage
        .from('company-job-files')
        .upload(storagePath, body, {
            contentType: mimeType,
            upsert: false,
        });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase.rpc('record_company_job_workflow_attachment', {
        p_workflow_id: input.workflow.id,
        p_stage: input.stage,
        p_storage_path: storagePath,
        p_file_name: fileName,
        p_mime_type: mimeType,
        p_size_bytes: input.asset.fileSize || null,
        p_caption: null,
    });
    if (error) {
        await supabase.storage.from('company-job-files').remove([storagePath]);
        throw error;
    }
    return data as JobWorkflowAttachment;
}

function sanitizeName(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'photo.jpg';
}

function fileExtension(name: string, mimeType: string) {
    const match = name.match(/\.([a-zA-Z0-9]+)$/);
    if (match) return match[1].toLowerCase();
    if (mimeType.includes('quicktime')) return 'mov';
    if (mimeType.includes('mp4')) return 'mp4';
    if (mimeType.includes('webm')) return 'webm';
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('webp')) return 'webp';
    return 'jpg';
}
