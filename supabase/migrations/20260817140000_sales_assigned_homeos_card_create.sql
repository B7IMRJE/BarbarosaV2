-- Allow a Sales Tech to add one generic or custom HomeOS card only while
-- operating inside the company client home for an explicitly assigned sales
-- request, visit, or job. Installed-item edits and all unassigned access stay
-- denied.

begin;

do $$
begin
    if to_regprocedure('public.company_sales_context_matches_client_home(uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.homeos_can_read_provider_assigned_items(uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.create_provider_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text)') is null
       or to_regprocedure('public.create_provider_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid)') is null then
        raise exception 'Assigned Sales HomeOS card creation requires the existing Sales assignment and HomeOS provider functions.';
    end if;
end;
$$;

create or replace function public.homeos_can_read_provider_assigned_items(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_auth_user_id uuid := auth.uid();
    v_company_user_id uuid := null;
    v_is_platform_admin boolean := false;
begin
    if v_auth_user_id is null or p_company_id is null or p_property_id is null then return false; end if;

    if (
        current_setting('barbarosa.sales_catalog_quote', true) = 'allowed'
        or current_setting('barbarosa.sales_homeos_card_create', true) = 'allowed'
    ) and public.company_sales_context_matches_client_home(
        p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
    ) then return true; end if;

    if p_service_request_id is null and p_schedule_slot_id is null and p_job_id is null then return false; end if;

    select public.homeos_is_platform_admin() into v_is_platform_admin;
    select company_user.id into v_company_user_id
    from public.company_users company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = v_auth_user_id
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
      and lower(btrim(coalesce(company_user.role, ''))) <> 'sales'
    order by company_user.created_at asc nulls last, company_user.id asc
    limit 1;
    if not coalesce(v_is_platform_admin, false) and v_company_user_id is null then return false; end if;
    if not exists (
        select 1 from public.company_property_clients company_client
        where company_client.company_id = p_company_id
          and company_client.property_id = p_property_id
          and lower(btrim(coalesce(company_client.status, ''))) not in (
              'archived', 'cancelled', 'canceled', 'declined', 'inactive', 'revoked'
          )
    ) then return false; end if;

    if p_schedule_slot_id is not null and exists (
        select 1
        from public.job_schedule_slots slot
        left join public.service_requests request
          on request.id = slot.service_request_id and request.company_id = slot.company_id
        left join public.jobs job
          on job.id = slot.job_id and job.company_id = slot.company_id
        where slot.id = p_schedule_slot_id
          and slot.company_id = p_company_id
          and (coalesce(v_is_platform_admin, false) or slot.technician_company_user_id = v_company_user_id)
          and (p_service_request_id is null or slot.service_request_id = p_service_request_id)
          and (p_job_id is null or slot.job_id = p_job_id)
          and (request.property_id = p_property_id or job.property_id = p_property_id)
    ) then return true; end if;

    if p_service_request_id is not null and exists (
        select 1 from public.service_requests request
        where request.id = p_service_request_id
          and request.company_id = p_company_id
          and request.property_id = p_property_id
          and (
              coalesce(v_is_platform_admin, false)
              or exists (
                  select 1 from public.job_schedule_slots slot
                  where slot.service_request_id = request.id
                    and slot.company_id = request.company_id
                    and slot.technician_company_user_id = v_company_user_id
              )
          )
    ) then return true; end if;

    if p_job_id is not null and exists (
        select 1 from public.jobs job
        where job.id = p_job_id
          and job.company_id = p_company_id
          and job.property_id = p_property_id
          and (
              coalesce(v_is_platform_admin, false)
              or exists (
                  select 1 from public.job_assignments assignment
                  where assignment.job_id = job.id
                    and assignment.company_id = job.company_id
                    and assignment.technician_auth_user_id = v_auth_user_id
                    and assignment.technician_company_user_id = v_company_user_id
                    and lower(btrim(coalesce(assignment.status, ''))) not in (
                        'removed', 'revoked', 'cancelled', 'canceled'
                    )
              )
              or exists (
                  select 1 from public.job_schedule_slots slot
                  where slot.job_id = job.id
                    and slot.company_id = job.company_id
                    and slot.technician_company_user_id = v_company_user_id
              )
          )
    ) then return true; end if;
    return false;
end;
$$;

create or replace function public.create_sales_homeos_item(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_item_slug text default null,
    p_name text default null,
    p_system text default null,
    p_category text default null,
    p_location text default null,
    p_parent_area text default null,
    p_status text default 'Missing Information',
    p_install_state text default 'Unknown',
    p_about text default null,
    p_brand text default null,
    p_model text default null,
    p_serial text default null
)
returns table (
    id uuid,
    item_slug text,
    name text,
    system text,
    category text,
    parent_area text,
    status text,
    location text,
    about text,
    brand text,
    model text,
    serial text,
    install_date text,
    created_at timestamptz,
    install_state text,
    photo_url text,
    archived boolean,
    property_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_created record;
begin
    if not public.company_sales_context_matches_client_home(
        p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
    ) then
        raise exception 'Sales HomeOS card creation requires an assigned company request, visit, or job.' using errcode = '42501';
    end if;

    perform set_config('barbarosa.sales_homeos_card_create', 'allowed', true);

    select created.* into v_created
    from public.create_provider_homeos_item(
        p_company_id => p_company_id,
        p_property_id => p_property_id,
        p_service_request_id => p_service_request_id,
        p_schedule_slot_id => p_schedule_slot_id,
        p_job_id => p_job_id,
        p_item_slug => p_item_slug,
        p_name => p_name,
        p_system => p_system,
        p_category => p_category,
        p_location => p_location,
        p_parent_area => p_parent_area,
        p_status => p_status,
        p_install_state => p_install_state,
        p_about => p_about,
        p_brand => p_brand,
        p_model => p_model,
        p_serial => p_serial
    ) created
    limit 1;

    if v_created.id is null then
        raise exception 'The assigned HomeOS card could not be created.';
    end if;

    if to_regprocedure('public.log_company_audit_event(uuid,text,text,uuid,text,jsonb,jsonb,jsonb)') is not null then
        perform public.log_company_audit_event(
            p_company_id,
            'sales_homeos_card_create',
            'home_item',
            v_created.id,
            v_created.name,
            null,
            jsonb_build_object(
                'property_id', p_property_id,
                'item_slug', v_created.item_slug,
                'system', v_created.system,
                'category', v_created.category,
                'location', v_created.location
            ),
            jsonb_build_object(
                'access_scope', 'assigned_sales_visit',
                'service_request_id', p_service_request_id,
                'schedule_slot_id', p_schedule_slot_id,
                'job_id', p_job_id,
                'source', 'manual_custom_item'
            )
        );
    end if;

    return query select
        v_created.id,
        v_created.item_slug,
        v_created.name,
        v_created.system,
        v_created.category,
        v_created.parent_area,
        v_created.status,
        v_created.location,
        v_created.about,
        v_created.brand,
        v_created.model,
        v_created.serial,
        v_created.install_date,
        v_created.created_at,
        v_created.install_state,
        v_created.photo_url,
        v_created.archived,
        v_created.property_id;
end;
$$;

create or replace function public.create_sales_homeos_starter_item_from_deck(
    p_company_id uuid,
    p_property_id uuid,
    p_template_key text,
    p_location text,
    p_parent_area text default null,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns table (
    id uuid,
    item_slug text,
    starter_template_key text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_created record;
begin
    if not public.company_sales_context_matches_client_home(
        p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
    ) then
        raise exception 'Sales HomeOS Deck access requires an assigned company request, visit, or job.' using errcode = '42501';
    end if;

    perform set_config('barbarosa.sales_homeos_card_create', 'allowed', true);

    select created.* into v_created
    from public.create_provider_homeos_starter_item_from_deck(
        p_company_id => p_company_id,
        p_property_id => p_property_id,
        p_template_key => p_template_key,
        p_location => p_location,
        p_parent_area => p_parent_area,
        p_service_request_id => p_service_request_id,
        p_schedule_slot_id => p_schedule_slot_id,
        p_job_id => p_job_id
    ) created
    limit 1;

    if v_created.id is null then
        raise exception 'The assigned HomeOS Deck card could not be created.';
    end if;

    if to_regprocedure('public.log_company_audit_event(uuid,text,text,uuid,text,jsonb,jsonb,jsonb)') is not null then
        perform public.log_company_audit_event(
            p_company_id,
            'sales_homeos_card_create',
            'home_item',
            v_created.id,
            p_template_key,
            null,
            jsonb_build_object(
                'property_id', p_property_id,
                'item_slug', v_created.item_slug,
                'starter_template_key', v_created.starter_template_key,
                'location', p_location,
                'parent_area', p_parent_area
            ),
            jsonb_build_object(
                'access_scope', 'assigned_sales_visit',
                'service_request_id', p_service_request_id,
                'schedule_slot_id', p_schedule_slot_id,
                'job_id', p_job_id,
                'source', 'homeos_deck'
            )
        );
    end if;

    return query select v_created.id, v_created.item_slug, v_created.starter_template_key;
end;
$$;

revoke all on function public.create_sales_homeos_item(
    uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text
) from public, anon;
revoke all on function public.create_sales_homeos_starter_item_from_deck(
    uuid,uuid,text,text,text,uuid,uuid,uuid
) from public, anon;
grant execute on function public.create_sales_homeos_item(
    uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text
) to authenticated;
grant execute on function public.create_sales_homeos_starter_item_from_deck(
    uuid,uuid,text,text,text,uuid,uuid,uuid
) to authenticated;

commit;
