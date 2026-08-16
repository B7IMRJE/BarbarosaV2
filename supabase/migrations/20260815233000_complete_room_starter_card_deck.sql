-- Complete Bathroom, Kitchen, and Garage starter-card inventory plus an explicit
-- archetype-to-real-product mapping for Catalog Factory and the HomeOS Catalog picker.

begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regclass('public.catalog_product_variants') is null
       or to_regclass('public.company_catalog_offerings') is null
       or to_regprocedure('public.homeos_is_platform_admin()') is null
       or to_regprocedure('public.company_catalog_variant_is_entitled(uuid,uuid)') is null
       or to_regprocedure('public.company_catalog_settings_can_view(uuid)') is null then
        raise exception 'Complete room starter cards require HomeOS, Catalog Factory, company offerings, and catalog entitlements.';
    end if;
end;
$$;

create table if not exists public.homeos_starter_card_templates (
    template_key text primary key,
    room_kind text not null,
    name text not null,
    system text not null,
    category text not null,
    parent_template_key text references public.homeos_starter_card_templates(template_key) on delete restrict,
    aliases jsonb not null default '[]'::jsonb,
    display_order integer not null,
    readiness_status text not null default 'unbuilt',
    admin_notes text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint homeos_starter_card_templates_room_check check (room_kind in ('bathroom','kitchen','garage')),
    constraint homeos_starter_card_templates_category_check check (category in ('Fixture','Equipment','Component')),
    constraint homeos_starter_card_templates_aliases_check check (jsonb_typeof(aliases) = 'array'),
    constraint homeos_starter_card_templates_readiness_check check (readiness_status in ('unbuilt','building','ready')),
    constraint homeos_starter_card_templates_name_present check (btrim(name) <> '')
);

create index if not exists homeos_starter_card_templates_room_order_idx
    on public.homeos_starter_card_templates(room_kind, display_order)
    where active;

create table if not exists public.homeos_starter_card_catalog_variants (
    template_key text not null references public.homeos_starter_card_templates(template_key) on delete cascade,
    product_variant_id uuid not null references public.catalog_product_variants(id) on delete cascade,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (template_key, product_variant_id)
);

create index if not exists homeos_starter_card_catalog_variants_variant_idx
    on public.homeos_starter_card_catalog_variants(product_variant_id, template_key);

alter table public.homeos_starter_card_templates enable row level security;
alter table public.homeos_starter_card_catalog_variants enable row level security;
revoke all on table public.homeos_starter_card_templates from public, anon, authenticated;
revoke all on table public.homeos_starter_card_catalog_variants from public, anon, authenticated;

