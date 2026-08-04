do $$
declare
    v_category_keys_def text;
    v_directory_def text;
    v_request_def text;
    v_invite_def text;
begin
    if public.homeos_normalize_provider_category(null) is not null
       or public.homeos_normalize_provider_category('') is not null
       or public.homeos_normalize_provider_category('Unknown') is not null
       or public.homeos_normalize_provider_category('No category') is not null
       or public.homeos_normalize_provider_category('Plumbing-ish services') is not null then
        raise exception 'Unclassified and invalid providers must not receive a category key.';
    end if;

    if public.homeos_normalize_provider_category('Plumbing') <> 'plumbing'
       or public.homeos_normalize_provider_category('Drain Cleaning') <> 'plumbing' then
        raise exception 'Explicit Plumbing classifications must occupy Plumbing.';
    end if;

    if public.homeos_normalize_provider_category('HVAC') <> 'hvac'
       or public.homeos_normalize_provider_category('Electrical') <> 'electrical' then
        raise exception 'Explicit HVAC and Electrical classifications must remain independently visible.';
    end if;

    if public.homeos_normalize_provider_category('Roto-Rooter') is not null then
        raise exception 'Company names must never be used as provider classifications.';
    end if;

    v_category_keys_def := pg_get_functiondef(
        'public.homeos_company_provider_category_keys(uuid)'::regprocedure
    );

    if v_category_keys_def not ilike '%company.status%'
       or v_category_keys_def not ilike '%''active''%' then
        raise exception 'Inactive companies must not supply active provider classifications.';
    end if;

    if not exists (
        select 1
        from pg_trigger
        where tgrelid = 'public.property_preferred_providers'::regclass
          and tgname = 'property_preferred_providers_validate_category'
          and not tgisinternal
    ) then
        raise exception 'Active preferred-provider rows must validate their exact company category.';
    end if;

    if to_regprocedure('public.get_homeowner_connection_providers(uuid)') is null then
        raise exception 'The property-scoped homeowner provider directory RPC is missing.';
    end if;

    v_directory_def := pg_get_functiondef(
        'public.get_homeowner_connection_providers(uuid)'::regprocedure
    );

    if v_directory_def not ilike '%homeos_company_provider_category_keys%'
       or v_directory_def not ilike '%occupied_provider%'
       or v_directory_def not ilike '%service_category_key%' then
        raise exception 'Provider directory must enforce explicit classifications and occupied-category exclusion.';
    end if;

    v_request_def := pg_get_functiondef(
        'public.request_property_provider_connection(uuid,uuid)'::regprocedure
    );
    v_invite_def := pg_get_functiondef(
        'public.accept_customer_invite_by_code(text,uuid)'::regprocedure
    );

    if v_request_def not ilike '%homeos_activate_provider_categories%'
       or v_invite_def not ilike '%homeos_activate_provider_categories%' then
        raise exception 'Direct selection and invitations must share strict category activation.';
    end if;

    if v_request_def ilike '%set status = ''archived''%'
       or v_invite_def ilike '%set status = ''archived''%' then
        raise exception 'New relationships must not archive providers in other categories.';
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'companies'
          and policyname = 'companies_select_provider_access'
          and qual ilike '%homeos_current_provider_company_visible%'
    ) then
        raise exception 'Direct company reads must not bypass the homeowner provider directory.';
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'property_connections'
          and policyname = 'property_connections_select_provider_visibility'
          and qual ilike '%homeos_provider_visible_for_property%'
    ) then
        raise exception 'Connection reads must enforce provider category visibility.';
    end if;
end;
$$;

select 'provider_category_visibility_ok' as result;
