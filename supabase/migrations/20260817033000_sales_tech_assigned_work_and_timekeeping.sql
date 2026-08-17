-- Scope Sales Tech to explicitly dispatched sales visits, add a distinct
-- server-validated Sales Visit scheduler, and persist per-user hourly/salaried
-- timekeeping without broadening technician execution or company admin access.

begin;

do $$
begin
    if to_regclass('public.company_users') is null
       or to_regclass('public.job_schedule_slots') is null
       or to_regclass('public.service_requests') is null
       or to_regclass('public.company_property_clients') is null
       or to_regclass('public.properties') is null then
        raise exception 'Company users, scheduling, requests, clients, and properties are required.';
    end if;
end;
$$;

alter table public.company_users
    add column if not exists pay_basis text;

update public.company_users
set pay_basis = case
    when lower(btrim(coalesce(role, ''))) in ('technician', 'tech', 'sales') then 'hourly'
    else 'salaried'
end
where pay_basis is null;

alter table public.company_users
    alter column pay_basis set not null;

alter table public.company_users
    drop constraint if exists company_users_pay_basis_check;
alter table public.company_users
    add constraint company_users_pay_basis_check
    check (pay_basis in ('hourly', 'salaried'));

create or replace function public.set_company_user_default_pay_basis()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if new.pay_basis is null then
        new.pay_basis := case
            when lower(btrim(coalesce(new.role, ''))) in ('technician', 'tech', 'sales') then 'hourly'
            else 'salaried'
        end;
    end if;
    return new;
end;
$$;

drop trigger if exists company_users_default_pay_basis on public.company_users;
create trigger company_users_default_pay_basis
before insert on public.company_users
for each row execute function public.set_company_user_default_pay_basis();

alter table public.job_schedule_slots
    add column if not exists assignment_kind text not null default 'field_service';

alter table public.job_schedule_slots
    drop constraint if exists job_schedule_slots_assignment_kind_check;
alter table public.job_schedule_slots
    add constraint job_schedule_slots_assignment_kind_check
    check (assignment_kind in ('field_service', 'sales_visit'));

create index if not exists job_schedule_slots_sales_assignment_idx
on public.job_schedule_slots (company_id, technician_company_user_id, start_at)
where assignment_kind = 'sales_visit';

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
                'can_view_customers', false,
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

