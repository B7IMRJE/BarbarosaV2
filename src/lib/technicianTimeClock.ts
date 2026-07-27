import { supabase } from './supabase';

export type TechnicianTimeEntry = {
    id: string;
    clockedInAt: string;
    clockedOutAt: string | null;
};

export async function loadTechnicianTimeEntries(technicianCompanyUserId: string) {
    const { data, error } = await supabase
        .from('company_technician_time_entries')
        .select('id, clocked_in_at, clocked_out_at')
        .eq('technician_company_user_id', technicianCompanyUserId)
        .order('clocked_in_at', { ascending: false })
        .limit(20);

    if (error) throw error;

    return (data || []).map((entry) => ({
        id: String(entry.id),
        clockedInAt: String(entry.clocked_in_at),
        clockedOutAt: entry.clocked_out_at ? String(entry.clocked_out_at) : null,
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
