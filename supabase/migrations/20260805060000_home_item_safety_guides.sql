-- Property-scoped emergency location/photo/video guides for explicitly eligible
-- HomeOS safety items. Assigned providers may read or publish a complete guide
-- only through an active request, visit, or job context.

begin;

do $$
begin
    if to_regclass('public.home_items') is null then
        raise exception 'public.home_items is required before HomeOS safety guides can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null
       or to_regprocedure('public.homeos_can_mutate_property_record(uuid,uuid)') is null then
        raise exception 'HomeOS property authorization helpers are required before safety guides can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_provider_assigned_items(uuid,uuid,uuid,uuid,uuid)') is null then
        raise exception 'Assigned-provider authorization is required before safety guides can be installed.';
    end if;
end;
$$;

create table if not exists public.home_item_safety_guides (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references public.properties(id) on delete cascade,
    home_item_id uuid not null references public.home_items(id) on delete cascade,
    guide_kind text not null,
    location_description text not null,
    operation_instructions text not null,
    safety_warning text,
    storage_bucket text not null default 'item-files',
    photo_storage_path text not null,
    video_storage_path text not null,
    active boolean not null default true,
    created_by uuid not null references auth.users(id) on delete restrict,
    updated_by uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint home_item_safety_guides_one_per_item unique (property_id, home_item_id),
    constraint home_item_safety_guides_kind_check check (guide_kind = 'water_main_shutoff'),
    constraint home_item_safety_guides_bucket_check check (storage_bucket = 'item-files'),
    constraint home_item_safety_guides_required_text_check check (
        btrim(location_description) <> ''
        and btrim(operation_instructions) <> ''
        and btrim(photo_storage_path) <> ''
        and btrim(video_storage_path) <> ''
    )
);

create index if not exists home_item_safety_guides_property_idx
    on public.home_item_safety_guides(property_id, active, updated_at desc);

alter table public.home_item_safety_guides enable row level security;

drop policy if exists home_item_safety_guides_property_members_select
    on public.home_item_safety_guides;
create policy home_item_safety_guides_property_members_select
    on public.home_item_safety_guides
    for select
    to authenticated
    using (public.homeos_can_read_property_record(property_id));

