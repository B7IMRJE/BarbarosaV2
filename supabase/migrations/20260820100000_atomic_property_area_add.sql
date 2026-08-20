-- Make property-first Add Area atomic across every HomeOS creation surface.
-- Existing records are preserved; this migration only classifies clear numbered
-- labels and guards future active top-level area writes.
begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or not exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'home_items'
             and column_name = 'area_scope'
       )
       or to_regprocedure('public.homeos_has_active_property_membership(uuid)') is null
       or to_regprocedure('public.homeos_can_mutate_property_record(uuid,uuid)') is null then
        raise exception 'Atomic property area creation requires the property-scoped HomeOS foundation.';
    end if;
end;
$$;

-- Numbered standard labels such as Bathroom 2 are also unambiguous. Bare
-- Garage and unknown labels remain null/unclassified.
update public.home_items
set area_scope = case regexp_replace(
    lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')),
    '[[:space:]]+#?[0-9]+$',
    ''
)
    when 'kitchen' then 'interior' when 'living room' then 'interior'
    when 'dining room' then 'interior' when 'hallway' then 'interior'
    when 'attached garage' then 'interior' when 'laundry room' then 'interior'
    when 'laundry' then 'interior' when 'primary bedroom' then 'interior'
    when 'master bedroom' then 'interior' when 'bedroom' then 'interior'
    when 'primary bathroom' then 'interior' when 'master bathroom' then 'interior'
    when 'bathroom' then 'interior' when 'office' then 'interior' when 'attic' then 'interior'
    when 'basement' then 'interior' when 'utility or mechanical room' then 'interior'
    when 'utility / mechanical room' then 'interior' when 'utility room' then 'interior'
    when 'mechanical room' then 'interior' when 'gym' then 'interior' when 'bar' then 'interior'
    when 'theater' then 'interior' when 'man cave' then 'interior' when 'wine room' then 'interior'
    when 'storage room' then 'interior' when 'interior walkway' then 'interior'
    when 'front yard' then 'exterior' when 'backyard' then 'exterior' when 'back yard' then 'exterior'
    when 'left side yard' then 'exterior' when 'right side yard' then 'exterior'
    when 'patio' then 'exterior' when 'porch' then 'exterior' when 'balcony' then 'exterior'
    when 'driveway' then 'exterior' when 'pool area' then 'exterior' when 'spa area' then 'exterior'
    when 'bbq or outdoor kitchen' then 'exterior' when 'bbq / grill area' then 'exterior'
    when 'outdoor kitchen' then 'exterior' when 'detached garage' then 'exterior'
    when 'shed' then 'exterior' when 'workshop' then 'exterior' when 'guest house or adu' then 'exterior'
    when 'guest house' then 'exterior' when 'adu' then 'exterior' when 'pool house' then 'exterior'
    when 'landscaping' then 'exterior' when 'irrigation' then 'exterior' when 'roof' then 'exterior'
    when 'exterior mechanical area' then 'exterior' when 'exterior shutoff area' then 'exterior'
    else null
end
where lower(btrim(coalesce(category, ''))) = 'area'
  and area_scope is null
  and lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) ~ '[[:space:]]+#?[0-9]+$';

-- Protect every writer, including the legacy Create Area path. The trigger
-- takes the same transaction lock used by the homeowner RPC before checking
-- for an active top-level same-name area across all systems. Existing nested
-- areas remain independent and existing rows are not rewritten or merged.
create or replace function public.enforce_home_items_top_level_area_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_name_identity text;
begin
    if new.property_id is null
       or lower(btrim(coalesce(new.category, ''))) <> 'area'
       or coalesce(new.archived, false)
       or nullif(btrim(coalesce(new.parent_area, '')), '') is not null then
        return new;
    end if;

    v_name_identity := lower(regexp_replace(
        btrim(coalesce(new.name, '')),
        '[[:space:]]+',
        ' ',
        'g'
    ));

    if v_name_identity = '' then
        return new;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
        'homeowner-property-area|' || new.property_id::text || '|' || v_name_identity,
        0
    ));

    if exists (
        select 1
        from public.home_items existing_area
        where existing_area.property_id = new.property_id
          and existing_area.id is distinct from new.id
          and lower(btrim(coalesce(existing_area.category, ''))) = 'area'
          and coalesce(existing_area.archived, false) = false
          and nullif(btrim(coalesce(existing_area.parent_area, '')), '') is null
          and lower(regexp_replace(
              btrim(coalesce(existing_area.name, '')),
              '[[:space:]]+',
              ' ',
              'g'
          )) = v_name_identity
    ) then
        raise exception 'An active top-level area named "%" already exists for this property.', new.name
            using errcode = '23505',
                  constraint = 'home_items_property_active_top_level_area_name_key';
    end if;

    return new;
