import {
    parseCompanyLegalDocument,
    parseCompanyLegalDocuments,
    type SaveCompanyLegalDocumentInput,
} from './companyLegalDocumentRules';
import { supabase } from './supabase';

export * from './companyLegalDocumentRules';

export async function loadCompanyLegalDocuments(companyId: string) {
    const normalizedCompanyId = companyId.trim();
    if (!normalizedCompanyId) throw new Error('Company id is required.');

    const { data, error } = await supabase.rpc('get_company_legal_documents', {
        p_company_id: normalizedCompanyId,
        p_job_workflow_id: null,
    });
    if (error) throw new Error(error.message);
    return parseCompanyLegalDocuments(data);
}

export async function saveCompanyLegalDocument(input: SaveCompanyLegalDocumentInput) {
    const { data, error } = await supabase.rpc('save_company_legal_document', {
        p_company_id: input.companyId,
        p_template_id: input.templateId,
        p_title: input.title,
        p_body: input.body,
        p_requires_customer_signature: input.requiresCustomerSignature,
        p_requires_customer_printed_name: input.requiresCustomerPrintedName,
        p_auto_record_datetime: input.autoRecordDateTime,
        p_workflow_stage: input.workflowStage,
        p_blocks_progression: input.blocksProgression,
        p_is_active: input.isActive,
        p_source: input.source,
    });
    if (error) throw new Error(error.message);
    return parseCompanyLegalDocument(data);
}

export async function restoreCompanyLegalDocumentDefault(companyId: string, templateId: string) {
    const { data, error } = await supabase.rpc('restore_company_legal_document_default', {
        p_company_id: companyId,
        p_template_id: templateId,
    });
    if (error) throw new Error(error.message);
    return parseCompanyLegalDocument(data);
}

export async function recordJobLegalDocument(input: {
    workflowId: string;
    templateId: string;
    customerName: string;
    signature: string;
}) {
    const { data, error } = await supabase.rpc('record_job_legal_document_snapshot', {
        p_workflow_id: input.workflowId,
        p_template_id: input.templateId,
        p_customer_name: input.customerName || null,
        p_signature: input.signature || null,
    });
    if (error) throw new Error(error.message);
    return data;
}
