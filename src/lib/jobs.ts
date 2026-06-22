import { requireActivePropertyMembership } from './activeProperty';
import { supabase } from './supabase';

export type Job = {
    id: string;
    user_id: string;
    property_id: string | null;
    item_slug: string | null;
    room_or_area: string | null;
    system: string | null;
    title: string;
    status: string;
    priority: string;
    job_source: string | null;
    job_type: string | null;
    emergency_type: string | null;
    visibility_status: string | null;
    dispatch_status: string | null;
    dispatched_at: string | null;
    arrived_at: string | null;
    completed_at: string | null;
    created_by: string | null;
    assigned_technician: string | null;
    created_at: string;
    updated_at: string;
};

export type JobThreadEvent = {
    id: string;
    job_id: string;
    user_id: string;
    property_id: string;
    event_type: string;
    message: string | null;
    created_by_name: string | null;
    visibility: string | null;
    actor_role: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
};

export type CreateJobInput = {
    title: string;
    system: string;
    priority: string;
    room_or_area?: string;
    item_slug?: string;
};

export type CreateJobWithFirstEventInput = {
    title: string;
    system?: string | null;
    priority?: string | null;
    room_or_area?: string | null;
    item_slug?: string | null;
    job_source?: string;
    job_type?: string;
    event_type?: string;
    message?: string;
    visibility?: string;
    actor_role?: string;
    metadata?: Record<string, unknown>;
};

async function getCurrentUser() {
    const {
        data: { user },
        error,
    } = await supabase.auth.getUser();

    if (error || !user) {
        throw new Error('You must be logged in.');
    }

    return user;
}

function userDisplayName(user: Awaited<ReturnType<typeof getCurrentUser>>) {
    return user.email || 'Logged-in user';
}

export async function loadJobs() {
    const activeProperty = await requireActivePropertyMembership();

    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('property_id', activeProperty.propertyId)
        .order('updated_at', { ascending: false });

    if (error) throw error;

    return (data || []) as Job[];
}

export async function createJob(input: CreateJobInput) {
    const activeProperty = await requireActivePropertyMembership();
    const user = await getCurrentUser();
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from('jobs')
        .insert({
            user_id: user.id,
            property_id: activeProperty.propertyId,
            item_slug: input.item_slug || null,
            room_or_area: input.room_or_area?.trim() || null,
            system: input.system.trim() || null,
            title: input.title.trim(),
            status: 'open',
            priority: input.priority.trim() || 'normal',
            created_by: user.id,
            assigned_technician: null,
            updated_at: now,
        })
        .select('*')
        .single();

    if (error) throw error;

    const job = data as Job;

    await addJobThreadEvent({
        jobId: job.id,
        propertyId: activeProperty.propertyId,
        eventType: 'job_created',
        message: `Job created: ${job.title}`,
        createdByName: userDisplayName(user),
    });

    return job;
}

export async function createJobWithFirstEvent(input: CreateJobWithFirstEventInput) {
    const activeProperty = await requireActivePropertyMembership();
    const user = await getCurrentUser();
    const now = new Date().toISOString();
    const title = input.title.trim();
    const jobSource = input.job_source || 'item';
    const jobType = input.job_type || 'service_request';
    const visibility = input.visibility || 'homeowner';
    const actorRole = input.actor_role || 'homeowner';

    const { data, error } = await supabase
        .from('jobs')
        .insert({
            user_id: user.id,
            property_id: activeProperty.propertyId,
            item_slug: input.item_slug || null,
            room_or_area: input.room_or_area?.trim() || null,
            system: input.system?.trim() || null,
            title,
            status: 'open',
            priority: input.priority?.trim() || 'normal',
            created_by: user.id,
            assigned_technician: null,
            job_source: jobSource,
            job_type: jobType,
            visibility_status: 'shared',
            dispatch_status: 'not_dispatched',
            updated_at: now,
        })
        .select('*')
        .single();

    if (error) throw error;

    const job = data as Job;

    const { data: eventData, error: eventError } = await supabase
        .from('job_thread_events')
        .insert({
            job_id: job.id,
            user_id: user.id,
            property_id: activeProperty.propertyId,
            event_type: input.event_type || 'job_created',
            message: input.message || `Job created: ${job.title}`,
            created_by_name: userDisplayName(user),
            visibility,
            actor_role: actorRole,
            metadata: input.metadata || {},
        })
        .select('*')
        .single();

    if (eventError) throw eventError;

    return {
        job,
        firstEvent: eventData as JobThreadEvent,
    };
}

export async function loadJob(jobId: string) {
    const activeProperty = await requireActivePropertyMembership();

    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('property_id', activeProperty.propertyId)
        .maybeSingle();

    if (error) throw error;

    return data as Job | null;
}

export async function loadJobThreadEvents(jobId: string) {
    const activeProperty = await requireActivePropertyMembership();

    const { data, error } = await supabase
        .from('job_thread_events')
        .select('*')
        .eq('job_id', jobId)
        .eq('property_id', activeProperty.propertyId)
        .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []) as JobThreadEvent[];
}

async function touchJob(jobId: string) {
    const activeProperty = await requireActivePropertyMembership();

    const { error } = await supabase
        .from('jobs')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', jobId)
        .eq('property_id', activeProperty.propertyId);

    if (error) throw error;
}

export async function addJobThreadEvent({
    jobId,
    propertyId,
    eventType,
    message,
    createdByName,
}: {
    jobId: string;
    propertyId?: string;
    eventType: string;
    message: string;
    createdByName?: string;
}) {
    const activeProperty = propertyId
        ? null
        : await requireActivePropertyMembership();
    const user = await getCurrentUser();
    const resolvedPropertyId = propertyId || activeProperty?.propertyId || '';

    const { data, error } = await supabase
        .from('job_thread_events')
        .insert({
            job_id: jobId,
            user_id: user.id,
            property_id: resolvedPropertyId,
            event_type: eventType,
            message,
            created_by_name: createdByName || userDisplayName(user),
        })
        .select('*')
        .single();

    if (error) throw error;

    await touchJob(jobId);

    return data as JobThreadEvent;
}

export async function addJobNote(jobId: string, message: string) {
    return addJobThreadEvent({
        jobId,
        eventType: 'note',
        message: message.trim(),
    });
}

export async function changeJobStatus(jobId: string, nextStatus: string) {
    const activeProperty = await requireActivePropertyMembership();
    const normalizedStatus = nextStatus.trim();

    const { error } = await supabase
        .from('jobs')
        .update({
            status: normalizedStatus,
            updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('property_id', activeProperty.propertyId);

    if (error) throw error;

    return addJobThreadEvent({
        jobId,
        propertyId: activeProperty.propertyId,
        eventType: normalizedStatus === 'completed' ? 'job_completed' : 'status_change',
        message: `Status changed to ${normalizedStatus}.`,
    });
}
