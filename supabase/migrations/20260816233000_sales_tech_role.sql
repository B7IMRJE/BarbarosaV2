-- Add a company-scoped Sales Tech role for client/HomeOS reads and proposal
-- authoring. Sales remains outside Dispatch, Price Book management, company
-- administration, technician execution, closeout, and installed-item publish.

begin;

alter table public.company_users
    drop constraint if exists company_users_role_check;
alter table public.company_users
    add constraint company_users_role_check
    check (role in ('owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor', 'sales', 'technician'));

alter table public.company_user_invitations
    drop constraint if exists company_user_invitations_role_check;
alter table public.company_user_invitations
    add constraint company_user_invitations_role_check
    check (role in ('owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor', 'sales', 'technician'));

alter table public.company_role_permission_profiles
    drop constraint if exists company_role_permission_profiles_role_check;
alter table public.company_role_permission_profiles
    add constraint company_role_permission_profiles_role_check
    check (role in ('admin', 'manager', 'office', 'dispatcher', 'supervisor', 'sales', 'technician'));

create or replace function public.company_role_default_permissions(p_role text)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, pg_temp
as $$
    select case
        when lower(btrim(coalesce(p_role, ''))) in ('tech', 'technician') then
            jsonb_build_object(
                'can_view_techos', true,
                'can_create_estimates', false,
                'can_add_item_to_estimate', false,
                'can_manage_price_book', false,
                'can_view_customers', false,
                'can_view_jobs', true,
                'can_manage_company_users', false,
                'can_manage_company_profile', false
            )
        when lower(btrim(coalesce(p_role, ''))) = 'sales' then
            jsonb_build_object(
                'can_view_techos', true,
                'can_create_estimates', true,
                'can_add_item_to_estimate', true,
                'can_manage_price_book', false,
                'can_view_customers', true,
                'can_view_jobs', true,
                'can_manage_company_users', false,
                'can_manage_company_profile', false
            )
        when lower(btrim(coalesce(p_role, ''))) in ('office', 'dispatcher', 'supervisor') then
            jsonb_build_object(
                'can_view_techos', true,
                'can_create_estimates', false,
                'can_add_item_to_estimate', false,
                'can_manage_price_book', false,
                'can_view_customers', true,
                'can_view_jobs', true,
                'can_manage_company_users', false,
                'can_manage_company_profile', false
            )
        when lower(btrim(coalesce(p_role, ''))) in ('manager', 'admin', 'owner') then
            jsonb_build_object(
                'can_view_techos', true,
                'can_create_estimates', true,
                'can_add_item_to_estimate', true,
                'can_manage_price_book', true,
                'can_view_customers', true,
                'can_view_jobs', true,
                'can_manage_company_users', true,
                'can_manage_company_profile', true
            )
        else
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
                'can_manage_price_book', false,
                'can_manage_company_users', false,
                'can_manage_company_profile', false
            )
        else resolved.permissions
    end
    from resolved;
$$;

create or replace function public.company_current_user_is_sales_tech(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and exists (
           select 1
           from public.company_users company_user
           where company_user.company_id = p_company_id
             and company_user.auth_user_id = auth.uid()
             and lower(btrim(coalesce(company_user.status, ''))) = 'active'
             and lower(btrim(coalesce(company_user.role, ''))) = 'sales'
       );
$$;

create or replace function public.company_estimate_options_can_use(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           public.company_price_book_can_view(p_company_id)
           or (
               public.company_current_user_is_sales_tech(p_company_id)
               and public.company_user_has_permission(p_company_id, 'can_create_estimates')
               and public.company_user_has_permission(p_company_id, 'can_add_item_to_estimate')
           )
       );
$$;

create or replace function public.company_product_catalog_can_manage(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           coalesce(public.homeos_is_platform_admin(), false)
           or (
               not public.company_current_user_is_sales_tech(p_company_id)
               and exists (
                   select 1
                   from public.company_catalog_entitlements entitlement
                   where entitlement.company_id = p_company_id
                     and entitlement.active
                     and entitlement.package_tier = 'full'
               )
               and (
                   public.company_price_book_can_manage(p_company_id)
                   or exists (
                       select 1
                       from public.company_users company_user
                       where company_user.company_id = p_company_id
                         and company_user.auth_user_id = auth.uid()
                         and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                         and lower(btrim(coalesce(company_user.role, ''))) in ('office', 'dispatcher', 'supervisor')
                   )
                   or (
                       public.company_user_has_permission(p_company_id, 'can_view_customers')
                       and public.company_user_has_permission(p_company_id, 'can_view_jobs')
                   )
               )
           )
       );
$$;

create or replace function public.get_company_role_permission_profiles(p_company_id uuid)
returns table (role text, permissions jsonb, is_custom boolean, updated_at timestamptz)
language plpgsql
security definer
stable
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not (
        public.is_platform_admin()
        or exists (
            select 1 from public.company_users company_user
            where company_user.company_id = p_company_id
              and company_user.auth_user_id = auth.uid()
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
              and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'manager')
        )
    ) then raise exception 'Only a company owner or manager can review role permissions.'; end if;

    return query
    with roles(role) as (
        values ('admin'), ('manager'), ('office'), ('dispatcher'), ('supervisor'), ('sales'), ('technician')
    )
    select
        roles.role,
        public.resolve_company_user_permissions_for_company(
            p_company_id,
            roles.role,
            'active',
            '{}'::jsonb
        ),
        profile.id is not null,
        profile.updated_at
    from roles
    left join public.company_role_permission_profiles profile
      on profile.company_id = p_company_id
     and profile.role = roles.role;
