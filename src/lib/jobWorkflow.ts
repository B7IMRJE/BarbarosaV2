import type * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';
import type { PersistableEstimateChoice } from './estimateOptionPersistence';

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
    execution_timing: 'now' | 'later' | null;
    scheduled_for: string | null;
    store_name: string | null;
    store_address: string | null;
    issue_summary: string | null;
    resolution_summary: string | null;
    technician_completed_at: string | null;
    completion_homeowner_name: string | null;
    completion_accepted_at: string | null;
    invoice_sent_at: string | null;
    payment_status: string;
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
    stage: 'before' | 'receipt' | 'purchased_item' | 'issue' | 'after';
    visibility: 'company' | 'homeowner';
    storage_path: string;
    file_name: string;
    created_at: string;
};

export type JobWorkflowBundle = {
    workflow: JobWorkflow;
    contract_rule: ContractRule;
    options: PersistableEstimateChoice[];
    attachments: JobWorkflowAttachment[];
    events: Array<{ id: string; title: string; detail: string | null; created_at: string }>;
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

export async function uploadJobWorkflowPhoto(input: {
    workflow: JobWorkflow;
    stage: JobWorkflowAttachment['stage'];
    asset: ImagePicker.ImagePickerAsset;
}) {
    const extension = fileExtension(input.asset.fileName || '', input.asset.mimeType || '');
    const fileName = sanitizeName(input.asset.fileName || `${input.stage}-${Date.now()}.${extension}`);
    const storagePath = [
        'companies', input.workflow.company_id, 'workflows', input.workflow.id,
        input.stage, `${Date.now()}-${fileName}`,
    ].join('/');
    const body = await fetch(input.asset.uri).then((response) => response.blob());
    const { error: uploadError } = await supabase.storage
        .from('company-job-files')
        .upload(storagePath, body, {
            contentType: input.asset.mimeType || 'image/jpeg',
            upsert: false,
        });
    if (uploadError) throw uploadError;

    const { data, error } = await supabase.rpc('record_company_job_workflow_attachment', {
        p_workflow_id: input.workflow.id,
        p_stage: input.stage,
        p_storage_path: storagePath,
        p_file_name: fileName,
        p_mime_type: input.asset.mimeType || 'image/jpeg',
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
    if (mimeType.includes('png')) return 'png';
    if (mimeType.includes('webp')) return 'webp';
    return 'jpg';
}
