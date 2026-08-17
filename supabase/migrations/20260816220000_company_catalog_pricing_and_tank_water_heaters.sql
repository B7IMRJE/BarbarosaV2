begin;

alter table public.company_catalog_offerings
    add column if not exists markup_mode text not null default 'amount',
    add column if not exists labor_hours numeric(8,2);

do $$
begin
    if not exists (
        select 1 from pg_constraint where conname = 'company_catalog_offerings_markup_mode_check'
    ) then
        alter table public.company_catalog_offerings
            add constraint company_catalog_offerings_markup_mode_check
            check (markup_mode in ('amount', 'percent'));
    end if;
    if not exists (
        select 1 from pg_constraint where conname = 'company_catalog_offerings_labor_hours_check'
    ) then
        alter table public.company_catalog_offerings
            add constraint company_catalog_offerings_labor_hours_check
            check (labor_hours is null or labor_hours >= 0);
    end if;
end;
$$;

comment on column public.company_catalog_offerings.installed_price is
    'Company-private minimum quote price. The legacy physical column name is retained for compatibility.';
comment on column public.company_catalog_offerings.markup_mode is
    'Explicit interpretation of markup: fixed dollar amount or percent of material cost.';
comment on column public.company_catalog_offerings.labor_hours is
    'Company catalog labor hours. Fractional hours are calculated using the company catalog hourly labor rate.';

create table if not exists public.company_catalog_pricing_settings (
    company_id uuid primary key references public.companies(id) on delete cascade,
    hourly_labor_rate numeric(12,2) not null,
    updated_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_catalog_pricing_settings_rate_check check (hourly_labor_rate > 0)
);

alter table public.company_catalog_pricing_settings enable row level security;

