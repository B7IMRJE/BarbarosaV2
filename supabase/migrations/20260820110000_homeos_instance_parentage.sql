-- Give HomeOS assembly/component cards a durable instance relationship while
-- retaining a legacy location/parent_area snapshot for existing clients.

begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regclass('public.homeos_starter_card_templates') is null
       or to_regprocedure('public.homeos_item_placement_identity(text,text,text,text,text)') is null
       or to_regprocedure('public.homeos_starter_identity(text)') is null
       or to_regprocedure('public.homeos_complete_room_kind(text)') is null
       or to_regprocedure('public.homeos_can_mutate_property_record(uuid,uuid)') is null
       or to_regprocedure('public.create_provider_homeos_item_unscoped_internal(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text)') is null
       or to_regprocedure('public.create_provider_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text)') is null
       or to_regprocedure('public.create_provider_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid)') is null
       or to_regprocedure('public.create_sales_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text)') is null
       or to_regprocedure('public.create_sales_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid)') is null
       or to_regprocedure('public.get_provider_homeos_items(uuid,uuid,uuid,uuid,uuid,text)') is null
       or to_regprocedure('public.get_sales_company_homeos_items(uuid,uuid,uuid,uuid,uuid,text)') is null then
        raise exception 'HomeOS instance parentage requires the current item, starter deck, provider, and Sales RPC schema.';
    end if;

    if not exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'home_items'
          and column_name = 'replaces_home_item_id'
    ) then
        raise exception 'HomeOS instance parentage requires replacement history support.';
    end if;
end;
$$;

alter table public.home_items
    add column if not exists parent_home_item_id uuid,
    add column if not exists placement_label text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint constraint_row
        where constraint_row.conrelid = 'public.home_items'::regclass
          and constraint_row.conname = 'home_items_parent_home_item_id_fkey'
    ) then
        alter table public.home_items
            add constraint home_items_parent_home_item_id_fkey
            foreign key (parent_home_item_id)
            references public.home_items(id)
            on delete restrict
            not valid;
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_constraint constraint_row
        where constraint_row.conrelid = 'public.home_items'::regclass
          and constraint_row.conname = 'home_items_placement_label_check'
    ) then
        alter table public.home_items
            add constraint home_items_placement_label_check
            check (
                placement_label is null
                or (
                    placement_label = btrim(placement_label)
                    and char_length(placement_label) between 1 and 120
                )
            );
    end if;
end;
$$;

create index if not exists home_items_parent_home_item_id_idx
    on public.home_items(parent_home_item_id)
    where parent_home_item_id is not null;