create or replace function public.homeos_starter_identity(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select btrim(regexp_replace(regexp_replace(lower(coalesce(p_value, '')), '&', ' and ', 'g'), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.homeos_complete_room_kind(p_area_name text)
returns text
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_name text := public.homeos_starter_identity(p_area_name);
begin
    if v_name = '' or v_name like '%outdoor kitchen%' then return null; end if;
    if v_name ~ '(^| )(bathroom|bath room|master bath|primary bath|guest bath|half bath|powder room)( |$)' then return 'bathroom'; end if;
    if v_name ~ '(^| )kitchen( |$)' then return 'kitchen'; end if;
    if v_name ~ '(^| )garage( |$)' then return 'garage'; end if;
    return null;
end;
$$;

with seed(room_kind, name, system, category, aliases, parent_name, display_order) as (
    values
    ('bathroom','Bathroom Vanity','Plumbing','Fixture','["Vanity"]'::jsonb,null,10),
    ('bathroom','Bathroom Sink','Plumbing','Fixture','["Vanity Sink","Lavatory Sink"]'::jsonb,null,20),
    ('bathroom','Bathroom Sink Faucet','Plumbing','Fixture','["Bathroom Faucet","Bathroom Sink / Faucet","Lavatory Faucet"]'::jsonb,null,30),
    ('bathroom','Shower / Tub','Plumbing','Fixture','["Shower/Tub","Shower / Tub Valve","Tub / Shower Combination","Shower","Tub"]'::jsonb,null,40),
    ('bathroom','Toilet','Plumbing','Fixture','["Water Closet"]'::jsonb,null,50),
    ('bathroom','Bathroom Sink Hot Angle Stop','Plumbing','Component','["Hot Angle Stop","Bathroom Hot Angle Stop"]'::jsonb,'Bathroom Sink',60),
    ('bathroom','Bathroom Sink Cold Angle Stop','Plumbing','Component','["Cold Angle Stop","Bathroom Cold Angle Stop","Bathroom Angle Stop"]'::jsonb,'Bathroom Sink',70),
    ('bathroom','Bathroom Sink Hot Supply Line','Plumbing','Component','["Hot Supply Line","Bathroom Hot Supply Line"]'::jsonb,'Bathroom Sink',80),
    ('bathroom','Bathroom Sink Cold Supply Line','Plumbing','Component','["Cold Supply Line","Bathroom Cold Supply Line"]'::jsonb,'Bathroom Sink',90),
    ('bathroom','Bathroom Sink P-Trap','Drains / Sewer','Component','["Bathroom P-Trap","Lavatory P-Trap"]'::jsonb,'Bathroom Sink',100),
    ('bathroom','Bathroom Sink Pop-Up / Drain Assembly','Drains / Sewer','Component','["Pop-Up Assembly","Bathroom Pop-Up Assembly","Drain Assembly","Lavatory Drain"]'::jsonb,'Bathroom Sink',110),
    ('bathroom','Shower Valve','Plumbing','Component','[]'::jsonb,'Shower / Tub',120),
    ('bathroom','Shower Cartridge','Plumbing','Component','[]'::jsonb,'Shower / Tub',130),
    ('bathroom','Shower Head','Plumbing','Fixture','["Showerhead"]'::jsonb,'Shower / Tub',140),
    ('bathroom','Shower Drain','Drains / Sewer','Fixture','["Shower / Tub Drain","Tub Drain"]'::jsonb,'Shower / Tub',150),
    ('bathroom','Tub / Shower Diverter','Plumbing','Component','["Shower Diverter","Tub Diverter"]'::jsonb,'Shower / Tub',160),
    ('bathroom','Tub Spout','Plumbing','Fixture','[]'::jsonb,'Shower / Tub',170),
    ('bathroom','Tub Waste and Overflow','Drains / Sewer','Component','["Tub Waste & Overflow"]'::jsonb,'Shower / Tub',180),
    ('bathroom','Toilet Shutoff / Angle Stop','Plumbing','Component','["Toilet Shutoff Valve","Toilet Angle Stop","Toilet Shutoff","Toilet Stop"]'::jsonb,'Toilet',190),
    ('bathroom','Toilet Supply Line','Plumbing','Component','[]'::jsonb,'Toilet',200),
    ('bathroom','Toilet Fill Valve','Plumbing','Component','["Fill Valve"]'::jsonb,'Toilet',210),
    ('bathroom','Toilet Flapper','Plumbing','Component','["Flapper"]'::jsonb,'Toilet',220),
    ('bathroom','Toilet Tank Bolts','Plumbing','Component','["Tank Bolts"]'::jsonb,'Toilet',230),
    ('bathroom','Toilet Wax Ring','Drains / Sewer','Component','["Wax Ring","Toilet Wax Seal"]'::jsonb,'Toilet',240),
    ('bathroom','Toilet Seat','Plumbing','Component','[]'::jsonb,'Toilet',250),

    ('kitchen','Kitchen Sink','Plumbing','Fixture','["Sink"]'::jsonb,null,10),
    ('kitchen','Kitchen Faucet','Plumbing','Fixture','["Faucet"]'::jsonb,null,20),
    ('kitchen','Garbage Disposal','Plumbing','Equipment','["Food Waste Disposer","Disposal"]'::jsonb,null,30),
    ('kitchen','Dishwasher','Appliances','Equipment','[]'::jsonb,null,40),
    ('kitchen','Refrigerator Water Line','Plumbing','Component','["Ice Maker Line","Refrigerator Line"]'::jsonb,null,50),
    ('kitchen','Instant Hot Water Dispenser','Plumbing','Equipment','["Instant Hot","Hot Water Dispenser"]'::jsonb,null,60),
    ('kitchen','Reverse Osmosis System','Water Quality','Equipment','["Reverse Osmosis","RO System"]'::jsonb,null,70),
    ('kitchen','Kitchen Hot Angle Stop','Plumbing','Component','["Hot Angle Stop","Kitchen Sink Hot Angle Stop"]'::jsonb,'Kitchen Sink',80),
    ('kitchen','Kitchen Cold Angle Stop','Plumbing','Component','["Cold Angle Stop","Kitchen Sink Cold Angle Stop"]'::jsonb,'Kitchen Sink',90),
    ('kitchen','Kitchen Hot Supply Line','Plumbing','Component','["Hot Supply Line","Kitchen Sink Hot Supply Line"]'::jsonb,'Kitchen Sink',100),
    ('kitchen','Kitchen Cold Supply Line','Plumbing','Component','["Cold Supply Line","Kitchen Sink Cold Supply Line"]'::jsonb,'Kitchen Sink',110),
    ('kitchen','Kitchen Sink Drain','Drains / Sewer','Fixture','["Kitchen Drain","Sink Drain"]'::jsonb,'Kitchen Sink',120),
    ('kitchen','Kitchen Sink P-Trap','Drains / Sewer','Component','["Kitchen P-Trap","Kitchen Drain / P-Trap","P-Trap"]'::jsonb,'Kitchen Sink',130),
    ('kitchen','Kitchen Basket Strainer','Drains / Sewer','Component','["Basket Strainer","Sink Strainer"]'::jsonb,'Kitchen Sink',140),
    ('kitchen','Disposal Flange','Drains / Sewer','Component','["Garbage Disposal Flange"]'::jsonb,'Garbage Disposal',150),
    ('kitchen','Dishwasher Supply Line','Plumbing','Component','["Dishwasher Connection"]'::jsonb,'Dishwasher',160),
    ('kitchen','Dishwasher Drain Hose','Drains / Sewer','Component','["Dishwasher Drain Line","Dishwasher Drain"]'::jsonb,'Dishwasher',170),
    ('kitchen','Dishwasher Air Gap','Plumbing','Component','["Air Gap"]'::jsonb,'Dishwasher',180),
    ('kitchen','Dishwasher Shutoff Valve','Plumbing','Component','["Dishwasher Angle Stop"]'::jsonb,'Dishwasher',190),
    ('kitchen','Refrigerator Water Filter','Water Quality','Component','["Refrigerator Filter"]'::jsonb,'Refrigerator Water Line',200),
    ('kitchen','Refrigerator Shutoff Valve','Plumbing','Component','["Ice Maker Shutoff Valve"]'::jsonb,'Refrigerator Water Line',210),
    ('kitchen','Instant Hot Shutoff Valve','Plumbing','Component','["Instant Hot Angle Stop"]'::jsonb,'Instant Hot Water Dispenser',220),
    ('kitchen','Instant Hot Supply Line','Plumbing','Component','[]'::jsonb,'Instant Hot Water Dispenser',230),
    ('kitchen','RO Feed Shutoff Valve','Water Quality','Component','["Reverse Osmosis Feed Valve"]'::jsonb,'Reverse Osmosis System',240),
    ('kitchen','RO Sediment Filter','Water Quality','Component','["Sediment Filter"]'::jsonb,'Reverse Osmosis System',250),
    ('kitchen','RO Carbon Pre-Filter','Water Quality','Component','["Carbon Pre-Filter"]'::jsonb,'Reverse Osmosis System',260),
    ('kitchen','RO Membrane','Water Quality','Component','["Reverse Osmosis Membrane"]'::jsonb,'Reverse Osmosis System',270),
    ('kitchen','RO Post-Carbon Filter','Water Quality','Component','["Post-Carbon Filter"]'::jsonb,'Reverse Osmosis System',280),
    ('kitchen','RO Filter Canisters','Water Quality','Component','["RO Canisters","Filter Canisters"]'::jsonb,'Reverse Osmosis System',290),
    ('kitchen','RO Storage Tank','Water Quality','Component','["Reverse Osmosis Tank"]'::jsonb,'Reverse Osmosis System',300),
    ('kitchen','RO Faucet','Water Quality','Fixture','["Reverse Osmosis Faucet"]'::jsonb,'Reverse Osmosis System',310),

    ('garage','Water Heater','Plumbing','Equipment','["Tank Water Heater","Tankless Water Heater"]'::jsonb,null,10),
    ('garage','Garage Hose Bibb','Plumbing','Fixture','["Garage Hose Bib","Hose Bib","Hose Bibb"]'::jsonb,null,20),
    ('garage','Washer Box / Laundry Connections','Plumbing','Equipment','["Washer Box","Laundry Connections","Washing Machine Box"]'::jsonb,null,30),
    ('garage','Whole Home Filter','Water Quality','Equipment','["Whole House Filter","Whole Home Filter / Halo 5"]'::jsonb,null,40),
    ('garage','Water Heater Cold Water Connection','Plumbing','Component','["Cold Water Connection","Water Heater Cold Supply"]'::jsonb,'Water Heater',50),
    ('garage','Water Heater Hot Water Connection','Plumbing','Component','["Hot Water Connection","Water Heater Hot Supply"]'::jsonb,'Water Heater',60),
    ('garage','Water Heater Shutoff Valve','Plumbing','Component','["Cold Water Shutoff","Water Heater Angle Stop"]'::jsonb,'Water Heater',70),
    ('garage','Expansion Tank','Plumbing','Equipment','[]'::jsonb,'Water Heater',80),
    ('garage','TPR Valve','Plumbing','Component','["T&P Valve","Temperature and Pressure Relief Valve"]'::jsonb,'Water Heater',90),
    ('garage','TPR Discharge Line','Plumbing','Component','["T&P Discharge Line"]'::jsonb,'Water Heater',100),
    ('garage','Water Heater Drain Pan','Plumbing','Component','["Drain Pan"]'::jsonb,'Water Heater',110),
    ('garage','Water Heater Sediment / Drain Valve','Plumbing','Component','["Water Heater Drain Valve","Sediment Drain Valve"]'::jsonb,'Water Heater',120),
    ('garage','Water Heater Venting','Gas','Component','["Water Heater Vent","Tankless Venting"]'::jsonb,'Water Heater',130),
    ('garage','Water Heater Gas Connection','Gas','Component','["Gas Connection"]'::jsonb,'Water Heater',140),
    ('garage','Water Heater Recirculation Pump','Plumbing','Equipment','["Recirculation Pump"]'::jsonb,'Water Heater',150),
    ('garage','Water Heater Recirculation Line','Plumbing','Component','["Recirculation Line"]'::jsonb,'Water Heater',160),
    ('garage','Tankless Isolation Valve Set','Plumbing','Component','["Tankless Isolation Valves"]'::jsonb,'Water Heater',170),
    ('garage','Tankless Condensate Drain','Drains / Sewer','Component','["Condensate Drain"]'::jsonb,'Water Heater',180),
    ('garage','Washer Hot Valve','Plumbing','Component','["Hot Washer Valve"]'::jsonb,'Washer Box / Laundry Connections',190),
    ('garage','Washer Cold Valve','Plumbing','Component','["Cold Washer Valve"]'::jsonb,'Washer Box / Laundry Connections',200),
    ('garage','Washer Hot Supply Line','Plumbing','Component','["Hot Washer Supply Line"]'::jsonb,'Washer Box / Laundry Connections',210),
    ('garage','Washer Cold Supply Line','Plumbing','Component','["Cold Washer Supply Line"]'::jsonb,'Washer Box / Laundry Connections',220),
    ('garage','Washer Drain / Standpipe','Drains / Sewer','Fixture','["Washer Drain","Laundry Standpipe"]'::jsonb,'Washer Box / Laundry Connections',230)
), prepared as (
    select
        room_kind || ':' || replace(public.homeos_starter_identity(name), ' ', '_') as template_key,
        room_kind,
        name,
        system,
        category,
        case when parent_name is null then null
             else room_kind || ':' || replace(public.homeos_starter_identity(parent_name), ' ', '_') end as parent_template_key,
        aliases,
        display_order
    from seed
)
insert into public.homeos_starter_card_templates(
    template_key, room_kind, name, system, category, parent_template_key, aliases, display_order
)
select template_key, room_kind, name, system, category, parent_template_key, aliases, display_order
from prepared
on conflict (template_key) do update set
    room_kind = excluded.room_kind,
    name = excluded.name,
    system = excluded.system,
    category = excluded.category,
    parent_template_key = excluded.parent_template_key,
    aliases = excluded.aliases,
    display_order = excluded.display_order,
    active = true,
    updated_at = now();

create or replace function public.provision_complete_room_starter_cards(p_area_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_area public.home_items%rowtype;
    v_template public.homeos_starter_card_templates%rowtype;
    v_parent_name text;
    v_slug text;
    v_base_slug text;
    v_suffix integer;
    v_created integer := 0;
begin
    select area.* into v_area
    from public.home_items area
    where area.id = p_area_id
      and lower(btrim(area.category)) = 'area'
      and coalesce(area.archived, false) = false
      and nullif(btrim(coalesce(area.parent_area, '')), '') is null;

    if not found or public.homeos_complete_room_kind(v_area.name) is null then return 0; end if;

    for v_template in
        select template.*
        from public.homeos_starter_card_templates template
        where template.active
          and template.room_kind = public.homeos_complete_room_kind(v_area.name)
        order by template.display_order, template.name
    loop
        if exists (
            select 1
            from public.home_items item
            where item.property_id = v_area.property_id
              and lower(btrim(item.category)) <> 'area'
              and public.homeos_starter_identity(item.name) in (
                  select public.homeos_starter_identity(value)
                  from jsonb_array_elements_text(v_template.aliases || jsonb_build_array(v_template.name)) value
              )
              and (
                  (
                      v_template.parent_template_key is null
                      and public.homeos_starter_identity(item.location) = public.homeos_starter_identity(v_area.name)
                      and nullif(btrim(coalesce(item.parent_area, '')), '') is null
                  )
                  or (
                      v_template.parent_template_key is not null
                      and (
                          (
                              public.homeos_starter_identity(item.location) = public.homeos_starter_identity(v_area.name)
                              and nullif(btrim(coalesce(item.parent_area, '')), '') is null
                          )
                          or public.homeos_starter_identity(item.parent_area) = public.homeos_starter_identity(v_area.name)
                      )
                  )
              )
        ) then
            continue;
        end if;

        v_parent_name := null;
        if v_template.parent_template_key is not null then
            select parent.name into v_parent_name
            from public.home_items parent
            join public.homeos_starter_card_templates parent_template
              on parent_template.template_key = v_template.parent_template_key
            where parent.property_id = v_area.property_id
              and public.homeos_starter_identity(parent.location) = public.homeos_starter_identity(v_area.name)
              and nullif(btrim(coalesce(parent.parent_area, '')), '') is null
              and public.homeos_starter_identity(parent.name) in (
                  select public.homeos_starter_identity(value)
                  from jsonb_array_elements_text(parent_template.aliases || jsonb_build_array(parent_template.name)) value
              )
            order by coalesce(parent.archived, false), parent.created_at
            limit 1;
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
            location, parent_area, status, install_state, archived
        ) values (
            v_area.user_id,
            v_area.property_id,
            v_slug,
            v_template.name,
            v_template.system,
            v_template.category,
            case when v_template.parent_template_key is null then v_area.name else v_parent_name end,
            case when v_template.parent_template_key is null then '' else v_area.name end,
            'Missing Information',
            'Installed',
            false
        );
        v_created := v_created + 1;
    end loop;

    return v_created;
end;
$$;

create or replace function public.sync_complete_room_starter_cards()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
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

drop trigger if exists sync_complete_room_starter_cards_trigger on public.home_items;
create trigger sync_complete_room_starter_cards_trigger
after insert or update of name, category, parent_area, archived on public.home_items
for each row
when (lower(btrim(new.category)) = 'area')
execute function public.sync_complete_room_starter_cards();

do $$
declare
    v_area_id uuid;
begin
    for v_area_id in
        select area.id
        from public.home_items area
        where lower(btrim(area.category)) = 'area'
          and coalesce(area.archived, false) = false
          and nullif(btrim(coalesce(area.parent_area, '')), '') is null
          and public.homeos_complete_room_kind(area.name) is not null
        order by area.created_at, area.id
    loop
        perform public.provision_complete_room_starter_cards(v_area_id);
    end loop;
end;
$$;

create or replace function public.get_homeos_starter_card_deck()
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
        'template_key', template.template_key,
        'room_kind', template.room_kind,
        'name', template.name,
        'system', template.system,
        'category', template.category,
        'parent_template_key', template.parent_template_key,
        'aliases', template.aliases,
        'display_order', template.display_order,
        'readiness_status', template.readiness_status,
        'admin_notes', coalesce(template.admin_notes, ''),
        'mapped_variant_ids', coalesce(mapping.mapped_variant_ids, '[]'::jsonb),
        'mapped_count', coalesce(mapping.mapped_count, 0),
        'approved_option_count', coalesce(mapping.approved_option_count, 0),
        'readiness_issues', to_jsonb(array_remove(array[
            case when coalesce(mapping.mapped_count, 0) = 0 then 'No real catalog product options mapped.' end,
            case when coalesce(mapping.mapped_count, 0) > 0 and coalesce(mapping.approved_option_count, 0) = 0 then 'Mapped options are not approved yet.' end,
            case when template.readiness_status <> 'ready' then 'Starter card is not marked ready.' end
        ], null))
    ) order by template.room_kind, template.display_order, template.name), '[]'::jsonb)
    into v_result
    from public.homeos_starter_card_templates template
    left join lateral (
        select
            jsonb_agg(link.product_variant_id::text order by link.created_at, link.product_variant_id) as mapped_variant_ids,
            count(*)::integer as mapped_count,
            count(*) filter (where variant.status = 'approved')::integer as approved_option_count
        from public.homeos_starter_card_catalog_variants link
        join public.catalog_product_variants variant on variant.id = link.product_variant_id
        where link.template_key = template.template_key
    ) mapping on true
    where template.active;

    return v_result;
