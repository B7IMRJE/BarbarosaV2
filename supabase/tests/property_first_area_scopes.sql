-- Read-only regression checks for the property-area scope and atomic Add Area migrations.

do $$
declare
    v_function_def text;
    v_trigger_def text;
    v_trigger_function_def text;
begin
    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'home_items'
          and column_name = 'area_scope'
    ) then
        raise exception 'Property areas are missing the additive area_scope classification.';
    end if;

    if to_regprocedure('public.add_homeowner_property_area(uuid,text,text)') is null then
        raise exception 'The atomic homeowner Add Area RPC is missing.';
    end if;

    if to_regprocedure('public.enforce_home_items_top_level_area_identity()') is null then
        raise exception 'The all-writer top-level area identity guard is missing.';
    end if;

    select pg_get_functiondef('public.add_homeowner_property_area(uuid,text,text)'::regprocedure)
    into v_function_def;
    select pg_get_functiondef('public.enforce_home_items_top_level_area_identity()'::regprocedure)
    into v_trigger_function_def;
    select pg_get_triggerdef(trigger.oid)
    into v_trigger_def
    from pg_trigger trigger
    where trigger.tgrelid = 'public.home_items'::regclass
      and trigger.tgname = 'home_items_enforce_top_level_area_identity'
      and not trigger.tgisinternal;

    if v_trigger_def is null
       or v_trigger_def !~* 'before insert or update'
       or v_trigger_def !~* 'enforce_home_items_top_level_area_identity' then
        raise exception 'Every HomeOS area writer must use the top-level area identity guard.';
    end if;

    if v_trigger_function_def !~* 'pg_advisory_xact_lock'
       or v_trigger_function_def !~* 'homeowner-property-area'
       or v_trigger_function_def !~* 'existing_area.property_id = new.property_id'
       or v_trigger_function_def !~* 'existing_area.id is distinct from new.id'
       or v_trigger_function_def !~* 'existing_area.parent_area'
       or v_trigger_function_def !~* '23505' then
        raise exception 'The all-writer area guard must serialize and reject active root duplicates safely.';
    end if;

    if v_trigger_function_def ~* 'existing_area.system[[:space:]]*=' then
        raise exception 'The all-writer top-level area guard must compare names across systems.';
    end if;

    if v_function_def !~* 'security definer'
       or v_function_def !~* 'homeos_has_active_property_membership'
       or v_function_def !~* 'homeos_can_mutate_property_record' then
        raise exception 'Add Area must preserve active homeowner property authorization.';
    end if;

    if v_function_def !~* 'pg_advisory_xact_lock'
       or v_function_def !~* 'existing_area.property_id = p_property_id'
       or v_function_def !~* 'existing_area.category'
       or v_function_def !~* 'existing_area.parent_area'
       or v_function_def !~* 'existing_area.name' then
        raise exception 'Add Area must serialize and recheck active top-level same-name areas.';
    end if;

    if v_function_def ~* 'existing_area.system[[:space:]]*=' then
        raise exception 'Top-level area reuse must work across systems.';
    end if;

    if has_function_privilege('anon', 'public.add_homeowner_property_area(uuid,text,text)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.add_homeowner_property_area(uuid,text,text)', 'EXECUTE') then
        raise exception 'Add Area RPC execution privileges are incorrect.';
    end if;
end;
$$;

select 'property_first_area_scopes_ok' as result;