-- The app has three explicitly approved compatibility overlays. Their
-- canonical descendants are flattened to the same root because the durable
-- schema intentionally permits only assembly -> component depth.
create or replace function public.homeos_overlay_root_identity(
    p_template_key text,
    p_name text,
    p_room_kind text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_template_key text := nullif(btrim(coalesce(p_template_key, '')), '');
    v_name_identity text := public.homeos_starter_identity(p_name);
    v_room_kind text := lower(btrim(coalesce(p_room_kind, '')));
begin
    -- A non-null stable key is authoritative. Name aliases are considered
    -- only for legacy rows that never received a starter key.
    if v_template_key is not null then
        if v_template_key in ('kitchen:kitchen_faucet', 'kitchen:garbage_disposal') then
            return 'template:kitchen:kitchen_sink';
        end if;
        if v_template_key in ('bathroom:bathroom_sink', 'bathroom:bathroom_sink_faucet') then
            return 'template:bathroom:bathroom_vanity';
        end if;
        if v_template_key = 'kitchen:refrigerator_water_line' then
            return 'name:refrigerator';
        end if;
        return null;
    end if;

    if v_room_kind = 'kitchen'
       and v_name_identity = any(array[
           'kitchen faucet', 'faucet',
           'garbage disposal', 'food waste disposer', 'disposal'
       ]::text[]) then
        return 'template:kitchen:kitchen_sink';
    end if;

    if v_room_kind = 'bathroom'
       and v_name_identity = any(array[
           'bathroom sink', 'vanity sink', 'lavatory sink', 'sink',
           'bathroom sink faucet', 'bathroom faucet', 'lavatory faucet', 'faucet'
       ]::text[]) then
        return 'template:bathroom:bathroom_vanity';
    end if;

    if v_room_kind = 'kitchen'
       and v_name_identity = any(array[
           'refrigerator water line', 'ice maker line', 'refrigerator line', 'water line'
       ]::text[]) then
        return 'name:refrigerator';
    end if;

    return null;
end;
$$;

create or replace function public.homeos_resolve_overlay_root_for_placement(
    p_property_id uuid,
    p_root_identity text,
    p_area_name text,
    p_parent_area text
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_root_id uuid;
    v_candidate_count integer := 0;
    v_template_key text;
begin
    if p_property_id is null
       or nullif(btrim(coalesce(p_root_identity, '')), '') is null
       or nullif(btrim(coalesce(p_area_name, '')), '') is null then
        return null;
    end if;

    if p_root_identity like 'template:%' then
        v_template_key := substring(p_root_identity from 10);

        select min(parent.id::text)::uuid, count(*)::integer
        into v_root_id, v_candidate_count
        from public.home_items parent
        where parent.property_id = p_property_id
          and parent.parent_home_item_id is null
          and parent.starter_template_key = v_template_key
          and lower(btrim(coalesce(parent.category, ''))) <> 'area'
          and coalesce(parent.archived, false) = false
          and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(p_area_name)
          and public.homeos_starter_identity(parent.parent_area) = public.homeos_starter_identity(p_parent_area);

        if v_candidate_count = 1 then return v_root_id; end if;
        if v_candidate_count > 1 then return null; end if;

        -- Stable-key parents win. Only if none exist may one unkeyed legacy
        -- alias identify the root assembly.
        select min(parent.id::text)::uuid, count(*)::integer
        into v_root_id, v_candidate_count
        from public.home_items parent
        join public.homeos_starter_card_templates root_template
          on root_template.template_key = v_template_key
        where parent.property_id = p_property_id
          and parent.parent_home_item_id is null
          and parent.starter_template_key is null
          and lower(btrim(coalesce(parent.category, ''))) <> 'area'
          and coalesce(parent.archived, false) = false
          and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(p_area_name)
          and public.homeos_starter_identity(parent.parent_area) = public.homeos_starter_identity(p_parent_area)
          and public.homeos_starter_identity(parent.name) in (
              select public.homeos_starter_identity(alias.value)
              from jsonb_array_elements_text(root_template.aliases || jsonb_build_array(root_template.name)) alias(value)
          );

        if v_candidate_count = 1 then return v_root_id; end if;
        return null;
    end if;

    if p_root_identity = 'name:refrigerator' then
        select min(parent.id::text)::uuid, count(*)::integer
        into v_root_id, v_candidate_count
        from public.home_items parent
        where parent.property_id = p_property_id
          and parent.parent_home_item_id is null
          and parent.starter_template_key is null
          and lower(btrim(coalesce(parent.category, ''))) <> 'area'
          and coalesce(parent.archived, false) = false
          and public.homeos_starter_identity(parent.name) = 'refrigerator'
          and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(p_area_name)
          and public.homeos_starter_identity(parent.parent_area) = public.homeos_starter_identity(p_parent_area);

        if v_candidate_count = 1 then return v_root_id; end if;
    end if;

    return null;
end;
$$;

create or replace function public.homeos_room_placement_identity(
    p_location text,
    p_parent_area text
)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select case
        when public.homeos_complete_room_kind(p_location) is not null then
            public.homeos_complete_room_kind(p_location) || '|' ||
            public.homeos_starter_identity(p_location) || '|' ||
            public.homeos_starter_identity(p_parent_area)
        when public.homeos_complete_room_kind(p_parent_area) is not null then
            public.homeos_complete_room_kind(p_parent_area) || '|' ||
            public.homeos_starter_identity(p_parent_area) || '|'
        else null
    end;
$$;

create or replace function public.homeos_resolve_unambiguous_overlay_parent(p_child_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_child public.home_items%rowtype;
    v_cursor public.home_items%rowtype;
    v_candidate_id uuid;
    v_candidate_count integer;
    v_root_identity text;
    v_root_id uuid;
    v_area_name text;
    v_outer_parent_area text;
    v_room_kind text;
    v_placement_identity text;
    v_parent_template_key text;
    v_root_template_key text;
    v_path uuid[] := array[]::uuid[];
    v_depth integer := 0;
begin
    select child.* into v_child
    from public.home_items child
    where child.id = p_child_id
      and child.parent_home_item_id is null
      and lower(btrim(coalesce(child.category, ''))) <> 'area'
      and coalesce(child.archived, false) = false;

    if not found then return null; end if;

    v_cursor := v_child;

    -- An unrecognized location may be a real nested Area rather than legacy
    -- item ancestry (for example Pantry beneath Kitchen). Preserve that exact
    -- scope instead of collapsing it into the complete room named by
    -- parent_area. Recognized nested rooms such as Kitchen beneath Guest House
    -- continue through the exact area + outer-area resolver below.
    if public.homeos_complete_room_kind(v_cursor.location) is null
       and exists (
           select 1
           from public.home_items area
           where area.property_id = v_child.property_id
             and lower(btrim(coalesce(area.category, ''))) = 'area'
             and coalesce(area.archived, false) = false
             and public.homeos_starter_identity(area.name) = public.homeos_starter_identity(v_cursor.location)
             and public.homeos_starter_identity(area.parent_area) = public.homeos_starter_identity(v_cursor.parent_area)
       ) then
        return null;
    end if;

    v_placement_identity := public.homeos_room_placement_identity(v_cursor.location, v_cursor.parent_area);
    if v_placement_identity is null then return null; end if;

    if public.homeos_complete_room_kind(v_cursor.location) is not null then
        v_area_name := nullif(btrim(coalesce(v_cursor.location, '')), '');
        v_outer_parent_area := nullif(btrim(coalesce(v_cursor.parent_area, '')), '');
    else
        v_area_name := nullif(btrim(coalesce(v_cursor.parent_area, '')), '');
        v_outer_parent_area := null;
    end if;
    v_room_kind := public.homeos_complete_room_kind(v_area_name);
    v_root_identity := public.homeos_overlay_root_identity(
        v_cursor.starter_template_key,
        v_cursor.name,
        v_room_kind
    );

    -- Descendants flatten only through the same saved canonical/legacy chain
    -- the UI can actually project. Catalog ancestry alone never synthesizes a
    -- missing intermediary card, and every hop must be unique.
    while v_root_identity is null and v_depth < 8 loop
        v_path := v_path || v_cursor.id;
        v_candidate_id := null;
        v_candidate_count := 0;
        v_parent_template_key := null;

        select template.parent_template_key
        into v_parent_template_key
        from public.homeos_starter_card_templates template
        where template.template_key = v_cursor.starter_template_key;

        if v_parent_template_key is not null then
            select min(parent.id::text)::uuid, count(*)::integer
            into v_candidate_id, v_candidate_count
            from public.home_items parent
            where parent.property_id = v_child.property_id
              and parent.id <> all(v_path)
              and parent.starter_template_key = v_parent_template_key
              and lower(btrim(coalesce(parent.category, ''))) <> 'area'
              and coalesce(parent.archived, false) = false
              and (
                  public.homeos_starter_identity(v_cursor.parent_area) = public.homeos_starter_identity(parent.location)
                  or public.homeos_room_placement_identity(parent.location, parent.parent_area) = v_placement_identity
              );

            if v_candidate_count = 0 then
                select min(parent.id::text)::uuid, count(*)::integer
                into v_candidate_id, v_candidate_count
                from public.home_items parent
                join public.homeos_starter_card_templates parent_template
                  on parent_template.template_key = v_parent_template_key
                where parent.property_id = v_child.property_id
                  and parent.id <> all(v_path)
                  and parent.starter_template_key is null
                  and lower(btrim(coalesce(parent.category, ''))) <> 'area'
                  and coalesce(parent.archived, false) = false
                  and (
                      public.homeos_starter_identity(v_cursor.parent_area) = public.homeos_starter_identity(parent.location)
                      or public.homeos_room_placement_identity(parent.location, parent.parent_area) = v_placement_identity
                  )
                  and public.homeos_starter_identity(parent.name) in (
                      select public.homeos_starter_identity(alias.value)
                      from jsonb_array_elements_text(parent_template.aliases || jsonb_build_array(parent_template.name)) alias(value)
                  )
                  and public.homeos_starter_identity(parent.name) = public.homeos_starter_identity(v_cursor.location)
                  and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(v_cursor.parent_area);
            end if;
        else
            if nullif(btrim(coalesce(v_cursor.parent_area, '')), '') is null
               or nullif(btrim(coalesce(v_cursor.location, '')), '') is null then
                return null;
            end if;

            select min(parent.id::text)::uuid, count(*)::integer
            into v_candidate_id, v_candidate_count
            from public.home_items parent
            where parent.property_id = v_child.property_id
              and parent.id <> all(v_path)
              and lower(btrim(coalesce(parent.category, ''))) <> 'area'
              and coalesce(parent.archived, false) = false
              and public.homeos_starter_identity(parent.name) = public.homeos_starter_identity(v_cursor.location)
              and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(v_cursor.parent_area)
              and (
                  public.homeos_starter_identity(v_cursor.parent_area) = public.homeos_starter_identity(parent.location)
                  or public.homeos_room_placement_identity(parent.location, parent.parent_area) = v_placement_identity
              );
        end if;

        if v_candidate_count <> 1 then return null; end if;

        select parent.* into v_cursor
        from public.home_items parent
        where parent.id = v_candidate_id;

        if public.homeos_complete_room_kind(v_cursor.location) is null
           and exists (
               select 1
               from public.home_items area
               where area.property_id = v_child.property_id
                 and lower(btrim(coalesce(area.category, ''))) = 'area'
                 and coalesce(area.archived, false) = false
                 and public.homeos_starter_identity(area.name) = public.homeos_starter_identity(v_cursor.location)
                 and public.homeos_starter_identity(area.parent_area) = public.homeos_starter_identity(v_cursor.parent_area)
           ) then
            return null;
        end if;

        v_placement_identity := public.homeos_room_placement_identity(v_cursor.location, v_cursor.parent_area);
        if v_placement_identity is null then return null; end if;

        if public.homeos_complete_room_kind(v_cursor.location) is not null then
            v_area_name := nullif(btrim(coalesce(v_cursor.location, '')), '');
            v_outer_parent_area := nullif(btrim(coalesce(v_cursor.parent_area, '')), '');
        else
            v_area_name := nullif(btrim(coalesce(v_cursor.parent_area, '')), '');
            v_outer_parent_area := null;
        end if;
        v_room_kind := public.homeos_complete_room_kind(v_area_name);

        -- Reaching the saved Kitchen Sink or Bathroom Vanity root is itself a
        -- complete chain. The root is not an overlay component, so it does not
        -- map through homeos_overlay_root_identity; return the unique saved
        -- instance (or its already-durable root) directly.
        if v_cursor.id <> v_child.id
           and (
               v_cursor.starter_template_key in (
                   'kitchen:kitchen_sink',
                   'bathroom:bathroom_vanity'
               )
               or (
                   v_cursor.starter_template_key is null
                   and (
                       (
                           v_room_kind = 'kitchen'
                           and public.homeos_starter_identity(v_cursor.name) in ('kitchen sink', 'sink')
                       )
                       or (
                           v_room_kind = 'bathroom'
                           and public.homeos_starter_identity(v_cursor.name) in ('bathroom vanity', 'vanity')
                       )
                   )
               )
           ) then
            if v_cursor.parent_home_item_id is null then
                return v_cursor.id;
            end if;

            select parent.id into v_root_id
            from public.home_items parent
            where parent.id = v_cursor.parent_home_item_id
              and parent.property_id = v_child.property_id
              and parent.parent_home_item_id is null
              and lower(btrim(coalesce(parent.category, ''))) <> 'area'
              and coalesce(parent.archived, false) = false;

            if found then return v_root_id; end if;
            return null;
        end if;

        v_root_identity := public.homeos_overlay_root_identity(
            v_cursor.starter_template_key,
            v_cursor.name,
            v_room_kind
        );
        v_depth := v_depth + 1;
    end loop;

    if v_root_identity is null then return null; end if;

    -- A durable parent on the unique saved intermediary is authoritative.
    if v_cursor.id <> v_child.id and v_cursor.parent_home_item_id is not null then
        select parent.id into v_root_id
        from public.home_items parent
        where parent.id = v_cursor.parent_home_item_id
          and parent.property_id = v_child.property_id
          and parent.parent_home_item_id is null
          and lower(btrim(coalesce(parent.category, ''))) <> 'area'
          and coalesce(parent.archived, false) = false;

        if found then return v_root_id; end if;
        return null;
    end if;

    -- UI legacy hierarchy resolution runs before overlay inference. Preserve
    -- that exact saved relation too: location names the assembly and
    -- parent_area names its room. This is especially important for a nested
    -- Kitchen whose outer area is absent from the child's old text snapshot.
    v_candidate_id := null;
    v_candidate_count := 0;
    if nullif(btrim(coalesce(v_cursor.location, '')), '') is not null
       and nullif(btrim(coalesce(v_cursor.parent_area, '')), '') is not null then
        if v_root_identity like 'template:%' then
            v_root_template_key := substring(v_root_identity from 10);

            select min(parent.id::text)::uuid, count(*)::integer
            into v_candidate_id, v_candidate_count
            from public.home_items parent
            where parent.property_id = v_child.property_id
              and parent.id <> v_child.id
              and parent.parent_home_item_id is null
              and parent.starter_template_key = v_root_template_key
              and lower(btrim(coalesce(parent.category, ''))) <> 'area'
              and coalesce(parent.archived, false) = false
              and public.homeos_starter_identity(parent.name) = public.homeos_starter_identity(v_cursor.location)
              and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(v_cursor.parent_area);

            if v_candidate_count = 1 then return v_candidate_id; end if;
            if v_candidate_count > 1 then return null; end if;

            select min(parent.id::text)::uuid, count(*)::integer
            into v_candidate_id, v_candidate_count
            from public.home_items parent
            join public.homeos_starter_card_templates root_template
              on root_template.template_key = v_root_template_key
            where parent.property_id = v_child.property_id
              and parent.id <> v_child.id
              and parent.parent_home_item_id is null
              and parent.starter_template_key is null
              and lower(btrim(coalesce(parent.category, ''))) <> 'area'
              and coalesce(parent.archived, false) = false
              and public.homeos_starter_identity(parent.name) in (
                  select public.homeos_starter_identity(alias.value)
                  from jsonb_array_elements_text(root_template.aliases || jsonb_build_array(root_template.name)) alias(value)
              )
              and public.homeos_starter_identity(parent.name) = public.homeos_starter_identity(v_cursor.location)
              and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(v_cursor.parent_area);

            if v_candidate_count = 1 then return v_candidate_id; end if;
            if v_candidate_count > 1 then return null; end if;
        elsif v_root_identity = 'name:refrigerator' then
            select min(parent.id::text)::uuid, count(*)::integer
            into v_candidate_id, v_candidate_count
            from public.home_items parent
            where parent.property_id = v_child.property_id
              and parent.id <> v_child.id
              and parent.parent_home_item_id is null
              and parent.starter_template_key is null
              and lower(btrim(coalesce(parent.category, ''))) <> 'area'
              and coalesce(parent.archived, false) = false
              and public.homeos_starter_identity(parent.name) = 'refrigerator'
              and public.homeos_starter_identity(parent.name) = public.homeos_starter_identity(v_cursor.location)
              and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(v_cursor.parent_area);

            if v_candidate_count = 1 then return v_candidate_id; end if;
            if v_candidate_count > 1 then return null; end if;
        end if;
    end if;

    v_root_id := public.homeos_resolve_overlay_root_for_placement(
        v_child.property_id,
        v_root_identity,
        v_area_name,
        v_outer_parent_area
    );

    if v_root_id = v_child.id then return null; end if;
    return v_root_id;
end;
$$;

-- Resolve every canonical starter relation to one concrete assembly instance.
-- Approved overlays may add another saved hop, so this walks only cards that
-- actually exist and flattens their final relationship to the one-level root.
-- Stable keys win; legacy aliases are considered only when no keyed candidate
-- exists. Duplicate candidates, missing intermediaries, and saved nested Area
-- placements remain deliberately unresolved.
create or replace function public.homeos_resolve_unambiguous_starter_parent(p_child_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_child public.home_items%rowtype;
    v_cursor public.home_items%rowtype;
    v_candidate_id uuid;
    v_candidate_count integer := 0;
    v_overlay_parent_id uuid;
    v_parent_template_key text;
    v_cursor_template_key text;
    v_candidate_parent_template_key text;
    v_placement_identity text;
    v_path uuid[] := array[]::uuid[];
    v_depth integer := 0;
begin
    select child.* into v_child
    from public.home_items child
    where child.id = p_child_id
      and child.parent_home_item_id is null
      and child.property_id is not null
      and lower(btrim(coalesce(child.category, ''))) <> 'area'
      and coalesce(child.archived, false) = false;

    if not found then return null; end if;

    v_cursor := v_child;
    v_cursor_template_key := v_child.starter_template_key;

    for v_depth in 0..8 loop
        if v_cursor.id = any(v_path) then return null; end if;
        v_path := v_path || v_cursor.id;

        -- A UUID already saved on an intermediary is authoritative and keeps
        -- the resulting graph flat.
        if v_cursor.id <> v_child.id and v_cursor.parent_home_item_id is not null then
            select root.id into v_candidate_id
            from public.home_items root
            where root.id = v_cursor.parent_home_item_id
              and root.property_id = v_child.property_id
              and root.parent_home_item_id is null
              and lower(btrim(coalesce(root.category, ''))) <> 'area'
              and coalesce(root.archived, false) = false;

            if found then return v_candidate_id; end if;
            return null;
        end if;

        -- Direct overlays and saved overlay chains share the UI resolver.
        v_overlay_parent_id := public.homeos_resolve_unambiguous_overlay_parent(v_cursor.id);
        if v_overlay_parent_id is not null then return v_overlay_parent_id; end if;

        -- Some established starter writers predate starter_template_key. Match
        -- those rows to the catalog only through one uniquely saved parent and
        -- the same legacy shapes the UI projects. A stable-key parent wins;
        -- unkeyed aliases are considered only when no keyed parent exists.
        if v_cursor_template_key is null then
            if public.homeos_complete_room_kind(v_cursor.location) is null
               and exists (
                   select 1
                   from public.home_items area
                   where area.property_id = v_child.property_id
                     and lower(btrim(coalesce(area.category, ''))) = 'area'
                     and coalesce(area.archived, false) = false
                     and public.homeos_starter_identity(area.name) = public.homeos_starter_identity(v_cursor.location)
                     and public.homeos_starter_identity(area.parent_area) = public.homeos_starter_identity(v_cursor.parent_area)
               ) then
                if v_cursor.id <> v_child.id then return v_cursor.id; end if;
                return null;
            end if;

            with candidates as (
                select distinct parent.id as parent_id, child_template.parent_template_key
                from public.homeos_starter_card_templates child_template
                join public.home_items parent
                  on parent.starter_template_key = child_template.parent_template_key
                where child_template.active
                  and child_template.parent_template_key is not null
                  and public.homeos_starter_identity(v_cursor.name) in (
                      select public.homeos_starter_identity(alias.value)
                      from jsonb_array_elements_text(child_template.aliases || jsonb_build_array(child_template.name)) alias(value)
                  )
                  and parent.property_id = v_child.property_id
                  and parent.id <> all(v_path)
                  and lower(btrim(coalesce(parent.category, ''))) <> 'area'
                  and coalesce(parent.archived, false) = false
                  and (
                      (
                          public.homeos_starter_identity(v_cursor.location) = public.homeos_starter_identity(parent.name)
                          and public.homeos_starter_identity(v_cursor.parent_area) = public.homeos_starter_identity(
                              coalesce(nullif(btrim(coalesce(parent.location, '')), ''), parent.parent_area)
                          )
                      )
                      or (
                          public.homeos_starter_identity(v_cursor.location) = public.homeos_starter_identity(parent.location)
                          and public.homeos_starter_identity(v_cursor.parent_area) = public.homeos_starter_identity(parent.parent_area)
                      )
                      or (
                          nullif(btrim(coalesce(v_cursor.location, '')), '') is null
                          and public.homeos_starter_identity(v_cursor.parent_area) = public.homeos_starter_identity(parent.name)
                      )
                  )
            )
            select min(candidate.parent_id::text)::uuid,
                   min(candidate.parent_template_key),
                   count(*)::integer
            into v_candidate_id, v_candidate_parent_template_key, v_candidate_count
            from candidates candidate;

            if v_candidate_count = 0 then
                with candidates as (
                    select distinct parent.id as parent_id, child_template.parent_template_key
                    from public.homeos_starter_card_templates child_template
                    join public.homeos_starter_card_templates parent_template
                      on parent_template.template_key = child_template.parent_template_key
                    join public.home_items parent
                      on parent.starter_template_key is null
                     and public.homeos_starter_identity(parent.name) in (
                         select public.homeos_starter_identity(alias.value)
                         from jsonb_array_elements_text(parent_template.aliases || jsonb_build_array(parent_template.name)) alias(value)
                     )
                    where child_template.active
                      and child_template.parent_template_key is not null
                      and public.homeos_starter_identity(v_cursor.name) in (
                          select public.homeos_starter_identity(alias.value)
                          from jsonb_array_elements_text(child_template.aliases || jsonb_build_array(child_template.name)) alias(value)
                      )
                      and parent.property_id = v_child.property_id
                      and parent.id <> all(v_path)
                      and lower(btrim(coalesce(parent.category, ''))) <> 'area'
                      and coalesce(parent.archived, false) = false
                      and (
                          (
                              public.homeos_starter_identity(v_cursor.location) = public.homeos_starter_identity(parent.name)
                              and public.homeos_starter_identity(v_cursor.parent_area) = public.homeos_starter_identity(
                                  coalesce(nullif(btrim(coalesce(parent.location, '')), ''), parent.parent_area)
                              )
                          )
                          or (
                              public.homeos_starter_identity(v_cursor.location) = public.homeos_starter_identity(parent.location)
                              and public.homeos_starter_identity(v_cursor.parent_area) = public.homeos_starter_identity(parent.parent_area)
                          )
                          or (
                              nullif(btrim(coalesce(v_cursor.location, '')), '') is null
                              and public.homeos_starter_identity(v_cursor.parent_area) = public.homeos_starter_identity(parent.name)
                          )
                      )
                )
                select min(candidate.parent_id::text)::uuid,
                       min(candidate.parent_template_key),
                       count(*)::integer
                into v_candidate_id, v_candidate_parent_template_key, v_candidate_count
                from candidates candidate;
            end if;

            -- Preserve the oldest parent_area-only UI relationship even when
            -- the child is not a catalog starter. It is safe only when exactly
            -- one active same-property card owns that explicit legacy name.
            if v_candidate_count = 0
               and nullif(btrim(coalesce(v_cursor.location, '')), '') is null
               and nullif(btrim(coalesce(v_cursor.parent_area, '')), '') is not null then
                select min(parent.id::text)::uuid, count(*)::integer
                into v_candidate_id, v_candidate_count
                from public.home_items parent
                where parent.property_id = v_child.property_id
                  and parent.id <> all(v_path)
                  and lower(btrim(coalesce(parent.category, ''))) <> 'area'
                  and coalesce(parent.archived, false) = false
                  and public.homeos_starter_identity(parent.name) = public.homeos_starter_identity(v_cursor.parent_area);

                v_candidate_parent_template_key := null;
            end if;

            if v_candidate_count = 0 then
                if v_cursor.id <> v_child.id then return v_cursor.id; end if;
                return null;
            end if;
            if v_candidate_count <> 1 or v_candidate_id is null then return null; end if;

            select parent.* into v_cursor
            from public.home_items parent
            where parent.id = v_candidate_id;

            v_cursor_template_key := coalesce(
                v_cursor.starter_template_key,
                v_candidate_parent_template_key
            );
            continue;
        end if;

        select template.parent_template_key
        into v_parent_template_key
        from public.homeos_starter_card_templates template
        where template.template_key = v_cursor_template_key
          and template.active;

        if not found then return null; end if;

        -- After at least one saved canonical hop, a template without another
        -- parent is the assembly instance itself (Toilet, Water Heater, Sink,
        -- Dishwasher, and so on). Check this before the nested-Area boundary:
        -- an assembly belongs in that exact Area, while a component whose own
        -- placement names that Area must never be collapsed into its parent.
        if v_parent_template_key is null then
            if v_cursor.id = v_child.id then return null; end if;
            return v_cursor.id;
        end if;

        -- An unrecognized location can be a real nested Area (Pantry beneath
        -- Kitchen), not a legacy component container. Never collapse it into
        -- the complete room named by parent_area.
        if public.homeos_complete_room_kind(v_cursor.location) is null
           and exists (
               select 1
               from public.home_items area
               where area.property_id = v_child.property_id
                 and lower(btrim(coalesce(area.category, ''))) = 'area'
                 and coalesce(area.archived, false) = false
                 and public.homeos_starter_identity(area.name) = public.homeos_starter_identity(v_cursor.location)
                 and public.homeos_starter_identity(area.parent_area) = public.homeos_starter_identity(v_cursor.parent_area)
        ) then
            return null;
        end if;

        v_placement_identity := public.homeos_room_placement_identity(v_cursor.location, v_cursor.parent_area);

        select min(parent.id::text)::uuid, count(*)::integer
        into v_candidate_id, v_candidate_count
        from public.home_items parent
        where parent.property_id = v_child.property_id
          and parent.id <> all(v_path)
          and parent.starter_template_key = v_parent_template_key
          and lower(btrim(coalesce(parent.category, ''))) <> 'area'
          and coalesce(parent.archived, false) = false
          and (
              public.homeos_starter_identity(v_cursor.parent_area) = public.homeos_starter_identity(parent.location)
              or (
                  v_placement_identity is not null
                  and public.homeos_room_placement_identity(parent.location, parent.parent_area) = v_placement_identity
              )
          );

        if v_candidate_count = 0 then
            select min(parent.id::text)::uuid, count(*)::integer
            into v_candidate_id, v_candidate_count
            from public.home_items parent
            join public.homeos_starter_card_templates parent_template
              on parent_template.template_key = v_parent_template_key
            where parent.property_id = v_child.property_id
              and parent.id <> all(v_path)
              and parent.starter_template_key is null
              and lower(btrim(coalesce(parent.category, ''))) <> 'area'
              and coalesce(parent.archived, false) = false
              and (
                  public.homeos_starter_identity(v_cursor.parent_area) = public.homeos_starter_identity(parent.location)
                  or (
                      v_placement_identity is not null
                      and public.homeos_room_placement_identity(parent.location, parent.parent_area) = v_placement_identity
                  )
              )
              and public.homeos_starter_identity(parent.name) in (
                  select public.homeos_starter_identity(alias.value)
                  from jsonb_array_elements_text(parent_template.aliases || jsonb_build_array(parent_template.name)) alias(value)
              );
        end if;

        if v_candidate_count <> 1 or v_candidate_id is null then return null; end if;

        select parent.* into v_cursor
        from public.home_items parent
        where parent.id = v_candidate_id;

        v_cursor_template_key := coalesce(v_cursor.starter_template_key, v_parent_template_key);
    end loop;

    return null;
end;
$$;

create or replace function public.homeos_validate_item_parentage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_parent public.home_items%rowtype;
    v_old_lock_key bigint;
    v_new_lock_key bigint;
    v_needs_parentage_lock boolean;
begin
    v_needs_parentage_lock := case
        when tg_op = 'INSERT' then new.parent_home_item_id is not null
        else old.parent_home_item_id is distinct from new.parent_home_item_id
          or old.property_id is distinct from new.property_id
          or old.category is distinct from new.category
          or old.archived is distinct from new.archived
    end;

    if coalesce(current_setting('barbarosa.homeos_parentage_system_write', true), '') <> 'allowed'
       and v_needs_parentage_lock
       and not (
           coalesce(new.archived, false)
           and lower(btrim(coalesce(new.status, ''))) = 'replaced'
       )
       and new.replaces_home_item_id is null
       and (
           lower(btrim(coalesce(new.category, ''))) <> 'area'
           or (
               tg_op = 'UPDATE'
               and lower(btrim(coalesce(old.category, ''))) <> 'area'
           )
       ) then
        if tg_op = 'UPDATE' and old.property_id is distinct from new.property_id then
            v_old_lock_key := case
                when old.property_id is null then null
                else hashtextextended('home-item-parentage|' || old.property_id::text, 0)
            end;
            v_new_lock_key := case
                when new.property_id is null then null
                else hashtextextended('home-item-parentage|' || new.property_id::text, 0)
            end;

            if v_old_lock_key is not null and v_new_lock_key is not null then
                perform pg_advisory_xact_lock(least(v_old_lock_key, v_new_lock_key));
                if v_old_lock_key <> v_new_lock_key then
                    perform pg_advisory_xact_lock(greatest(v_old_lock_key, v_new_lock_key));
                end if;
            elsif v_old_lock_key is not null then
                perform pg_advisory_xact_lock(v_old_lock_key);
            elsif v_new_lock_key is not null then
                perform pg_advisory_xact_lock(v_new_lock_key);
            end if;
        elsif new.property_id is not null then
            perform pg_advisory_xact_lock(hashtextextended(
                'home-item-parentage|' || new.property_id::text,
                0
            ));
        end if;
    end if;

    if lower(btrim(coalesce(new.category, ''))) = 'area'
       and new.parent_home_item_id is not null then
        raise exception 'An Area card cannot be an assembly component.' using errcode = '23514';
    end if;

    if exists (
        select 1
        from public.home_items child
        where child.parent_home_item_id = new.id
    ) then
        if new.parent_home_item_id is not null then
            raise exception 'HomeOS supports one assembly-to-component level only.' using errcode = '23514';
        end if;

        if lower(btrim(coalesce(new.category, ''))) = 'area' then
            raise exception 'An Area card cannot be the parent of a component card.' using errcode = '23514';
        end if;

        if tg_op = 'UPDATE' and old.property_id is distinct from new.property_id then
            raise exception 'Move or archive linked components before changing an assembly property.' using errcode = '23514';
        end if;
    end if;

    if new.parent_home_item_id is null then
        return new;
    end if;

    if new.id = new.parent_home_item_id then
        raise exception 'A HomeOS card cannot be its own parent.' using errcode = '23514';
    end if;

    if new.property_id is null then
        raise exception 'A linked HomeOS component must belong to a property.' using errcode = '23514';
    end if;

    select parent.*
    into v_parent
    from public.home_items parent
    where parent.id = new.parent_home_item_id;

    if not found then
        raise exception 'The selected HomeOS parent card is unavailable.' using errcode = '23503';
    end if;

    if v_parent.property_id is distinct from new.property_id then
        raise exception 'A HomeOS component and its parent must belong to the same property.' using errcode = '23514';
    end if;

    if lower(btrim(coalesce(v_parent.category, ''))) = 'area' then
        raise exception 'Select an assembly card, not an Area card, as the component parent.' using errcode = '23514';
    end if;

    if v_parent.parent_home_item_id is not null then
        raise exception 'HomeOS supports one assembly-to-component level only.' using errcode = '23514';
    end if;

    if coalesce(new.archived, false) = false
       and coalesce(v_parent.archived, false) then
        raise exception 'An active component cannot belong to an archived assembly.' using errcode = '23514';
    end if;

    if exists (
        select 1
        from public.home_items child
        where child.parent_home_item_id = new.id
    ) then
        raise exception 'An assembly that has components cannot become a component.' using errcode = '23514';
    end if;

    -- The UUID is authoritative. These text fields are refreshed whenever the
    -- component itself is written, but parent rename/move never rewrites child
    -- rows synchronously; that avoids cross-row lock inversion.
    new.location := nullif(btrim(coalesce(v_parent.name, '')), '');
    new.parent_area := nullif(btrim(coalesce(v_parent.location, '')), '');

    return new;
end;
$$;

create or replace function public.homeos_validate_item_parent_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_item public.home_items%rowtype;
    v_parent public.home_items%rowtype;
begin
    select item.*
    into v_item
    from public.home_items item
    where item.id = new.id;

    if not found then
        return null;
    end if;

    if v_item.parent_home_item_id is not null then
        select parent.*
        into v_parent
        from public.home_items parent
        where parent.id = v_item.parent_home_item_id;

        if not found then
            raise exception 'The selected HomeOS parent card is unavailable.' using errcode = '23503';
        end if;

        if v_item.id = v_parent.id
           or v_item.property_id is distinct from v_parent.property_id
           or lower(btrim(coalesce(v_item.category, ''))) = 'area'
           or lower(btrim(coalesce(v_parent.category, ''))) = 'area'
           or v_parent.parent_home_item_id is not null
           or exists (
               select 1
               from public.home_items child
               where child.parent_home_item_id = v_item.id
           ) then
            raise exception 'HomeOS parentage must remain one-level, same-property, acyclic, and outside Area cards.' using errcode = '23514';
        end if;

        if coalesce(v_item.archived, false) = false
           and coalesce(v_parent.archived, false) then
            raise exception 'An active component cannot belong to an archived assembly.' using errcode = '23514';
        end if;
    end if;

    if coalesce(v_item.archived, false)
       and exists (
           select 1
           from public.home_items child
           where child.parent_home_item_id = v_item.id
             and coalesce(child.archived, false) = false
       ) then
        raise exception 'Archive or reassign active component cards before archiving their assembly.' using errcode = '23514';
    end if;

    return null;
end;
$$;

create or replace function public.homeos_preserve_replacement_parentage()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_old_item public.home_items%rowtype;
begin
    if new.replaces_home_item_id is null then
        return null;
    end if;

    perform set_config('barbarosa.homeos_parentage_system_write', 'allowed', true);

    select old_item.*
    into v_old_item
    from public.home_items old_item
    where old_item.id = new.replaces_home_item_id
    for update;

    if not found
       or v_old_item.property_id is distinct from new.property_id
       or v_old_item.user_id is distinct from new.user_id then
        raise exception 'A replacement HomeOS card must keep the retired card property owner.' using errcode = '23514';
    end if;

    if new.parent_home_item_id is not null
       and new.parent_home_item_id is distinct from v_old_item.parent_home_item_id then
        raise exception 'A replacement HomeOS card must keep the retired card parent.' using errcode = '23514';
    end if;

    if new.starter_template_key is not null
       and new.starter_template_key is distinct from v_old_item.starter_template_key then
        raise exception 'A replacement HomeOS card must keep the retired card starter type.' using errcode = '23514';
    end if;

    update public.home_items replacement
    set parent_home_item_id = coalesce(replacement.parent_home_item_id, v_old_item.parent_home_item_id),
        placement_label = coalesce(replacement.placement_label, v_old_item.placement_label),
        starter_template_key = coalesce(replacement.starter_template_key, v_old_item.starter_template_key)
    where replacement.id = new.id
      and (
          replacement.parent_home_item_id is distinct from coalesce(replacement.parent_home_item_id, v_old_item.parent_home_item_id)
          or replacement.placement_label is distinct from coalesce(replacement.placement_label, v_old_item.placement_label)
          or replacement.starter_template_key is distinct from coalesce(replacement.starter_template_key, v_old_item.starter_template_key)
      );

    update public.home_items child
    set parent_home_item_id = new.id
    where child.parent_home_item_id = v_old_item.id;

    return null;
end;
$$;

drop trigger if exists home_items_validate_item_parentage on public.home_items;
create trigger home_items_validate_item_parentage
before insert or update on public.home_items
for each row execute function public.homeos_validate_item_parentage();

drop trigger if exists home_items_validate_item_parent_lifecycle on public.home_items;
create constraint trigger home_items_validate_item_parent_lifecycle
after insert or update on public.home_items
deferrable initially deferred
for each row execute function public.homeos_validate_item_parent_lifecycle();

drop trigger if exists home_items_preserve_replacement_parentage on public.home_items;
create trigger home_items_preserve_replacement_parentage
after insert on public.home_items
for each row
when (new.replaces_home_item_id is not null)
execute function public.homeos_preserve_replacement_parentage();

create or replace function public.homeos_resolve_starter_parentage_after_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_child public.home_items%rowtype;
    v_parent public.home_items%rowtype;
    v_parent_id uuid;
    v_confirmed_parent_id uuid;
    v_target_identity text;
    v_natural_lock_key bigint;
    v_slug_lock_key bigint;
    v_first_lock_key bigint;
    v_second_lock_key bigint;
    v_previous_system_write text;
    v_constraint_name text;
begin
    select child.* into v_child
    from public.home_items child
    where child.id = new.id
      and child.parent_home_item_id is null
      and child.property_id is not null
      and lower(btrim(coalesce(child.category, ''))) <> 'area'
      and coalesce(child.archived, false) = false;

    if not found then return null; end if;

    v_parent_id := public.homeos_resolve_unambiguous_starter_parent(v_child.id);
    if v_parent_id is null then return null; end if;

    -- This is intentionally a non-locking parent read. The originating write
    -- may already hold the child row, so waiting on a parent here would invert
    -- archive/replacement order and create a child-row/parent-row deadlock.
    select parent.* into v_parent
    from public.home_items parent
    where parent.id = v_parent_id
      and parent.property_id = v_child.property_id
      and parent.parent_home_item_id is null
      and lower(btrim(coalesce(parent.category, ''))) <> 'area'
      and coalesce(parent.archived, false) = false;

    if not found then return null; end if;

    v_confirmed_parent_id := public.homeos_resolve_unambiguous_starter_parent(v_child.id);
    if v_confirmed_parent_id is distinct from v_parent.id then return null; end if;

    v_target_identity := public.homeos_item_placement_identity(
        v_child.system,
        v_child.category,
        v_child.name,
        v_parent.name,
        v_parent.location
    );
    v_natural_lock_key := hashtextextended(
        v_child.property_id::text || '|' || v_target_identity,
        0
    );
    v_slug_lock_key := hashtextextended(
        'home-item-parent-slug|' || v_child.property_id::text || '|' ||
        lower(coalesce(v_child.item_slug, '')) || '|' ||
        public.homeos_starter_identity(v_parent.name) || '|' ||
        public.homeos_starter_identity(v_parent.location),
        0
    );
    v_first_lock_key := least(v_natural_lock_key, v_slug_lock_key);
    v_second_lock_key := greatest(v_natural_lock_key, v_slug_lock_key);

    -- Never wait while a deferred trigger is holding row locks. A competing
    -- writer will resolve its own row; this row safely remains legacy-only for
    -- a later explicit edit/recovery instead of risking a deadlock.
    if not pg_try_advisory_xact_lock(v_first_lock_key) then return null; end if;
    if v_second_lock_key <> v_first_lock_key
       and not pg_try_advisory_xact_lock(v_second_lock_key) then
        return null;
    end if;

    -- Recheck active uniqueness after serialization. Deferred inference must
    -- never make an otherwise valid create fail or pick one of two parents.
    if exists (
        select 1
        from public.home_items conflict_item
        where conflict_item.property_id = v_child.property_id
          and conflict_item.id <> v_child.id
          and coalesce(conflict_item.archived, false) = false
          and public.homeos_item_placement_identity(
              conflict_item.system,
              conflict_item.category,
              conflict_item.name,
              conflict_item.location,
              conflict_item.parent_area
          ) = v_target_identity
    ) or exists (
        select 1
        from public.home_items slug_conflict
        where v_child.item_slug is not null
          and slug_conflict.property_id = v_child.property_id
          and slug_conflict.id <> v_child.id
          and coalesce(slug_conflict.archived, false) = false
          and lower(slug_conflict.item_slug) = lower(v_child.item_slug)
          and public.homeos_starter_identity(slug_conflict.location) = public.homeos_starter_identity(v_parent.name)
          and public.homeos_starter_identity(slug_conflict.parent_area) = public.homeos_starter_identity(v_parent.location)
    ) then
        return null;
    end if;

    v_previous_system_write := coalesce(
        current_setting('barbarosa.homeos_parentage_system_write', true),
        ''
    );

    begin
        perform set_config('barbarosa.homeos_parentage_system_write', 'allowed', true);

        update public.home_items child
        set parent_home_item_id = v_parent.id
        where child.id = v_child.id
          and child.parent_home_item_id is null
          and coalesce(child.archived, false) = false;

        perform set_config(
            'barbarosa.homeos_parentage_system_write',
            v_previous_system_write,
            true
        );
    exception
        when unique_violation then
            get stacked diagnostics v_constraint_name = constraint_name;
            perform set_config(
                'barbarosa.homeos_parentage_system_write',
                v_previous_system_write,
                true
            );

            if v_constraint_name in (
                'home_items_property_placement_identity_key',
                'home_items_property_placement_slug_key'
            ) then
                return null;
            end if;
            raise;
        when others then
            perform set_config(
                'barbarosa.homeos_parentage_system_write',
                v_previous_system_write,
                true
            );
            raise;
    end;

    return null;
end;
$$;

-- The homeowner Manage action uses this explicit cascade. Ordinary direct
-- updates keep the deferred lifecycle guard and cannot orphan active children.
create or replace function public.archive_home_item_with_components(p_home_item_id uuid)
returns table (
    archived_home_item_id uuid,
    archived_component_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_item public.home_items%rowtype;
    v_inferred_claim_ids uuid[] := array[]::uuid[];
    v_archived_component_count integer := 0;
    v_newly_archived integer := 0;
begin
    if auth.uid() is null then
        raise exception 'Sign in to archive a HomeOS item.' using errcode = '42501';
    end if;

    select item.*
    into v_item
    from public.home_items item
    where item.id = p_home_item_id;

    if not found then
        raise exception 'That HomeOS item is unavailable.' using errcode = 'P0002';
    end if;

    if lower(btrim(coalesce(v_item.category, ''))) = 'area' then
        raise exception 'Archive property areas through Area management.' using errcode = '23514';
    end if;

    if not public.homeos_can_mutate_property_record(v_item.property_id, v_item.user_id) then
        raise exception 'You cannot archive that HomeOS item.' using errcode = '42501';
    end if;

    -- Lock the selected item before its children. Replacement closeout already
    -- uses this order, and this RPC deliberately does not take the parentage
    -- advisory lock. Component validators do not lock the parent row, so an
    -- edit can finish without forming a row/advisory-lock cycle.
    select item.*
    into v_item
    from public.home_items item
    where item.id = p_home_item_id
    for update;

    if not found
       or not public.homeos_can_mutate_property_record(v_item.property_id, v_item.user_id) then
        raise exception 'You cannot archive that HomeOS item.' using errcode = '42501';
    end if;

    perform set_config('barbarosa.homeos_parentage_system_write', 'allowed', true);

    -- Persist every currently unambiguous canonical or approved legacy child
    -- before the selected root disappears from active reads. If an inferred
    -- intermediary still owns one-level children, move those descendants first
    -- so the final archived graph is flat and valid.
    select coalesce(array_agg(child.id order by child.id), array[]::uuid[])
    into v_inferred_claim_ids
    from public.home_items child
    where child.property_id = v_item.property_id
      and child.parent_home_item_id is null
      and coalesce(child.archived, false) = false
      and public.homeos_resolve_unambiguous_starter_parent(child.id) = v_item.id;

    -- Lock the inferred claims in a stable order, then resolve them again from
    -- their post-wait state. A concurrent edit must never be overwritten from
    -- a stale resolver snapshot.
    perform child.id
    from public.home_items child
    where child.id = any(v_inferred_claim_ids)
    order by child.id
    for update;

    select coalesce(array_agg(child.id order by child.id), array[]::uuid[])
    into v_inferred_claim_ids
    from public.home_items child
    where child.id = any(v_inferred_claim_ids)
      and child.property_id = v_item.property_id
      and child.parent_home_item_id is null
      and coalesce(child.archived, false) = false
      and public.homeos_resolve_unambiguous_starter_parent(child.id) = v_item.id;

    -- Direct and intermediary-owned components are the remaining rows this
    -- cascade can mutate. Lock those too before authorization and updates.
    perform child.id
    from public.home_items child
    where child.property_id = v_item.property_id
      and coalesce(child.archived, false) = false
      and (
          child.parent_home_item_id = v_item.id
          or child.parent_home_item_id = any(v_inferred_claim_ids)
      )
    order by child.id
    for update;

    -- SECURITY DEFINER must not turn ownership of the selected assembly into
    -- authority over another member's records. RLS permits only each record's
    -- creator to mutate it, so require the same authorization for every row
    -- this explicit cascade is about to archive or reparent.
    if exists (
        select 1
        from public.home_items child
        where child.property_id = v_item.property_id
          and coalesce(child.archived, false) = false
          and (
              child.parent_home_item_id = v_item.id
              or child.id = any(v_inferred_claim_ids)
              or child.parent_home_item_id = any(v_inferred_claim_ids)
          )
          and not public.homeos_can_mutate_property_record(child.property_id, child.user_id)
    ) then
        raise exception 'You cannot archive one or more component cards owned by another property member.' using errcode = '42501';
    end if;

    select count(*)::integer
    into v_newly_archived
    from public.home_items nested_child
    where nested_child.parent_home_item_id = any(v_inferred_claim_ids)
      and coalesce(nested_child.archived, false) = false;

    update public.home_items nested_child
    set parent_home_item_id = v_item.id,
        archived = true
    where nested_child.parent_home_item_id = any(v_inferred_claim_ids)
      and coalesce(nested_child.archived, false) = false;

    v_archived_component_count := v_archived_component_count + v_newly_archived;

    update public.home_items inferred_child
    set parent_home_item_id = v_item.id,
        archived = true
    where inferred_child.id = any(v_inferred_claim_ids)
      and inferred_child.property_id = v_item.property_id
      and inferred_child.parent_home_item_id is null
      and coalesce(inferred_child.archived, false) = false
      and public.homeos_resolve_unambiguous_starter_parent(inferred_child.id) = v_item.id;

    get diagnostics v_newly_archived = row_count;
    v_archived_component_count := v_archived_component_count + v_newly_archived;

    update public.home_items child
    set archived = true
    where child.parent_home_item_id = v_item.id
      and coalesce(child.archived, false) = false;

    get diagnostics v_newly_archived = row_count;
    v_archived_component_count := v_archived_component_count + v_newly_archived;

    update public.home_items item
    set archived = true
    where item.id = v_item.id
      and coalesce(item.archived, false) = false;

    return query
    select v_item.id, v_archived_component_count;
end;
$$;

-- Persist every uniquely resolved canonical starter relation before considering
-- broader unkeyed legacy location inference. Descendants resolve only through
-- a unique saved intermediary chain, and repeated passes let a newly durable
-- intermediate expose that same chain without inventing missing cards.
do $$
declare
    v_linked integer := 0;
    v_pass integer;
begin
    for v_pass in 1..8 loop
        with overlay_resolved as (
            select
                child.id as child_id,
                public.homeos_resolve_unambiguous_starter_parent(child.id) as parent_id
            from public.home_items child
            where child.parent_home_item_id is null
              and child.property_id is not null
              and lower(btrim(coalesce(child.category, ''))) <> 'area'
              and coalesce(child.archived, false) = false
        ),
        overlay_proposals as (
            select
                resolved.child_id,
                resolved.parent_id,
                child.property_id,
                public.homeos_item_placement_identity(
                    child.system,
                    child.category,
                    child.name,
                    parent.name,
                    parent.location
                ) as proposed_identity,
                lower(child.item_slug) as proposed_slug,
                public.homeos_starter_identity(parent.name) as proposed_location,
                public.homeos_starter_identity(parent.location) as proposed_parent_area
            from overlay_resolved resolved
            join public.home_items child on child.id = resolved.child_id
            join public.home_items parent on parent.id = resolved.parent_id
            where resolved.parent_id is not null
        ),
        safe_overlay_resolved as (
            select proposal.child_id, proposal.parent_id
            from overlay_proposals proposal
            join public.home_items child on child.id = proposal.child_id
            join public.home_items parent on parent.id = proposal.parent_id
            where (
                select count(*)
                from overlay_proposals peer
                where peer.property_id = proposal.property_id
                  and peer.proposed_identity = proposal.proposed_identity
            ) = 1
              and (
                  proposal.proposed_slug is null
                  or (
                      select count(*)
                      from overlay_proposals peer
                      where peer.property_id = proposal.property_id
                        and peer.proposed_slug = proposal.proposed_slug
                        and peer.proposed_location = proposal.proposed_location
                        and peer.proposed_parent_area = proposal.proposed_parent_area
                  ) = 1
              )
              and not exists (
                  select 1
                  from public.home_items conflict_item
                  where conflict_item.property_id = proposal.property_id
                    and conflict_item.id <> child.id
                    and coalesce(conflict_item.archived, false) = false
                    and public.homeos_item_placement_identity(
                        conflict_item.system,
                        conflict_item.category,
                        conflict_item.name,
                        conflict_item.location,
                        conflict_item.parent_area
                    ) = proposal.proposed_identity
              )
              and not exists (
                  select 1
                  from public.home_items slug_conflict
                  where slug_conflict.property_id = child.property_id
                    and slug_conflict.id <> child.id
                    and coalesce(slug_conflict.archived, false) = false
                    and lower(slug_conflict.item_slug) = proposal.proposed_slug
                    and public.homeos_starter_identity(slug_conflict.location) = proposal.proposed_location
                    and public.homeos_starter_identity(slug_conflict.parent_area) = proposal.proposed_parent_area
              )
        )
        update public.home_items child
        set parent_home_item_id = resolved.parent_id
        from safe_overlay_resolved resolved
        where child.id = resolved.child_id
          and child.parent_home_item_id is null;

        get diagnostics v_linked = row_count;
        exit when v_linked = 0;
    end loop;
end;
$$;

-- Backfill only an unambiguous active unkeyed legacy relationship. Canonical
-- keyed rows were handled above; this final compatibility pass accepts only an
-- explicit location/parent_area chain. Nested Areas, ambiguous matches,
-- placement conflicts, and multi-level chains remain null for later review.
with eligible_children as (
    select child.*
    from public.home_items child
    where child.parent_home_item_id is null
      -- Keyed rows were handled by the conservative resolver above. This
      -- broader legacy fallback must not override a keyed ambiguity, missing
      -- intermediary, or exact nested-Area boundary.
      and child.starter_template_key is null
      and child.property_id is not null
      and lower(btrim(coalesce(child.category, ''))) <> 'area'
      and coalesce(child.archived, false) = false
      and not (
          public.homeos_complete_room_kind(child.location) is null
          and exists (
              select 1
              from public.home_items area
              where area.property_id = child.property_id
                and lower(btrim(coalesce(area.category, ''))) = 'area'
                and coalesce(area.archived, false) = false
                and public.homeos_starter_identity(area.name) = public.homeos_starter_identity(child.location)
                and public.homeos_starter_identity(area.parent_area) = public.homeos_starter_identity(child.parent_area)
          )
      )
),
explicit_candidates as (
    select child.id as child_id, parent.id as parent_id
    from eligible_children child
    join public.home_items parent
      on parent.property_id = child.property_id
     and parent.id <> child.id
     and parent.parent_home_item_id is null
     and lower(btrim(coalesce(parent.category, ''))) <> 'area'
     and coalesce(parent.archived, false) = false
     and public.homeos_starter_identity(parent.name) = public.homeos_starter_identity(child.location)
     and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(child.parent_area)
    where nullif(btrim(coalesce(child.parent_area, '')), '') is not null
),
explicit_resolved as (
    select candidate.child_id, min(candidate.parent_id::text)::uuid as parent_id
    from explicit_candidates candidate
    group by candidate.child_id
    having count(distinct candidate.parent_id) = 1
),
all_candidates as (
    select explicit.child_id, explicit.parent_id from explicit_candidates explicit
),
resolved as (
    select explicit.child_id, explicit.parent_id from explicit_resolved explicit
),
one_level_resolved as (
    select resolved.child_id, resolved.parent_id
    from resolved
    where not exists (
        select 1
        from all_candidates deeper_parent
        where deeper_parent.child_id = resolved.parent_id
    )
      and not exists (
          select 1
          from all_candidates nested_child
          where nested_child.parent_id = resolved.child_id
      )
),
proposals as (
    select
        resolved.child_id,
        resolved.parent_id,
        child.property_id,
        public.homeos_item_placement_identity(
            child.system,
            child.category,
            child.name,
            parent.name,
            parent.location
        ) as proposed_identity,
        lower(child.item_slug) as proposed_slug,
        public.homeos_starter_identity(parent.name) as proposed_location,
        public.homeos_starter_identity(parent.location) as proposed_parent_area
    from one_level_resolved resolved
    join public.home_items child on child.id = resolved.child_id
    join public.home_items parent on parent.id = resolved.parent_id
),
safe_resolved as (
    select proposal.child_id, proposal.parent_id
    from proposals proposal
    join public.home_items child on child.id = proposal.child_id
    where (
        select count(*)
        from proposals peer
        where peer.property_id = proposal.property_id
          and peer.proposed_identity = proposal.proposed_identity
    ) = 1
      and (
          proposal.proposed_slug is null
          or (
              select count(*)
              from proposals peer
              where peer.property_id = proposal.property_id
                and peer.proposed_slug = proposal.proposed_slug
                and peer.proposed_location = proposal.proposed_location
                and peer.proposed_parent_area = proposal.proposed_parent_area
          ) = 1
      )
      and not exists (
        select 1
        from public.home_items conflict_item
        where conflict_item.property_id = proposal.property_id
          and conflict_item.id <> child.id
          and coalesce(conflict_item.archived, false) = false
          and public.homeos_item_placement_identity(
              conflict_item.system,
              conflict_item.category,
              conflict_item.name,
              conflict_item.location,
              conflict_item.parent_area
          ) = proposal.proposed_identity
    )
      and not exists (
          select 1
          from public.home_items slug_conflict
          where slug_conflict.property_id = child.property_id
            and slug_conflict.id <> child.id
            and coalesce(slug_conflict.archived, false) = false
            and lower(slug_conflict.item_slug) = proposal.proposed_slug
            and public.homeos_starter_identity(slug_conflict.location) = proposal.proposed_location
            and public.homeos_starter_identity(slug_conflict.parent_area) = proposal.proposed_parent_area
      )
)
update public.home_items child
set parent_home_item_id = resolved.parent_id
from safe_resolved resolved
where child.id = resolved.child_id
  and child.parent_home_item_id is null;

alter table public.home_items
    validate constraint home_items_parent_home_item_id_fkey;

-- Every future canonical starter or explicit parent_area-only legacy write
-- receives one deferred opportunity to persist its concrete parent after the
-- full statement/transaction is visible. This covers multi-row inserts in any
-- row order and root-first one-row writers without overriding explicit parents
-- or guessing duplicates.
drop trigger if exists home_items_resolve_starter_parentage_after_write on public.home_items;
create constraint trigger home_items_resolve_starter_parentage_after_write
after insert or update on public.home_items
deferrable initially deferred
for each row execute function public.homeos_resolve_starter_parentage_after_write();

-- The room provisioner now records the concrete assembly instance after the
-- parent template has been resolved. Existing text matching remains as a
-- compatibility and idempotency path.
create or replace function public.provision_complete_room_starter_cards(p_area_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_area public.home_items%rowtype;
    v_template public.homeos_starter_card_templates%rowtype;
    v_parent_id uuid;
    v_direct_parent_id uuid;
    v_parent_name text;
    v_parent_candidate_count integer := 0;
    v_overlay_root_identity text;
    v_slug text;
    v_base_slug text;
    v_suffix integer;
    v_created integer := 0;
    v_inserted integer := 0;
    v_existing_id uuid;
    v_is_master_bathroom boolean := false;
begin
    select area.* into v_area
    from public.home_items area
    where area.id = p_area_id
      and lower(btrim(area.category)) = 'area'
      and coalesce(area.archived, false) = false
      and nullif(btrim(coalesce(area.parent_area, '')), '') is null
    for update;

    if not found or public.homeos_complete_room_kind(v_area.name) is null then return 0; end if;
    v_is_master_bathroom := public.homeos_is_master_bathroom(v_area.name);

    perform set_config('barbarosa.homeos_parentage_system_write', 'allowed', true);

    for v_template in
        select template.*
        from public.homeos_starter_card_templates template
        where template.active
          and public.homeos_property_trade_enabled(v_area.property_id, template.trade_key)
          and (
              template.room_kind = public.homeos_complete_room_kind(v_area.name)
              or (
                  v_is_master_bathroom
                  and (
                      template.room_kind = 'master_bathroom'
                      or template.template_key in (
                          'electrical_bathroom:bathroom_exhaust_fan',
                          'electrical_living_room:interior_light_fixture'
                      )
                  )
              )
          )
        order by
            case
                when template.room_kind = 'bathroom' then 0
                when template.room_kind = 'master_bathroom' then 1
                else 2
            end,
            template.display_order,
            template.name
    loop
        v_parent_id := null;
        v_direct_parent_id := null;
        v_parent_name := null;
        v_parent_candidate_count := 0;
        v_overlay_root_identity := public.homeos_overlay_root_identity(
            v_template.template_key,
            v_template.name,
            v_template.room_kind
        );

        if v_overlay_root_identity is not null then
            v_parent_id := public.homeos_resolve_overlay_root_for_placement(
                v_area.property_id,
                v_overlay_root_identity,
                v_area.name,
                nullif(btrim(coalesce(v_area.parent_area, '')), '')
            );

            if v_parent_id is null then
                -- Missing or repeated root assemblies are intentionally left
                -- for explicit user selection; never guess an instance.
                continue;
            end if;

            select parent.name into v_parent_name
            from public.home_items parent
            where parent.id = v_parent_id;
        elsif v_template.parent_template_key is not null then
            select min(parent.id::text)::uuid, count(*)::integer
            into v_direct_parent_id, v_parent_candidate_count
            from public.home_items parent
            where parent.property_id = v_area.property_id
              and parent.starter_template_key = v_template.parent_template_key
              and lower(btrim(coalesce(parent.category, ''))) <> 'area'
              and coalesce(parent.archived, false) = false
              and (
                  (
                      parent.parent_home_item_id is null
                      and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(v_area.name)
                      and public.homeos_starter_identity(parent.parent_area) = public.homeos_starter_identity(v_area.parent_area)
                  )
                  or exists (
                      select 1
                      from public.home_items root
                      where root.id = parent.parent_home_item_id
                        and root.property_id = v_area.property_id
                        and root.parent_home_item_id is null
                        and lower(btrim(coalesce(root.category, ''))) <> 'area'
                        and coalesce(root.archived, false) = false
                        and public.homeos_starter_identity(root.location) = public.homeos_starter_identity(v_area.name)
                        and public.homeos_starter_identity(root.parent_area) = public.homeos_starter_identity(v_area.parent_area)
                  )
              );

            if v_parent_candidate_count = 0 then
                select min(parent.id::text)::uuid, count(*)::integer
                into v_direct_parent_id, v_parent_candidate_count
                from public.home_items parent
                join public.homeos_starter_card_templates parent_template
                  on parent_template.template_key = v_template.parent_template_key
                where parent.property_id = v_area.property_id
                  and parent.starter_template_key is null
                  and lower(btrim(coalesce(parent.category, ''))) <> 'area'
                  and coalesce(parent.archived, false) = false
                  and (
                      (
                          parent.parent_home_item_id is null
                          and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(v_area.name)
                          and public.homeos_starter_identity(parent.parent_area) = public.homeos_starter_identity(v_area.parent_area)
                      )
                      or exists (
                          select 1
                          from public.home_items root
                          where root.id = parent.parent_home_item_id
                            and root.property_id = v_area.property_id
                            and root.parent_home_item_id is null
                            and lower(btrim(coalesce(root.category, ''))) <> 'area'
                            and coalesce(root.archived, false) = false
                            and public.homeos_starter_identity(root.location) = public.homeos_starter_identity(v_area.name)
                            and public.homeos_starter_identity(root.parent_area) = public.homeos_starter_identity(v_area.parent_area)
                      )
                  )
                  and public.homeos_starter_identity(parent.name) in (
                      select public.homeos_starter_identity(value)
                      from jsonb_array_elements_text(parent_template.aliases || jsonb_build_array(parent_template.name)) value
                  );
            end if;

            if v_parent_candidate_count <> 1 or v_direct_parent_id is null then
                continue;
            end if;

            -- The saved starter chain may already place this immediate parent
            -- beneath an approved overlay root. Keep the durable graph at one
            -- assembly -> component level by linking the new descendant to
            -- that root rather than creating a UUID grandchild.
            select
                case
                    when parent.parent_home_item_id is null then parent.id
                    else root.id
                end,
                coalesce(root.name, parent.name)
            into v_parent_id, v_parent_name
            from public.home_items parent
            left join public.home_items root
              on root.id = parent.parent_home_item_id
             and root.property_id = parent.property_id
             and root.parent_home_item_id is null
             and lower(btrim(coalesce(root.category, ''))) <> 'area'
             and coalesce(root.archived, false) = false
            where parent.id = v_direct_parent_id;

            if v_parent_id is null then
                continue;
            end if;
        end if;

        perform pg_advisory_xact_lock(hashtextextended(
            v_area.property_id::text || '|' || public.homeos_item_placement_identity(
                v_template.system,
                v_template.category,
                v_template.name,
                case when v_parent_id is null then v_area.name else v_parent_name end,
                case when v_parent_id is null then '' else v_area.name end
            ),
            0
        ));

        v_existing_id := null;
        select item.id into v_existing_id
        from public.home_items item
        where item.property_id = v_area.property_id
          and lower(btrim(item.category)) <> 'area'
          and coalesce(item.archived, false) = false
          and public.homeos_starter_identity(item.name) in (
              select public.homeos_starter_identity(value)
              from jsonb_array_elements_text(v_template.aliases || jsonb_build_array(v_template.name)) value
          )
          and (
              (
                  v_parent_id is null
                  and item.parent_home_item_id is null
                  and public.homeos_starter_identity(item.location) = public.homeos_starter_identity(v_area.name)
                  and nullif(btrim(coalesce(item.parent_area, '')), '') is null
              )
              or (
                  v_parent_id is not null
                  and (
                      item.parent_home_item_id = v_parent_id
                      or (
                          item.parent_home_item_id is null
                          and (
                              (
                                  public.homeos_starter_identity(item.location) = public.homeos_starter_identity(v_area.name)
                                  and nullif(btrim(coalesce(item.parent_area, '')), '') is null
                              )
                              or public.homeos_starter_identity(item.parent_area) = public.homeos_starter_identity(v_area.name)
                          )
                      )
                  )
              )
          )
        order by
            case when item.parent_home_item_id = v_parent_id and v_parent_id is not null then 0 else 1 end,
            item.created_at,
            item.id
        limit 1;

        if v_existing_id is not null then
            update public.home_items item
            set starter_template_key = coalesce(item.starter_template_key, v_template.template_key),
                parent_home_item_id = case
                    when v_parent_id is null then item.parent_home_item_id
                    else coalesce(item.parent_home_item_id, v_parent_id)
                end
            where item.id = v_existing_id;
            continue;
        end if;

        v_base_slug := regexp_replace(lower(v_area.name || '-' || v_template.name), '[^a-z0-9]+', '-', 'g');
        v_base_slug := trim(both '-' from v_base_slug);
        v_slug := v_base_slug;
        v_suffix := 2;
        while exists (
            select 1 from public.home_items item
            where item.property_id = v_area.property_id and lower(item.item_slug) = lower(v_slug)
        ) loop
            v_slug := v_base_slug || '-' || v_suffix::text;
            v_suffix := v_suffix + 1;
        end loop;

        insert into public.home_items(
            user_id, property_id, item_slug, name, system, category,
            location, parent_area, status, install_state, archived,
            starter_template_key, parent_home_item_id
        ) values (
            v_area.user_id,
            v_area.property_id,
            v_slug,
            v_template.name,
            v_template.system,
            v_template.category,
            case when v_parent_id is null then v_area.name else v_parent_name end,
            case when v_parent_id is null then '' else v_area.name end,
            'Missing Information',
            case
                when v_is_master_bathroom
                  or v_template.template_key in ('bathroom:shower_trim', 'bathroom:tub_shower_trim')
                    then 'Unknown'
                else 'Installed'
            end,
            false,
            v_template.template_key,
            v_parent_id
        )
        on conflict do nothing;

        get diagnostics v_inserted = row_count;
        v_created := v_created + v_inserted;
    end loop;

    return v_created;
end;
$$;

-- Fixed TABLE return types must be recreated to append the non-sensitive
-- instance parent id used by provider and Sales card navigation.
drop function public.get_provider_homeos_items(uuid,uuid,uuid,uuid,uuid,text);

create function public.get_provider_homeos_items(
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
    starter_template_key text,
    parent_home_item_id uuid,
    placement_label text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.homeos_can_read_provider_assigned_items(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then
        raise exception 'Not authorized to read provider HomeOS items for this assigned job.';
    end if;

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
        null::text as about,
        null::text as brand,
        null::text as model,
        null::text as serial,
        null::text as install_date,
        item.created_at,
        item.install_state,
        null::text as photo_url,
        item.archived,
        item.property_id,
        item.starter_template_key,
        item.parent_home_item_id,
        item.placement_label
    from public.home_items item
    where item.property_id = p_property_id
      and (p_item_slug is null or item.item_slug = p_item_slug)
      and coalesce(item.archived, false) = false
    order by item.system asc nulls last, item.name asc nulls last, item.id asc;
end;
$$;

drop function public.get_sales_company_homeos_items(uuid,uuid,uuid,uuid,uuid,text);

create function public.get_sales_company_homeos_items(
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
    starter_template_key text,
    parent_home_item_id uuid,
    placement_label text
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
    ) then
        raise exception 'Sales HomeOS access requires an active company client home.';
    end if;

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
        item.starter_template_key,
        item.parent_home_item_id,
        item.placement_label
    from public.home_items item
    where item.property_id = p_property_id
      and (p_item_slug is null or item.item_slug = p_item_slug)
      and coalesce(item.archived, false) = false
    order by item.system asc nulls last, item.name asc nulls last, item.id asc;
end;
$$;

-- Replace the public create wrappers in dependency order. The internal
-- provider creator remains unchanged; this wrapper canonicalizes the legacy
-- placement from the selected parent, then attaches the durable relationship
-- in the same transaction.
drop function public.create_sales_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid);
drop function public.create_sales_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text);
drop function public.create_provider_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid);
drop function public.create_provider_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text);

create function public.create_provider_homeos_item(
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
    p_serial text default null,
    p_parent_home_item_id uuid default null,
    p_placement_label text default null
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
    parent_home_item_id uuid,
    placement_label text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_trade_key text := public.homeos_trade_key_for_system(p_system);
    v_item_id uuid;
    v_component_candidate_count integer := 0;
    v_reused_existing boolean := false;
    v_item public.home_items%rowtype;
    v_location text := p_location;
    v_parent_area text := p_parent_area;
    v_placement_label text := nullif(btrim(coalesce(p_placement_label, '')), '');
begin
    if v_trade_key is not null and not public.homeos_company_trade_enabled(p_company_id, v_trade_key) then
        raise exception 'This company does not have % enabled for new HomeOS cards.', initcap(v_trade_key) using errcode = '42501';
    end if;

    if not public.homeos_can_read_provider_assigned_items(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then
        raise exception 'Not authorized to publish provider HomeOS items for this assigned job.' using errcode = '42501';
    end if;

    if char_length(v_placement_label) > 120 then
        raise exception 'A HomeOS placement label must be 120 characters or fewer.' using errcode = '22001';
    end if;

    if p_parent_home_item_id is not null then
        select
            nullif(btrim(coalesce(parent.name, '')), ''),
            nullif(btrim(coalesce(parent.location, '')), '')
        into v_location, v_parent_area
        from public.home_items parent
        where parent.id = p_parent_home_item_id
          and parent.property_id = p_property_id
          and parent.parent_home_item_id is null
          and lower(btrim(coalesce(parent.category, ''))) <> 'area'
          and coalesce(parent.archived, false) = false
        for key share;

        if not found then
            raise exception 'Select an active assembly card from this property.' using errcode = '23514';
        end if;
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
        p_property_id::text || '|' || public.homeos_item_placement_identity(
            p_system,
            p_category,
            p_name,
            v_location,
            v_parent_area
        ),
        0
    ));

    -- The UUID relationship is durable even when a parent is renamed or
    -- moved and the child's legacy location snapshot is intentionally stale.
    -- Resolve that exact component before delegating to the legacy text-only
    -- creator, while labels keep legitimate repeated instances distinct.
    if p_parent_home_item_id is not null then
        select min(item.id::text)::uuid, count(*)::integer
        into v_item_id, v_component_candidate_count
        from public.home_items item
        where item.property_id = p_property_id
          and item.parent_home_item_id = p_parent_home_item_id
          and lower(btrim(coalesce(item.category, ''))) <> 'area'
          and coalesce(item.archived, false) = false
          and public.homeos_starter_identity(item.system) = public.homeos_starter_identity(p_system)
          and public.homeos_starter_identity(item.category) = public.homeos_starter_identity(p_category)
          and public.homeos_starter_identity(item.name) = public.homeos_starter_identity(p_name)
          and (
              (v_placement_label is null and item.placement_label is null)
              or (
                  v_placement_label is not null
                  and (item.placement_label is null or item.placement_label = v_placement_label)
              )
          );

        if v_component_candidate_count > 1 then
            raise exception 'More than one component matches that assembly and label; choose the existing card explicitly.' using errcode = '23514';
        elsif v_component_candidate_count = 1 then
            v_reused_existing := true;
        end if;
    end if;

    if v_item_id is null then
        -- The delegated legacy creator may also reuse the active row at this
        -- exact text placement. Remember that state before calling it so a
        -- create RPC cannot become an unmasked read of an existing card.
        select exists (
            select 1
            from public.home_items item
            where item.property_id = p_property_id
              and coalesce(item.archived, false) = false
              and (
                  (
                      lower(btrim(coalesce(p_category, ''))) = 'area'
                      and lower(btrim(coalesce(item.category, ''))) = 'area'
                      and public.homeos_starter_identity(item.system) = public.homeos_starter_identity(p_system)
                      and public.homeos_starter_identity(item.name) = public.homeos_starter_identity(p_name)
                      and public.homeos_starter_identity(item.parent_area) = public.homeos_starter_identity(v_parent_area)
                  )
                  or (
                      lower(btrim(coalesce(p_category, ''))) <> 'area'
                      and lower(btrim(coalesce(item.category, ''))) <> 'area'
                      and public.homeos_starter_identity(item.system) = public.homeos_starter_identity(p_system)
                      and public.homeos_starter_identity(item.category) = public.homeos_starter_identity(p_category)
                      and public.homeos_starter_identity(item.name) = public.homeos_starter_identity(p_name)
                      and public.homeos_starter_identity(item.location) = public.homeos_starter_identity(v_location)
                      and public.homeos_starter_identity(item.parent_area) = public.homeos_starter_identity(v_parent_area)
                  )
              )
        ) into v_reused_existing;

        select created.id
        into v_item_id
        from public.create_provider_homeos_item_unscoped_internal(
            p_company_id,
            p_property_id,
            p_service_request_id,
            p_schedule_slot_id,
            p_job_id,
            p_item_slug,
            p_name,
            p_system,
            p_category,
            v_location,
            v_parent_area,
            p_status,
            p_install_state,
            p_about,
            p_brand,
            p_model,
            p_serial
        ) created
        limit 1;
    end if;

    if v_item_id is null then
        raise exception 'The assigned HomeOS card could not be created.';
    end if;

    select item.*
    into v_item
    from public.home_items item
    where item.id = v_item_id
    for update;

    if p_parent_home_item_id is not null
       and v_item.parent_home_item_id is not null
       and v_item.parent_home_item_id <> p_parent_home_item_id then
        raise exception 'That HomeOS card already belongs to a different assembly.' using errcode = '23514';
    end if;

    if v_placement_label is not null
       and v_item.placement_label is not null
       and v_item.placement_label <> v_placement_label then
        raise exception 'That HomeOS card already uses a different placement label.' using errcode = '23514';
    end if;

    if (p_parent_home_item_id is not null and v_item.parent_home_item_id is null)
       or (v_placement_label is not null and v_item.placement_label is null) then
        update public.home_items item
        set parent_home_item_id = case
                when p_parent_home_item_id is null then item.parent_home_item_id
                else coalesce(item.parent_home_item_id, p_parent_home_item_id)
            end,
            placement_label = coalesce(item.placement_label, v_placement_label)
        where item.id = v_item_id
        returning item.* into v_item;
    end if;

    return query
    select
        v_item.id,
        v_item.item_slug,
        v_item.name,
        v_item.system,
        v_item.category,
        v_item.parent_area,
        v_item.status,
        v_item.location,
        case when v_reused_existing then null::text else v_item.about end,
        case when v_reused_existing then null::text else v_item.brand end,
        case when v_reused_existing then null::text else v_item.model end,
        case when v_reused_existing then null::text else v_item.serial end,
        null::text,
        v_item.created_at,
        v_item.install_state,
        null::text,
        v_item.archived,
        v_item.property_id,
        v_item.parent_home_item_id,
        v_item.placement_label;
end;
$$;

create function public.create_provider_homeos_starter_item_from_deck(
    p_company_id uuid,
    p_property_id uuid,
    p_template_key text,
    p_location text,
    p_parent_area text default null,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_parent_home_item_id uuid default null,
    p_placement_label text default null
)
returns table (
    id uuid,
    item_slug text,
    starter_template_key text,
    parent_home_item_id uuid,
    placement_label text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_template public.homeos_starter_card_templates%rowtype;
    v_item_id uuid;
    v_item_slug text;
    v_parent_id uuid;
    v_placement_label text;
    v_existing_template_key text;
    v_existing_about text;
    v_existing_parent_template_count integer := 0;
    v_creation_marker text := 'homeos-deck-create:' || gen_random_uuid()::text;
begin
    if auth.uid() is null then
        raise exception 'Sign in to add a HomeOS Deck card.' using errcode = '42501';
    end if;

    select template.* into v_template
    from public.homeos_starter_card_templates template
    where template.template_key = btrim(coalesce(p_template_key, ''))
      and template.active;

    if v_template.template_key is null then
        raise exception 'That HomeOS Deck card is not available.';
    end if;

    if not public.homeos_company_trade_enabled(p_company_id, v_template.trade_key) then
        raise exception 'This company does not have % enabled for new HomeOS Deck cards.', initcap(v_template.trade_key) using errcode = '42501';
    end if;

    if not public.homeos_can_read_provider_assigned_items(
        p_company_id,
        p_property_id,
        p_service_request_id,
        p_schedule_slot_id,
        p_job_id
    ) then
        raise exception 'Not authorized to publish provider HomeOS items for this assigned job.' using errcode = '42501';
    end if;

    if p_parent_home_item_id is null and btrim(coalesce(p_location, '')) = '' then
        raise exception 'Choose the item location before adding a HomeOS Deck card.';
    end if;

    if p_parent_home_item_id is not null then
        select min(item.id::text)::uuid, count(*)::integer
        into v_item_id, v_existing_parent_template_count
        from public.home_items item
        where item.property_id = p_property_id
          and item.parent_home_item_id = p_parent_home_item_id
          and item.starter_template_key = v_template.template_key
          and coalesce(item.archived, false) = false
          and (
              (nullif(btrim(coalesce(p_placement_label, '')), '') is null and item.placement_label is null)
              or (
                  nullif(btrim(coalesce(p_placement_label, '')), '') is not null
                  and (
                      item.placement_label is null
                      or item.placement_label = nullif(btrim(coalesce(p_placement_label, '')), '')
                  )
              )
          );

        if v_existing_parent_template_count > 1 then
            raise exception 'More than one HomeOS Deck card matches that assembly and label; choose the existing card explicitly.' using errcode = '23514';
        elsif v_existing_parent_template_count = 1 then
            raise exception 'That HomeOS card already exists in this assembly. Open the existing card instead of creating a duplicate.';
        end if;

        v_item_id := null;
    end if;

    select created.id, created.item_slug, created.parent_home_item_id, created.placement_label
    into v_item_id, v_item_slug, v_parent_id, v_placement_label
    from public.create_provider_homeos_item(
        p_company_id => p_company_id,
        p_property_id => p_property_id,
        p_service_request_id => p_service_request_id,
        p_schedule_slot_id => p_schedule_slot_id,
        p_job_id => p_job_id,
        p_name => v_template.name,
        p_system => v_template.system,
        p_category => v_template.category,
        p_location => p_location,
        p_parent_area => p_parent_area,
        p_status => 'Missing Information',
        p_install_state => 'Unknown',
        p_about => v_creation_marker,
        p_brand => 'Unknown',
        p_model => 'Unknown',
        p_serial => 'Unknown',
        p_parent_home_item_id => p_parent_home_item_id,
        p_placement_label => p_placement_label
    ) created
    limit 1;

    if v_item_id is null then
        raise exception 'The HomeOS Deck card could not be created.';
    end if;

    select item.starter_template_key, item.about, item.parent_home_item_id, item.placement_label
    into v_existing_template_key, v_existing_about, v_parent_id, v_placement_label
    from public.home_items item
    where item.id = v_item_id
    for update;

    if v_existing_template_key is not null and v_existing_template_key <> v_template.template_key then
        raise exception 'An existing item in this location is already linked to a different HomeOS Deck card.';
    end if;

    if v_existing_about is distinct from v_creation_marker then
        raise exception 'That HomeOS card already exists in this location. Open the existing card instead of creating a duplicate.';
    end if;

    update public.home_items item
    set starter_template_key = v_template.template_key,
        about = null,
        brand = null,
        model = null,
        serial = null
    where item.id = v_item_id;

    return query select v_item_id, v_item_slug, v_template.template_key, v_parent_id, v_placement_label;
end;
$$;

create function public.create_sales_homeos_item(
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
    p_serial text default null,
    p_parent_home_item_id uuid default null,
    p_placement_label text default null
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
    parent_home_item_id uuid,
    placement_label text
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
        p_serial => p_serial,
        p_parent_home_item_id => p_parent_home_item_id,
        p_placement_label => p_placement_label
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
                'location', v_created.location,
                'parent_home_item_id', v_created.parent_home_item_id,
                'placement_label', v_created.placement_label
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
        v_created.property_id,
        v_created.parent_home_item_id,
        v_created.placement_label;
end;
$$;

create function public.create_sales_homeos_starter_item_from_deck(
    p_company_id uuid,
    p_property_id uuid,
    p_template_key text,
    p_location text,
    p_parent_area text default null,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_parent_home_item_id uuid default null,
    p_placement_label text default null
)
returns table (
    id uuid,
    item_slug text,
    starter_template_key text,
    parent_home_item_id uuid,
    placement_label text
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
        p_job_id => p_job_id,
        p_parent_home_item_id => p_parent_home_item_id,
        p_placement_label => p_placement_label
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
                'parent_area', p_parent_area,
                'parent_home_item_id', v_created.parent_home_item_id,
                'placement_label', v_created.placement_label
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

    return query select
        v_created.id,
        v_created.item_slug,
        v_created.starter_template_key,
        v_created.parent_home_item_id,
        v_created.placement_label;
end;
$$;

revoke all on function public.homeos_overlay_root_identity(text,text,text) from public, anon, authenticated;
revoke all on function public.homeos_resolve_overlay_root_for_placement(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.homeos_room_placement_identity(text,text) from public, anon, authenticated;
revoke all on function public.homeos_resolve_unambiguous_overlay_parent(uuid) from public, anon, authenticated;
revoke all on function public.homeos_resolve_unambiguous_starter_parent(uuid) from public, anon, authenticated;
revoke all on function public.homeos_validate_item_parentage() from public, anon, authenticated;
revoke all on function public.homeos_validate_item_parent_lifecycle() from public, anon, authenticated;
revoke all on function public.homeos_preserve_replacement_parentage() from public, anon, authenticated;
revoke all on function public.homeos_resolve_starter_parentage_after_write() from public, anon, authenticated;
revoke all on function public.provision_complete_room_starter_cards(uuid) from public, anon, authenticated;
revoke all on function public.archive_home_item_with_components(uuid) from public, anon;
revoke all on function public.get_provider_homeos_items(uuid,uuid,uuid,uuid,uuid,text) from public, anon;
revoke all on function public.get_sales_company_homeos_items(uuid,uuid,uuid,uuid,uuid,text) from public, anon;
revoke all on function public.create_provider_homeos_item(
    uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid,text
) from public, anon;
revoke all on function public.create_provider_homeos_starter_item_from_deck(
    uuid,uuid,text,text,text,uuid,uuid,uuid,uuid,text
) from public, anon;
revoke all on function public.create_sales_homeos_item(
    uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid,text
) from public, anon;
revoke all on function public.create_sales_homeos_starter_item_from_deck(
    uuid,uuid,text,text,text,uuid,uuid,uuid,uuid,text
) from public, anon;

grant execute on function public.get_provider_homeos_items(uuid,uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.get_sales_company_homeos_items(uuid,uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.archive_home_item_with_components(uuid) to authenticated;
grant execute on function public.create_provider_homeos_item(
    uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid,text
) to authenticated;
grant execute on function public.create_provider_homeos_starter_item_from_deck(
    uuid,uuid,text,text,text,uuid,uuid,uuid,uuid,text
) to authenticated;
grant execute on function public.create_sales_homeos_item(
    uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,uuid,text
) to authenticated;
grant execute on function public.create_sales_homeos_starter_item_from_deck(
    uuid,uuid,text,text,text,uuid,uuid,uuid,uuid,text
) to authenticated;

comment on column public.home_items.parent_home_item_id is
    'Concrete same-property assembly instance for a component card. Null identifies an area/top-level assembly or an unresolved legacy row.';

comment on column public.home_items.placement_label is
    'Optional user-supplied instance label, such as Main or Guest, stored trimmed at 120 characters or fewer.';

comment on function public.homeos_overlay_root_identity(text,text,text) is
    'Maps only direct approved Kitchen Sink, Bathroom Vanity, and Refrigerator overlay cards to a root identity; descendants must resolve through saved intermediaries.';

comment on function public.homeos_resolve_overlay_root_for_placement(uuid,text,text,text) is
    'Returns one active overlay root only when stable-key or legacy-name placement resolves to exactly one same-property assembly.';

comment on function public.homeos_room_placement_identity(text,text) is
    'Normalizes an item legacy location snapshot to the room and optional outer-area placement used by the hierarchy projection.';

comment on function public.homeos_resolve_unambiguous_overlay_parent(uuid) is
    'Resolves an unlinked approved overlay card, or a descendant with one unique saved intermediary chain, directly to one root assembly instance.';

comment on function public.homeos_resolve_unambiguous_starter_parent(uuid) is
    'Resolves an unlinked canonical starter component, including approved unkeyed overlay compatibility, through unique saved instances to one root assembly without crossing an exact nested Area.';

comment on function public.homeos_validate_item_parentage() is
    'Enforces one-level same-property assembly parentage and refreshes a component legacy placement snapshot when that component is written.';

comment on function public.homeos_validate_item_parent_lifecycle() is
    'Defers archive consistency until transaction end so atomic component archive/reassignment and item replacement remain safe.';

comment on function public.homeos_preserve_replacement_parentage() is
    'Keeps a replacement parent, label, and starter type and transfers assembly components to the replacement instance.';

comment on function public.homeos_resolve_starter_parentage_after_write() is
    'Deferred internal writer reconciliation that persists one unambiguous canonical starter relationship without waiting on parent rows or overriding explicit parent UUIDs.';

comment on function public.archive_home_item_with_components(uuid) is
    'Explicitly archives one homeowner-authorized HomeOS card, direct components, and unambiguous canonical or approved legacy descendants without deleting history.';

comment on function public.provision_complete_room_starter_cards(uuid) is
    'Idempotently fills enabled-trade starter cards per placement, flattening approved overlays and linking each component only when one assembly instance resolves.';

commit;