end;
$$;

create or replace function public.save_homeos_starter_card_deck_entry(
    p_template_key text,
    p_variant_ids uuid[],
    p_readiness_status text,
    p_admin_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
begin
    if not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Catalog Factory is restricted to platform administrators.';
    end if;
    if p_readiness_status not in ('unbuilt','building','ready') then raise exception 'Invalid starter-card readiness.'; end if;
    if not exists (select 1 from public.homeos_starter_card_templates where template_key = p_template_key and active) then
        raise exception 'Starter card was not found.';
    end if;
    if exists (
        select 1 from unnest(coalesce(p_variant_ids, array[]::uuid[])) variant_id
        where not exists (select 1 from public.catalog_product_variants variant where variant.id = variant_id)
    ) then raise exception 'One or more mapped product variants no longer exist.'; end if;

    delete from public.homeos_starter_card_catalog_variants where template_key = p_template_key;
    insert into public.homeos_starter_card_catalog_variants(template_key, product_variant_id, created_by_user_id)
    select p_template_key, variant_id, auth.uid()
    from (select distinct unnest(coalesce(p_variant_ids, array[]::uuid[])) as variant_id) selected;

    update public.homeos_starter_card_templates
    set readiness_status = p_readiness_status,
        admin_notes = nullif(btrim(coalesce(p_admin_notes, '')), ''),
        updated_at = now()
    where template_key = p_template_key;

    select entry into v_result
    from jsonb_array_elements(public.get_homeos_starter_card_deck()) entry
    where entry->>'template_key' = p_template_key;
    return v_result;
end;
$$;

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
begin
    if not public.company_catalog_settings_can_view(p_company_id) then
        raise exception 'Company catalog access is required.';
    end if;

    select coalesce(jsonb_agg(link.product_variant_id::text order by link.created_at, link.product_variant_id), '[]'::jsonb)
    into v_result
    from public.homeos_starter_card_catalog_variants link
    join public.catalog_product_variants variant on variant.id = link.product_variant_id and variant.status = 'approved'
    join public.company_catalog_offerings offering
      on offering.company_id = p_company_id
     and offering.product_variant_id = link.product_variant_id
     and offering.active
     and offering.company_catalog_product_id is not null
    join public.company_approved_products product
      on product.id = offering.company_catalog_product_id
     and product.company_id = p_company_id
     and product.active
     and product.approved
    where link.template_key = p_template_key
      and public.company_catalog_variant_is_entitled(p_company_id, link.product_variant_id);

    return v_result;
end;
$$;

revoke all on function public.homeos_starter_identity(text) from public, anon;
revoke all on function public.homeos_complete_room_kind(text) from public, anon;
revoke all on function public.provision_complete_room_starter_cards(uuid) from public, anon, authenticated;
revoke all on function public.sync_complete_room_starter_cards() from public, anon, authenticated;
revoke all on function public.get_homeos_starter_card_deck() from public, anon;
revoke all on function public.save_homeos_starter_card_deck_entry(text,uuid[],text,text) from public, anon;
revoke all on function public.get_company_homeos_starter_catalog_variant_ids(uuid,text) from public, anon;
grant execute on function public.get_homeos_starter_card_deck() to authenticated;
grant execute on function public.save_homeos_starter_card_deck_entry(text,uuid[],text,text) to authenticated;
grant execute on function public.get_company_homeos_starter_catalog_variant_ids(uuid,text) to authenticated;

comment on table public.homeos_starter_card_templates is
    'Generic HomeOS starter archetypes. These are not manufacturer/model product variants.';
comment on table public.homeos_starter_card_catalog_variants is
    'Explicit mappings from generic HomeOS starter archetypes to real Catalog Factory product variants.';

commit;
