begin;

do $$
begin
    if to_regprocedure('public.save_company_estimate_option_set(uuid,jsonb,text,boolean)') is null then
        raise exception 'save_company_estimate_option_set is missing';
    end if;

    if to_regprocedure('public.get_company_estimate_option_set(uuid)') is null then
        raise exception 'get_company_estimate_option_set is missing';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'company_estimate_options'
          and column_name = 'choice_snapshot'
          and data_type = 'jsonb'
    ) then
        raise exception 'company_estimate_options.choice_snapshot is missing';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'company_estimate_options'
          and column_name = 'selected_for_presentation'
    ) then
        raise exception 'company_estimate_options.selected_for_presentation is missing';
    end if;
end;
$$;

rollback;
