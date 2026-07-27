begin;

do $$
begin
    if to_regclass('public.company_technician_time_entries') is null then
        raise exception 'company_technician_time_entries is missing';
    end if;
    if to_regclass('public.company_time_correction_requests') is null then
        raise exception 'company_time_correction_requests is missing';
    end if;
    if to_regprocedure('public.manage_company_technician_time_entry(uuid,text,jsonb)') is null then
        raise exception 'manage_company_technician_time_entry is missing';
    end if;
    if to_regprocedure('public.request_company_clock_in_correction(uuid,timestamptz,text,double precision,double precision,double precision)') is null then
        raise exception 'request_company_clock_in_correction is missing';
    end if;
    if to_regprocedure('public.review_company_clock_in_correction(uuid,text,text)') is null then
        raise exception 'review_company_clock_in_correction is missing';
    end if;
    if not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='company_technician_time_entries'
          and column_name='technician_signature'
    ) then
        raise exception 'technician daily signature column is missing';
    end if;
    if not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='company_technician_time_entries'
          and column_name='break_minutes'
    ) then
        raise exception 'lunch break minutes column is missing';
    end if;
end;
$$;

rollback;
