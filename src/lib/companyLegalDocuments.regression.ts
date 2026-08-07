import {
    COMPANY_LEGAL_DOCUMENT_NOTICE,
    COMPANY_LEGAL_DOCUMENT_TYPE_LABELS,
    getCompanyLegalDocument,
    getWorkflowStageForStatus,
    isIntegratedLegalDocument,
    parseCompanyLegalDocuments,
} from './companyLegalDocumentRules';

runCompanyLegalDocumentRegressions();

export function runCompanyLegalDocumentRegressions() {
    exposesEveryRequestedDocumentType();
    preservesTenantAndRevisionIdentity();
    mapsWorkflowStatusesToDocumentStages();
    identifiesDocumentsEmbeddedInTheWorkflow();
    includesTheRequiredCompanyLegalNotice();
}

function exposesEveryRequestedDocumentType() {
    const labels = Object.values(COMPANY_LEGAL_DOCUMENT_TYPE_LABELS);
    assert(labels.length >= 10, 'The legal editor should expose every requested document type.');
    assert(labels.includes('Notice of Cancellation'), 'Cancellation documents must be configurable.');
    assert(labels.includes('Completion Acknowledgment'), 'Completion documents must be configurable.');
    assert(labels.includes('Other Custom Legal Document'), 'A custom legal document type must remain available.');
    assert(labels.includes('Same-Day Work Authorization'), 'Existing same-day signature wording must also be configurable.');
}

function preservesTenantAndRevisionIdentity() {
    const documents = parseCompanyLegalDocuments([{
        template_id: 'template-a',
        company_id: 'company-a',
        document_type: 'notice_of_cancellation',
        revision_id: 'revision-7',
        revision_number: 7,
        default_revision_number: 1,
        title: 'Company A cancellation notice',
        body: 'Company A wording',
        requires_customer_signature: true,
        requires_customer_printed_name: true,
        auto_record_datetime: true,
        workflow_stage: 'quote_approval',
        blocks_progression: true,
        is_active: true,
        protected_fields: ['workflow_stage'],
        protected_notice: 'Protected control',
        source: 'attorney_approved',
        is_default: false,
        completed_snapshot_id: null,
        completed_at: null,
    }]);

    const cancellation = getCompanyLegalDocument(documents, 'notice_of_cancellation');
    assert(cancellation?.company_id === 'company-a', 'The document must retain its company tenant id.');
    assert(cancellation?.revision_id === 'revision-7', 'The exact revision id must survive parsing.');
    assert(cancellation?.body === 'Company A wording', 'Company wording must not fall back to another tenant.');
}

function mapsWorkflowStatusesToDocumentStages() {
    assert(getWorkflowStageForStatus('presenting') === 'quote_approval', 'Quote documents belong in approval.');
    assert(getWorkflowStageForStatus('prework') === 'before_work', 'Prework documents belong before work.');
    assert(getWorkflowStageForStatus('work_in_progress') === 'work_completion', 'Work documents precede technician completion.');
    assert(getWorkflowStageForStatus('work_complete') === 'customer_completion', 'Completion documents follow technician completion.');
    assert(getWorkflowStageForStatus('customer_completed') === 'payment_closeout', 'Payment documents precede closeout.');
}

function identifiesDocumentsEmbeddedInTheWorkflow() {
    assert(isIntegratedLegalDocument('notice_of_cancellation'), 'Cancellation is embedded in quote approval.');
    assert(isIntegratedLegalDocument('customer_authorization'), 'Customer authorization is embedded in quote approval.');
    assert(isIntegratedLegalDocument('completion_acknowledgment'), 'Completion is embedded in closeout.');
    assert(!isIntegratedLegalDocument('warranty_terms'), 'Warranty terms use the general document presenter.');
}

function includesTheRequiredCompanyLegalNotice() {
    assert(
        COMPANY_LEGAL_DOCUMENT_NOTICE.includes('not a substitute for legal advice'),
        'The editor must display the required legal-review notice.'
    );
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
