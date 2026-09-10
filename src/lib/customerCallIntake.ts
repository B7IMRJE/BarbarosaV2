import { supabase } from './supabase';
import { type CreatedServiceRequestReceipt } from './homeServiceRequests';

export const CUSTOMER_KINDS = [{ value: 'new', label: 'New customer' }, { value: 'existing', label: 'Existing customer' }] as const;
export const SERVICE_REASONS = [{ value: 'setup', label: 'Add customer only' }, { value: 'repair', label: 'New service' }, { value: 'warranty', label: 'Warranty / previous work' }, { value: 'maintenance', label: 'Maintenance' }] as const;
export type CustomerCallDraft = {
    customerKind: 'new' | 'existing';
    serviceReason: 'setup' | 'repair' | 'warranty' | 'maintenance';
    urgency: 'regular' | 'emergency';
    customerSummary: string;
    addressHint: string;
    previousWorkReference: string;
    knownPropertyId: string;
};
export const EMPTY_CALL_DRAFT: CustomerCallDraft = { customerKind: 'new', serviceReason: 'setup', urgency: 'regular', customerSummary: '', addressHint: '', previousWorkReference: '', knownPropertyId: '' };
export type CustomerIntake = {
    id: string; display_number: number; company_id: string; company_name: string;
    invitation_id: string; invite_code: string; customer_kind: CustomerCallDraft['customerKind'];
    service_reason: CustomerCallDraft['serviceReason']; urgency: 'regular' | 'emergency';
    customer_summary: string; address_hint: string; previous_work_reference: string;
    property_id: string | null; suggested_property_id: string | null; service_request_id: string | null;
    invited_name: string; invited_phone: string; invited_email: string;
    confirmed_contact: { name: string; email: string; phone: string } | null;
    customer_draft: { issue?: string; accessInstructions?: string; location?: string; requestType?: 'regular' | 'emergency' };
    media_completed_at: string | null; phone_handoff_ids: string[];
    started_at: string | null; contact_confirmed_at: string | null; submitted_at: string | null;
    office_note?: string; invitation_status?: string;
};
export function intakeReasonLabel(reason: CustomerCallDraft['serviceReason']) {
    return reason === 'warranty' ? 'Warranty review requested' : SERVICE_REASONS.find(item => item.value === reason)?.label || 'Service request';
}
export function intakeProgressLabel(intake: CustomerIntake) {
    if (intake.submitted_at) return 'Request submitted';
    if (intake.property_id) return 'Address confirmed · awaiting request';
    if (intake.contact_confirmed_at) return 'Contact confirmed · awaiting address';
    if (intake.started_at) return 'Customer is completing details';
    return 'Waiting for customer to open invitation';
}
export async function loadCustomerIntake(input: { inviteCode?: string; intakeId?: string }): Promise<CustomerIntake | null> {
    const { data, error } = await supabase.rpc('get_my_customer_intake', { p_invite_code: input.inviteCode || null, p_intake_id: input.intakeId || null });
    if (error) throw new Error(error.message);
    return data as CustomerIntake | null;
}
export async function saveCustomerIntake(intakeId: string, input: { contact?: CustomerIntake['confirmed_contact']; propertyId?: string; draft?: CustomerIntake['customer_draft'] }) {
    const { data, error } = await supabase.rpc('save_my_customer_intake', { p_intake_id: intakeId, p_contact: input.contact || null, p_property_id: input.propertyId || null, p_draft: input.draft || null });
    if (error) throw new Error(error.message);
    return data as CustomerIntake;
}
export async function submitCustomerIntake(intakeId: string, issue: string, requestType: 'regular' | 'emergency', access: string): Promise<CreatedServiceRequestReceipt> {
    const { data, error } = await supabase.rpc('submit_my_customer_intake', { p_intake_id: intakeId, p_issue_summary: issue, p_request_type: requestType, p_access_instructions: access.trim() || null });
    if (error) throw new Error(error.message);
    if (!data?.service_request_id) throw new Error('The request number was not returned. Please retry this same request.');
    return { id: data.service_request_id, companyId: data.company_id, propertyId: data.property_id, displayCode: data.display_code || null, displaySequence: data.display_sequence || null, requestType: data.request_type, status: data.status, priority: data.priority, createdAt: data.created_at };
}
