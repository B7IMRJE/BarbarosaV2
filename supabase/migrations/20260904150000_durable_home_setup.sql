-- Local repair: explicit setup intent/checkpoints, NOT a card-count repair job.
-- No backfill/repopulation. Existing homes are classified lazily by their owner.
begin;

create table public.home_setup_progress (
    property_id uuid primary key references public.properties(id) on delete cascade,
    starter_state text not null default 'unselected'
        check (starter_state in ('unselected', 'legacy_review', 'pending', 'complete', 'empty', 'existing')),
    starter_plan jsonb,
    completed_at timestamptz,
    updated_at timestamptz not null default now(),
    skipped_areas integer not null default 0,
    check ((starter_state = 'pending') = (starter_plan is not null))
);
alter table public.home_setup_progress enable row level security;
revoke all on public.home_setup_progress from public, anon, authenticated;
comment on table public.home_setup_progress is
    'Owner-only setup checkpoints. Completion survives archived/deleted cards; never infer corruption from an empty deck.';

create function public.homeos_initialize_new_home_setup()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
begin
    insert into public.home_setup_progress(property_id) values (new.id)
    on conflict (property_id) do nothing;
    return new;
end;
$$;
create trigger initialize_new_home_setup after insert on public.properties
for each row execute function public.homeos_initialize_new_home_setup();

