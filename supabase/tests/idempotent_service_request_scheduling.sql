do $$
declare
    v_schedule_def text;
begin
    if to_regprocedure(
        'public.schedule_service_request_slot(uuid,uuid,uuid,timestamptz,timestamptz,timestamptz,timestamptz,integer,text,text)'
    ) is null then
        raise exception 'schedule_service_request_slot RPC is missing.';
    end if;

    v_schedule_def := pg_get_functiondef(
        'public.schedule_service_request_slot(uuid,uuid,uuid,timestamptz,timestamptz,timestamptz,timestamptz,integer,text,text)'::regprocedure
    );

    if v_schedule_def not ilike '%slot.service_request_id is distinct from p_service_request_id%' then
        raise exception 'Scheduling must exclude the same request from technician overlap conflicts.';
    end if;

    if v_schedule_def not ilike '%update public.job_schedule_slots as slot%' then
        raise exception 'Scheduling retries must update the existing active appointment.';
    end if;

    if v_schedule_def not ilike '%where slot.id = v_slot.id%' then
        raise exception 'Scheduling retries must preserve the existing appointment id.';
    end if;

    if v_schedule_def not ilike '%slot.technician_company_user_id = p_technician_company_user_id%' then
        raise exception 'Scheduling must continue checking the selected technician for overlaps.';
    end if;

    if v_schedule_def not ilike '%tstzrange(slot.start_at, slot.end_at, ''[)'') && tstzrange(p_start_at, p_end_at, ''[)'')%' then
        raise exception 'Scheduling must continue blocking real overlapping appointments.';
    end if;
end;
$$;

select 'idempotent_service_request_scheduling_ok' as result;
