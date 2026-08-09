-- Add homeowner-provided property facts and a focused, durable construction
-- history. Event attachments reference existing HomeOS item files so this does
-- not create a second document store or collect deed/identity documents.

begin;

do $$
begin
    if to_regclass('public.properties') is null
       or to_regclass('public.property_memberships') is null
       or to_regclass('public.home_items') is null
       or to_regclass('public.home_item_files') is null
       or to_regclass('public.jobs') is null then
        raise exception 'Home profile construction history requires properties, property memberships, home items, home item files, and jobs.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null
       or to_regprocedure('public.homeos_can_mutate_property_record(uuid,uuid)') is null
       or to_regprocedure('public.homeos_is_platform_admin()') is null
       or to_regprocedure('public.homeos_can_read_provider_assigned_items(uuid,uuid,uuid,uuid,uuid)') is null then
        raise exception 'Home profile construction history requires the existing HomeOS authorization functions.';
    end if;
end;
$$;

alter table public.properties
    add column if not exists homeowner_year_built integer,
    add column if not exists homeowner_square_footage integer,
    add column if not exists homeowner_apn text,
    add column if not exists homeowner_major_upgrade_types text[] not null default array[]::text[],
    add column if not exists homeowner_profile_updated_at timestamptz,
    add column if not exists homeowner_profile_updated_by uuid references public.profiles(id) on delete set null;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'properties_homeowner_year_built_check'
          and conrelid = 'public.properties'::regclass
    ) then
        alter table public.properties add constraint properties_homeowner_year_built_check
        check (homeowner_year_built is null or homeowner_year_built between 1600 and 2200);
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'properties_homeowner_square_footage_check'
          and conrelid = 'public.properties'::regclass
    ) then
        alter table public.properties add constraint properties_homeowner_square_footage_check
        check (homeowner_square_footage is null or homeowner_square_footage between 1 and 1000000);
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'properties_homeowner_apn_length_check'
          and conrelid = 'public.properties'::regclass
    ) then
        alter table public.properties add constraint properties_homeowner_apn_length_check
        check (homeowner_apn is null or char_length(homeowner_apn) <= 100);
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'properties_homeowner_upgrade_types_check'
          and conrelid = 'public.properties'::regclass
    ) then
        alter table public.properties add constraint properties_homeowner_upgrade_types_check
        check (
            homeowner_major_upgrade_types <@ array[
                'pool', 'solar', 'roof', 'hvac', 'repipe', 'electrical'
            ]::text[]
        );
    end if;
end;
$$;

create table if not exists public.property_construction_events (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references public.properties(id) on delete cascade,
    created_by uuid not null references public.profiles(id) on delete restrict,
    event_type text not null,
    category text not null,
    title text not null,
    event_date date not null,
    date_precision text not null default 'exact',
    description text,
    home_item_id uuid references public.home_items(id) on delete set null,
    system text,
    installer_name text,
    service_company text,
    service_contact text,
    warranty_details text,
    related_job_id uuid references public.jobs(id) on delete set null,
    source text not null default 'homeowner_provided',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint property_construction_events_type_check check (
        event_type in ('installation', 'replacement', 'upgrade', 'addition', 'inspection', 'significant_repair')
    ),
    constraint property_construction_events_category_check check (
        category in ('pool', 'solar', 'roof', 'hvac', 'repipe', 'electrical', 'plumbing', 'structure', 'other')
    ),
    constraint property_construction_events_date_precision_check check (
        date_precision in ('exact', 'month', 'year')
    ),
    constraint property_construction_events_source_check check (
        source in ('homeowner_provided', 'company_documented')
    ),
    constraint property_construction_events_title_check check (
        char_length(btrim(title)) between 1 and 160
    ),
    constraint property_construction_events_description_check check (
        description is null or char_length(description) <= 8000
    ),
    constraint property_construction_events_installer_check check (
        installer_name is null or char_length(installer_name) <= 200
    ),
    constraint property_construction_events_service_company_check check (
        service_company is null or char_length(service_company) <= 200
    ),
    constraint property_construction_events_service_contact_check check (
        service_contact is null or char_length(service_contact) <= 300
    ),
    constraint property_construction_events_warranty_check check (
        warranty_details is null or char_length(warranty_details) <= 4000
    )
);

