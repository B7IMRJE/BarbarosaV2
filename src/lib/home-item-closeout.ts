import { supabase } from './supabase';
import type {
    HomeItemCloseoutContext,
    HomeItemCloseoutDraft,
    HomeItemLifetimeHistory,
} from './home-item-closeout-core';

export * from './home-item-closeout-core';

export async function loadCompanyJobHomeItemCloseout(workflowId: string) {
    const { data, error } = await supabase.rpc('get_company_job_homeos_closeout', {
        p_workflow_id: workflowId,
    });
    if (error) throw error;
    return data as HomeItemCloseoutContext;
}

export async function saveCompanyJobHomeItemCloseout(workflowId: string, draft: HomeItemCloseoutDraft) {
    const { data, error } = await supabase.rpc('save_company_job_homeos_closeout', {
        p_workflow_id: workflowId,
        p_payload: draft,
    });
    if (error) throw error;
    return data as HomeItemCloseoutContext;
}

export async function loadHomeItemLifetimeHistory(input: {
    homeItemId: string;
    companyId?: string | null;
    serviceRequestId?: string | null;
    scheduleSlotId?: string | null;
    jobId?: string | null;
}) {
    const { data, error } = await supabase.rpc('get_home_item_lifetime_history', {
        p_home_item_id: input.homeItemId,
        p_company_id: input.companyId || null,
        p_service_request_id: input.serviceRequestId || null,
        p_schedule_slot_id: input.scheduleSlotId || null,
        p_job_id: input.jobId || null,
    });
    if (error) throw error;
    return data as HomeItemLifetimeHistory;
}
