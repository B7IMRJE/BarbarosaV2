begin;

create table if not exists public.catalog_card_short_codes (
    entity_kind text not null,
    entity_key text not null,
    short_code text not null,
    semantic_initial text not null,
    created_at timestamptz not null default now(),
    primary key (entity_kind, entity_key),
    constraint catalog_card_short_codes_kind_check check (entity_kind in ('starter_template', 'product_variant')),
    constraint catalog_card_short_codes_code_check check (short_code ~ '^[A-Z][0-9]{2}$'),
    constraint catalog_card_short_codes_initial_check check (semantic_initial ~ '^[A-Z]$')
);

create unique index if not exists catalog_card_short_codes_case_insensitive_idx
    on public.catalog_card_short_codes(lower(short_code));

alter table public.catalog_card_short_codes enable row level security;
revoke all on table public.catalog_card_short_codes from public, anon, authenticated;

create or replace function public.catalog_card_semantic_initial(p_label text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_label text := upper(btrim(coalesce(p_label, '')));
    v_clean text;
begin
    if v_label ~ '(^|[^A-Z])ANGLE[[:space:]]+STOP([^A-Z]|$)' then return 'A'; end if;
    if v_label ~ '(^|[^A-Z])VANITY([^A-Z]|$)' then return 'V'; end if;
    if v_label ~ '(^|[^A-Z])FAUCET([^A-Z]|$)' then return 'F'; end if;
    if v_label ~ '(^|[^A-Z])SHOWER([^A-Z]|$)' then return 'S'; end if;

    v_clean := regexp_replace(v_label, '^(BATHROOM|KITCHEN|GARAGE|FRONT[[:space:]]+YARD|BACK[[:space:]]+YARD)[^A-Z]+', '');
    v_clean := regexp_replace(v_clean, '^(HOT|COLD)[^A-Z]+', '');
    v_clean := regexp_replace(v_clean, '[^A-Z]', '', 'g');
    return coalesce(nullif(substr(v_clean, 1, 1), ''), 'X');
end;
$$;

create or replace function public.catalog_register_short_code(
    p_entity_kind text,
    p_entity_key text,
    p_label text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_existing text;
    v_initial text;
    v_number integer;
    v_code text;
begin
    if p_entity_kind not in ('starter_template', 'product_variant') then
        raise exception 'Unsupported catalog card code entity.';
    end if;
    if nullif(btrim(coalesce(p_entity_key, '')), '') is null then
        raise exception 'Catalog card code entity key is required.';
    end if;

    select code.short_code into v_existing
    from public.catalog_card_short_codes code
    where code.entity_kind = p_entity_kind and code.entity_key = p_entity_key;
    if found then return v_existing; end if;

    v_initial := public.catalog_card_semantic_initial(p_label);
    perform pg_advisory_xact_lock(hashtext('catalog-card-short-code:' || v_initial));

    select code.short_code into v_existing
    from public.catalog_card_short_codes code
    where code.entity_kind = p_entity_kind and code.entity_key = p_entity_key;
    if found then return v_existing; end if;

    select coalesce(max(substring(code.short_code from 2 for 2)::integer), 0) + 1
    into v_number
    from public.catalog_card_short_codes code
    where code.semantic_initial = v_initial;
    if v_number > 99 then
        raise exception 'Catalog card code capacity is exhausted for initial %.', v_initial;
    end if;

    v_code := v_initial || lpad(v_number::text, 2, '0');
    insert into public.catalog_card_short_codes(entity_kind, entity_key, short_code, semantic_initial)
    values (p_entity_kind, p_entity_key, v_code, v_initial);
    return v_code;
end;
$$;

create or replace function public.catalog_register_starter_short_code()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    perform public.catalog_register_short_code('starter_template', new.template_key, new.name);
    return new;
end;
$$;

create or replace function public.catalog_register_product_short_code()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_label text;
begin
    select coalesce(nullif(family.family_name, ''), nullif(new.model_number, ''), 'Product')
    into v_label
    from public.catalog_product_families family
    where family.id = new.product_family_id;
    perform public.catalog_register_short_code('product_variant', new.id::text, coalesce(v_label, new.model_number, 'Product'));
    return new;
end;
$$;

drop trigger if exists catalog_register_starter_short_code_trigger on public.homeos_starter_card_templates;
create trigger catalog_register_starter_short_code_trigger
after insert on public.homeos_starter_card_templates
for each row execute function public.catalog_register_starter_short_code();

drop trigger if exists catalog_register_product_short_code_trigger on public.catalog_product_variants;
create trigger catalog_register_product_short_code_trigger
after insert on public.catalog_product_variants
for each row execute function public.catalog_register_product_short_code();

do $$
declare
    v_template record;
    v_variant record;
begin
    for v_template in
        select template.template_key, template.name
        from public.homeos_starter_card_templates template
        order by template.room_kind, template.display_order, template.name, template.template_key
    loop
        perform public.catalog_register_short_code('starter_template', v_template.template_key, v_template.name);
    end loop;

    for v_variant in
        select
            variant.id,
            coalesce(
                (
                    select template.name
                    from public.homeos_starter_card_catalog_variants link
                    join public.homeos_starter_card_templates template on template.template_key = link.template_key
                    where link.product_variant_id = variant.id
                    order by template.room_kind, template.display_order, template.template_key
                    limit 1
                ),
                nullif(family.family_name, ''),
                nullif(variant.model_number, ''),
                'Product'
            ) as semantic_label
        from public.catalog_product_variants variant
        join public.catalog_product_families family on family.id = variant.product_family_id
        order by variant.created_at, variant.id
    loop
        perform public.catalog_register_short_code('product_variant', v_variant.id::text, v_variant.semantic_label);
    end loop;
end;
$$;

create or replace function public.get_catalog_card_short_codes()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
begin
    if not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Catalog Factory is restricted to platform administrators.';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'entity_kind', code.entity_kind,
        'entity_key', code.entity_key,
        'short_code', code.short_code
    ) order by code.short_code), '[]'::jsonb)
    into v_result
    from public.catalog_card_short_codes code;
    return v_result;