create index if not exists property_construction_events_property_date_idx
    on public.property_construction_events (property_id, event_date desc, created_at desc);
create index if not exists property_construction_events_home_item_idx
    on public.property_construction_events (home_item_id)
    where home_item_id is not null;
create index if not exists property_construction_events_job_idx
    on public.property_construction_events (related_job_id)
    where related_job_id is not null;

create table if not exists public.property_construction_event_files (
    event_id uuid not null references public.property_construction_events(id) on delete cascade,
    home_item_file_id uuid not null references public.home_item_files(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    created_by uuid not null references public.profiles(id) on delete restrict,
    created_at timestamptz not null default now(),
    primary key (event_id, home_item_file_id)
);

create index if not exists property_construction_event_files_property_idx
    on public.property_construction_event_files (property_id, event_id);

create or replace function public.touch_property_construction_event_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists property_construction_events_touch_updated_at
    on public.property_construction_events;
create trigger property_construction_events_touch_updated_at
before update on public.property_construction_events
for each row execute function public.touch_property_construction_event_updated_at();

create or replace function public.update_home_profile_details(
    p_property_id uuid,
    p_year_built integer,
    p_square_footage integer,
    p_apn text,
    p_major_upgrade_types text[]
)
returns table (property_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_apn text := nullif(btrim(coalesce(p_apn, '')), '');
    v_upgrade_types text[] := coalesce(p_major_upgrade_types, array[]::text[]);
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    if not exists (
        select 1 from public.property_memberships as membership
        where membership.property_id = p_property_id
          and membership.user_id = v_user_id
          and upper(btrim(coalesce(membership.role, ''))) = 'OWNER'
          and membership.status = 'active'
    ) then
        raise exception 'Not authorized to update this home profile' using errcode = '42501';
    end if;

    if p_year_built is not null and (p_year_built < 1600 or p_year_built > 2200) then
        raise exception 'Year built is outside the supported range' using errcode = '22023';
    end if;

    if p_square_footage is not null and (p_square_footage < 1 or p_square_footage > 1000000) then
        raise exception 'Square footage is outside the supported range' using errcode = '22023';
    end if;

    if char_length(coalesce(v_apn, '')) > 100 then
        raise exception 'APN is too long' using errcode = '22023';
    end if;

    if not v_upgrade_types <@ array['pool', 'solar', 'roof', 'hvac', 'repipe', 'electrical']::text[] then
        raise exception 'Major upgrade type is invalid' using errcode = '22023';
    end if;

    update public.properties as property
    set homeowner_year_built = p_year_built,
        homeowner_square_footage = p_square_footage,
        homeowner_apn = v_apn,
        homeowner_major_upgrade_types = v_upgrade_types,
        homeowner_profile_updated_at = now(),
        homeowner_profile_updated_by = v_user_id
    where property.id = p_property_id;

    return query select p_property_id;
end;
$$;

create or replace function public.homeos_can_read_company_home_profile(
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
    v_user_id uuid := auth.uid();
begin
    if v_user_id is null or p_company_id is null or p_property_id is null then
        return false;
    end if;

    if public.homeos_is_platform_admin() then
        return exists (
            select 1 from public.company_property_clients as company_client
            where company_client.company_id = p_company_id
              and company_client.property_id = p_property_id
              and lower(btrim(coalesce(company_client.status, ''))) not in (
                  'archived', 'cancelled', 'canceled', 'declined', 'inactive', 'revoked'
              )
        );
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

    return exists (
        select 1
        from public.company_users as company_user
        join public.company_property_clients as company_client
          on company_client.company_id = company_user.company_id
         and company_client.property_id = p_property_id
        where company_user.company_id = p_company_id
          and company_user.auth_user_id = v_user_id
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
          and lower(btrim(coalesce(company_client.status, ''))) not in (
              'archived', 'cancelled', 'canceled', 'declined', 'inactive', 'revoked'
          )
    );
end;
$$;

create or replace function public.homeos_can_read_company_construction_history(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select public.homeos_can_read_company_home_profile(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    )
    and exists (
        select 1
        from public.property_connections as property_connection
        where property_connection.company_id = p_company_id
          and property_connection.property_id = p_property_id
          and lower(btrim(coalesce(property_connection.status, ''))) = 'connected'
          and coalesce(property_connection.can_view_service_history, false) = true
    );
$$;

create or replace function public.get_company_home_profile(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns table (
    property_id uuid,
    name text,
    property_type text,
    address_line_1 text,
    address_line_2 text,
    city text,
    state text,
    postal_code text,
    country_code text,
    formatted_address text,
    latitude double precision,
    longitude double precision,
    google_place_id text,
    address_validation_status text,
    address_validated_at timestamptz,
    owner_display_name text,
    homeowner_year_built integer,
    homeowner_square_footage integer,
    homeowner_apn text,
    homeowner_major_upgrade_types text[],
    homeowner_profile_updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.homeos_can_read_company_home_profile(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then
        raise exception 'Not authorized to read this client home profile.';
    end if;

    return query
    select
        property.id,
        property.name::text,
        property.property_type::text,
        coalesce(property.address_line_1, property.address)::text,
        property.address_line_2::text,
        coalesce(property.city, '')::text,
        coalesce(property.state, '')::text,
        coalesce(property.postal_code, property.zip)::text,
        coalesce(property.country_code, '')::text,
        property.formatted_address::text,
        property.latitude,
        property.longitude,
        property.google_place_id::text,
        property.address_validation_status::text,
        property.address_validated_at,
        coalesce(nullif(btrim(owner_profile.full_name), ''), 'Homeowner')::text,
        property.homeowner_year_built,
        property.homeowner_square_footage,
        property.homeowner_apn,
        property.homeowner_major_upgrade_types,
        property.homeowner_profile_updated_at
    from public.properties as property
    left join public.profiles as owner_profile on owner_profile.id = property.owner_id
    where property.id = p_property_id;
end;
$$;

create or replace function public.get_company_construction_events(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_event_id uuid default null
)
returns table (
    id uuid,
    property_id uuid,
    event_type text,
    category text,
    title text,
    event_date date,
    date_precision text,
    description text,
    home_item_id uuid,
    home_item_slug text,
    home_item_name text,
    system text,
    installer_name text,
    service_company text,
    service_contact text,
    warranty_details text,
    related_job_id uuid,
    related_job_title text,
    related_job_status text,
    source text,
    created_at timestamptz,
    updated_at timestamptz,
    linked_files jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.homeos_can_read_company_construction_history(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then
        raise exception 'Construction history is not shared with this company.';
    end if;

    return query
    select
        event.id,
        event.property_id,
        event.event_type,
        event.category,
        event.title,
        event.event_date,
        event.date_precision,
        event.description,
        event.home_item_id,
        item.item_slug::text,
        item.name::text,
        event.system,
        event.installer_name,
        event.service_company,
        event.service_contact,
        event.warranty_details,
        event.related_job_id,
        job.title::text,
        job.status::text,
        event.source,
        event.created_at,
        event.updated_at,
        coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', file.id,
                'file_url', file.file_url,
                'file_name', file.file_name,
                'file_type', file.file_type,
                'category', file.category,
                'created_at', file.created_at
            ) order by file.created_at desc)
            from public.property_construction_event_files as link
            join public.home_item_files as file on file.id = link.home_item_file_id
            where link.event_id = event.id
              and link.property_id = event.property_id
              and exists (
                  select 1
                  from public.property_connections as file_connection
                  where file_connection.company_id = p_company_id
                    and file_connection.property_id = p_property_id
                    and lower(btrim(coalesce(file_connection.status, ''))) = 'connected'
                    and (
                        (file.file_type = 'photo' and coalesce(file_connection.can_view_photos, false))
                        or (file.file_type <> 'photo' and coalesce(file_connection.can_view_documents, false))
                    )
              )
        ), '[]'::jsonb)
    from public.property_construction_events as event
    left join public.home_items as item
      on item.id = event.home_item_id
     and item.property_id = event.property_id
    left join public.jobs as job
      on job.id = event.related_job_id
     and job.property_id = event.property_id
    where event.property_id = p_property_id
      and (p_event_id is null or event.id = p_event_id)
    order by event.event_date desc, event.created_at desc;
end;
$$;

alter table public.property_construction_events enable row level security;
alter table public.property_construction_event_files enable row level security;

revoke all on table public.property_construction_events from public, anon;
revoke all on table public.property_construction_event_files from public, anon;
grant select, insert, update, delete on table public.property_construction_events to authenticated;
grant select, insert, update, delete on table public.property_construction_event_files to authenticated;

drop policy if exists property_construction_events_member_select on public.property_construction_events;
create policy property_construction_events_member_select
on public.property_construction_events for select to authenticated
using (public.homeos_can_read_property_record(property_id));

drop policy if exists property_construction_events_member_insert on public.property_construction_events;
create policy property_construction_events_member_insert
on public.property_construction_events for insert to authenticated
with check (
    public.homeos_can_mutate_property_record(property_id, created_by)
    and (home_item_id is null or exists (
        select 1 from public.home_items as item
        where item.id = public.property_construction_events.home_item_id
          and item.property_id = public.property_construction_events.property_id
    ))
    and (related_job_id is null or exists (
        select 1 from public.jobs as job
        where job.id = public.property_construction_events.related_job_id
          and job.property_id = public.property_construction_events.property_id
    ))
);

drop policy if exists property_construction_events_member_update on public.property_construction_events;
create policy property_construction_events_member_update
on public.property_construction_events for update to authenticated
using (public.homeos_can_mutate_property_record(property_id, created_by))
with check (
    public.homeos_can_mutate_property_record(property_id, created_by)
    and (home_item_id is null or exists (
        select 1 from public.home_items as item
        where item.id = public.property_construction_events.home_item_id
          and item.property_id = public.property_construction_events.property_id
    ))
    and (related_job_id is null or exists (
        select 1 from public.jobs as job
        where job.id = public.property_construction_events.related_job_id
          and job.property_id = public.property_construction_events.property_id
    ))
);

drop policy if exists property_construction_events_member_delete on public.property_construction_events;
create policy property_construction_events_member_delete
on public.property_construction_events for delete to authenticated
using (public.homeos_can_mutate_property_record(property_id, created_by));

drop policy if exists property_construction_event_files_member_select on public.property_construction_event_files;
create policy property_construction_event_files_member_select
on public.property_construction_event_files for select to authenticated
using (public.homeos_can_read_property_record(property_id));

drop policy if exists property_construction_event_files_member_insert on public.property_construction_event_files;
create policy property_construction_event_files_member_insert
on public.property_construction_event_files for insert to authenticated
with check (
    public.homeos_can_mutate_property_record(property_id, created_by)
    and exists (
        select 1 from public.property_construction_events as event
        where event.id = public.property_construction_event_files.event_id
          and event.property_id = public.property_construction_event_files.property_id
    )
    and exists (
        select 1 from public.home_item_files as file
        where file.id = public.property_construction_event_files.home_item_file_id
          and file.property_id = public.property_construction_event_files.property_id
    )
);

drop policy if exists property_construction_event_files_member_delete on public.property_construction_event_files;
create policy property_construction_event_files_member_delete
on public.property_construction_event_files for delete to authenticated
using (public.homeos_can_mutate_property_record(property_id, created_by));

revoke all on function public.update_home_profile_details(uuid, integer, integer, text, text[]) from public, anon;
grant execute on function public.update_home_profile_details(uuid, integer, integer, text, text[]) to authenticated;

revoke all on function public.homeos_can_read_company_home_profile(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.homeos_can_read_company_construction_history(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

revoke all on function public.get_company_home_profile(uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.get_company_home_profile(uuid, uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.get_company_construction_events(uuid, uuid, uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.get_company_construction_events(uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;

revoke all on function public.touch_property_construction_event_updated_at() from public, anon;

notify pgrst, 'reload schema';

commit;