end;
$$;

drop trigger if exists home_items_enforce_top_level_area_identity on public.home_items;
create trigger home_items_enforce_top_level_area_identity
before insert or update of property_id, name, category, parent_area, archived
on public.home_items
for each row
execute function public.enforce_home_items_top_level_area_identity();

revoke all on function public.enforce_home_items_top_level_area_identity() from public, anon, authenticated;

-- Add a homeowner area through one serialized transaction. The lock and
-- natural-identity recheck intentionally ignore system so the same top-level
-- room cannot be created twice merely because separate trades use it. Nested
-- rooms remain independent because only blank parent_area rows are reused.
create or replace function public.add_homeowner_property_area(
    p_property_id uuid,
    p_name text,
    p_area_scope text
)
returns table (
    area_id uuid,
    item_slug text,
    area_name text,
    area_scope text,
    created boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_name text := nullif(regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g'), '');
    v_name_identity text;
    v_slug_base text;
    v_slug text;
    v_area public.home_items%rowtype;
begin
    if v_user_id is null then
        raise exception 'Authentication required.' using errcode = '28000';
    end if;

    if p_property_id is null then
        raise exception 'Property is required.' using errcode = '22023';
    end if;

    if v_name is null or length(v_name) > 160 then
        raise exception 'Choose a valid area name.' using errcode = '22023';
    end if;

    if p_area_scope is null or p_area_scope not in ('interior', 'exterior') then
        raise exception 'Area scope must be interior or exterior.' using errcode = '22023';
    end if;

    -- This is deliberately homeowner-membership authorization only. Provider
    -- assignment, company, request, job, and platform-admin access do not
    -- substitute for an active membership on this property.
    if not public.homeos_has_active_property_membership(p_property_id)
       or not public.homeos_can_mutate_property_record(p_property_id, v_user_id) then
        raise exception 'You are not authorized to add areas to this property.' using errcode = '42501';
    end if;

    v_name_identity := lower(v_name);

    perform pg_advisory_xact_lock(hashtextextended(
        'homeowner-property-area|' || p_property_id::text || '|' || v_name_identity,
        0
    ));

    select existing_area.*
    into v_area
    from public.home_items existing_area
    where existing_area.property_id = p_property_id
      and lower(btrim(coalesce(existing_area.category, ''))) = 'area'
      and coalesce(existing_area.archived, false) = false
      and nullif(btrim(coalesce(existing_area.parent_area, '')), '') is null
      and lower(regexp_replace(btrim(coalesce(existing_area.name, '')), '[[:space:]]+', ' ', 'g')) = v_name_identity
    order by existing_area.created_at asc nulls last, existing_area.id asc
    limit 1
    for update;

    if found then
        return query
        select v_area.id, v_area.item_slug, v_area.name, v_area.area_scope, false;
        return;
    end if;

    v_slug_base := trim(both '-' from regexp_replace(v_name_identity, '[^a-z0-9]+', '-', 'g'));
    if v_slug_base = '' then
        v_slug_base := 'area';
    end if;
    v_slug := 'area-' || v_slug_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

    insert into public.home_items as new_area (
        user_id,
        property_id,
        item_slug,
        name,
        system,
        category,
        location,
        parent_area,
        area_scope,
        status,
        install_state,
        archived
    ) values (
        v_user_id,
        p_property_id,
        v_slug,
        v_name,
        'Structural',
        'Area',
        '',
        '',
        p_area_scope,
        'Missing Information',
        'Unknown',
        false
    )
    returning new_area.* into v_area;

    return query
    select v_area.id, v_area.item_slug, v_area.name, v_area.area_scope, true;
end;
$$;

revoke all on function public.add_homeowner_property_area(uuid, text, text) from public, anon;
grant execute on function public.add_homeowner_property_area(uuid, text, text) to authenticated;

comment on function public.add_homeowner_property_area(uuid, text, text) is
    'Atomically creates or reuses one active top-level property area for an active homeowner member.';

commit;
