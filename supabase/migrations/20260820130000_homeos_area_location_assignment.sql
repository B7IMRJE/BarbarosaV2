-- Keep a movable HomeOS area as one canonical row while preserving the
-- established text placement snapshot used by existing HomeOS routes.
-- This migration is additive: legacy Area rows keep a NULL placement state
-- until an explicit location action is taken.

begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regclass('public.properties') is null
       or to_regprocedure('public.homeos_has_active_property_membership(uuid)') is null
       or to_regprocedure('public.homeos_can_mutate_property_record(uuid,uuid)') is null
       or to_regprocedure('public.homeos_item_placement_identity(text,text,text,text,text)') is null
       or to_regprocedure('public.homeos_starter_identity(text)') is null
       or to_regprocedure('public.provision_complete_room_starter_cards(uuid)') is null
       or to_regprocedure('public.sync_complete_room_starter_cards()') is null
       or not exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'home_items'
             and column_name = 'parent_home_item_id'
       ) then
        raise exception 'HomeOS area location assignment requires the property, placement identity, and instance-parent foundations.';
    end if;
end;
$$;

alter table public.home_items
    add column if not exists area_placement_state text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint constraint_row
        where constraint_row.conrelid = 'public.home_items'::regclass
          and constraint_row.conname = 'home_items_area_placement_state_check'
    ) then
        alter table public.home_items
            add constraint home_items_area_placement_state_check
            check (
                area_placement_state is null
                or (
                    lower(btrim(coalesce(category, ''))) = 'area'
                    and area_placement_state in ('unassigned', 'standalone', 'inside_area')
                )
            );
    end if;
end;
$$;

create index if not exists home_items_property_active_area_placement_state_idx
    on public.home_items(property_id, area_placement_state, parent_area)
    where lower(btrim(coalesce(category, ''))) = 'area'
      and coalesce(archived, false) = false;

-- Adopt only a uniquely identifiable Laundry Area per property. It may
-- already have a legacy parent_area snapshot; its unassigned state means the
-- canonical location still needs explicit confirmation, not that history is
-- silently reparented. Ambiguous legacy duplicates remain NULL/untouched.
with active_laundry as (
    select
        area.id,
        count(*) over (partition by area.property_id) as active_laundry_count
    from public.home_items area
    where lower(btrim(coalesce(area.category, ''))) = 'area'
      and coalesce(area.archived, false) = false
      and public.homeos_starter_identity(area.name) in ('laundry', 'laundry room')
)
update public.home_items area
set area_placement_state = 'unassigned'
from active_laundry laundry
where area.id = laundry.id
  and laundry.active_laundry_count = 1
  and area.area_placement_state is null;

