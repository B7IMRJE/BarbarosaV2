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

    if position(
        'coalesce(v_source_choice_id = v_selected_source_choice_id, false)'
        in pg_get_functiondef('public.save_company_estimate_option_set(uuid,jsonb,text,boolean)'::regprocedure)
    ) = 0 then
        raise exception 'save_company_estimate_option_set must save an unselected draft option as selected_for_presentation = false';
    end if;
end;
$$;

rollback;
