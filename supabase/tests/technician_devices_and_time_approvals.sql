begin;

do $$
begin
    if to_regclass('public.company_technician_devices') is null then
        raise exception 'company_technician_devices is missing';
    end if;
    if to_regclass('public.company_time_approval_requests') is null then
        raise exception 'company_time_approval_requests is missing';
    end if;
    if to_regprocedure('public.register_company_technician_device(uuid,text,text,text)') is null then
        raise exception 'register_company_technician_device is missing';
    end if;
    if to_regprocedure('public.request_company_time_approval(uuid,text)') is null then
        raise exception 'request_company_time_approval is missing';
    end if;
    if to_regprocedure('public.review_company_time_approval(uuid,text,text)') is null then
        raise exception 'review_company_time_approval is missing';
    end if;
end;
$$;

rollback;
