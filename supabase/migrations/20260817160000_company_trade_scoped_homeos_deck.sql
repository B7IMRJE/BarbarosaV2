-- Scope reusable HomeOS Deck discovery and creation to explicitly enabled
-- company trades, while preserving existing installed customer records.

begin;

do $$
begin
    if to_regclass('public.companies') is null
       or to_regclass('public.homeos_starter_card_templates') is null
       or to_regclass('public.home_items') is null
       or to_regprocedure('public.homeos_company_provider_category_keys(uuid)') is null
       or to_regprocedure('public.company_sales_context_matches_client_home(uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.company_estimate_session_context_can_use(uuid,uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.upsert_estimate_option_session_for_draft(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text)') is null then
        raise exception 'Company trade-scoped HomeOS Deck requires company categories, starter templates, HomeOS items, and estimate authorization.';
    end if;
end;
$$;

alter table public.homeos_starter_card_templates
    add column if not exists trade_key text not null default 'plumbing';

update public.homeos_starter_card_templates
set trade_key = case
    when lower(btrim(coalesce(system, ''))) = 'electrical'
      or lower(btrim(coalesce(room_kind, ''))) like 'electrical%'
      or lower(btrim(coalesce(template_key, ''))) like 'electrical_%'
        then 'electrical'
    when lower(btrim(coalesce(system, ''))) in ('hvac', 'heating', 'cooling', 'climate')
        then 'hvac'
    else 'plumbing'
end;

alter table public.homeos_starter_card_templates
    drop constraint if exists homeos_starter_card_templates_trade_key_check;

alter table public.homeos_starter_card_templates
    add constraint homeos_starter_card_templates_trade_key_check
    check (trade_key = lower(btrim(trade_key)) and trade_key ~ '^[a-z][a-z0-9-]*$');

create index if not exists homeos_starter_card_templates_trade_active_idx
    on public.homeos_starter_card_templates(trade_key, active, display_order);

comment on column public.homeos_starter_card_templates.trade_key is
    'Explicit company capability required to discover or add this generic HomeOS archetype.';

create or replace function public.homeos_trade_key_for_system(p_system text)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select case regexp_replace(lower(btrim(coalesce(p_system, ''))), '[^a-z0-9]+', ' ', 'g')
        when 'electrical' then 'electrical'
        when 'electric' then 'electrical'
        when 'hvac' then 'hvac'
        when 'heating' then 'hvac'
        when 'cooling' then 'hvac'
        when 'climate' then 'hvac'
        when 'plumbing' then 'plumbing'
        when 'water service' then 'plumbing'
        when 'drain sewer' then 'plumbing'
        when 'drain and sewer' then 'plumbing'
        when 'gas' then 'plumbing'
        when 'water treatment' then 'plumbing'
        else null
    end;
$$;

