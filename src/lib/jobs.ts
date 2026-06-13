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
    created_by: string | null;
    assigned_technician: string | null;
    created_at: string;
    updated_at: string;
};

export type JobThreadEvent = {
    id: string;
    job_id: string;
    user_id: string;
    event_type: string;
    message: string | null;
    created_by_name: string | null;
    created_at: string;
};

export type CreateJobInput = {
    title: string;
    system: string;
    priority: string;
    room_or_area?: string;
    item_slug?: string;
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
    const user = await getCurrentUser();

    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

    if (error) throw error;

    return (data || []) as Job[];
}

export async function createJob(input: CreateJobInput) {
    const user = await getCurrentUser();
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from('jobs')
        .insert({
            user_id: user.id,
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
        eventType: 'job_created',
        message: `Job created: ${job.title}`,
        createdByName: userDisplayName(user),
    });

    return job;
}

export async function loadJob(jobId: string) {
    const user = await getCurrentUser();

    const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .maybeSingle();

    if (error) throw error;

    return data as Job | null;
}

export async function loadJobThreadEvents(jobId: string) {
    const user = await getCurrentUser();

    const { data, error } = await supabase
        .from('job_thread_events')
        .select('*')
        .eq('job_id', jobId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []) as JobThreadEvent[];
}

async function touchJob(jobId: string) {
    const user = await getCurrentUser();

    const { error } = await supabase
        .from('jobs')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', jobId)
        .eq('user_id', user.id);

    if (error) throw error;
}

export async function addJobThreadEvent({
    jobId,
    eventType,
    message,
    createdByName,
}: {
    jobId: string;
    eventType: string;
    message: string;
    createdByName?: string;
}) {
    const user = await getCurrentUser();

    const { data, error } = await supabase
        .from('job_thread_events')
        .insert({
            job_id: jobId,
            user_id: user.id,
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
    const user = await getCurrentUser();
    const normalizedStatus = nextStatus.trim();

    const { error } = await supabase
        .from('jobs')
        .update({
            status: normalizedStatus,
            updated_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('user_id', user.id);

    if (error) throw error;

    return addJobThreadEvent({
        jobId,
        eventType: normalizedStatus === 'completed' ? 'job_completed' : 'status_change',
        message: `Status changed to ${normalizedStatus}.`,
        createdByName: userDisplayName(user),
    });
}