-- The property lock serializes selection/finalization across tabs and devices.
-- Neither a provider assignment nor membership alone grants setup mutation.
create function public.homeos_lock_owned_setup(p_property_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
begin
    if auth.uid() is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;
    perform p.id from public.properties p
    where p.id = p_property_id and p.owner_id = auth.uid()
      and exists (select 1 from public.property_memberships m
          where m.property_id = p.id and m.user_id = auth.uid()
            and upper(btrim(m.role)) = 'OWNER' and lower(btrim(m.status)) = 'active')
    -- Compatible with home_items FK KEY SHARE locks held by manual Add Area.
    -- A FOR UPDATE lock here could deadlock with that writer's area lock.
    for no key update;
    if not found then
        raise exception 'Only the active home owner can finish setup' using errcode = '42501';
    end if;
    -- Archived cards also prove a previous deck existed. With no evidence,
    -- ask the owner; an empty legacy home may have been intentional.
    insert into public.home_setup_progress(property_id, starter_state)
    values (p_property_id, case when exists (
        select 1 from public.home_items i where i.property_id = p_property_id
    ) then 'existing' else 'legacy_review' end)
    on conflict (property_id) do nothing;
end;
$$;

create function public.get_my_home_setup(p_property_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare v_result jsonb;
begin
    perform public.homeos_lock_owned_setup(p_property_id);
    -- Only deterministic bookkeeping is healed here, never home_items.
    update public.home_setup_progress s set completed_at = coalesce(s.completed_at, now())
    from public.properties p where s.property_id = p_property_id and p.id = s.property_id
      and s.starter_state in ('complete', 'empty', 'existing')
      and s.completed_at is null
      and p.homeowner_story_count in ('1','2','3','4','4_plus');
    select jsonb_build_object(
        'property_id', p.id, 'home_name', p.name, 'property_type', p.property_type,
        'story_count', p.homeowner_story_count, 'starter_state', s.starter_state,
        'completed_at', s.completed_at, 'skipped_areas', s.skipped_areas,
        'needs_details', coalesce(p.homeowner_story_count not in ('1','2','3','4','4_plus'), true),
        'needs_choice', s.starter_state in ('unselected','legacy_review'),
        'can_retry', coalesce(s.starter_state = 'pending' and p.homeowner_story_count in ('1','2','3','4','4_plus'), false)
    ) into v_result from public.properties p
    join public.home_setup_progress s on s.property_id = p.id where p.id = p_property_id;
    return v_result;
end;
$$;

create function public.save_my_home_setup_story(p_property_id uuid, p_story_count text)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
begin
    perform public.homeos_lock_owned_setup(p_property_id);
    if p_story_count is null or p_story_count not in ('1','2','3','4','4_plus') then
        raise exception 'Choose the number of stories' using errcode = '22023';
    end if;
    -- Do not overwrite existing details or private access codes during recovery.
    update public.properties p set homeowner_story_count = p_story_count,
        homeowner_profile_updated_at = now(), homeowner_profile_updated_by = auth.uid()
    where p.id = p_property_id and coalesce(p.homeowner_story_count not in ('1','2','3','4','4_plus'), true);
    return public.get_my_home_setup(p_property_id);
end;
$$;

create function public.choose_my_home_starter_setup(p_property_id uuid, p_plan jsonb, p_keep_empty boolean default false)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare v_state text; v_area jsonb; v_item jsonb;
begin
    perform public.homeos_lock_owned_setup(p_property_id);
    select s.starter_state into v_state from public.home_setup_progress s where s.property_id = p_property_id;
    -- First saved intent wins. A lost response/double tap cannot replace a
    -- pending plan or restart a completed/deleted deck.
    if v_state not in ('unselected','legacy_review') then return public.get_my_home_setup(p_property_id); end if;
    if coalesce(p_keep_empty, false) then
        update public.home_setup_progress set starter_state = 'empty', updated_at = now()
        where property_id = p_property_id;
        return public.get_my_home_setup(p_property_id);
    end if;
    if p_plan is null or jsonb_typeof(p_plan) <> 'array' then
        raise exception 'A starter selection is required' using errcode = '22023';
    end if;
    if jsonb_array_length(p_plan) not between 1 and 30 or pg_column_size(p_plan) > 200000 then
        raise exception 'Starter selection is too large or empty' using errcode = '22023';
    end if;
    for v_area in select value from jsonb_array_elements(p_plan) loop
        if coalesce(length(v_area->>'name'),0) not between 1 and 100
           or coalesce(length(v_area->>'system'),0) not between 1 and 80
           or coalesce(v_area->>'scope','') not in ('interior','exterior')
           or coalesce(jsonb_typeof(v_area->'items'),'') <> 'array' then
            raise exception 'Invalid starter area' using errcode = '22023';
        end if;
        if jsonb_array_length(v_area->'items') > 100 then
            raise exception 'Too many starter items' using errcode = '22023';
        end if;
        for v_item in select value from jsonb_array_elements(v_area->'items') loop
            if coalesce(length(v_item->>'name'),0) not between 1 and 140
               or coalesce(length(v_item->>'system'),0) not between 1 and 80
               or coalesce(v_item->>'category','') not in ('Fixture','Equipment','Component')
               or length(coalesce(v_item->>'parentName','')) > 140 then
                raise exception 'Invalid starter item' using errcode = '22023';
            end if;
        end loop;
    end loop;
    update public.home_setup_progress set starter_state = 'pending', starter_plan = p_plan, updated_at = now()
    where property_id = p_property_id;
    return public.get_my_home_setup(p_property_id);
end;
$$;

create function public.finish_my_home_starter_setup(p_property_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare
    v_setup public.home_setup_progress%rowtype;
    v_area jsonb; v_item jsonb; v_trade text; v_area_id uuid;
    v_skipped integer := 0; v_available integer := 0; v_parent_name text;
begin
    perform public.homeos_lock_owned_setup(p_property_id);
    select * into v_setup from public.home_setup_progress s where s.property_id = p_property_id;
    if v_setup.starter_state <> 'pending' then return public.get_my_home_setup(p_property_id); end if;
    if not exists (select 1 from public.properties p where p.id = p_property_id
        and p.homeowner_story_count in ('1','2','3','4','4_plus')) then
        return public.get_my_home_setup(p_property_id);
    end if;
    for v_area in select value from jsonb_array_elements(v_setup.starter_plan) loop
        -- Use the existing Add Area identity lock as well as the setup lock,
        -- so manual Add Area and recovery cannot race through the existence check.
        perform pg_advisory_xact_lock(hashtextextended(
            'homeowner-property-area|' || p_property_id::text || '|' ||
            lower(regexp_replace(btrim(v_area->>'name'), '[[:space:]]+', ' ', 'g')), 0));
        if public.homeos_complete_room_kind(v_area->>'name') = 'laundry' then
            perform pg_advisory_xact_lock(hashtextextended(
                'homeos-canonical-area|' || p_property_id::text || '|laundry-laundry-room', 0));
        end if;
        -- Never expand/reseed an existing or archived area: customizations and
        -- removals win over the saved initial plan, including legacy partials.
        if exists (select 1 from public.home_items i where i.property_id = p_property_id
            and lower(i.category) = 'area'
            and (public.homeos_starter_identity(i.name) = public.homeos_starter_identity(v_area->>'name')
                or (public.homeos_complete_room_kind(i.name) = 'laundry'
                    and public.homeos_complete_room_kind(v_area->>'name') = 'laundry'))) then
            v_available := v_available + 1; continue;
        end if;
        v_trade := public.homeos_trade_key_for_system(v_area->>'system');
        if v_trade is not null and not public.homeos_property_trade_enabled(p_property_id, v_trade) then
            v_skipped := v_skipped + 1; continue;
        end if;
        insert into public.home_items(user_id, property_id, name, system, category, item_slug,
            location, parent_area, area_scope, status, install_state, archived)
        values (auth.uid(), p_property_id, v_area->>'name', v_area->>'system', 'Area',
            'setup-' || replace(public.homeos_starter_identity(v_area->>'name'),' ','-'),
            v_area->>'name', '', v_area->>'scope', 'Missing Information', 'Unknown', false)
        on conflict do nothing returning id into v_area_id;
        v_available := v_available + 1;
        if v_area_id is null then continue; end if;
        -- Published room templates/installed triggers are the authority for
        -- kitchen/bathroom/garage/laundry. Do not overlay stale client copies.
        if public.homeos_complete_room_kind(v_area->>'name') is not null then
            if not exists (select 1 from public.home_items i where i.property_id = p_property_id
                and lower(i.category) <> 'area' and not coalesce(i.archived,false)
                and (public.homeos_starter_identity(i.location) = public.homeos_starter_identity(v_area->>'name')
                  or public.homeos_starter_identity(i.parent_area) = public.homeos_starter_identity(v_area->>'name'))) then
                raise exception 'No enabled starter pack was available for %. Ask management to check its published pack.', v_area->>'name';
            end if;
            continue;
        end if;
        for v_item in select value from jsonb_array_elements(v_area->'items') loop
            v_trade := public.homeos_trade_key_for_system(v_item->>'system');
            if v_trade is not null and not public.homeos_property_trade_enabled(p_property_id, v_trade) then continue; end if;
            v_parent_name := nullif(v_item->>'parentName','');
            if v_parent_name is not null and not exists (
                select 1 from public.home_items i where i.property_id = p_property_id and not coalesce(i.archived,false)
                  and public.homeos_starter_identity(i.name) = public.homeos_starter_identity(v_parent_name)
                  and public.homeos_starter_identity(i.location) = public.homeos_starter_identity(v_area->>'name')
            ) then continue; end if;
            if exists (select 1 from public.home_items i where i.property_id = p_property_id
                and public.homeos_starter_identity(i.name) = public.homeos_starter_identity(v_item->>'name')
                and (public.homeos_starter_identity(i.location) = public.homeos_starter_identity(v_area->>'name')
                    or public.homeos_starter_identity(i.parent_area) = public.homeos_starter_identity(v_area->>'name'))) then continue; end if;
            insert into public.home_items(user_id, property_id, name, system, category, item_slug,
                location, parent_area, status, install_state, archived)
            values (auth.uid(), p_property_id, v_item->>'name', v_item->>'system', v_item->>'category',
                'setup-' || replace(public.homeos_starter_identity((v_area->>'name') || ' ' || (v_item->>'name')),' ','-'),
                coalesce(v_parent_name, v_area->>'name'), case when v_parent_name is null then '' else v_area->>'name' end,
                'Missing Information', 'Unknown', false)
            on conflict do nothing;
        end loop;
    end loop;
    if v_available = 0 then
        raise exception 'None of the selected starter areas match the enabled trades. Ask management to check this home trade setup.';
    end if;
    -- Same transaction as all inserts/triggers. A failure rolls back both the
    -- entire seed and completion, leaving the saved intent retryable.
    update public.home_setup_progress set starter_state = 'complete', starter_plan = null,
        completed_at = now(), updated_at = now(), skipped_areas = v_skipped where property_id = p_property_id;
    return public.get_my_home_setup(p_property_id);
end;
$$;

revoke all on function public.homeos_initialize_new_home_setup() from public, anon, authenticated;
revoke all on function public.homeos_lock_owned_setup(uuid) from public, anon, authenticated;
revoke all on function public.get_my_home_setup(uuid) from public, anon;
revoke all on function public.save_my_home_setup_story(uuid,text) from public, anon;
revoke all on function public.choose_my_home_starter_setup(uuid,jsonb,boolean) from public, anon;
revoke all on function public.finish_my_home_starter_setup(uuid) from public, anon;
grant execute on function public.get_my_home_setup(uuid) to authenticated;
grant execute on function public.save_my_home_setup_story(uuid,text) to authenticated;
grant execute on function public.choose_my_home_starter_setup(uuid,jsonb,boolean) to authenticated;
grant execute on function public.finish_my_home_starter_setup(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
