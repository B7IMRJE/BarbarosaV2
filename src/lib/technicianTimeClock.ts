import { supabase } from './supabase';

export type TechnicianTimeEntry = {
    id: string;
    clockedInAt: string;
    clockedOutAt: string | null;
    breakStartedAt: string | null;
    breakEndedAt: string | null;
    breakMinutes: number;
    automaticLunchApplied: boolean;
    mealExceptionReported: boolean;
    shiftNotes: string | null;
    injuryReported: boolean | null;
    injuryDetails: string | null;
    submittedAt: string | null;
};

export type ClockInCorrectionRequest = {
    id: string;
    technicianCompanyUserId: string;
    requestedClockInAt: string;
    reason: string;
    latitude: number | null;
    longitude: number | null;
    accuracyMeters: number | null;
    status: 'pending' | 'approved' | 'denied';
    createdAt: string;
};

export async function loadTechnicianTimeEntries(technicianCompanyUserId: string) {
    const { data, error } = await supabase
        .from('company_technician_time_entries')
        .select('id, clocked_in_at, clocked_out_at, break_started_at, break_ended_at, break_minutes, automatic_lunch_applied, meal_exception_reported, shift_notes, injury_reported, injury_details, submitted_at')
        .eq('technician_company_user_id', technicianCompanyUserId)
        .order('clocked_in_at', { ascending: false })
        .limit(20);

    if (error) throw error;

    return (data || []).map((entry) => ({
        id: String(entry.id),
        clockedInAt: String(entry.clocked_in_at),
        clockedOutAt: entry.clocked_out_at ? String(entry.clocked_out_at) : null,
        breakStartedAt: entry.break_started_at ? String(entry.break_started_at) : null,
        breakEndedAt: entry.break_ended_at ? String(entry.break_ended_at) : null,
        breakMinutes: Number(entry.break_minutes || 0),
        automaticLunchApplied: Boolean(entry.automatic_lunch_applied),
        mealExceptionReported: Boolean(entry.meal_exception_reported),
        shiftNotes: entry.shift_notes ? String(entry.shift_notes) : null,
        injuryReported: typeof entry.injury_reported === 'boolean' ? entry.injury_reported : null,
        injuryDetails: entry.injury_details ? String(entry.injury_details) : null,
        submittedAt: entry.submitted_at ? String(entry.submitted_at) : null,
    }));
}

export async function setTechnicianClock(technicianCompanyUserId: string, action: 'clock_in' | 'clock_out') {
    const { data, error } = await supabase.rpc('set_company_technician_clock', {
        p_technician_company_user_id: technicianCompanyUserId,
        p_action: action,
    });

    if (error) throw error;

    return data;
}

export async function manageTechnicianTimeEntry(
    technicianCompanyUserId: string,
    action: 'start_break' | 'end_break' | 'add_30_minute_break' | 'submit_day',
    payload: Record<string, unknown> = {}
) {
    const { data, error } = await supabase.rpc('manage_company_technician_time_entry', {
        p_technician_company_user_id: technicianCompanyUserId,
        p_action: action,
        p_payload: payload,
    });

    if (error) throw error;
    return data;
}

export async function requestClockInCorrection(input: {
    technicianCompanyUserId: string;
    requestedClockInAt: string;
    reason: string;
    latitude?: number | null;
    longitude?: number | null;
    accuracyMeters?: number | null;
}) {
    const { data, error } = await supabase.rpc('request_company_clock_in_correction', {
        p_technician_company_user_id: input.technicianCompanyUserId,
        p_requested_clock_in_at: input.requestedClockInAt,
        p_reason: input.reason,
        p_latitude: input.latitude ?? null,
        p_longitude: input.longitude ?? null,
        p_accuracy_meters: input.accuracyMeters ?? null,
    });

    if (error) throw error;
    return data;
}

export async function loadPendingClockInCorrections(companyId: string) {
    const { data, error } = await supabase
        .from('company_time_correction_requests')
        .select('id, technician_company_user_id, requested_clock_in_at, reason, location_latitude, location_longitude, location_accuracy_meters, status, created_at')
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []).map((request) => ({
        id: String(request.id),
        technicianCompanyUserId: String(request.technician_company_user_id),
        requestedClockInAt: String(request.requested_clock_in_at),
        reason: String(request.reason),
        latitude: typeof request.location_latitude === 'number' ? request.location_latitude : null,
        longitude: typeof request.location_longitude === 'number' ? request.location_longitude : null,
        accuracyMeters: typeof request.location_accuracy_meters === 'number' ? request.location_accuracy_meters : null,
        status: String(request.status) as ClockInCorrectionRequest['status'],
        createdAt: String(request.created_at),
    }));
}

export async function reviewClockInCorrection(
    requestId: string,
    decision: 'approved' | 'denied',
    reviewNote = ''
) {
    const { data, error } = await supabase.rpc('review_company_clock_in_correction', {
        p_request_id: requestId,
        p_decision: decision,
        p_review_note: reviewNote || null,
    });

    if (error) throw error;
    return data;
}