create or replace function public.homeos_company_trade_enabled(
    p_company_id uuid,
    p_trade_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select p_company_id is not null
       and nullif(lower(btrim(coalesce(p_trade_key, ''))), '') is not null
       and exists (
            select 1
            from public.homeos_company_provider_category_keys(p_company_id) category
            where category.category_key = lower(btrim(p_trade_key))
       );
$$;

create or replace function public.homeos_property_trade_enabled(
    p_property_id uuid,
    p_trade_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_trade_key text := lower(btrim(coalesce(p_trade_key, '')));
begin
    if p_property_id is null or v_trade_key = '' then return false; end if;

    if exists (
        select 1
        from public.property_preferred_providers preferred
        where preferred.property_id = p_property_id
          and lower(btrim(coalesce(preferred.status, ''))) = 'active'
    ) then
        return exists (
            select 1
            from public.property_preferred_providers preferred
            where preferred.property_id = p_property_id
              and lower(btrim(coalesce(preferred.status, ''))) = 'active'
              and preferred.service_category_key = v_trade_key
              and public.homeos_company_trade_enabled(preferred.company_id, v_trade_key)
        );
    end if;

    -- Legacy homes with no selected provider keep the existing plumbing Deck
    -- default. No other trade is inferred.
    return v_trade_key = 'plumbing';
end;
$$;

create or replace function public.homeos_company_home_context_can_use(
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
begin
    if auth.uid() is null or p_company_id is null or p_property_id is null then return false; end if;
    if coalesce(public.homeos_is_platform_admin(), false) then return true; end if;

    if public.company_sales_context_matches_client_home(
        p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
    ) then return true; end if;

    if public.homeos_can_read_provider_assigned_items(
        p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
    ) then return true; end if;

    if (
        public.can_dispatch_company(p_company_id)
        or public.can_manage_company_profile(p_company_id)
    ) and exists (
        select 1
        from public.company_property_clients client
        where client.company_id = p_company_id
          and client.property_id = p_property_id
          and lower(btrim(coalesce(client.status, ''))) not in (
              'archived', 'cancelled', 'canceled', 'declined', 'inactive', 'revoked'
          )
    ) then return true; end if;

    return false;
end;
$$;

drop function if exists public.get_homeos_starter_card_picker();

create function public.get_homeos_starter_card_picker(
    p_company_id uuid default null,
    p_property_id uuid default null,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
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

    if p_company_id is not null then
        if not public.homeos_company_home_context_can_use(
            p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
        ) then
            raise exception 'This company HomeOS Deck requires an assigned or authorized customer context.' using errcode = '42501';
        end if;
    elsif p_property_id is not null then
        if not public.homeos_can_read_property_record(p_property_id) then
            raise exception 'This HomeOS Deck is not available for that home.' using errcode = '42501';
        end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'template_key', template.template_key,
        'short_code', coalesce(code.short_code, ''),
        'trade_key', template.trade_key,
        'room_kind', template.room_kind,
        'placement_tags', template.placement_tags,
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
    where template.active
      and case
          when p_company_id is not null then public.homeos_company_trade_enabled(p_company_id, template.trade_key)
          when p_property_id is not null then public.homeos_property_trade_enabled(p_property_id, template.trade_key)
          else template.trade_key = 'plumbing'
      end;

    return v_result;
end;
$$;

create or replace function public.get_homeos_trade_context(
    p_company_id uuid default null,
    p_property_id uuid default null,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_enabled_keys jsonb := '[]'::jsonb;
    v_can_start_repipe boolean := false;
begin
    if auth.uid() is null then raise exception 'Sign in to load HomeOS trade access.' using errcode = '42501'; end if;

    if p_company_id is not null then
        if not public.homeos_company_home_context_can_use(
            p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
        ) then
            raise exception 'This company HomeOS access requires an assigned or authorized customer context.' using errcode = '42501';
        end if;

        select coalesce(jsonb_agg(category.category_key order by category.category_key), '[]'::jsonb)
        into v_enabled_keys
        from public.homeos_company_provider_category_keys(p_company_id) category;

        v_can_start_repipe := public.homeos_company_trade_enabled(p_company_id, 'plumbing')
            and public.company_estimate_options_can_use(p_company_id)
            and (
                public.company_sales_context_matches_client_home(
                    p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
                )
                or public.company_estimate_session_context_can_use(
                    p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id, null
                )
            );
    elsif p_property_id is not null then
        if not public.homeos_can_read_property_record(p_property_id) then
            raise exception 'This HomeOS trade access is not available for that home.' using errcode = '42501';
        end if;

        select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
        into v_enabled_keys
        from (
            select distinct template.trade_key as key
            from public.homeos_starter_card_templates template
            where template.active
              and public.homeos_property_trade_enabled(p_property_id, template.trade_key)
        ) enabled;
    else
        v_enabled_keys := '["plumbing"]'::jsonb;
    end if;

    return jsonb_build_object(
        'enabled_trade_keys', v_enabled_keys,
        'can_start_repipe', v_can_start_repipe,
        'repipe_trade_enabled', coalesce(v_enabled_keys ? 'plumbing', false)
    );
end;
$$;

create or replace function public.homeos_company_variant_trade_enabled(
    p_company_id uuid,
    p_variant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select p_company_id is not null
       and (
            p_variant_id is null
            or
            not exists (
                select 1 from public.homeos_starter_card_catalog_variants link
                where link.product_variant_id = p_variant_id
            )
            or exists (
                select 1
                from public.homeos_starter_card_catalog_variants link
                join public.homeos_starter_card_templates template
                  on template.template_key = link.template_key
                 and template.active
                where link.product_variant_id = p_variant_id
                  and public.homeos_company_trade_enabled(p_company_id, template.trade_key)
            )
       );
$$;

-- Keep the original provider publisher internal, then expose the same RPC name
-- through a trade-enforcing wrapper so all existing clients keep working.
alter function public.create_provider_homeos_item(
    uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text
) rename to create_provider_homeos_item_unscoped_internal;

revoke all on function public.create_provider_homeos_item_unscoped_internal(
    uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text
) from public, anon, authenticated;

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
    p_serial text default null
)
returns table (
    id uuid, item_slug text, name text, system text, category text, parent_area text,
    status text, location text, about text, brand text, model text, serial text,
    install_date text, created_at timestamptz, install_state text, photo_url text,
    archived boolean, property_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_trade_key text := public.homeos_trade_key_for_system(p_system);
begin
    if v_trade_key is not null and not public.homeos_company_trade_enabled(p_company_id, v_trade_key) then
        raise exception 'This company does not have % enabled for new HomeOS cards.', initcap(v_trade_key) using errcode = '42501';
    end if;

    return query
    select created.*
    from public.create_provider_homeos_item_unscoped_internal(
        p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id,
        p_item_slug, p_name, p_system, p_category, p_location, p_parent_area,
        p_status, p_install_state, p_about, p_brand, p_model, p_serial
    ) created;
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
returns table (id uuid, item_slug text, starter_template_key text)
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
    if auth.uid() is null then raise exception 'Sign in to add a HomeOS Deck card.' using errcode = '42501'; end if;

    select template.* into v_template
    from public.homeos_starter_card_templates template
    where template.template_key = btrim(coalesce(p_template_key, '')) and template.active;

    if v_template.template_key is null then raise exception 'That HomeOS Deck card is not available.'; end if;
    if not public.homeos_company_trade_enabled(p_company_id, v_template.trade_key) then
        raise exception 'This company does not have % enabled for new HomeOS Deck cards.', initcap(v_template.trade_key) using errcode = '42501';
    end if;
    if btrim(coalesce(p_location, '')) = '' then raise exception 'Choose the item location before adding a HomeOS Deck card.'; end if;

    select created.id, created.item_slug into v_item_id, v_item_slug
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
        p_brand => 'Unknown', p_model => 'Unknown', p_serial => 'Unknown'
    ) created limit 1;

    if v_item_id is null then raise exception 'The HomeOS Deck card could not be created.'; end if;

    select item.starter_template_key, item.about into v_existing_template_key, v_existing_about
    from public.home_items item where item.id = v_item_id for update;

    if v_existing_template_key is not null and v_existing_template_key <> v_template.template_key then
        raise exception 'An existing item in this location is already linked to a different HomeOS Deck card.';
    end if;
    if v_existing_about is distinct from v_creation_marker then
        raise exception 'That HomeOS card already exists in this location. Open the existing card instead of creating a duplicate.';
    end if;

    update public.home_items item
    set starter_template_key = v_template.template_key, about = null, brand = null, model = null, serial = null
    where item.id = v_item_id;

    return query select v_item_id, v_item_slug, v_template.template_key;
end;
$$;

create or replace function public.homeos_validate_homeowner_starter_trade()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_trade_key text;
begin
    if auth.uid() is null or coalesce(public.homeos_is_platform_admin(), false) then
        return new;
    end if;

    if new.starter_template_key is not null then
        select template.trade_key into v_trade_key
        from public.homeos_starter_card_templates template
        where template.template_key = new.starter_template_key and template.active;
    else
        v_trade_key := public.homeos_trade_key_for_system(new.system);
    end if;

    if new.starter_template_key is not null and v_trade_key is null then
        raise exception 'That HomeOS Deck card is not active.' using errcode = '42501';
    end if;
    if v_trade_key is not null and not public.homeos_property_trade_enabled(new.property_id, v_trade_key) then
        raise exception 'That HomeOS Deck trade is not enabled for this home.' using errcode = '42501';
    end if;
    return new;
end;
$$;

drop trigger if exists home_items_validate_homeowner_starter_trade on public.home_items;
create trigger home_items_validate_homeowner_starter_trade
before insert on public.home_items
for each row execute function public.homeos_validate_homeowner_starter_trade();

create or replace function public.get_company_homeos_starter_catalog_variant_ids(
    p_company_id uuid,
    p_template_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
    v_trade_key text;
begin
    if not public.company_catalog_settings_can_view(p_company_id) then raise exception 'Company catalog access is required.'; end if;

    select template.trade_key into v_trade_key
    from public.homeos_starter_card_templates template
    where template.template_key = p_template_key and template.active;

    if v_trade_key is null or not public.homeos_company_trade_enabled(p_company_id, v_trade_key) then return '[]'::jsonb; end if;

    select coalesce(jsonb_agg(link.product_variant_id::text order by link.created_at, link.product_variant_id), '[]'::jsonb)
    into v_result
    from public.homeos_starter_card_catalog_variants link
    join public.catalog_product_variants variant on variant.id = link.product_variant_id and variant.status = 'approved'
    join public.company_catalog_offerings offering
      on offering.company_id = p_company_id and offering.product_variant_id = link.product_variant_id
     and offering.active and offering.company_catalog_product_id is not null
    join public.company_approved_products product
      on product.id = offering.company_catalog_product_id and product.company_id = p_company_id
     and product.active and product.approved
    where link.template_key = p_template_key
      and public.company_catalog_variant_is_entitled(p_company_id, link.product_variant_id);
    return v_result;
end;
$$;

create or replace function public.start_company_repipe_wizard(
    p_company_id uuid,
    p_property_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session record;
    v_sales_context boolean := false;
    v_company_user_id uuid;
begin
    if auth.uid() is null then raise exception 'Sign in to start a Repipe estimate.' using errcode = '42501'; end if;
    if not public.homeos_company_trade_enabled(p_company_id, 'plumbing') then
        raise exception 'Plumbing / Repipe is not enabled for this company.' using errcode = '42501';
    end if;
    if not public.company_estimate_options_can_use(p_company_id) then
        raise exception 'Your company role cannot create estimates.' using errcode = '42501';
    end if;

    v_sales_context := public.company_sales_context_matches_client_home(
        p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id
    );
    if v_sales_context then perform set_config('barbarosa.sales_catalog_quote', 'allowed', true); end if;

    if not v_sales_context and not public.company_estimate_session_context_can_use(
        p_company_id, p_property_id, p_service_request_id, p_schedule_slot_id, p_job_id, null
    ) then
        raise exception 'Repipe estimates require an assigned or authorized customer context.' using errcode = '42501';
    end if;

    select company_user.id into v_company_user_id
    from public.company_users company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at, company_user.id
    limit 1;

    -- Reuse only a Repipe draft. Never convert another in-progress estimate
    -- (for example a toilet or water-heater quote) into a Repipe estimate.
    select session.* into v_session
    from public.company_estimate_option_sessions session
    where session.company_id = p_company_id
      and session.property_id is not distinct from p_property_id
      and session.service_request_id is not distinct from p_service_request_id
      and session.schedule_slot_id is not distinct from p_schedule_slot_id
      and session.job_id is not distinct from p_job_id
      and session.home_item_id is null
      and session.category = 'whole_home_repipe'
      and session.source = 'provider_mode'
      and lower(btrim(coalesce(session.status, ''))) in ('draft', 'technician_review')
    order by session.updated_at desc nulls last, session.created_at desc nulls last, session.id desc
    limit 1
    for update;

    if v_session.id is null then
        insert into public.company_estimate_option_sessions (
            company_id, property_id, service_request_id, job_id, schedule_slot_id,
            home_item_id, category, status, source, created_by_company_user_id
        ) values (
            p_company_id, p_property_id, p_service_request_id, p_job_id, p_schedule_slot_id,
            null, 'whole_home_repipe', 'draft', 'provider_mode', v_company_user_id
        ) returning * into v_session;
    else
        update public.company_estimate_option_sessions session
        set updated_at = now()
        where session.id = v_session.id
        returning session.* into v_session;
    end if;

    if v_session.id is null then raise exception 'The Repipe estimate workspace could not be prepared.'; end if;

    if to_regprocedure('public.log_company_audit_event(uuid,text,text,uuid,text,jsonb,jsonb,jsonb)') is not null then
        perform public.log_company_audit_event(
            p_company_id, 'repipe_wizard_started', 'estimate_session', v_session.id,
            'Whole Home Repipe', null,
            jsonb_build_object('property_id', p_property_id, 'category', 'whole_home_repipe'),
            jsonb_build_object(
                'service_request_id', p_service_request_id,
                'schedule_slot_id', p_schedule_slot_id,
                'job_id', p_job_id,
                'source', 'whole_home_direct_action'
            )
        );
    end if;

    return jsonb_build_object(
        'estimate_session_id', v_session.id,
        'company_user_id', v_session.created_by_company_user_id,
        'category', v_session.category,
        'status', v_session.status
    );
end;
$$;

create or replace function public.get_approved_master_catalog_for_company(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_is_platform_admin boolean := coalesce(public.homeos_is_platform_admin(), false);
    v_result jsonb;
begin
    if not public.company_catalog_settings_can_view(p_company_id) then raise exception 'Company catalog access is required.'; end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', variant.id, 'category', template.category_name, 'manufacturer', family.manufacturer,
        'brand', family.brand, 'family_name', family.family_name, 'model_number', variant.model_number,
        'manufacturer_part_number', variant.manufacturer_part_number, 'upc_gtin', variant.upc_gtin,
        'description', coalesce(variant.description, family.description), 'specifications', variant.specifications,
        'primary_image_url', (
            select case when asset.copied_storage_path is null then asset.source_url else null end
            from public.catalog_source_assets asset
            where asset.product_variant_id = variant.id and asset.asset_type = 'image' and asset.active
            order by asset.is_primary desc, asset.created_at limit 1
        ),
        'primary_image_bucket', (
            select asset.copied_bucket from public.catalog_source_assets asset
            where asset.product_variant_id = variant.id and asset.asset_type = 'image' and asset.active
            order by asset.is_primary desc, asset.created_at limit 1
        ),
        'primary_image_path', (
            select asset.copied_storage_path from public.catalog_source_assets asset
            where asset.product_variant_id = variant.id and asset.asset_type = 'image' and asset.active
            order by asset.is_primary desc, asset.created_at limit 1
        ),
        'entitled', public.company_catalog_variant_is_entitled(p_company_id, variant.id),
        'offering', (
            select to_jsonb(offering) from public.company_catalog_offerings offering
            where offering.company_id = p_company_id and offering.product_variant_id = variant.id
        )
    ) order by template.category_name, family.brand, family.family_name, variant.model_number), '[]'::jsonb)
    into v_result
    from public.catalog_product_variants variant
    join public.catalog_product_families family on family.id = variant.product_family_id
    join public.catalog_category_templates template on template.id = family.category_template_id
    where variant.status = 'approved' and family.status = 'approved'
      and public.homeos_company_variant_trade_enabled(p_company_id, variant.id)
      and (v_is_platform_admin or public.company_catalog_variant_is_entitled(p_company_id, variant.id));
    return v_result;
end;
$$;

create or replace function public.get_company_product_catalog(p_company_id uuid)
returns setof jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select jsonb_build_object(
        'id', product.id, 'company_id', product.company_id,
        'product_name', coalesce(nullif(btrim(product.product_name), ''), concat_ws(' ', product.brand, product.model)),
        'category', product.category, 'brand', product.brand, 'model', product.model,
        'manufacturer_part_number', product.manufacturer_part_number, 'sku', product.sku,
        'product_description', product.product_description, 'tier', product.tier,
        'catalog_status', product.catalog_status, 'approved_selling_price', product.approved_selling_price,
        'price_book_item_id', product.price_book_item_id, 'price_book_item_name', price_item.name,
        'minimum_selling_price', product.minimum_selling_price, 'maximum_selling_price', product.maximum_selling_price,
        'product_specifications', product.product_specifications,
        'compatible_applications', to_jsonb(product.compatible_applications),
        'installation_requirements', to_jsonb(product.installation_requirements),
        'workmanship_warranty', product.workmanship_warranty, 'labor_warranty', product.labor_warranty,
        'manufacturer_warranty', coalesce(product.manufacturer_warranty, product.warranty),
        'warranty', product.warranty, 'availability_note', product.availability_note,
        'manufacturer_reference', product.manufacturer_reference, 'company_notes', product.company_notes,
        'master_primary_image_url', (
            select asset.source_url from public.catalog_source_assets asset
            where asset.product_variant_id = product.master_product_variant_id and asset.asset_type = 'image'
            order by asset.is_primary desc, asset.created_at limit 1
        ),
        'created_at', product.created_at, 'updated_at', product.updated_at,
        'files', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', media.id, 'company_id', media.company_id, 'product_id', media.product_id,
                'media_kind', media.media_kind, 'bucket', media.bucket, 'storage_path', media.storage_path,
                'file_name', media.file_name, 'mime_type', media.mime_type, 'size_bytes', media.size_bytes,
                'alt_text', media.alt_text, 'active', media.active
            ) order by media.created_at)
            from public.company_product_media media where media.product_id = product.id and media.active
        ), '[]'::jsonb)
    )
    from public.company_approved_products product
    left join public.company_price_book_items price_item
      on price_item.id = product.price_book_item_id and price_item.company_id = product.company_id
    where product.company_id = p_company_id
      and public.company_product_catalog_can_view(p_company_id)
      and public.homeos_company_variant_trade_enabled(p_company_id, product.master_product_variant_id)
      and (
          public.company_product_catalog_can_manage(p_company_id)
          or (product.approved and product.active and product.catalog_status = 'approved')
      )
    order by product.catalog_status, product.category, product.brand, product.model;
$$;

revoke all on function public.homeos_trade_key_for_system(text) from public, anon;
revoke all on function public.homeos_company_trade_enabled(uuid,text) from public, anon, authenticated;
revoke all on function public.homeos_property_trade_enabled(uuid,text) from public, anon, authenticated;
revoke all on function public.homeos_company_home_context_can_use(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke all on function public.homeos_company_variant_trade_enabled(uuid,uuid) from public, anon, authenticated;
revoke all on function public.homeos_validate_homeowner_starter_trade() from public, anon, authenticated;
revoke all on function public.get_homeos_starter_card_picker(uuid,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.get_homeos_trade_context(uuid,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.start_company_repipe_wizard(uuid,uuid,uuid,uuid,uuid) from public, anon;
revoke all on function public.create_provider_homeos_item(
    uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text
) from public, anon;
revoke all on function public.create_provider_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid) from public, anon;
revoke all on function public.get_company_homeos_starter_catalog_variant_ids(uuid,text) from public, anon;
revoke all on function public.get_approved_master_catalog_for_company(uuid) from public, anon;
revoke all on function public.get_company_product_catalog(uuid) from public, anon;

grant execute on function public.homeos_trade_key_for_system(text) to authenticated;
grant execute on function public.get_homeos_starter_card_picker(uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.get_homeos_trade_context(uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.start_company_repipe_wizard(uuid,uuid,uuid,uuid,uuid) to authenticated;
grant execute on function public.create_provider_homeos_item(
    uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text
) to authenticated;
grant execute on function public.create_provider_homeos_starter_item_from_deck(uuid,uuid,text,text,text,uuid,uuid,uuid) to authenticated;
grant execute on function public.get_company_homeos_starter_catalog_variant_ids(uuid,text) to authenticated;
grant execute on function public.get_approved_master_catalog_for_company(uuid) to authenticated;
grant execute on function public.get_company_product_catalog(uuid) to authenticated;

commit;