end;
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
            'can_manage_price_book', false,
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
        p_company_id,
        v_role,
        'active',
        '{}'::jsonb
    );
end;
$$;

create or replace function public.update_company_user_role(
    p_company_user_id uuid,
    p_role text
)
returns public.company_users
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_member public.company_users%rowtype;
    v_role text := lower(btrim(coalesce(p_role, '')));
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if p_company_user_id is null then raise exception 'company_user_id is required'; end if;
    if v_role not in ('admin', 'manager', 'office', 'dispatcher', 'supervisor', 'sales', 'technician') then
        raise exception 'Invalid company role.';
    end if;

    select * into v_member
    from public.company_users company_user
    where company_user.id = p_company_user_id
    for update;
    if not found then raise exception 'Company user not found.'; end if;
    if lower(btrim(coalesce(v_member.role, ''))) = 'owner' then
        raise exception 'Company Owner role changes require ownership transfer.';
    end if;
    if not public.can_manage_company_users(v_member.company_id) then
        raise exception 'Not authorized';
    end if;

    update public.company_users company_user
    set role = v_role,
        permissions = '{}'::jsonb,
        updated_at = now()
    where company_user.id = v_member.id
    returning * into v_member;
    return v_member;
end;
$$;

-- Preserve the latest invite rate limiting/email verification behavior while
-- extending only the accepted role list.
do $$
declare
    v_definition text;
    v_updated text;
begin
    select pg_get_functiondef('public.create_company_user_invitation(uuid,text,text,text)'::regprocedure)
    into v_definition;
    v_updated := replace(
        v_definition,
        '(''owner'', ''admin'', ''manager'', ''office'', ''dispatcher'', ''supervisor'', ''technician'')',
        '(''owner'', ''admin'', ''manager'', ''office'', ''dispatcher'', ''supervisor'', ''sales'', ''technician'')'
    );
    if v_updated = v_definition then raise exception 'Invitation role guard did not match the installed function.'; end if;
    execute v_updated;

    select pg_get_functiondef('public.accept_company_user_invitation(uuid)'::regprocedure)
    into v_definition;
    v_updated := replace(
        v_definition,
        '(''owner'', ''admin'', ''manager'', ''office'', ''dispatcher'', ''supervisor'', ''technician'')',
        '(''owner'', ''admin'', ''manager'', ''office'', ''dispatcher'', ''supervisor'', ''sales'', ''technician'')'
    );
    if v_updated = v_definition then raise exception 'Invitation acceptance role guard did not match the installed function.'; end if;
    execute v_updated;
end;
$$;

