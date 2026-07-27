begin;

do $$
begin
    if to_regprocedure('public.request_company_clock_out_correction(uuid,timestamptz,text,double precision,double precision,double precision)') is null then
        raise exception 'forgotten clock-out request function is missing';
    end if;
    if to_regprocedure('public.add_company_holiday(uuid,date,text)') is null then
        raise exception 'company holiday function is missing';
    end if;
    if not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='company_technician_time_entries'
          and column_name='rest_break_minutes'
    ) then
        raise exception 'rest-break minutes column is missing';
    end if;
    if not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name='company_time_correction_requests'
          and column_name='correction_type'
    ) then
        raise exception 'time-correction type column is missing';
    end if;
    if to_regclass('public.company_holidays') is null then
        raise exception 'company holidays table is missing';
    end if;
end
$$;

rollback;
