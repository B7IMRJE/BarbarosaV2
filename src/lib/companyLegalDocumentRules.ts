export type CompanyLegalDocumentType =
    | 'home_improvement_contract'
    | 'notice_of_cancellation'
    | 'same_day_work_authorization'
    | 'emergency_immediate_work_waiver'
    | 'customer_authorization'
    | 'payment_authorization'
    | 'change_order'
    | 'completion_acknowledgment'
    | 'warranty_terms'
    | 'terms_and_conditions'
    | 'other_custom_legal_document';

export type CompanyLegalWorkflowStage =
    | 'quote_approval'
    | 'before_work'
    | 'work_completion'
    | 'customer_completion'
    | 'payment_closeout'
    | 'job_record';

export type CompanyLegalDocument = {
    template_id: string;
    company_id: string;
    document_type: CompanyLegalDocumentType;
    revision_id: string;
    revision_number: number;
    title: string;
    body: string;
    requires_customer_signature: boolean;
    requires_customer_printed_name: boolean;
    auto_record_datetime: boolean;
    workflow_stage: CompanyLegalWorkflowStage;
    blocks_progression: boolean;
    is_active: boolean;
    protected_fields: string[];
    protected_notice: string;
    source: 'techos_default' | 'company_custom' | 'attorney_approved';
    default_revision_number: number;
    is_default: boolean;
    completed_snapshot_id: string | null;
    completed_at: string | null;
};

export type SaveCompanyLegalDocumentInput = {
    companyId: string;
    templateId: string;
    title: string;
    body: string;
    requiresCustomerSignature: boolean;
    requiresCustomerPrintedName: boolean;
    autoRecordDateTime: boolean;
    workflowStage: CompanyLegalWorkflowStage;
    blocksProgression: boolean;
    isActive: boolean;
    source: 'company_custom' | 'attorney_approved';
};

export const COMPANY_LEGAL_DOCUMENT_NOTICE =
    'Your company is responsible for reviewing and approving its legal documents and contract language. TechOS templates are provided for configuration convenience and are not a substitute for legal advice.';

export const COMPANY_LEGAL_DOCUMENT_TYPE_LABELS: Record<CompanyLegalDocumentType, string> = {
    home_improvement_contract: 'Home Improvement Contract',
    notice_of_cancellation: 'Notice of Cancellation',
    same_day_work_authorization: 'Same-Day Work Authorization',
    emergency_immediate_work_waiver: 'Emergency / Immediate Work Waiver',
    customer_authorization: 'Customer Authorization',
    payment_authorization: 'Payment Authorization',
    change_order: 'Change Order',
    completion_acknowledgment: 'Completion Acknowledgment',
    warranty_terms: 'Warranty Terms',
    terms_and_conditions: 'Terms and Conditions',
    other_custom_legal_document: 'Other Custom Legal Document',
};

export const COMPANY_LEGAL_WORKFLOW_STAGE_LABELS: Record<CompanyLegalWorkflowStage, string> = {
    quote_approval: 'Quote approval',
    before_work: 'Before work starts',
    work_completion: 'Before technician completion',
    customer_completion: 'Customer completion sign-off',
    payment_closeout: 'Payment and job closeout',
    job_record: 'Job record / reference only',
};

export const COMPANY_LEGAL_WORKFLOW_STAGES = Object.keys(
    COMPANY_LEGAL_WORKFLOW_STAGE_LABELS
) as CompanyLegalWorkflowStage[];

export function parseCompanyLegalDocuments(value: unknown): CompanyLegalDocument[] {
    if (!Array.isArray(value)) return [];

    return value
        .map(parseCompanyLegalDocument)
        .filter((document): document is CompanyLegalDocument => Boolean(document));
}

export function parseCompanyLegalDocument(value: unknown): CompanyLegalDocument | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

    const record = value as Record<string, unknown>;
    const documentType = readDocumentType(record.document_type);
    const workflowStage = readWorkflowStage(record.workflow_stage);
    const templateId = readString(record.template_id);
    const companyId = readString(record.company_id);
    const revisionId = readString(record.revision_id);

    if (!documentType || !workflowStage || !templateId || !companyId || !revisionId) return null;

    const source = record.source === 'attorney_approved'
        ? 'attorney_approved'
        : record.source === 'company_custom'
            ? 'company_custom'
            : 'techos_default';

    return {
        template_id: templateId,
        company_id: companyId,
        document_type: documentType,
        revision_id: revisionId,
        revision_number: readPositiveInteger(record.revision_number, 1),
        title: readString(record.title),
        body: readString(record.body),
        requires_customer_signature: record.requires_customer_signature === true,
        requires_customer_printed_name: record.requires_customer_printed_name === true,
        auto_record_datetime: record.auto_record_datetime !== false,
        workflow_stage: workflowStage,
        blocks_progression: record.blocks_progression === true,
        is_active: record.is_active !== false,
        protected_fields: readStringArray(record.protected_fields),
        protected_notice: readString(record.protected_notice),
        source,
        default_revision_number: readPositiveInteger(record.default_revision_number, 1),
        is_default: record.is_default === true,
        completed_snapshot_id: readNullableString(record.completed_snapshot_id),
        completed_at: readNullableString(record.completed_at),
    };
}

export function getCompanyLegalDocument(
    documents: CompanyLegalDocument[],
    documentType: CompanyLegalDocumentType
) {
    return documents.find((document) => document.document_type === documentType) || null;
}

export function getWorkflowStageForStatus(status: string): CompanyLegalWorkflowStage | null {
    if (status === 'presenting') return 'quote_approval';
    if (['sold', 'scheduled_later', 'prework'].includes(status)) return 'before_work';
    if (['work_in_progress', 'issue_found', 'store_trip', 'returning_to_job'].includes(status)) {
        return 'work_completion';
    }
    if (status === 'work_complete') return 'customer_completion';
    if (['customer_completed', 'invoice_sent', 'collection_pending'].includes(status)) {
        return 'payment_closeout';
    }
    return status === 'closed' ? 'job_record' : null;
}

export function isIntegratedLegalDocument(documentType: CompanyLegalDocumentType) {
    return [
        'notice_of_cancellation',
        'customer_authorization',
        'same_day_work_authorization',
        'emergency_immediate_work_waiver',
        'completion_acknowledgment',
    ].includes(documentType);
}

function readDocumentType(value: unknown): CompanyLegalDocumentType | null {
    const text = readString(value) as CompanyLegalDocumentType;
    return Object.prototype.hasOwnProperty.call(COMPANY_LEGAL_DOCUMENT_TYPE_LABELS, text) ? text : null;
}

function readWorkflowStage(value: unknown): CompanyLegalWorkflowStage | null {
    const text = readString(value) as CompanyLegalWorkflowStage;
    return Object.prototype.hasOwnProperty.call(COMPANY_LEGAL_WORKFLOW_STAGE_LABELS, text) ? text : null;
}

function readString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown) {
    const text = readString(value);
    return text || null;
}

function readStringArray(value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.map(readString).filter(Boolean);
}

function readPositiveInteger(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