create or replace function public.company_sales_can_read_client_home(
    p_company_id uuid,
    p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select public.company_current_user_is_sales_tech(p_company_id)
       and exists (
           select 1
           from public.company_property_clients company_client
           where company_client.company_id = p_company_id
             and company_client.property_id = p_property_id
             and lower(btrim(coalesce(company_client.status, ''))) not in (
                 'archived', 'cancelled', 'canceled', 'declined', 'inactive', 'revoked'
             )
       );
$$;

create or replace function public.company_sales_context_matches_client_home(
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
begin
    if not public.company_sales_can_read_client_home(p_company_id, p_property_id) then return false; end if;
    if p_service_request_id is not null and not exists (
        select 1 from public.service_requests request
        where request.id = p_service_request_id
          and request.company_id = p_company_id
          and request.property_id = p_property_id
    ) then return false; end if;
    if p_schedule_slot_id is not null and not exists (
        select 1
        from public.job_schedule_slots slot
        left join public.service_requests request
          on request.id = slot.service_request_id and request.company_id = slot.company_id
        left join public.jobs job
          on job.id = slot.job_id and job.company_id = slot.company_id
        where slot.id = p_schedule_slot_id
          and slot.company_id = p_company_id
          and (p_service_request_id is null or slot.service_request_id = p_service_request_id)
          and (p_job_id is null or slot.job_id = p_job_id)
          and (request.property_id = p_property_id or job.property_id = p_property_id)
    ) then return false; end if;
    if p_job_id is not null and not exists (
        select 1 from public.jobs job
        where job.id = p_job_id
          and job.company_id = p_company_id
          and job.property_id = p_property_id
    ) then return false; end if;
    return true;
end;
$$;

create or replace function public.get_sales_company_homeos_items(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_item_slug text default null
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
    property_id uuid,
    starter_template_key text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.company_sales_context_matches_client_home(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then raise exception 'Sales HomeOS access requires an active company client home.'; end if;

    return query
    select
        item.id,
        item.item_slug,
        item.name,
        item.system,
        item.category,
        item.parent_area,
        item.status,
        item.location,
        null::text,
        null::text,
        null::text,
        null::text,
        null::text,
        item.created_at,
        item.install_state,
        null::text,
        item.archived,
        item.property_id,
        item.starter_template_key
    from public.home_items item
    where item.property_id = p_property_id
      and (p_item_slug is null or item.item_slug = p_item_slug)
      and coalesce(item.archived, false) = false
    order by item.system asc nulls last, item.name asc nulls last, item.id asc;
end;
$$;

-- Catalog proposal wrappers set a transaction-local flag that only the
-- hardened assignment helper recognizes for an authenticated Sales Tech.
-- Other provider write RPCs never set this flag and keep assignment checks.
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

    if current_setting('barbarosa.sales_catalog_quote', true) = 'allowed'
       and public.company_sales_context_matches_client_home(
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

create or replace function public.get_sales_home_item_catalog_proposals(
    p_company_id uuid,
    p_property_id uuid,
    p_home_item_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.company_sales_context_matches_client_home(
        p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
    ) then raise exception 'Sales catalog access requires an active company client home.'; end if;
    perform set_config('barbarosa.sales_catalog_quote', 'allowed', true);
    return public.get_home_item_catalog_proposals(
        p_company_id, p_property_id, p_home_item_id,
        p_service_request_id, p_schedule_slot_id, p_job_id
    );
end;
$$;

create or replace function public.add_sales_home_item_catalog_product_to_quote_v2(
    p_company_id uuid,
    p_property_id uuid,
    p_home_item_id uuid,
    p_product_variant_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_estimate_category text default 'faucet_replacement',
    p_source text default 'provider_mode'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.company_sales_context_matches_client_home(
        p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
    ) then raise exception 'Sales quote access requires an active company client home.'; end if;
    perform set_config('barbarosa.sales_catalog_quote', 'allowed', true);
    return public.add_home_item_catalog_product_to_quote_v2(
        p_company_id, p_property_id, p_home_item_id, p_product_variant_id,
        p_service_request_id, p_schedule_slot_id, p_job_id, p_estimate_category, p_source
    );
end;
$$;

create or replace function public.add_sales_home_item_catalog_products_to_quote_v2(
    p_company_id uuid,
    p_property_id uuid,
    p_home_item_id uuid,
    p_product_variant_ids uuid[],
    p_estimate_categories text[],
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_source text default 'provider_mode'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.company_sales_context_matches_client_home(
        p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
    ) then raise exception 'Sales quote access requires an active company client home.'; end if;
    perform set_config('barbarosa.sales_catalog_quote', 'allowed', true);
    return public.add_home_item_catalog_products_to_quote_v2(
        p_company_id, p_property_id, p_home_item_id, p_product_variant_ids, p_estimate_categories,
        p_service_request_id, p_schedule_slot_id, p_job_id, p_source
    );
end;
$$;

create or replace function public.prevent_sales_tech_job_execution()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company_id uuid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
begin
    if not public.company_current_user_is_sales_tech(v_company_id) then
        if tg_op = 'DELETE' then return old; end if;
        return new;
    end if;
    if tg_op = 'DELETE' then raise exception 'Sales Tech cannot delete job workflows.'; end if;
    if lower(btrim(coalesce(new.status, ''))) not in ('presenting', 'accepted', 'sold', 'scheduled_later') then
        raise exception 'Sales Tech can author proposals but cannot start, execute, close, or publish technician work.';
    end if;
    if tg_op = 'UPDATE' and (
        new.technician_completed_at is distinct from old.technician_completed_at
        or new.completion_homeowner_name is distinct from old.completion_homeowner_name
        or new.completion_homeowner_signature is distinct from old.completion_homeowner_signature
        or new.completion_accepted_at is distinct from old.completion_accepted_at
        or new.invoice_sent_at is distinct from old.invoice_sent_at
        or new.payment_status is distinct from old.payment_status
        or new.closed_at is distinct from old.closed_at
        or new.completed_home_item_id is distinct from old.completed_home_item_id
        or new.homeos_item_update_payload is distinct from old.homeos_item_update_payload
        or new.homeos_item_update_reviewed_at is distinct from old.homeos_item_update_reviewed_at
        or new.homeos_item_update_reviewed_by_user_id is distinct from old.homeos_item_update_reviewed_by_user_id
    ) then raise exception 'Sales Tech cannot complete, close, invoice, or publish installed HomeOS work.'; end if;
    return new;
end;
$$;

drop trigger if exists company_job_workflows_prevent_sales_execution on public.company_job_workflows;
create trigger company_job_workflows_prevent_sales_execution
before insert or update or delete on public.company_job_workflows
for each row execute function public.prevent_sales_tech_job_execution();

revoke all on function public.company_role_default_permissions(text) from public, anon;
revoke all on function public.resolve_company_user_permissions_for_company(uuid,text,text,jsonb) from public, anon;
revoke all on function public.company_current_user_is_sales_tech(uuid) from public, anon;
revoke all on function public.company_estimate_options_can_use(uuid) from public, anon;
revoke all on function public.company_product_catalog_can_manage(uuid) from public, anon;
revoke all on function public.get_company_role_permission_profiles(uuid) from public, anon;
revoke all on function public.set_company_role_permission_profile(uuid,text,jsonb) from public, anon;
revoke all on function public.update_company_user_role(uuid,text) from public, anon;
revoke all on function public.company_sales_can_read_client_home(uuid,uuid) from public, anon, authenticated;
revoke all on function public.company_sales_context_matches_client_home(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.get_sales_company_homeos_items(uuid,uuid,uuid,uuid,uuid,text) from public, anon;
revoke all on function public.get_sales_home_item_catalog_proposals(uuid,uuid,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.add_sales_home_item_catalog_product_to_quote_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text) from public, anon;
revoke all on function public.add_sales_home_item_catalog_products_to_quote_v2(uuid,uuid,uuid,uuid[],text[],uuid,uuid,uuid,text) from public, anon;
revoke all on function public.prevent_sales_tech_job_execution() from public, anon, authenticated;

grant execute on function public.company_role_default_permissions(text) to authenticated;
grant execute on function public.resolve_company_user_permissions_for_company(uuid,text,text,jsonb) to authenticated;
grant execute on function public.company_current_user_is_sales_tech(uuid) to authenticated;
grant execute on function public.company_estimate_options_can_use(uuid) to authenticated;
grant execute on function public.company_product_catalog_can_manage(uuid) to authenticated;
grant execute on function public.get_company_role_permission_profiles(uuid) to authenticated;
grant execute on function public.set_company_role_permission_profile(uuid,text,jsonb) to authenticated;
grant execute on function public.update_company_user_role(uuid,text) to authenticated;
grant execute on function public.get_sales_company_homeos_items(uuid,uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.get_sales_home_item_catalog_proposals(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.add_sales_home_item_catalog_product_to_quote_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.add_sales_home_item_catalog_products_to_quote_v2(uuid,uuid,uuid,uuid[],text[],uuid,uuid,uuid,text) to authenticated;

commit;
