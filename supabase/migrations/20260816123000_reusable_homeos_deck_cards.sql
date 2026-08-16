-- Persist the generic starter archetype chosen for a HomeOS item so the same
-- card and catalog mapping can be reused in any explicitly selected area.

begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regclass('public.homeos_starter_card_templates') is null
       or to_regprocedure('public.create_provider_homeos_item(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text)') is null
       or to_regprocedure('public.homeos_can_read_provider_assigned_items(uuid,uuid,uuid,uuid,uuid)') is null then
        raise exception 'Reusable HomeOS Deck cards require HomeOS items, starter templates, and provider item access.';
    end if;
end;
$$;

alter table public.home_items
    add column if not exists starter_template_key text
    references public.homeos_starter_card_templates(template_key) on delete set null;

create index if not exists home_items_starter_template_key_idx
    on public.home_items(starter_template_key)
    where starter_template_key is not null and coalesce(archived, false) = false;

create or replace function public.get_homeos_starter_card_picker()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
begin
    if auth.uid() is null then
        raise exception 'Sign in to browse HomeOS Deck cards.' using errcode = '42501';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'template_key', template.template_key,
        'short_code', coalesce(code.short_code, ''),
        'room_kind', template.room_kind,
        'name', template.name,
        'system', template.system,
        'category', template.category,
        'parent_template_key', template.parent_template_key,
        'aliases', template.aliases,
        'display_order', template.display_order
    ) order by template.room_kind, template.display_order, template.name), '[]'::jsonb)
    into v_result
    from public.homeos_starter_card_templates template
    left join public.catalog_card_short_codes code
      on code.entity_kind = 'starter_template'
     and code.entity_key = template.template_key
    where template.active;

    return v_result;
end;
$$;

-- The existing provider reader has a fixed table return type, so recreate it
-- with the new non-sensitive archetype key included.
drop function public.get_provider_homeos_items(uuid, uuid, uuid, uuid, uuid, text);

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
    starter_template_key text
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
        item.starter_template_key
    from public.home_items item
    where item.property_id = p_property_id
      and (p_item_slug is null or item.item_slug = p_item_slug)
      and coalesce(item.archived, false) = false
    order by item.system asc nulls last, item.name asc nulls last, item.id asc;
end;
$$;

create or replace function public.create_provider_homeos_starter_item_from_deck(
    p_company_id uuid,
    p_property_id uuid,
    p_template_key text,
    p_location text,
    p_parent_area text default null,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns table (
    id uuid,
    item_slug text,
    starter_template_key text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_template public.homeos_starter_card_templates%rowtype;
    v_item_id uuid;
    v_item_slug text;
    v_existing_template_key text;
    v_existing_about text;
    v_creation_marker text := 'homeos-deck-create:' || gen_random_uuid()::text;
begin
    if auth.uid() is null then
        raise exception 'Sign in to add a HomeOS Deck card.' using errcode = '42501';
    end if;

    select template.*
    into v_template
    from public.homeos_starter_card_templates template
    where template.template_key = btrim(coalesce(p_template_key, ''))
      and template.active;

    if v_template.template_key is null then
        raise exception 'That HomeOS Deck card is not available.';
    end if;

    if btrim(coalesce(p_location, '')) = '' then
        raise exception 'Choose the item location before adding a HomeOS Deck card.';
    end if;

    select created.id, created.item_slug
    into v_item_id, v_item_slug
    from public.create_provider_homeos_item(
        p_company_id => p_company_id,
        p_property_id => p_property_id,
        p_service_request_id => p_service_request_id,
        p_schedule_slot_id => p_schedule_slot_id,
        p_job_id => p_job_id,
        p_name => v_template.name,
        p_system => v_template.system,
        p_category => v_template.category,
        p_location => btrim(p_location),
        p_parent_area => nullif(btrim(coalesce(p_parent_area, '')), ''),
        p_status => 'Missing Information',
        p_install_state => 'Unknown',
        p_about => v_creation_marker,
        p_brand => 'Unknown',
        p_model => 'Unknown',
        p_serial => 'Unknown'
    ) created
    limit 1;

    if v_item_id is null then
        raise exception 'The HomeOS Deck card could not be created.';
    end if;

    select item.starter_template_key, item.about
    into v_existing_template_key, v_existing_about
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

    return query select v_item_id, v_item_slug, v_template.template_key;
end;
$$;

revoke all on function public.get_homeos_starter_card_picker() from public, anon;
revoke all on function public.get_provider_homeos_items(uuid,uuid,uuid,uuid,uuid,text) from public, anon;
revoke all on function public.create_provider_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid) from public, anon;
grant execute on function public.get_homeos_starter_card_picker() to authenticated;
grant execute on function public.get_provider_homeos_items(uuid,uuid,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.create_provider_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid) to authenticated;

commit;