create or replace function public.get_company_catalog_pricing_settings(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_settings public.company_catalog_pricing_settings%rowtype;
begin
    if auth.uid() is null or not (
        coalesce(public.homeos_is_platform_admin(), false)
        or public.company_price_book_can_manage(p_company_id)
    ) then
        raise exception 'Company catalog pricing access is required.';
    end if;

    select settings.* into v_settings
    from public.company_catalog_pricing_settings settings
    where settings.company_id = p_company_id;

    return jsonb_build_object(
        'company_id', p_company_id,
        'hourly_labor_rate', v_settings.hourly_labor_rate,
        'updated_at', v_settings.updated_at
    );
end;
$$;

create or replace function public.save_company_catalog_pricing_settings(
    p_company_id uuid,
    p_hourly_labor_rate numeric
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_settings public.company_catalog_pricing_settings%rowtype;
begin
    if auth.uid() is null or not (
        coalesce(public.homeos_is_platform_admin(), false)
        or public.company_price_book_can_manage(p_company_id)
    ) then
        raise exception 'Company catalog pricing access is required.';
    end if;
    if p_hourly_labor_rate is null or p_hourly_labor_rate <= 0 then
        raise exception 'Hourly labor rate must be greater than zero.';
    end if;

    insert into public.company_catalog_pricing_settings(
        company_id, hourly_labor_rate, updated_by_user_id, updated_at
    ) values (
        p_company_id, round(p_hourly_labor_rate, 2), auth.uid(), now()
    )
    on conflict (company_id) do update set
        hourly_labor_rate = excluded.hourly_labor_rate,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    returning * into v_settings;

    return to_jsonb(v_settings);
end;
$$;

create or replace function public.save_company_catalog_offering_pricing_v2(
    p_company_id uuid,
    p_variant_id uuid,
    p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_offering public.company_catalog_offerings%rowtype;
    v_rate numeric(12,2);
    v_material_cost numeric(12,2);
    v_markup numeric(12,2);
    v_markup_mode text;
    v_labor_hours numeric(8,2);
    v_labor_amount numeric(12,2);
    v_minimum_price numeric(12,2);
    v_supplier text;
    v_warranty text;
    v_active boolean;
begin
    if auth.uid() is null or not (
        coalesce(public.homeos_is_platform_admin(), false)
        or public.company_price_book_can_manage(p_company_id)
    ) then
        raise exception 'Company catalog pricing access is required.';
    end if;
    if jsonb_typeof(p_payload) <> 'object' then
        raise exception 'Company offering details are required.';
    end if;
    if not public.company_catalog_variant_is_entitled(p_company_id, p_variant_id) then
        raise exception 'This master card is not included in the company catalog package.';
    end if;

    select offering.* into v_offering
    from public.company_catalog_offerings offering
    where offering.company_id = p_company_id
      and offering.product_variant_id = p_variant_id
    for update;
    if not found then
        raise exception 'Create the company offering before saving its pricing.';
    end if;

    v_material_cost := coalesce(nullif(p_payload->>'material_cost', '')::numeric, v_offering.material_cost);
    v_markup := coalesce(nullif(p_payload->>'markup', '')::numeric, v_offering.markup);
    v_markup_mode := coalesce(nullif(p_payload->>'markup_mode', ''), v_offering.markup_mode, 'amount');
    v_labor_hours := nullif(p_payload->>'labor_hours', '')::numeric;
    v_minimum_price := coalesce(nullif(p_payload->>'minimum_price', '')::numeric, v_offering.installed_price);
    v_supplier := coalesce(nullif(btrim(coalesce(p_payload->>'preferred_supplier', '')), ''), v_offering.preferred_supplier);
    v_warranty := coalesce(nullif(btrim(coalesce(p_payload->>'company_warranty', '')), ''), v_offering.company_warranty);
    v_active := coalesce((p_payload->>'active')::boolean, v_offering.active);

    if v_markup_mode not in ('amount', 'percent') then
        raise exception 'Markup mode must be amount or percent.';
    end if;
    if v_material_cost < 0 or v_markup < 0 or v_labor_hours < 0 or v_minimum_price < 0 then
        raise exception 'Company offering prices and hours cannot be negative.';
    end if;

    if v_labor_hours is null then
        v_labor_amount := v_offering.labor_amount;
    else
        select settings.hourly_labor_rate into v_rate
        from public.company_catalog_pricing_settings settings
        where settings.company_id = p_company_id;
        if v_rate is null then
            raise exception 'Save the company hourly labor rate before using labor hours.';
        end if;
        v_labor_amount := round(v_labor_hours * v_rate, 2);
    end if;

    update public.company_catalog_offerings offering
    set material_cost = v_material_cost,
        markup = v_markup,
        markup_mode = v_markup_mode,
        labor_hours = coalesce(v_labor_hours, offering.labor_hours),
        labor_amount = v_labor_amount,
        installed_price = v_minimum_price,
        preferred_supplier = v_supplier,
        company_warranty = v_warranty,
        active = v_active,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where offering.id = v_offering.id
    returning * into v_offering;

    if v_offering.company_catalog_product_id is not null then
        update public.company_approved_products product
        set internal_product_cost = coalesce(v_material_cost, product.internal_product_cost),
            approved_selling_price = coalesce(v_minimum_price, product.approved_selling_price),
            warranty = coalesce(v_warranty, product.warranty),
            active = v_active,
            approved = true,
            catalog_status = case when v_active then 'approved' else 'archived' end,
            updated_by_user_id = auth.uid(),
            updated_at = now()
        where product.id = v_offering.company_catalog_product_id
          and product.company_id = p_company_id;
    end if;

    return to_jsonb(v_offering) || jsonb_build_object('minimum_price', v_offering.installed_price);
end;
$$;

create or replace function public.add_home_item_catalog_product_to_quote_v2(
    p_company_id uuid,
    p_property_id uuid,
    p_home_item_id uuid,
    p_product_variant_id uuid,
    p_service_request_id uuid default null,
    p_schedule_slot_id uuid default null,
    p_job_id uuid default null,
    p_estimate_category text default 'faucet_replacement',
    p_source text default 'provider_mode'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
    v_option_id uuid;
begin
    v_result := public.add_home_item_catalog_product_to_quote(
        p_company_id, p_property_id, p_home_item_id, p_product_variant_id,
        p_service_request_id, p_schedule_slot_id, p_job_id, p_estimate_category, p_source
    );
    v_option_id := nullif(v_result->>'estimate_option_id', '')::uuid;
    if v_option_id is null then raise exception 'The catalog quote option was not created.'; end if;

    update public.company_estimate_options option_row
    set choice_snapshot = jsonb_set(
            option_row.choice_snapshot,
            '{pricingResult,minimumAllowedTotal}',
            to_jsonb(option_row.deterministic_total),
            true
        ),
        updated_at = now()
    where option_row.id = v_option_id
      and option_row.company_id = p_company_id;
    if not found then raise exception 'The catalog quote minimum could not be established.'; end if;

    return v_result;
end;
$$;

create or replace function public.add_home_item_catalog_products_to_quote_v2(
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
    if coalesce(cardinality(p_product_variant_ids), 0) = 0 then raise exception 'Select at least one catalog product.'; end if;
    if cardinality(p_product_variant_ids) > 20 then raise exception 'Add no more than 20 catalog products at once.'; end if;
    if cardinality(p_product_variant_ids) <> cardinality(p_estimate_categories) then raise exception 'Each catalog product requires an estimate category.'; end if;
    if cardinality(p_product_variant_ids) <> (select count(distinct selected.variant_id) from unnest(p_product_variant_ids) selected(variant_id)) then
        raise exception 'Catalog product selections must be unique.';
    end if;

    v_index := 1;
    while v_index <= cardinality(p_product_variant_ids) loop
        v_results := v_results || jsonb_build_array(public.add_home_item_catalog_product_to_quote_v2(
            p_company_id, p_property_id, p_home_item_id, p_product_variant_ids[v_index],
            p_service_request_id, p_schedule_slot_id, p_job_id, p_estimate_categories[v_index], p_source
        ));
        v_index := v_index + 1;
    end loop;
    return v_results;
end;
$$;

create or replace function public.add_homeos_starter_card_variant_mapping(
    p_template_key text,
    p_variant_id uuid
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
    if not exists (
        select 1 from public.homeos_starter_card_templates template
        where template.template_key = p_template_key and template.active
    ) then raise exception 'Starter card was not found.'; end if;
    if not exists (
        select 1 from public.catalog_product_variants variant
        where variant.id = p_variant_id and variant.status = 'approved'
    ) then raise exception 'Only approved master products can be mapped.'; end if;

    insert into public.homeos_starter_card_catalog_variants(template_key, product_variant_id, created_by_user_id)
    values (p_template_key, p_variant_id, auth.uid())
    on conflict (template_key, product_variant_id) do nothing;
    return true;
end;
$$;

update public.catalog_category_templates
set category_name = 'Tank Water Heater',
    description = 'Storage tank and hybrid water heaters. This category is distinct from Tankless Water Heater.',
    specification_fields = '[{"key":"fuel_type","label":"Fuel type"},{"key":"capacity_gallons","label":"Capacity (gallons)"},{"key":"form_factor","label":"Form Factor / Physical Profile"},{"key":"height_inches","label":"Verified height (inches)"},{"key":"diameter_inches","label":"Verified diameter (inches)"},{"key":"input_btu","label":"Input BTU"},{"key":"vent_type","label":"Vent type"}]'::jsonb,
    required_fields = '["fuel_type","capacity_gallons"]'::jsonb,
    updated_at = now()
where template_key = 'water_heater';

update public.homeos_starter_card_templates
set aliases = coalesce(aliases, '[]'::jsonb) || '["Tank Water Heater","Storage Water Heater","30 gallon","40 gallon","50 gallon","70 gallon","100 gallon"]'::jsonb,
    updated_at = now()
where template_key = 'garage:water_heater';

insert into public.homeos_starter_card_catalog_variants(template_key, product_variant_id, created_by_user_id)
select 'garage:water_heater', variant.id, null
from public.catalog_product_variants variant
join public.catalog_product_families family on family.id = variant.product_family_id
join public.catalog_category_templates template on template.id = family.category_template_id
where template.template_key = 'water_heater'
  and variant.status = 'approved'
  and family.status = 'approved'
on conflict (template_key, product_variant_id) do nothing;

revoke all on function public.get_company_catalog_pricing_settings(uuid) from public, anon;
revoke all on function public.save_company_catalog_pricing_settings(uuid,numeric) from public, anon;
revoke all on function public.save_company_catalog_offering_pricing_v2(uuid,uuid,jsonb) from public, anon;
revoke all on function public.add_home_item_catalog_product_to_quote_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text) from public, anon;
revoke all on function public.add_home_item_catalog_products_to_quote_v2(uuid,uuid,uuid,uuid[],text[],uuid,uuid,uuid,text) from public, anon;
revoke all on function public.add_homeos_starter_card_variant_mapping(text,uuid) from public, anon;

grant execute on function public.get_company_catalog_pricing_settings(uuid) to authenticated;
grant execute on function public.save_company_catalog_pricing_settings(uuid,numeric) to authenticated;
grant execute on function public.save_company_catalog_offering_pricing_v2(uuid,uuid,jsonb) to authenticated;
grant execute on function public.add_home_item_catalog_product_to_quote_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text) to authenticated;
grant execute on function public.add_home_item_catalog_products_to_quote_v2(uuid,uuid,uuid,uuid[],text[],uuid,uuid,uuid,text) to authenticated;
grant execute on function public.add_homeos_starter_card_variant_mapping(text,uuid) to authenticated;

commit;