create or replace function public.homeos_item_is_water_main_shutoff(p_home_item_id uuid, p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select exists (
        select 1
        from public.home_items as item
        cross join lateral (
            select lower(regexp_replace(
                concat_ws(' ', item.name, item.category, item.item_slug),
                '[^a-z0-9]+',
                ' ',
                'g'
            )) as identity
        ) as normalized
        where item.id = p_home_item_id
          and item.property_id = p_property_id
          and normalized.identity ~ '\mwater[[:space:]]+(main|service)\M'
          and normalized.identity ~ '\m(shut[[:space:]]*off|shutoff|stop[[:space:]]*valve)\M'
          and coalesce(item.archived, false) = false
    );
$$;

create or replace function public.get_home_item_safety_guide(
    p_property_id uuid,
    p_home_item_id uuid,
    p_company_id uuid default null,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns setof public.home_item_safety_guides
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Sign in to view this safety guide.' using errcode = '42501';
    end if;

    if not public.homeos_can_read_property_record(p_property_id)
       and not public.homeos_can_read_provider_assigned_items(
           p_company_id,
           p_property_id,
           p_service_request_id,
           p_schedule_slot_id,
           p_job_id
       ) then
        raise exception 'Not authorized to view this safety guide.' using errcode = '42501';
    end if;

    return query
    select guide.*
    from public.home_item_safety_guides as guide
    where guide.property_id = p_property_id
      and guide.home_item_id = p_home_item_id
      and guide.active = true;
end;
$$;

create or replace function public.upsert_home_item_safety_guide(
    p_property_id uuid,
    p_home_item_id uuid,
    p_guide_kind text,
    p_location_description text,
    p_operation_instructions text,
    p_safety_warning text,
    p_photo_storage_path text,
    p_video_storage_path text,
    p_company_id uuid default null,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns setof public.home_item_safety_guides
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_existing public.home_item_safety_guides%rowtype;
    v_is_home_member boolean := false;
    v_is_assigned_provider boolean := false;
begin
    if auth.uid() is null then
        raise exception 'Sign in to save this safety guide.' using errcode = '42501';
    end if;

    v_is_home_member := public.homeos_can_mutate_property_record(p_property_id, auth.uid());
    v_is_assigned_provider := public.homeos_can_read_provider_assigned_items(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    );

    if not v_is_home_member and not v_is_assigned_provider then
        raise exception 'Not authorized to save this safety guide.' using errcode = '42501';
    end if;

    if p_guide_kind <> 'water_main_shutoff'
       or not public.homeos_item_is_water_main_shutoff(p_home_item_id, p_property_id) then
        raise exception 'This HomeOS item is not an eligible water-main shutoff card.';
    end if;

    if btrim(coalesce(p_location_description, '')) = ''
       or btrim(coalesce(p_operation_instructions, '')) = ''
       or btrim(coalesce(p_photo_storage_path, '')) = ''
       or btrim(coalesce(p_video_storage_path, '')) = '' then
        raise exception 'Location, instructions, photo, and video are required before publishing.';
    end if;

    select guide.*
    into v_existing
    from public.home_item_safety_guides as guide
    where guide.property_id = p_property_id
      and guide.home_item_id = p_home_item_id;

    if v_existing.id is null or v_existing.photo_storage_path is distinct from p_photo_storage_path then
        if p_photo_storage_path not like ('users/' || auth.uid()::text || '/%') then
            raise exception 'The new location photo must belong to the signed-in uploader.' using errcode = '42501';
        end if;
    end if;

    if v_existing.id is null or v_existing.video_storage_path is distinct from p_video_storage_path then
        if p_video_storage_path not like ('users/' || auth.uid()::text || '/%') then
            raise exception 'The new location video must belong to the signed-in uploader.' using errcode = '42501';
        end if;
    end if;

    insert into public.home_item_safety_guides (
        property_id,
        home_item_id,
        guide_kind,
        location_description,
        operation_instructions,
        safety_warning,
        storage_bucket,
        photo_storage_path,
        video_storage_path,
        active,
        created_by,
        updated_by
    ) values (
        p_property_id,
        p_home_item_id,
        p_guide_kind,
        btrim(p_location_description),
        btrim(p_operation_instructions),
        nullif(btrim(coalesce(p_safety_warning, '')), ''),
        'item-files',
        p_photo_storage_path,
        p_video_storage_path,
        true,
        auth.uid(),
        auth.uid()
    )
    on conflict (property_id, home_item_id) do update set
        guide_kind = excluded.guide_kind,
        location_description = excluded.location_description,
        operation_instructions = excluded.operation_instructions,
        safety_warning = excluded.safety_warning,
        storage_bucket = excluded.storage_bucket,
        photo_storage_path = excluded.photo_storage_path,
        video_storage_path = excluded.video_storage_path,
        active = true,
        updated_by = auth.uid(),
        updated_at = now();

    return query
    select guide.*
    from public.home_item_safety_guides as guide
    where guide.property_id = p_property_id
      and guide.home_item_id = p_home_item_id;
end;
$$;

revoke all on table public.home_item_safety_guides from public, anon;
grant select on table public.home_item_safety_guides to authenticated;

revoke all on function public.homeos_item_is_water_main_shutoff(uuid,uuid) from public, anon, authenticated;
revoke all on function public.get_home_item_safety_guide(uuid,uuid,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.upsert_home_item_safety_guide(uuid,uuid,text,text,text,text,text,text,uuid,uuid,uuid,uuid) from public, anon;
grant execute on function public.get_home_item_safety_guide(uuid,uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.upsert_home_item_safety_guide(uuid,uuid,text,text,text,text,text,text,uuid,uuid,uuid,uuid) to authenticated;

commit;
