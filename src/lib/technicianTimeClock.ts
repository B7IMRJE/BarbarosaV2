import { supabase } from './supabase';

export type TechnicianTimeEntry = {
    id: string;
    clockedInAt: string;
    clockedOutAt: string | null;
    breakStartedAt: string | null;
    breakEndedAt: string | null;
    breakMinutes: number;
    restBreakStartedAt: string | null;
    restBreakMinutes: number;
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
    requestedClockOutAt: string | null;
    correctionType: 'clock_in' | 'clock_out';
    reason: string;
    latitude: number | null;
    longitude: number | null;
    accuracyMeters: number | null;
    status: 'pending' | 'approved' | 'denied';
    createdAt: string;
};

export type TimeApprovalRequest = {
    id: string;
    technicianCompanyUserId: string;
    timeEntryId: string;
    approvalType: 'early_clock_in' | 'overtime';
    status: 'pending' | 'approved' | 'denied';
    requestedAt: string;
};

export async function loadTechnicianTimeEntries(technicianCompanyUserId: string) {
    const { data, error } = await supabase
        .from('company_technician_time_entries')
        .select('id, clocked_in_at, clocked_out_at, break_started_at, break_ended_at, break_minutes, rest_break_started_at, rest_break_minutes, automatic_lunch_applied, meal_exception_reported, shift_notes, injury_reported, injury_details, submitted_at')
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
        restBreakStartedAt: entry.rest_break_started_at ? String(entry.rest_break_started_at) : null,
        restBreakMinutes: Number(entry.rest_break_minutes || 0),
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

    if (error) throw new Error(error.message);

    return data;
}

export async function manageTechnicianTimeEntry(
    technicianCompanyUserId: string,
    action: 'start_break' | 'end_break' | 'add_30_minute_break' | 'start_rest_break' | 'end_rest_break' | 'submit_day',
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

export async function requestClockOutCorrection(input: {
    technicianCompanyUserId: string;
    requestedClockOutAt: string;
    reason: string;
    latitude?: number | null;
    longitude?: number | null;
    accuracyMeters?: number | null;
}) {
    const { data, error } = await supabase.rpc('request_company_clock_out_correction', {
        p_technician_company_user_id: input.technicianCompanyUserId,
        p_requested_clock_out_at: input.requestedClockOutAt,
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
        .select('id, technician_company_user_id, requested_clock_in_at, requested_clock_out_at, correction_type, reason, location_latitude, location_longitude, location_accuracy_meters, status, created_at')
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

    if (error) throw error;

    return (data || []).map((request) => ({
        id: String(request.id),
        technicianCompanyUserId: String(request.technician_company_user_id),
        requestedClockInAt: String(request.requested_clock_in_at),
        requestedClockOutAt: request.requested_clock_out_at ? String(request.requested_clock_out_at) : null,
        correctionType: String(request.correction_type || 'clock_in') as ClockInCorrectionRequest['correctionType'],
        reason: String(request.reason),
        latitude: typeof request.location_latitude === 'number' ? request.location_latitude : null,
        longitude: typeof request.location_longitude === 'number' ? request.location_longitude : null,
        accuracyMeters: typeof request.location_accuracy_meters === 'number' ? request.location_accuracy_meters : null,
        status: String(request.status) as ClockInCorrectionRequest['status'],
        createdAt: String(request.created_at),
    }));
}

export type CompanyHoliday = {
    id: string;
    holidayDate: string;
    name: string;
};

export async function loadCompanyTimekeeping(companyId: string) {
    const [
        { data: entries, error: entriesError },
        { data: holidays, error: holidaysError },
        { data: users, error: usersError },
    ] = await Promise.all([
        supabase
            .from('company_technician_time_entries')
            .select('id, technician_company_user_id, clocked_in_at, clocked_out_at, break_minutes, rest_break_minutes, submitted_at')
            .eq('company_id', companyId)
            .order('clocked_in_at', { ascending: false })
            .limit(100),
        supabase
            .from('company_holidays')
            .select('id, holiday_date, name')
            .eq('company_id', companyId)
            .order('holiday_date', { ascending: true }),
        supabase
            .from('company_users')
            .select('id, full_name, email')
            .eq('company_id', companyId),
    ]);
    if (entriesError) throw entriesError;
    if (holidaysError) throw holidaysError;
    if (usersError) throw usersError;
    return {
        entries: entries || [],
        users: users || [],
        holidays: (holidays || []).map((holiday) => ({
            id: String(holiday.id),
            holidayDate: String(holiday.holiday_date),
            name: String(holiday.name),
        })) as CompanyHoliday[],
    };
}

export async function addCompanyHoliday(companyId: string, holidayDate: string, name: string) {
    const { data, error } = await supabase.rpc('add_company_holiday', {
        p_company_id: companyId,
        p_holiday_date: holidayDate,
        p_name: name,
    });
    if (error) throw error;
    return data;
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

export async function requestTimeApproval(
    technicianCompanyUserId: string,
    approvalType: 'early_clock_in' | 'overtime'
) {
    const { data, error } = await supabase.rpc('request_company_time_approval', {
        p_technician_company_user_id: technicianCompanyUserId,
        p_approval_type: approvalType,
    });
    if (error) throw error;
    return data;
}

export async function loadPendingTimeApprovals(companyId: string) {
    const { data, error } = await supabase
        .from('company_time_approval_requests')
        .select('id, technician_company_user_id, time_entry_id, approval_type, status, requested_at')
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((request) => ({
        id: String(request.id),
        technicianCompanyUserId: String(request.technician_company_user_id),
        timeEntryId: String(request.time_entry_id),
        approvalType: String(request.approval_type) as TimeApprovalRequest['approvalType'],
        status: String(request.status) as TimeApprovalRequest['status'],
        requestedAt: String(request.requested_at),
    }));
}

export async function reviewTimeApproval(requestId: string, decision: 'approved' | 'denied') {
    const { data, error } = await supabase.rpc('review_company_time_approval', {
        p_request_id: requestId,
        p_decision: decision,
        p_review_note: null,
    });
    if (error) throw error;
    return data;
}

export async function registerTechnicianDevice(
    technicianCompanyUserId: string,
    deviceKey: string,
    deviceRole: 'primary_phone' | 'companion_tablet',
    deviceLabel: string
) {
    const { data, error } = await supabase.rpc('register_company_technician_device', {
        p_technician_company_user_id: technicianCompanyUserId,
        p_device_key: deviceKey,
        p_device_role: deviceRole,
        p_device_label: deviceLabel,
    });
    if (error) throw new Error(error.message);
    return data;
}
