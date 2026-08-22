-- Keep Sales Tech estimate authoring available for the exact client home and
-- Sales Visit assigned to the signed-in salesperson. This preserves the
-- existing estimate workflow while preventing Sales from inheriting broad
-- technician, Dispatch, customer-directory, or company-management access.

begin;

do $$
begin
    if to_regprocedure('public.company_current_user_is_sales_tech(uuid)') is null
       or to_regprocedure('public.company_sales_context_matches_client_home(uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.company_estimate_options_can_use(uuid)') is null
       or to_regprocedure('public.homeos_can_read_provider_assigned_items(uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.resolve_company_user_permissions_for_company(uuid,text,text,jsonb)') is null
       or to_regprocedure('public.set_company_role_permission_profile(uuid,text,jsonb)') is null then
        raise exception 'Sales Tech, provider assignment, and company permission functions are required.';
    end if;
end;
$$;

create or replace function public.resolve_company_user_permissions_for_company(
    p_company_id uuid,
    p_role text,
    p_status text,
    p_user_permissions jsonb default '{}'::jsonb
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    with resolved as (
        select case
            when lower(btrim(coalesce(p_status, ''))) <> 'active' then
                jsonb_build_object(
                    'can_view_techos', false,
                    'can_create_estimates', false,
                    'can_add_item_to_estimate', false,
                    'can_manage_price_book', false,
                    'can_view_customers', false,
                    'can_view_jobs', false,
                    'can_manage_company_users', false,
                    'can_manage_company_profile', false
                )
            when lower(btrim(coalesce(p_role, ''))) = 'owner' then
                public.company_role_default_permissions('owner')
            else
                public.company_role_default_permissions(p_role)
                || coalesce((
                    select profile.permissions
                    from public.company_role_permission_profiles profile
                    where profile.company_id = p_company_id
                      and profile.role = lower(btrim(coalesce(p_role, '')))
                    limit 1
                ), '{}'::jsonb)
                || coalesce(nullif(p_user_permissions, 'null'::jsonb), '{}'::jsonb)
        end as permissions
    )
    select case
        when lower(btrim(coalesce(p_role, ''))) = 'sales'
          and lower(btrim(coalesce(p_status, ''))) = 'active' then
            resolved.permissions || jsonb_build_object(
                'can_create_estimates', true,
                'can_add_item_to_estimate', true,
                'can_manage_price_book', false,
                'can_view_customers', false,
                'can_manage_company_users', false,
                'can_manage_company_profile', false
            )
        else resolved.permissions
    end
    from resolved;
$$;

create or replace function public.set_company_role_permission_profile(
    p_company_id uuid,
    p_role text,
    p_permissions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_role text := lower(btrim(coalesce(p_role, '')));
    v_permissions jsonb := coalesce(p_permissions, '{}'::jsonb);
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if p_company_id is null then raise exception 'company_id is required'; end if;
    if v_role not in ('admin', 'manager', 'office', 'dispatcher', 'supervisor', 'sales', 'technician') then
        raise exception 'This role cannot be customized.';
    end if;
    if not public.company_permissions_are_valid(v_permissions) then
        raise exception 'Permissions must contain only supported boolean values.';
    end if;
    if not (
        public.is_platform_admin()
        or exists (
            select 1 from public.company_users company_user
            where company_user.company_id = p_company_id
              and company_user.auth_user_id = auth.uid()
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
              and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'manager')
        )
    ) then raise exception 'Only a company owner or manager can change role permissions.'; end if;

    if v_role = 'sales' then
        v_permissions := v_permissions || jsonb_build_object(
            'can_create_estimates', true,
            'can_add_item_to_estimate', true,
            'can_manage_price_book', false,
            'can_view_customers', false,
            'can_manage_company_users', false,
            'can_manage_company_profile', false
        );
    end if;

    insert into public.company_role_permission_profiles(
        company_id, role, permissions, updated_by_user_id, updated_at
    ) values (
        p_company_id, v_role, v_permissions, auth.uid(), now()
    )
    on conflict (company_id, role) do update
    set permissions = excluded.permissions,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_at = now();

    return public.resolve_company_user_permissions_for_company(
        p_company_id, v_role, 'active', '{}'::jsonb
    );
end;
$$;

create or replace function public.company_estimate_session_context_can_use(
    p_company_id uuid,
    p_property_id uuid default null,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_home_item_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null or p_company_id is null then
        return false;
    end if;

    if not exists (
        select 1
        from public.companies as company
        where company.id = p_company_id
          and lower(btrim(coalesce(company.status, 'active'))) not in (
              'inactive',
              'archived',
              'cancelled',
              'canceled',
              'disabled',
              'suspended'
          )
    ) then
        return false;
    end if;

    if not public.company_estimate_options_can_use(p_company_id) then
        return false;
    end if;

    if p_home_item_id is not null and not exists (
        select 1
        from public.home_items as item
        where item.id = p_home_item_id
          and item.property_id = p_property_id
          and coalesce(item.archived, false) = false
    ) then
        return false;
    end if;

    -- Sales uses its own assignment boundary. Do this before the generic
    -- provider helper, which intentionally excludes Sales identities unless a
    -- catalog wrapper temporarily enables one specific operation.
    if public.company_current_user_is_sales_tech(p_company_id) then
        return public.company_sales_context_matches_client_home(
            p_company_id,
            p_property_id,
            p_service_request_id,
            p_schedule_slot_id,
            p_job_id
        );
    end if;

    if p_service_request_id is not null
       or p_schedule_slot_id is not null
       or p_job_id is not null then
        if p_property_id is null then
            return false;
        end if;

        if public.homeos_can_read_provider_assigned_items(
            p_company_id,
            p_property_id,
            p_service_request_id,
            p_schedule_slot_id,
            p_job_id
        ) then
            return true;
        end if;

        if public.can_dispatch_company(p_company_id) then
            if p_schedule_slot_id is not null and exists (
                select 1
                from public.job_schedule_slots as slot
                left join public.service_requests as request
                  on request.id = slot.service_request_id
                 and request.company_id = slot.company_id
                left join public.jobs as job
                  on job.id = slot.job_id
                 and job.company_id = slot.company_id
                where slot.id = p_schedule_slot_id
                  and slot.company_id = p_company_id
                  and (p_service_request_id is null or slot.service_request_id = p_service_request_id)
                  and (p_job_id is null or slot.job_id = p_job_id)
                  and (
                      (request.id is not null and request.property_id = p_property_id)
                      or (job.id is not null and job.property_id = p_property_id)
                  )
            ) then
                return true;
            end if;

            if p_service_request_id is not null and exists (
                select 1
                from public.service_requests as request
                where request.id = p_service_request_id
                  and request.company_id = p_company_id
                  and request.property_id = p_property_id
            ) then
                return true;
            end if;

            if p_job_id is not null and exists (
                select 1
                from public.jobs as job
                where job.id = p_job_id
                  and job.company_id = p_company_id
                  and job.property_id = p_property_id
            ) then
                return true;
            end if;
        end if;

        return false;
    end if;

    if p_property_id is null then
        return false;
    end if;

    return exists (
        select 1
        from public.company_property_clients as company_client
        where company_client.company_id = p_company_id
          and company_client.property_id = p_property_id
          and lower(btrim(coalesce(company_client.status, ''))) not in (
              'archived',
              'cancelled',
              'canceled',
              'declined',
              'inactive',
              'revoked'
          )
    );
end;
$$;

comment on function public.company_estimate_session_context_can_use(uuid,uuid,uuid,uuid,uuid,uuid) is
    'Authorizes estimate sessions for company-scoped work; Sales Tech is limited to the exact active Sales Visit and client home assigned to the signed-in salesperson.';

commit;