-- Serialize active direct-root placement writes with Area moves. A row trigger
-- already runs after its row lock is held, so it must never wait on the Area
-- lock (that would invert the move's property-lock -> row-lock order). A
-- competing writer fails fast with a retryable serialization error instead.
create or replace function public.homeos_lock_area_location_root_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_old_lock_key bigint;
    v_new_lock_key bigint;
    v_first_lock_key bigint;
    v_second_lock_key bigint;
begin
    if tg_op = 'UPDATE'
       and old.property_id is not null
       and lower(btrim(coalesce(old.category, ''))) <> 'area'
       and old.parent_home_item_id is null
       and coalesce(old.archived, false) = false then
        v_old_lock_key := hashtextextended(
            'homeos-area-location|' || old.property_id::text,
            0
        );
    end if;

    if new.property_id is not null
       and lower(btrim(coalesce(new.category, ''))) <> 'area'
       and new.parent_home_item_id is null
       and coalesce(new.archived, false) = false then
        v_new_lock_key := hashtextextended(
            'homeos-area-location|' || new.property_id::text,
            0
        );
    end if;

    if v_old_lock_key is null and v_new_lock_key is null then
        return new;
    end if;

    if v_old_lock_key is null then
        v_first_lock_key := v_new_lock_key;
    elsif v_new_lock_key is null then
        v_first_lock_key := v_old_lock_key;
    else
        v_first_lock_key := least(v_old_lock_key, v_new_lock_key);
        v_second_lock_key := greatest(v_old_lock_key, v_new_lock_key);
    end if;

    if not pg_try_advisory_xact_lock(v_first_lock_key) then
        raise exception 'This HomeOS Area location is changing. Retry the container update.' using errcode = '40001';
    end if;

    if v_second_lock_key is not null
       and v_second_lock_key <> v_first_lock_key
       and not pg_try_advisory_xact_lock(v_second_lock_key) then
        raise exception 'This HomeOS Area location is changing. Retry the container update.' using errcode = '40001';
    end if;

    return new;
end;
$$;

drop trigger if exists home_items_lock_area_location_root_write on public.home_items;
create trigger home_items_lock_area_location_root_write
before insert or update
on public.home_items
for each row
execute function public.homeos_lock_area_location_root_write();

-- Preserve the established complete-room synchronization behavior, except
-- while the dedicated Area move RPC is changing its compatibility snapshot.
-- A location assignment must never provision a new room deck as a side effect.
create or replace function public.sync_complete_room_starter_cards()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if coalesce(current_setting('barbarosa.homeos_area_location_write', true), '') = 'allowed' then
        return new;
    end if;

    if tg_op = 'UPDATE' and old.name is distinct from new.name
       and lower(btrim(new.category)) = 'area'
       and nullif(btrim(coalesce(new.parent_area, '')), '') is null then
        update public.home_items item
        set location = new.name
        where item.property_id = new.property_id
          and item.id <> new.id
          and lower(btrim(item.category)) <> 'area'
          and public.homeos_starter_identity(item.location) = public.homeos_starter_identity(old.name)
          and nullif(btrim(coalesce(item.parent_area, '')), '') is null;

        update public.home_items item
        set parent_area = new.name
        where item.property_id = new.property_id
          and item.id <> new.id
          and lower(btrim(item.category)) <> 'area'
          and public.homeos_starter_identity(item.parent_area) = public.homeos_starter_identity(old.name);
    end if;

    perform public.provision_complete_room_starter_cards(new.id);
    return new;
end;
$$;

-- Explicit placement state is guarded for every writer. Legacy rows with a
-- NULL state retain non-placement compatibility, but not raw relocation.
create or replace function public.homeos_validate_area_location_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_state text := nullif(lower(btrim(coalesce(new.area_placement_state, ''))), '');
    v_parent_identity text := public.homeos_starter_identity(new.parent_area);
    v_host_count integer := 0;
    v_host_id uuid;
begin
    -- An active host cannot disappear while a confirmed child Area still
    -- points to it. Conversely, archiving an assigned child must not depend on
    -- its host still being available, so successful active-to-archived Area
    -- writes return before the active-host and explicit-move validations.
    if tg_op = 'UPDATE'
       and lower(btrim(coalesce(old.category, ''))) = 'area'
       and not coalesce(old.archived, false)
       and coalesce(new.archived, false) then
        if exists (
            select 1
            from public.home_items child_area
            where child_area.property_id = new.property_id
              and child_area.id is distinct from new.id
              and lower(btrim(coalesce(child_area.category, ''))) = 'area'
              and coalesce(child_area.archived, false) = false
              and child_area.area_placement_state = 'inside_area'
              and public.homeos_starter_identity(child_area.parent_area) = public.homeos_starter_identity(new.name)
        ) then
            raise exception 'Archive assigned child Areas before archiving their host Area.' using errcode = '23514';
        end if;
    end if;

    -- Category transitions in either direction and existing-Area property
    -- changes have no safe compatibility update: they can bypass Area guards
    -- or move history across properties. A dedicated atomic workflow is
    -- required before either identity may change.
    if tg_op = 'UPDATE'
       and (
           (
               (
                   lower(btrim(coalesce(old.category, ''))) = 'area'
                   or lower(btrim(coalesce(new.category, ''))) = 'area'
               )
               and lower(btrim(coalesce(old.category, ''))) is distinct from lower(btrim(coalesce(new.category, '')))
           )
           or (
               lower(btrim(coalesce(old.category, ''))) = 'area'
               and old.property_id is distinct from new.property_id
           )
       ) then
        raise exception 'Area identity changes require a dedicated atomic workflow.' using errcode = '42501';
    end if;

    if tg_op = 'UPDATE'
       and lower(btrim(coalesce(old.category, ''))) = 'area'
       and not coalesce(old.archived, false)
       and coalesce(new.archived, false) then
        if public.homeos_starter_identity(old.name) is distinct from public.homeos_starter_identity(new.name) then
            raise exception 'Area identity changes require a dedicated atomic workflow.' using errcode = '42501';
        end if;

        if old.parent_area is distinct from new.parent_area
           or old.area_placement_state is distinct from new.area_placement_state then
            raise exception 'Archive an Area without changing its placement snapshot.' using errcode = '42501';
        end if;

        return new;
    end if;

    if lower(btrim(coalesce(new.category, ''))) <> 'area' then
        if new.area_placement_state is not null then
            raise exception 'Only Area cards can have an area placement state.' using errcode = '23514';
        end if;
        return new;
    end if;

    -- Every newly inserted Laundry starts as one unassigned canonical Area,
    -- regardless of its legacy text placement. This lets one lock protect the
    -- Laundry/Laundry Room alias family across all placements.
    if tg_op = 'INSERT'
       and v_state is null
       and public.homeos_starter_identity(new.name) in ('laundry', 'laundry room') then
        v_state := 'unassigned';
        new.area_placement_state := v_state;
    end if;

    -- Laundry and Laundry Room are one canonical Area family per property,
    -- even for legacy NULL-state rows and reactivations. The lock makes the
    -- all-writer check safe for concurrent root and nested inserts.
    if not coalesce(new.archived, false)
       and new.property_id is not null
       and public.homeos_starter_identity(new.name) in ('laundry', 'laundry room') then
        perform pg_advisory_xact_lock(hashtextextended(
            'homeos-canonical-area|' || new.property_id::text || '|laundry-laundry-room',
            0
        ));

        if exists (
            select 1
            from public.home_items existing_laundry
            where existing_laundry.property_id = new.property_id
              and existing_laundry.id is distinct from new.id
              and lower(btrim(coalesce(existing_laundry.category, ''))) = 'area'
              and coalesce(existing_laundry.archived, false) = false
              and public.homeos_starter_identity(existing_laundry.name) in ('laundry', 'laundry room')
        ) then
            raise exception 'One active Laundry Area already exists for this property.'
                using errcode = '23505',
                      constraint = 'home_items_property_canonical_laundry_area_key';
        end if;
    end if;

    -- Name identity drives all legacy location snapshots. Until a dedicated
    -- rename workflow can update those roots atomically, identity-changing
    -- Area renames are rejected. Cosmetic changes with the same normalized
    -- identity remain compatible.
    if tg_op = 'UPDATE'
       and lower(btrim(coalesce(old.category, ''))) = 'area'
       and public.homeos_starter_identity(old.name) is distinct from public.homeos_starter_identity(new.name) then
        raise exception 'Area identity changes require a dedicated atomic workflow.' using errcode = '42501';
    end if;

    -- Legacy Areas may keep a NULL placement state for compatibility, but a
    -- raw parent change would detach their direct containers. Ordinary
    -- non-placement edits remain valid; only the atomic move path may change
    -- this placement snapshot.
    if tg_op = 'UPDATE'
       and v_state is null
       and not coalesce(new.archived, false)
       and old.parent_area is distinct from new.parent_area
       and coalesce(current_setting('barbarosa.homeos_area_location_write', true), '') <> 'allowed' then
        raise exception 'Move an Area through move_homeowner_property_area so its direct containers stay attached.' using errcode = '42501';
    end if;

    if v_state is null then
        return new;
    end if;

    if v_state not in ('unassigned', 'standalone', 'inside_area') then
        raise exception 'Choose unassigned, standalone, or inside_area for an Area location.' using errcode = '22023';
    end if;

    -- Explicit moves must go through the atomic RPC so direct containers move
    -- with the Area. Inserts may receive the default unassigned Laundry state.
    if tg_op = 'UPDATE'
       and (
           old.area_placement_state is distinct from new.area_placement_state
           or (
               new.area_placement_state is not null
               and public.homeos_starter_identity(old.parent_area) is distinct from v_parent_identity
           )
       )
       and coalesce(current_setting('barbarosa.homeos_area_location_write', true), '') <> 'allowed' then
        raise exception 'Move an Area through move_homeowner_property_area so its direct containers stay attached.' using errcode = '42501';
    end if;

    if v_state = 'unassigned' then
        -- A unique legacy Laundry may retain a nonblank snapshot until the
        -- homeowner confirms it through the atomic move RPC.
        new.area_placement_state := v_state;
        return new;
    end if;

    if v_state = 'standalone' then
        if v_parent_identity <> '' then
            raise exception 'Standalone Areas cannot have a host Area.' using errcode = '23514';
        end if;
        new.parent_area := null;
        new.area_placement_state := v_state;
        return new;
    end if;

    if new.property_id is null or v_parent_identity = '' then
        raise exception 'An inside_area placement requires a property and an active host Area.' using errcode = '23514';
    end if;

    select min(host.id::text)::uuid, count(*)::integer
    into v_host_id, v_host_count
    from public.home_items host
    where host.property_id = new.property_id
      and lower(btrim(coalesce(host.category, ''))) = 'area'
      and coalesce(host.archived, false) = false
      and nullif(btrim(coalesce(host.parent_area, '')), '') is null
      and public.homeos_starter_identity(host.name) = v_parent_identity;

    if v_host_count <> 1 or v_host_id is null then
        raise exception 'Choose one active top-level Area as the host.' using errcode = '23514';
    end if;

    if new.id is not null and v_host_id = new.id then
        raise exception 'An Area cannot be hosted inside itself.' using errcode = '23514';
    end if;

    new.area_placement_state := v_state;
    return new;
end;
$$;

drop trigger if exists home_items_validate_area_location_assignment on public.home_items;
create trigger home_items_validate_area_location_assignment
before insert or update of category, name, property_id, parent_area, archived, area_placement_state
on public.home_items
for each row
execute function public.homeos_validate_area_location_assignment();

-- Normal Area lifecycle is archival so canonical IDs and linked history stay
-- recoverable. A property FK cascade is still allowed once its parent row is
-- gone, and the existing reset RPC receives one function-local teardown flag.
create or replace function public.homeos_prevent_area_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if lower(btrim(coalesce(old.category, ''))) <> 'area' then
        return old;
    end if;

    if old.property_id is not null
       and not exists (
           select 1
           from public.properties property_record
           where property_record.id = old.property_id
       ) then
        return old;
    end if;

    if coalesce(current_setting('barbarosa.homeos_property_teardown', true), '') = 'allowed' then
        return old;
    end if;

    raise exception 'Archive HomeOS Areas instead of deleting their canonical records.' using errcode = '23514';
end;
$$;

drop trigger if exists home_items_prevent_area_hard_delete on public.home_items;
create trigger home_items_prevent_area_hard_delete
before delete on public.home_items
for each row
execute function public.homeos_prevent_area_hard_delete();

do $$
begin
    if to_regprocedure('public.reset_active_home_for_testing(text)') is not null then
        execute 'alter function public.reset_active_home_for_testing(text) '
             || 'set barbarosa.homeos_property_teardown = ''allowed''';
    end if;
end;
$$;

-- Moves one canonical Area record. Its direct root containers receive the new
-- legacy parent snapshot in the same transaction; UUID-linked components stay
-- linked to their existing parent_home_item_id and are never copied.
create or replace function public.move_homeowner_property_area(
    p_area_id uuid,
    p_placement_state text,
    p_host_area_id uuid default null
)
returns table (
    area_id uuid,
    area_name text,
    parent_area text,
    area_placement_state text,
    host_area_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_area public.home_items%rowtype;
    v_host public.home_items%rowtype;
    v_state text := nullif(lower(btrim(coalesce(p_placement_state, ''))), '');
    v_previous_area_location_write text := coalesce(current_setting('barbarosa.homeos_area_location_write', true), '');
    v_old_parent_area text;
    v_new_parent_area text;
begin
    if v_user_id is null then
        raise exception 'Authentication required.' using errcode = '28000';
    end if;

    if p_area_id is null
       or v_state is null
       or v_state not in ('unassigned', 'standalone', 'inside_area') then
        raise exception 'Choose an Area and a valid location state.' using errcode = '22023';
    end if;

    -- One property-level lock serializes Area moves before row locks, avoiding
    -- crossed host/target locks during simultaneous reassignment attempts.
    select area.*
    into v_area
    from public.home_items area
    where area.id = p_area_id;

    if not found then
        raise exception 'That Area is unavailable.' using errcode = 'P0002';
    end if;

    if v_area.property_id is null
       or lower(btrim(coalesce(v_area.category, ''))) <> 'area'
       or coalesce(v_area.archived, false) then
        raise exception 'Choose an active property Area.' using errcode = '23514';
    end if;

    if not public.homeos_has_active_property_membership(v_area.property_id)
       or not public.homeos_can_mutate_property_record(v_area.property_id, v_area.user_id) then
        raise exception 'You are not authorized to move this HomeOS Area.' using errcode = '42501';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
        'homeos-area-location|' || v_area.property_id::text,
        0
    ));

    select area.*
    into v_area
    from public.home_items area
    where area.id = p_area_id
    for update;

    if not found
       or v_area.property_id is null
       or lower(btrim(coalesce(v_area.category, ''))) <> 'area'
       or coalesce(v_area.archived, false)
       or not public.homeos_has_active_property_membership(v_area.property_id)
       or not public.homeos_can_mutate_property_record(v_area.property_id, v_area.user_id) then
        raise exception 'You are not authorized to move this HomeOS Area.' using errcode = '42501';
    end if;

    if v_state = 'inside_area' then
        if p_host_area_id is null then
            raise exception 'Choose an active host Area.' using errcode = '22023';
        end if;

        select host.*
        into v_host
        from public.home_items host
        where host.id = p_host_area_id
        for update;

        if not found
           or v_host.id = v_area.id
           or v_host.property_id is distinct from v_area.property_id
           or lower(btrim(coalesce(v_host.category, ''))) <> 'area'
           or coalesce(v_host.archived, false)
           or nullif(btrim(coalesce(v_host.parent_area, '')), '') is not null then
            raise exception 'Choose an active top-level Area in this property as the host.' using errcode = '23514';
        end if;

        v_new_parent_area := nullif(btrim(coalesce(v_host.name, '')), '');
        if v_new_parent_area is null then
            raise exception 'The selected host Area needs a name.' using errcode = '23514';
        end if;
    else
        if p_host_area_id is not null then
            raise exception 'Unassigned and standalone Areas do not use a host Area.' using errcode = '22023';
        end if;
        v_new_parent_area := null;
    end if;

    v_old_parent_area := nullif(btrim(coalesce(v_area.parent_area, '')), '');

    -- This first-phase location model deliberately refuses to move an Area
    -- that is itself a host. Current routes carry one parent-area segment;
    -- moving a host with child Areas would require a dedicated tree migration.
    if exists (
        select 1
        from public.home_items child_area
        where child_area.property_id = v_area.property_id
          and lower(btrim(coalesce(child_area.category, ''))) = 'area'
          and coalesce(child_area.archived, false) = false
          and public.homeos_starter_identity(child_area.parent_area) = public.homeos_starter_identity(v_area.name)
    ) then
        raise exception 'Move or archive child Areas before relocating this Area.' using errcode = '23514';
    end if;

    -- Verify every active direct root is mutable before inspecting proposed
    -- placement conflicts or changing any snapshot.
    if exists (
        select 1
        from public.home_items moving
        where moving.property_id = v_area.property_id
          and moving.parent_home_item_id is null
          and lower(btrim(coalesce(moving.category, ''))) <> 'area'
          and coalesce(moving.archived, false) = false
          and public.homeos_starter_identity(moving.location) = public.homeos_starter_identity(v_area.name)
          and public.homeos_starter_identity(moving.parent_area) = public.homeos_starter_identity(v_old_parent_area)
          and not public.homeos_can_mutate_property_record(moving.property_id, moving.user_id)
    ) then
        raise exception 'You are not authorized to move every direct container in this Area.' using errcode = '42501';
    end if;

    -- Preflight both the Area identity and every direct root container's new
    -- placement. A conflict aborts before any row is changed.
    if exists (
        select 1
        from public.home_items conflict_area
        where conflict_area.property_id = v_area.property_id
          and conflict_area.id <> v_area.id
          and coalesce(conflict_area.archived, false) = false
          and public.homeos_item_placement_identity(
              conflict_area.system,
              conflict_area.category,
              conflict_area.name,
              conflict_area.location,
              conflict_area.parent_area
          ) = public.homeos_item_placement_identity(
              v_area.system,
              v_area.category,
              v_area.name,
              v_area.location,
              v_new_parent_area
          )
    ) then
        raise exception 'An active Area with this placement already exists.' using errcode = '23505';
    end if;

    if exists (
        with moving_roots as (
            select moving.id, moving.system, moving.category, moving.name
            from public.home_items moving
            where moving.property_id = v_area.property_id
              and moving.parent_home_item_id is null
              and lower(btrim(coalesce(moving.category, ''))) <> 'area'
              and coalesce(moving.archived, false) = false
              and public.homeos_starter_identity(moving.location) = public.homeos_starter_identity(v_area.name)
              and public.homeos_starter_identity(moving.parent_area) = public.homeos_starter_identity(v_old_parent_area)
        )
        select 1
        from moving_roots moving
        join public.home_items conflict_item
          on conflict_item.property_id = v_area.property_id
         and coalesce(conflict_item.archived, false) = false
         and public.homeos_item_placement_identity(
             conflict_item.system,
             conflict_item.category,
             conflict_item.name,
             conflict_item.location,
             conflict_item.parent_area
         ) = public.homeos_item_placement_identity(
             moving.system,
             moving.category,
             moving.name,
             v_area.name,
             v_new_parent_area
         )
        where not exists (
            select 1
            from moving_roots moved_again
            where moved_again.id = conflict_item.id
        )
    ) then
        raise exception 'Moving this Area would duplicate an active container placement.' using errcode = '23505';
    end if;

    begin
        perform set_config('barbarosa.homeos_area_location_write', 'allowed', true);

        update public.home_items area
        set parent_area = v_new_parent_area,
            area_placement_state = v_state
        where area.id = v_area.id;

        update public.home_items direct_root
        set parent_area = v_new_parent_area
        where direct_root.property_id = v_area.property_id
          and direct_root.parent_home_item_id is null
          and lower(btrim(coalesce(direct_root.category, ''))) <> 'area'
          and coalesce(direct_root.archived, false) = false
          and public.homeos_starter_identity(direct_root.location) = public.homeos_starter_identity(v_area.name)
          and public.homeos_starter_identity(direct_root.parent_area) = public.homeos_starter_identity(v_old_parent_area);

        perform set_config(
            'barbarosa.homeos_area_location_write',
            v_previous_area_location_write,
            true
        );
    exception when others then
        perform set_config(
            'barbarosa.homeos_area_location_write',
            v_previous_area_location_write,
            true
        );
        raise;
    end;

    return query
    select
        v_area.id,
        v_area.name,
        v_new_parent_area,
        v_state,
        case when v_state = 'inside_area' then v_host.id else null end;
end;
$$;

revoke all on function public.homeos_validate_area_location_assignment() from public, anon, authenticated;
revoke all on function public.homeos_prevent_area_hard_delete() from public, anon, authenticated;
revoke all on function public.homeos_lock_area_location_root_write() from public, anon, authenticated;
revoke all on function public.sync_complete_room_starter_cards() from public, anon, authenticated;
revoke all on function public.move_homeowner_property_area(uuid,text,uuid) from public, anon;
grant execute on function public.move_homeowner_property_area(uuid,text,uuid) to authenticated;

comment on column public.home_items.area_placement_state is
    'Explicit Area location state. NULL preserves legacy parent_area behavior; unassigned marks one canonical Area awaiting confirmed placement and may retain a legacy parent_area snapshot, while standalone and inside_area are confirmed placements.';

comment on function public.move_homeowner_property_area(uuid,text,uuid) is
    'Atomically moves one canonical HomeOS Area between unassigned, standalone, and one top-level host Area without duplicating Area, container, or component records.';

commit;