create or replace function public.get_current_company_timekeeping_policy(p_company_id uuid)
returns table (
    company_user_id uuid,
    company_id uuid,
    role text,
    pay_basis text,
    clock_required boolean,
    clock_available boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    return query
    select
        company_user.id,
        company_user.company_id,
        company_user.role,
        company_user.pay_basis,
        company_user.pay_basis = 'hourly',
        true
    from public.company_users company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at asc nulls last, company_user.id asc
    limit 1;
end;
$$;

create or replace function public.get_company_user_timekeeping_policies(p_company_id uuid)
returns table (
    company_user_id uuid,
    company_id uuid,
    role text,
    pay_basis text,
    clock_required boolean,
    clock_available boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.can_manage_company_users(p_company_id) then raise exception 'Not authorized'; end if;

    return query
    select
        company_user.id,
        company_user.company_id,
        company_user.role,
        company_user.pay_basis,
        company_user.pay_basis = 'hourly',
        true
    from public.company_users company_user
    where company_user.company_id = p_company_id
    order by company_user.full_name asc nulls last, company_user.created_at asc nulls last, company_user.id asc;
end;
$$;

create or replace function public.set_company_user_pay_basis(
    p_company_user_id uuid,
    p_pay_basis text
)
returns table (
    company_user_id uuid,
    company_id uuid,
    role text,
    pay_basis text,
    clock_required boolean,
    clock_available boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company_user public.company_users%rowtype;
    v_pay_basis text := lower(btrim(coalesce(p_pay_basis, '')));
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if v_pay_basis not in ('hourly', 'salaried') then raise exception 'Pay basis must be hourly or salaried.'; end if;

    select * into v_company_user
    from public.company_users company_user
    where company_user.id = p_company_user_id
    for update;
    if not found then raise exception 'Company user not found.'; end if;
    if not public.can_manage_company_users(v_company_user.company_id) then raise exception 'Not authorized'; end if;

    update public.company_users company_user
    set pay_basis = v_pay_basis,
        updated_at = now()
    where company_user.id = v_company_user.id;

    return query
    select
        company_user.id,
        company_user.company_id,
        company_user.role,
        company_user.pay_basis,
        company_user.pay_basis = 'hourly',
        true
    from public.company_users company_user
    where company_user.id = v_company_user.id;
end;
$$;

create or replace function public.get_company_users_for_dispatch(p_company_id uuid)
returns table (
    id uuid,
    company_id uuid,
    auth_user_id uuid,
    full_name text,
    email text,
    role text,
    status text,
    created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if p_company_id is null then raise exception 'company_id is required'; end if;
    if not public.can_dispatch_company_operations(p_company_id) then
        raise exception 'Not authorized to view dispatch roster for this company.';
    end if;

    return query
    select
        company_user.id,
        company_user.company_id,
        company_user.auth_user_id,
        company_user.full_name,
        company_user.email,
        company_user.role,
        company_user.status,
        company_user.created_at
    from public.company_users company_user
    where company_user.company_id = p_company_id
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
      and lower(btrim(coalesce(company_user.role, ''))) in (
          'owner', 'admin', 'manager', 'office', 'dispatcher', 'dispatch',
          'supervisor', 'sales', 'technician', 'tech', 'field_tech',
          'field-tech', 'field technician'
      )
    order by
        case
            when lower(btrim(coalesce(company_user.role, ''))) in ('technician', 'tech', 'field_tech', 'field-tech', 'field technician') then 0
            when lower(btrim(coalesce(company_user.role, ''))) = 'sales' then 1
            else 2
        end,
        company_user.full_name asc nulls last,
        company_user.email asc nulls last,
        company_user.created_at asc nulls last,
        company_user.id asc;
end;
$$;

create or replace function public.schedule_sales_service_request_slot(
    p_company_id uuid,
    p_service_request_id uuid,
    p_sales_company_user_id uuid,
    p_start_at timestamptz,
    p_end_at timestamptz,
    p_arrival_window_start timestamptz default null,
    p_arrival_window_end timestamptz default null,
    p_estimated_duration_minutes integer default 60,
    p_priority text default 'normal',
    p_notes text default null,
    p_assignment_kind text default null
)
returns public.job_schedule_slots
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_slot public.job_schedule_slots%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if lower(btrim(coalesce(p_assignment_kind, ''))) <> 'sales_visit' then
        raise exception 'An explicit Sales Visit assignment is required.';
    end if;
    if p_company_id is null or p_service_request_id is null or p_sales_company_user_id is null then
        raise exception 'Company, service request, and Sales Tech are required.';
    end if;
    if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
        raise exception 'A valid start and end time are required.';
    end if;
    if coalesce(p_estimated_duration_minutes, 60) <= 0 then
        raise exception 'Estimated duration must be greater than zero.';
    end if;
    if not public.can_dispatch_company(p_company_id) and not public.can_manage_company_users(p_company_id) then
        raise exception 'Not authorized to schedule sales work for this company.';
    end if;
    if not exists (
        select 1 from public.company_users company_user
        where company_user.id = p_sales_company_user_id
          and company_user.company_id = p_company_id
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
          and lower(btrim(coalesce(company_user.role, ''))) = 'sales'
    ) then raise exception 'Active Sales Tech not found for this company.'; end if;

    select request.* into v_request
    from public.service_requests request
    where request.id = p_service_request_id
      and request.company_id = p_company_id
    for update;
    if not found then raise exception 'Service request not found for this company.'; end if;

    select slot.* into v_slot
    from public.job_schedule_slots slot
    where slot.company_id = p_company_id
      and slot.service_request_id = p_service_request_id
      and slot.visit_closed_at is null
      and lower(btrim(coalesce(slot.status, ''))) not in ('cancelled', 'completed', 'archived')
    order by slot.updated_at desc nulls last, slot.start_at desc, slot.id desc
    limit 1
    for update;

    if exists (
        select 1 from public.job_schedule_slots slot
        where slot.company_id = p_company_id
          and slot.service_request_id is distinct from p_service_request_id
          and slot.technician_company_user_id = p_sales_company_user_id
          and lower(btrim(coalesce(slot.status, ''))) not in ('cancelled', 'completed', 'archived')
          and tstzrange(slot.start_at, slot.end_at, '[)') && tstzrange(p_start_at, p_end_at, '[)')
    ) then raise exception 'Sales Tech already has scheduled work during this time.'; end if;

    if v_slot.id is not null then
        update public.job_schedule_slots slot
        set technician_company_user_id = p_sales_company_user_id,
            assignment_kind = 'sales_visit',
            start_at = p_start_at,
            end_at = p_end_at,
            arrival_window_start = p_arrival_window_start,
            arrival_window_end = p_arrival_window_end,
            status = 'scheduled',
            estimated_duration_minutes = coalesce(p_estimated_duration_minutes, 60),
            priority = lower(btrim(coalesce(p_priority, 'normal'))),
            notes = nullif(btrim(coalesce(p_notes, '')), ''),
            updated_by_user_id = auth.uid(),
            updated_at = now()
        where slot.id = v_slot.id
        returning slot.* into v_slot;
    else
        insert into public.job_schedule_slots (
            company_id, service_request_id, technician_company_user_id, assignment_kind,
            start_at, end_at, arrival_window_start, arrival_window_end, status,
            estimated_duration_minutes, priority, notes, created_by_user_id, updated_by_user_id
        ) values (
            p_company_id, p_service_request_id, p_sales_company_user_id, 'sales_visit',
            p_start_at, p_end_at, p_arrival_window_start, p_arrival_window_end, 'scheduled',
            coalesce(p_estimated_duration_minutes, 60), lower(btrim(coalesce(p_priority, 'normal'))),
            nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), auth.uid()
        ) returning * into v_slot;
    end if;

    update public.service_requests request
    set status = 'scheduled', updated_at = now()
    where request.id = v_request.id
      and request.company_id = p_company_id
      and lower(btrim(coalesce(request.status, ''))) in ('new', 'acknowledged', 'scheduled');

    return v_slot;
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
           from public.company_users company_user
           join public.job_schedule_slots slot
             on slot.company_id = company_user.company_id
            and slot.technician_company_user_id = company_user.id
            and slot.assignment_kind = 'sales_visit'
           left join public.service_requests request
             on request.id = slot.service_request_id
            and request.company_id = slot.company_id
           left join public.jobs job
             on job.id = slot.job_id
            and job.company_id = slot.company_id
           where company_user.company_id = p_company_id
             and company_user.auth_user_id = auth.uid()
             and lower(btrim(coalesce(company_user.status, ''))) = 'active'
             and lower(btrim(coalesce(company_user.role, ''))) = 'sales'
             and lower(btrim(coalesce(slot.status, ''))) not in ('cancelled', 'canceled', 'archived')
             and (request.property_id = p_property_id or job.property_id = p_property_id)
       )
       and exists (
           select 1 from public.company_property_clients company_client
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
declare
    v_company_user_id uuid;
begin
    if p_service_request_id is null and p_schedule_slot_id is null and p_job_id is null then return false; end if;
    if not public.company_sales_can_read_client_home(p_company_id, p_property_id) then return false; end if;

    select company_user.id into v_company_user_id
    from public.company_users company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
      and lower(btrim(coalesce(company_user.role, ''))) = 'sales'
    order by company_user.created_at asc nulls last, company_user.id asc
    limit 1;

    if p_service_request_id is not null and not exists (
        select 1
        from public.service_requests request
        join public.job_schedule_slots slot
          on slot.service_request_id = request.id
         and slot.company_id = request.company_id
        where request.id = p_service_request_id
          and request.company_id = p_company_id
          and request.property_id = p_property_id
          and slot.technician_company_user_id = v_company_user_id
          and slot.assignment_kind = 'sales_visit'
          and (p_schedule_slot_id is null or slot.id = p_schedule_slot_id)
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
          and slot.technician_company_user_id = v_company_user_id
          and slot.assignment_kind = 'sales_visit'
          and (p_service_request_id is null or slot.service_request_id = p_service_request_id)
          and (p_job_id is null or slot.job_id = p_job_id)
          and (request.property_id = p_property_id or job.property_id = p_property_id)
    ) then return false; end if;

    if p_job_id is not null and not exists (
        select 1
        from public.jobs job
        join public.job_schedule_slots slot
          on slot.job_id = job.id
         and slot.company_id = job.company_id
        where job.id = p_job_id
          and job.company_id = p_company_id
          and job.property_id = p_property_id
          and slot.technician_company_user_id = v_company_user_id
          and slot.assignment_kind = 'sales_visit'
          and (p_schedule_slot_id is null or slot.id = p_schedule_slot_id)
    ) then return false; end if;

    return true;
end;
$$;

create or replace function public.sales_scoped_property_can_read(p_property_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_auth_user_id uuid := auth.uid();
begin
    if v_auth_user_id is null or p_property_id is null then return false; end if;
    if public.homeos_is_platform_admin()
       or public.homeos_has_active_property_membership(p_property_id)
       or exists (
           select 1 from public.properties property
           where property.id = p_property_id and property.owner_id = v_auth_user_id
       ) then return true; end if;

    if exists (
        select 1 from public.properties property
        where property.id = p_property_id
          and property.company_id is not null
          and public.is_active_company_member(property.company_id)
          and (
              not public.company_current_user_is_sales_tech(property.company_id)
              or public.company_sales_can_read_client_home(property.company_id, p_property_id)
          )
    ) then return true; end if;

    return exists (
        select 1 from public.company_property_clients company_client
        where company_client.property_id = p_property_id
          and lower(btrim(coalesce(company_client.status, ''))) not in (
              'archived', 'cancelled', 'canceled', 'declined', 'inactive', 'revoked'
          )
          and public.is_active_company_member(company_client.company_id)
          and (
              not public.company_current_user_is_sales_tech(company_client.company_id)
              or public.company_sales_can_read_client_home(company_client.company_id, p_property_id)
          )
    );
end;
$$;

alter table public.properties enable row level security;

drop policy if exists properties_select_sales_scoped_current on public.properties;
create policy properties_select_sales_scoped_current
on public.properties
for select
to authenticated
using (public.sales_scoped_property_can_read(properties.id));

drop policy if exists properties_insert_non_sales_authorized on public.properties;
create policy properties_insert_non_sales_authorized
on public.properties
for insert
to authenticated
with check (
    public.homeos_is_platform_admin()
    or (
        not exists (
            select 1 from public.company_users company_user
            where company_user.auth_user_id = auth.uid()
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
              and lower(btrim(coalesce(company_user.role, ''))) = 'sales'
        )
        and (
            properties.owner_id = auth.uid()
            or (
                properties.company_id is not null
                and public.is_active_company_member(properties.company_id)
            )
        )
    )
);

drop policy if exists properties_update_non_sales_authorized on public.properties;
create policy properties_update_non_sales_authorized
on public.properties
for update
to authenticated
using (
    public.sales_scoped_property_can_read(properties.id)
    and (
        public.homeos_is_platform_admin()
        or not exists (
            select 1 from public.company_users company_user
            where company_user.auth_user_id = auth.uid()
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
              and lower(btrim(coalesce(company_user.role, ''))) = 'sales'
        )
    )
)
with check (
    public.sales_scoped_property_can_read(properties.id)
    and (
        public.homeos_is_platform_admin()
        or not exists (
            select 1 from public.company_users company_user
            where company_user.auth_user_id = auth.uid()
              and lower(btrim(coalesce(company_user.status, ''))) = 'active'
              and lower(btrim(coalesce(company_user.role, ''))) = 'sales'
        )
    )
);

drop policy if exists company_property_clients_restrict_sales_to_assignments on public.company_property_clients;
create policy company_property_clients_restrict_sales_to_assignments
on public.company_property_clients
as restrictive
for select
to authenticated
using (
    public.homeos_is_platform_admin()
    or not public.company_current_user_is_sales_tech(company_property_clients.company_id)
    or public.company_sales_can_read_client_home(
        company_property_clients.company_id,
        company_property_clients.property_id
    )
);

revoke all on function public.set_company_user_default_pay_basis() from public, anon, authenticated;
revoke all on function public.company_role_default_permissions(text) from public, anon;
revoke all on function public.resolve_company_user_permissions_for_company(uuid,text,text,jsonb) from public, anon;
revoke all on function public.set_company_role_permission_profile(uuid,text,jsonb) from public, anon;
revoke all on function public.get_current_company_timekeeping_policy(uuid) from public, anon;
revoke all on function public.get_company_user_timekeeping_policies(uuid) from public, anon;
revoke all on function public.set_company_user_pay_basis(uuid,text) from public, anon;
revoke all on function public.get_company_users_for_dispatch(uuid) from public, anon;
revoke all on function public.schedule_sales_service_request_slot(
    uuid,uuid,uuid,timestamptz,timestamptz,timestamptz,timestamptz,integer,text,text,text
) from public, anon;
revoke all on function public.company_sales_can_read_client_home(uuid,uuid) from public, anon, authenticated;
revoke all on function public.company_sales_context_matches_client_home(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.sales_scoped_property_can_read(uuid) from public, anon;

grant execute on function public.company_role_default_permissions(text) to authenticated;
grant execute on function public.resolve_company_user_permissions_for_company(uuid,text,text,jsonb) to authenticated;
grant execute on function public.set_company_role_permission_profile(uuid,text,jsonb) to authenticated;
grant execute on function public.get_current_company_timekeeping_policy(uuid) to authenticated;
grant execute on function public.get_company_user_timekeeping_policies(uuid) to authenticated;
grant execute on function public.set_company_user_pay_basis(uuid,text) to authenticated;
grant execute on function public.get_company_users_for_dispatch(uuid) to authenticated;
grant execute on function public.schedule_sales_service_request_slot(
    uuid,uuid,uuid,timestamptz,timestamptz,timestamptz,timestamptz,integer,text,text,text
) to authenticated;
grant execute on function public.company_sales_can_read_client_home(uuid,uuid) to authenticated;
grant execute on function public.sales_scoped_property_can_read(uuid) to authenticated;

commit;