end;
$$;

create or replace function public.get_visible_catalog_product_short_codes(p_variant_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
begin
    if auth.uid() is null then raise exception 'Sign in to read catalog product codes.'; end if;
    if coalesce(cardinality(p_variant_ids), 0) > 250 then raise exception 'Too many catalog product codes requested.'; end if;

    select coalesce(jsonb_agg(
        case
            when coalesce(public.homeos_is_platform_admin(), false)
              or public.catalog_variant_is_visible_to_current_user(request.variant_id)
            then code.short_code
            else null
        end
        order by request.ordinality
    ), '[]'::jsonb)
    into v_result
    from unnest(coalesce(p_variant_ids, array[]::uuid[])) with ordinality request(variant_id, ordinality)
    left join public.catalog_card_short_codes code
      on code.entity_kind = 'product_variant'
     and code.entity_key = request.variant_id::text;
    return v_result;
end;
$$;

create or replace function public.set_homeos_starter_card_readiness(
    p_template_key text,
    p_readiness_status text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Catalog Factory is restricted to platform administrators.';
    end if;
    if p_readiness_status not in ('unbuilt', 'building', 'ready') then
        raise exception 'Invalid starter-card readiness.';
    end if;
    update public.homeos_starter_card_templates
    set readiness_status = p_readiness_status,
        updated_at = now()
    where template_key = p_template_key and active;
    if not found then raise exception 'Starter card was not found.'; end if;
    return true;
end;
$$;

create or replace function public.add_home_item_catalog_products_to_quote(
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
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_index integer;
    v_results jsonb := '[]'::jsonb;
begin
    if coalesce(cardinality(p_product_variant_ids), 0) = 0 then
        raise exception 'Select at least one catalog product.';
    end if;
    if cardinality(p_product_variant_ids) > 20 then
        raise exception 'Add no more than 20 catalog products at once.';
    end if;
    if cardinality(p_product_variant_ids) <> cardinality(p_estimate_categories) then
        raise exception 'Each catalog product requires an estimate category.';
    end if;
    if cardinality(p_product_variant_ids) <> (select count(distinct selected.variant_id) from unnest(p_product_variant_ids) selected(variant_id)) then
        raise exception 'Catalog product selections must be unique.';
    end if;

    for v_index in 1..cardinality(p_product_variant_ids)
    loop
        v_results := v_results || jsonb_build_array(public.add_home_item_catalog_product_to_quote(
            p_company_id,
            p_property_id,
            p_home_item_id,
            p_product_variant_ids[v_index],
            p_service_request_id,
            p_schedule_slot_id,
            p_job_id,
            p_estimate_categories[v_index],
            p_source
        ));
    end loop;
    return v_results;
end;
$$;

revoke all on function public.catalog_card_semantic_initial(text) from public, anon;
revoke all on function public.catalog_register_short_code(text,text,text) from public, anon;
revoke all on function public.catalog_register_starter_short_code() from public, anon;
revoke all on function public.catalog_register_product_short_code() from public, anon;
revoke all on function public.get_catalog_card_short_codes() from public, anon;
revoke all on function public.get_visible_catalog_product_short_codes(uuid[]) from public, anon;
revoke all on function public.set_homeos_starter_card_readiness(text,text) from public, anon;
revoke all on function public.add_home_item_catalog_products_to_quote(uuid,uuid,uuid,uuid[],text[],uuid,uuid,uuid,text) from public, anon;
grant execute on function public.get_catalog_card_short_codes() to authenticated;
grant execute on function public.get_visible_catalog_product_short_codes(uuid[]) to authenticated;
grant execute on function public.set_homeos_starter_card_readiness(text,text) to authenticated;
grant execute on function public.add_home_item_catalog_products_to_quote(uuid,uuid,uuid,uuid[],text[],uuid,uuid,uuid,text) to authenticated;

comment on table public.catalog_card_short_codes is
'Stable, compact human-facing codes shared by generic HomeOS starter archetypes and real master catalog variants. Codes never derive from UUIDs and remain unchanged when names are edited.';
comment on function public.set_homeos_starter_card_readiness(text,text) is
'Platform-admin-only work-queue update that changes starter readiness without touching product mappings, notes, HomeOS items, or installer data.';
comment on function public.add_home_item_catalog_products_to_quote(uuid,uuid,uuid,uuid[],text[],uuid,uuid,uuid,text) is
'Atomically adds one or more entitled catalog products as separate proposed quote options using existing estimate permissions and proposed-until-closeout behavior.';

commit;
