-- Platform-admin approval for AI-researched canonical HomeOS card drafts.
-- This changes master Deck definitions only. It never writes installed home_items.

begin;
do $$
begin
    if to_regclass('public.homeos_starter_card_templates') is null
       or to_regprocedure('public.homeos_is_platform_admin()') is null
       or to_regprocedure('public.get_homeos_starter_card_deck()') is null then
        raise exception 'The AI Card Builder requires the canonical HomeOS starter-card Deck.';
    end if;
end;
$$;
create or replace function public.homeos_approve_ai_card_upsert(p_card jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_key text := lower(btrim(p_card->>'template_key'));
begin
    insert into public.homeos_starter_card_templates(
        template_key, trade_key, room_kind, name, system, category, parent_template_key,
        presentation_role, auto_provision, aliases, placement_tags, display_order,
        readiness_status, admin_notes, active, created_at, updated_at
    ) values (
        v_key,
        lower(btrim(coalesce(nullif(p_card->>'trade_key', ''), 'plumbing'))),
        lower(btrim(p_card->>'room_kind')),
        btrim(p_card->>'name'),
        btrim(p_card->>'system'),
        btrim(p_card->>'category'),
        nullif(lower(btrim(coalesce(p_card->>'parent_template_key', ''))), ''),
        btrim(p_card->>'presentation_role'),
        coalesce((p_card->>'auto_provision')::boolean, false),
        coalesce(p_card->'aliases', '[]'::jsonb),
        coalesce(p_card->'placement_tags', '[]'::jsonb),
        greatest(coalesce((p_card->>'display_order')::integer, 0), 0),
        'unbuilt',
        nullif(btrim(coalesce(p_card->>'admin_notes', '')), ''),
        true,
        now(),
        now()
    )
    on conflict (template_key) do update
    set trade_key = excluded.trade_key,
        room_kind = excluded.room_kind,
        name = excluded.name,
        system = excluded.system,
        category = excluded.category,
        parent_template_key = excluded.parent_template_key,
        presentation_role = excluded.presentation_role,
        auto_provision = excluded.auto_provision,
        aliases = excluded.aliases,
        placement_tags = excluded.placement_tags,
        display_order = excluded.display_order,
        admin_notes = excluded.admin_notes,
        active = true,
        updated_at = now();
end;
$$;
create or replace function public.approve_admin_homeos_ai_card_drafts(p_cards jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_card jsonb;
    v_key text;
    v_original_key text;
    v_parent_key text;
    v_category text;
    v_role text;
    v_count integer;
begin
    if not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Card Deck management is restricted to platform administrators.';
    end if;
    if coalesce(jsonb_typeof(p_cards), 'null') <> 'array' then
        raise exception 'AI card approval requires an array of drafts.';
    end if;
    v_count := jsonb_array_length(p_cards);
    if v_count < 1 or v_count > 20 then
        raise exception 'Approve between 1 and 20 AI card drafts at a time.';
    end if;
    if exists (
        select 1 from (
            select lower(btrim(card->>'template_key')) as template_key, count(*)
            from jsonb_array_elements(p_cards) card
            group by lower(btrim(card->>'template_key'))
            having count(*) > 1
        ) duplicate
    ) then
        raise exception 'AI card approval contains duplicate permanent keys.';
    end if;

    for v_card in select value from jsonb_array_elements(p_cards) loop
        v_key := lower(btrim(coalesce(v_card->>'template_key', '')));
        v_original_key := nullif(lower(btrim(coalesce(v_card->>'original_template_key', ''))), '');
        v_parent_key := nullif(lower(btrim(coalesce(v_card->>'parent_template_key', ''))), '');
        v_category := btrim(coalesce(v_card->>'category', ''));
        v_role := btrim(coalesce(v_card->>'presentation_role', ''));

        if v_key = '' or v_key !~ '^[a-z0-9]+([_-][a-z0-9]+)*(:[a-z0-9]+([_-][a-z0-9]+)*)?$' then
            raise exception 'Every AI card requires a valid lowercase permanent key.';
        end if;
        if btrim(coalesce(v_card->>'name', '')) = ''
           or btrim(coalesce(v_card->>'room_kind', '')) = ''
           or btrim(coalesce(v_card->>'system', '')) = '' then
            raise exception 'Every AI card requires a name, room kind, and system.';
        end if;
        if v_category not in ('Fixture', 'Equipment', 'Component') then
            raise exception 'Invalid AI card category for %.', v_key;
        end if;
        if v_role not in ('container', 'component') then
            raise exception 'Invalid AI card presentation role for %.', v_key;
        end if;
        if jsonb_typeof(coalesce(v_card->'aliases', '[]'::jsonb)) <> 'array'
           or jsonb_typeof(coalesce(v_card->'placement_tags', '[]'::jsonb)) <> 'array' then
            raise exception 'Aliases and placement tags must be arrays for %.', v_key;
        end if;
        if v_original_key is not null then
            if v_original_key <> v_key then raise exception 'A permanent Deck key cannot be changed.'; end if;
            if not exists (select 1 from public.homeos_starter_card_templates where template_key = v_original_key) then
                raise exception 'The master card % no longer exists.', v_original_key;
            end if;
        elsif exists (select 1 from public.homeos_starter_card_templates where template_key = v_key) then
            raise exception 'The permanent key % already exists. Open that card for editing instead.', v_key;
        end if;
        if v_parent_key = v_key then raise exception 'A card cannot contain itself.'; end if;
        if (v_parent_key is not null or v_role <> 'container') and exists (
            select 1 from public.homeos_starter_card_templates child
            where child.parent_template_key = v_key and child.active
        ) then
            raise exception 'Card % already contains children and must remain a top-level container.', v_key;
        end if;
        if v_parent_key is not null
           and not exists (select 1 from public.homeos_starter_card_templates where template_key = v_parent_key)
           and not exists (select 1 from jsonb_array_elements(p_cards) proposed where lower(btrim(proposed->>'template_key')) = v_parent_key) then
            raise exception 'Parent card % was not found.', v_parent_key;
        end if;
        if v_parent_key is not null and exists (
            select 1 from public.homeos_starter_card_templates parent
            where parent.template_key = v_parent_key
              and (parent.parent_template_key is not null or parent.presentation_role <> 'container')
        ) then
            raise exception 'Parent card % is not a top-level container.', v_parent_key;
        end if;
        if v_parent_key is not null and exists (
            select 1 from jsonb_array_elements(p_cards) proposed
            where lower(btrim(proposed->>'template_key')) = v_parent_key
              and (nullif(btrim(coalesce(proposed->>'parent_template_key', '')), '') is not null
                   or proposed->>'presentation_role' <> 'container')
        ) then
            raise exception 'Proposed parent card % must be a top-level container.', v_parent_key;
        end if;
    end loop;

    -- Upsert roots first so new children can reference a new container in this batch.
    for v_card in
        select value from jsonb_array_elements(p_cards)
        where nullif(btrim(coalesce(value->>'parent_template_key', '')), '') is null
    loop
        perform public.homeos_approve_ai_card_upsert(v_card);
    end loop;
    for v_card in
        select value from jsonb_array_elements(p_cards)
        where nullif(btrim(coalesce(value->>'parent_template_key', '')), '') is not null
    loop
        perform public.homeos_approve_ai_card_upsert(v_card);
    end loop;

    return jsonb_build_object('approved_count', v_count, 'cards', public.get_homeos_starter_card_deck());
end;
$$;
revoke all on function public.homeos_approve_ai_card_upsert(jsonb) from public, anon, authenticated;
revoke all on function public.approve_admin_homeos_ai_card_drafts(jsonb) from public, anon;
grant execute on function public.approve_admin_homeos_ai_card_drafts(jsonb) to authenticated;
comment on function public.approve_admin_homeos_ai_card_drafts(jsonb) is
    'Platform-admin explicit approval of reviewed AI card drafts into the canonical HomeOS Deck. Does not modify installed homes.';
commit;
