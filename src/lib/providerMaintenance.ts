import type { MaintenanceCompletion, MaintenanceTask, RecurrenceUnit } from './maintenanceTimers';
import type { ProviderModeParams } from './providerMode';
import { providerMaintenanceContextArgs } from './providerMaintenanceCore';
import { supabase } from './supabase';

type Context = Pick<ProviderModeParams, 'companyId' | 'propertyId' | 'serviceRequestId' | 'scheduleSlotId' | 'jobId'>;

export type ProviderMaintenanceTaskInput = {
    taskId?: string | null;
    homeItemId: string;
    itemSlug?: string | null;
    system?: string | null;
    taskKey?: string | null;
    title: string;
    description?: string | null;
    recurrenceInterval: number;
    recurrenceUnit: RecurrenceUnit;
    startDate: string;
    nextDueDate: string;
};

export async function loadProviderMaintenance(context: Context, homeItemId: string) {
    const { data, error } = await supabase.rpc('get_provider_homeos_maintenance', {
        ...providerMaintenanceContextArgs(context),
        p_home_item_id: homeItemId,
    });
    if (error) throw error;
    const response = record(data);
    return {
        tasks: array(response.tasks) as MaintenanceTask[],
        completions: array(response.completions) as MaintenanceCompletion[],
    };
}

export async function saveProviderMaintenanceTask(context: Context, input: ProviderMaintenanceTaskInput) {
    const { data, error } = await supabase.rpc('save_provider_homeos_maintenance_task', {
        ...providerMaintenanceContextArgs(context),
        p_home_item_id: input.homeItemId,
        p_task_id: optional(input.taskId),
        p_item_slug: optional(input.itemSlug),
        p_system: optional(input.system),
        p_task_key: optional(input.taskKey),
        p_title: input.title.trim(),
        p_description: optional(input.description),
        p_recurrence_interval: input.recurrenceInterval,
        p_recurrence_unit: input.recurrenceUnit,
        p_start_date: input.startDate,
        p_next_due_date: input.nextDueDate,
    });
    if (error) throw error;
    return String(data || '').trim();
}

export async function completeProviderMaintenanceTask(context: Context, homeItemId: string, taskId: string) {
    const { data, error } = await supabase.rpc('complete_provider_homeos_maintenance_task', {
        ...providerMaintenanceContextArgs(context),
        p_home_item_id: homeItemId,
        p_task_id: taskId,
    });
    if (error) throw error;
    return String(data || '').trim();
}

function optional(value?: string | null) {
    const result = String(value || '').trim();
    return result || null;
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function array(value: unknown) {
    return Array.isArray(value) ? value : [];
}
