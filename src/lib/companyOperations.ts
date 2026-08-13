import { supabase } from './supabase';

export type OperationsRoom = {
    id: string;
    companyId: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    memberIds: string[];
    memberCount: number;
    canManage: boolean;
};

export type OperationsPerson = {
    id: string;
    fullName: string;
    email: string | null;
    role: string;
    status: string;
};

export type OperationsEvent = {
    id: string;
    companyId: string;
    subjectCompanyUserId: string | null;
    actorCompanyUserId: string | null;
    actorName: string;
    eventType: string;
    title: string;
    detail: string | null;
    serviceRequestId: string | null;
    scheduleSlotId: string | null;
    workflowId: string | null;
    displayCode: string | null;
    sourceKind: string;
    sourceId: string | null;
    mediaBucket: string | null;
    mediaStoragePath: string | null;
    mediaMimeType: string | null;
    mediaFileName: string | null;
    metadata: Record<string, unknown>;
    occurredAt: string;
    mediaUrl: string | null;
};

export type OperationsRosterMember = {
    companyUserId: string;
    fullName: string;
    email: string | null;
    role: string;
    activityStatus: 'clocked_in' | 'not_clocked_in' | 'clocked_out' | 'available' | 'on_break' | 'at_store' | 'on_my_way' | 'on_job';
    statusLabel: string;
    clockedInAt: string | null;
    clockedOutAt: string | null;
    serviceRequestId: string | null;
    displayCode: string | null;
};

export async function loadOperationsRooms(companyId: string): Promise<OperationsRoom[]> {
    const { data, error } = await supabase.rpc('get_company_operations_rooms', {
        p_company_id: companyId,
    });
    if (error) throw new Error(error.message);

    return (Array.isArray(data) ? data : []).map((row) => {
        const record = asRecord(row);
        const memberIds = Array.isArray(record.member_ids)
            ? record.member_ids.map(String).filter(Boolean)
            : [];

        return {
            id: String(record.id || ''),
            companyId: String(record.company_id || ''),
            name: String(record.name || 'Operations'),
            description: nullableString(record.description),
            isDefault: Boolean(record.is_default),
            memberIds,
            memberCount: Number(record.member_count || memberIds.length || 0),
            canManage: Boolean(record.can_manage),
        };
    }).filter((room) => room.id);
}

export async function loadOperationsPeople(companyId: string): Promise<OperationsPerson[]> {
    const { data, error } = await supabase.rpc('get_company_operations_people', {
        p_company_id: companyId,
    });
    if (error) throw new Error(error.message);

    return (Array.isArray(data) ? data : []).map((row) => {
        const record = asRecord(row);
        return {
            id: String(record.id || ''),
            fullName: String(record.full_name || record.email || 'Team member'),
            email: nullableString(record.email),
            role: String(record.role || 'team'),
            status: String(record.status || 'active'),
        };
    }).filter((person) => person.id);
}

export async function loadOperationsEvents(input: {
    companyId: string;
    roomId: string;
    startAt: string;
    endAt: string;
}): Promise<OperationsEvent[]> {
    const { data, error } = await supabase.rpc('get_company_operations_events', {
        p_company_id: input.companyId,
        p_room_id: input.roomId,
        p_start_at: input.startAt,
        p_end_at: input.endAt,
    });
    if (error) throw new Error(error.message);

    const events = (Array.isArray(data) ? data : []).map(normalizeOperationsEvent);
    const mediaEvents = events.filter((event) => event.mediaBucket && event.mediaStoragePath);
    const signedUrls = await Promise.all(mediaEvents.map(async (event) => {
        const { data: signed, error: signedError } = await supabase.storage
            .from(event.mediaBucket!)
            .createSignedUrl(event.mediaStoragePath!, 60 * 15);
        return [event.id, signedError ? null : signed?.signedUrl || null] as const;
    }));
    const urlById = new Map(signedUrls);

    return events.map((event) => ({
        ...event,
        mediaUrl: urlById.get(event.id) || null,
    }));
}

export async function loadOperationsRoster(input: {
    companyId: string;
    roomId: string;
    dayStartAt: string;
    dayEndAt: string;
}): Promise<OperationsRosterMember[]> {
    const { data, error } = await supabase.rpc('get_company_operations_roster', {
        p_company_id: input.companyId,
        p_room_id: input.roomId,
        p_day_start_at: input.dayStartAt,
        p_day_end_at: input.dayEndAt,
    });
    if (error) throw new Error(error.message);

    return (Array.isArray(data) ? data : []).map((row) => {
        const record = asRecord(row);
        return {
            companyUserId: String(record.company_user_id || ''),
            fullName: String(record.full_name || record.email || 'Team member'),
            email: nullableString(record.email),
            role: String(record.role || 'team'),
            activityStatus: String(record.activity_status || 'not_clocked_in') as OperationsRosterMember['activityStatus'],
            statusLabel: String(record.status_label || 'Not clocked in'),
            clockedInAt: nullableString(record.clocked_in_at),
            clockedOutAt: nullableString(record.clocked_out_at),
            serviceRequestId: nullableString(record.service_request_id),
            displayCode: nullableString(record.display_code),
        };
    }).filter((member) => member.companyUserId);
}

export async function createOperationsRoom(input: {
    companyId: string;
    name: string;
    description?: string;
    memberIds: string[];
}) {
    const { data, error } = await supabase.rpc('save_company_operations_room', {
        p_company_id: input.companyId,
        p_room_id: null,
        p_name: input.name,
        p_description: input.description || null,
        p_member_ids: input.memberIds,
    });
    if (error) throw new Error(error.message);
    return data;
}

export async function updateOperationsRoom(input: {
    companyId: string;
    roomId: string;
    name: string;
    description?: string;
    memberIds: string[];
}) {
    const { data, error } = await supabase.rpc('save_company_operations_room', {
        p_company_id: input.companyId,
        p_room_id: input.roomId,
        p_name: input.name,
        p_description: input.description || null,
        p_member_ids: input.memberIds,
    });
    if (error) throw new Error(error.message);
    return data;
}

export async function postOperationsUpdate(input: {
    companyId: string;
    roomId: string;
    message: string;
}) {
    const { data, error } = await supabase.rpc('post_company_operations_update', {
        p_company_id: input.companyId,
        p_room_id: input.roomId,
        p_message: input.message,
    });
    if (error) throw new Error(error.message);
    return data;
}

function normalizeOperationsEvent(row: unknown): OperationsEvent {
    const record = asRecord(row);
    return {
        id: String(record.id || ''),
        companyId: String(record.company_id || ''),
        subjectCompanyUserId: nullableString(record.subject_company_user_id),
        actorCompanyUserId: nullableString(record.actor_company_user_id),
        actorName: String(record.actor_name || 'Barbarosa'),
        eventType: String(record.event_type || 'update'),
        title: String(record.title || 'Operations update'),
        detail: nullableString(record.detail),
        serviceRequestId: nullableString(record.service_request_id),
        scheduleSlotId: nullableString(record.schedule_slot_id),
        workflowId: nullableString(record.workflow_id),
        displayCode: nullableString(record.display_code),
        sourceKind: String(record.source_kind || 'system'),
        sourceId: nullableString(record.source_id),
        mediaBucket: nullableString(record.media_bucket),
        mediaStoragePath: nullableString(record.media_storage_path),
        mediaMimeType: nullableString(record.media_mime_type),
        mediaFileName: nullableString(record.media_file_name),
        metadata: asRecord(record.metadata),
        occurredAt: String(record.occurred_at || ''),
        mediaUrl: null,
    };
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function nullableString(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
}
