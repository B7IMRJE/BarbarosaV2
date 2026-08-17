-- Give the Flo by Moen Smart Water Monitor and Shutoff exact, size-specific
-- master variants and company-private offerings. No company cost or selling
-- price is created or copied by this migration. Existing pricing, activation,
-- media, mappings, and history remain authoritative.

begin;

do $$
begin
    if to_regclass('public.catalog_product_variants') is null
       or to_regclass('public.catalog_product_families') is null
       or to_regclass('public.catalog_sources') is null
       or to_regclass('public.catalog_source_assets') is null
       or to_regclass('public.company_catalog_offerings') is null
       or to_regclass('public.company_approved_products') is null
       or to_regclass('public.homeos_starter_card_catalog_variants') is null
       or to_regprocedure('public.seed_default_approved_company_catalog(uuid,uuid)') is null then
        raise exception 'Flo size variants require Catalog Factory, company offerings, and the HomeOS Deck.';
    end if;
end;
$$;

do $$
declare
    v_family_id uuid;
    v_source_variant public.catalog_product_variants%rowtype;
    v_variant record;
    v_source_id uuid;
    v_specification_url text;
    v_manual_url constant text := 'https://assets.moen.com/shared/docs/instruction-sheets/ins11955c.pdf';
begin
    select variant.*
    into v_source_variant
    from public.catalog_product_variants variant
    where lower(btrim(variant.manufacturer_snapshot)) = 'moen'
      and regexp_replace(lower(variant.model_number), '[^a-z0-9]', '', 'g') = '900001'
      and variant.status = 'approved'
    order by variant.approved_at nulls last, variant.created_at, variant.id
    limit 1;

    if not found then
        raise exception 'The approved Flo by Moen 900-001 source variant was not found.';
    end if;

    v_family_id := v_source_variant.product_family_id;

    -- The existing 3/4-inch record remains the same record. Only verified
    -- product facts are added; all existing JSON keys and authoring data stay.
    update public.catalog_product_variants variant
    set size = coalesce(nullif(btrim(variant.size), ''), '3/4 inch'),
        specifications = coalesce(variant.specifications, '{}'::jsonb) || jsonb_build_object(
            'nominal_device_size', '3/4 inch',
            'connection_size', '3/4 inch NPT',
            'product_type', 'Smart Water Monitor and Automatic Shutoff',
            'manufacturer_model', '900-001'
        ),
        last_verified_at = now(),
        updated_at = now()
    where variant.id = v_source_variant.id;

    -- Official Moen models 900-006 and 900-002 are distinct products. They
    -- intentionally begin without any company cost, markup, labor, or price.
    insert into public.catalog_product_variants(
        product_family_id,
        manufacturer_snapshot,
        model_number,
        manufacturer_part_number,
        size,
        variant_name,
        description,
        specifications,
        status,
        confidence,
        validation_warnings,
        duplicate_warnings,
        missing_fields,
        last_verified_at,
        approved_at,
        approved_by_user_id,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
    )
    select
        v_family_id,
        'Moen',
        seed.model_number,
        seed.model_number,
        seed.nominal_size,
        concat('Flo by Moen Smart Water Monitor and Shutoff - ', seed.nominal_size),
        concat('Flo by Moen Smart Water Monitor and Automatic Shutoff for a ', seed.nominal_size, ' domestic-water service connection.'),
        jsonb_build_object(
            'nominal_device_size', seed.nominal_size,
            'connection_size', seed.connection_size,
            'product_type', 'Smart Water Monitor and Automatic Shutoff',
            'manufacturer_model', seed.model_number
        ),
        'approved',
        1.000,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        now(),
        now(),
        v_source_variant.approved_by_user_id,
        v_source_variant.created_by_user_id,
        v_source_variant.updated_by_user_id,
        now(),
        now()
    from (
        values
            ('900-006'::text, '1 inch'::text, '1 inch NPT'::text),
            ('900-002'::text, '1-1/4 inch'::text, '1-1/4 inch NPT'::text)
    ) as seed(model_number, nominal_size, connection_size)
    where not exists (
        select 1
        from public.catalog_product_variants existing
        where lower(btrim(existing.manufacturer_snapshot)) = 'moen'
          and regexp_replace(lower(coalesce(existing.manufacturer_part_number, existing.model_number)), '[^a-z0-9]', '', 'g') =
              regexp_replace(lower(seed.model_number), '[^a-z0-9]', '', 'g')
          and existing.status = 'approved'
    );

    -- Keep exact existing approved variants idempotently aligned to their
    -- official sizes without disturbing uncommon/user-authored metadata.
    update public.catalog_product_variants variant
    set size = coalesce(nullif(btrim(variant.size), ''), seed.nominal_size),
        specifications = coalesce(variant.specifications, '{}'::jsonb) || jsonb_build_object(
            'nominal_device_size', seed.nominal_size,
            'connection_size', seed.connection_size,
            'product_type', 'Smart Water Monitor and Automatic Shutoff',
            'manufacturer_model', seed.model_number
        ),
        last_verified_at = now(),
        updated_at = now()
    from (
        values
            ('900-006'::text, '1 inch'::text, '1 inch NPT'::text),
            ('900-002'::text, '1-1/4 inch'::text, '1-1/4 inch NPT'::text)
    ) as seed(model_number, nominal_size, connection_size)
    where lower(btrim(variant.manufacturer_snapshot)) = 'moen'
      and regexp_replace(lower(coalesce(variant.manufacturer_part_number, variant.model_number)), '[^a-z0-9]', '', 'g') =
          regexp_replace(lower(seed.model_number), '[^a-z0-9]', '', 'g')
      and variant.status = 'approved';

    for v_variant in
        select
            variant.id,
            variant.model_number,
            case regexp_replace(lower(variant.model_number), '[^a-z0-9]', '', 'g')
                when '900001' then 'https://assets.moen.com/shared/docs/product-specifications/900-001sp.pdf'
                when '900006' then 'https://assets.moen.com/shared/docs/product-specifications/spc16022csp.pdf'
                when '900002' then 'https://assets.moen.com/shared/docs/product-specifications/spc15995sp.pdf'
            end as specification_url
        from public.catalog_product_variants variant
        where variant.product_family_id = v_family_id
          and variant.status = 'approved'
          and regexp_replace(lower(variant.model_number), '[^a-z0-9]', '', 'g') in ('900001', '900006', '900002')
    loop
        v_specification_url := v_variant.specification_url;

        insert into public.catalog_sources(
            product_variant_id, source_type, source_url, title,
            verified_at, confidence, notes, created_by_user_id
        )
        select
            v_variant.id,
            'specification_sheet',
            v_specification_url,
            concat('Moen ', v_variant.model_number, ' Product Specifications'),
            now(),
            1.000,
            'Official manufacturer specification sheet used to verify the model and nominal connection size.',
            v_source_variant.created_by_user_id
        where not exists (
            select 1
            from public.catalog_sources source
            where source.product_variant_id = v_variant.id
              and source.source_url = v_specification_url
        )
        returning id into v_source_id;

        if v_source_id is null then
            select source.id
            into v_source_id
            from public.catalog_sources source
            where source.product_variant_id = v_variant.id
              and source.source_url = v_specification_url
            order by source.created_at, source.id
            limit 1;
        end if;

        insert into public.catalog_source_assets(
            product_variant_id, source_id, asset_type, source_url,
            is_primary, approved_for_copy, verified_at, confidence, created_by_user_id
        )
        select
            v_variant.id, v_source_id, 'specification_sheet', v_specification_url,
            false, false, now(), 1.000, v_source_variant.created_by_user_id
        where not exists (
            select 1
            from public.catalog_source_assets asset
            where asset.product_variant_id = v_variant.id
              and asset.source_url = v_specification_url
        );

        v_source_id := null;

        insert into public.catalog_sources(
            product_variant_id, source_type, source_url, title,
            verified_at, confidence, notes, created_by_user_id
        )
        select
            v_variant.id,
            'installation_manual',
            v_manual_url,
            'Moen Flo Smart Water Monitor and Shutoff Installation Instructions',
            now(),
            1.000,
            'Official manufacturer instructions covering the supported Flo shutoff sizes.',
            v_source_variant.created_by_user_id
        where not exists (
            select 1
            from public.catalog_sources source
            where source.product_variant_id = v_variant.id
              and source.source_url = v_manual_url
        )
        returning id into v_source_id;

        if v_source_id is null then
            select source.id
            into v_source_id
            from public.catalog_sources source
            where source.product_variant_id = v_variant.id
              and source.source_url = v_manual_url
            order by source.created_at, source.id
            limit 1;
        end if;

        insert into public.catalog_source_assets(
            product_variant_id, source_id, asset_type, source_url,
            is_primary, approved_for_copy, verified_at, confidence, created_by_user_id
        )
        select
            v_variant.id, v_source_id, 'installation_manual', v_manual_url,
            false, false, now(), 1.000, v_source_variant.created_by_user_id
        where not exists (
            select 1
            from public.catalog_source_assets asset
            where asset.product_variant_id = v_variant.id
              and asset.source_url = v_manual_url
        );

        insert into public.homeos_starter_card_catalog_variants(
            template_key, product_variant_id, created_by_user_id
        ) values (
            'whole_home:smart_water_shutoff', v_variant.id, v_source_variant.created_by_user_id
        )
        on conflict (template_key, product_variant_id) do nothing;

        perform public.seed_default_approved_company_catalog(company.id, v_variant.id)
        from public.companies company;
    end loop;

    -- The already-distributed 900-001 company records gain only verified
    -- product facts. Prices, costs, activation, custom text, and media remain.
    update public.company_approved_products product
    set product_specifications = coalesce(product.product_specifications, '{}'::jsonb) || jsonb_build_object(
            'nominal_device_size', variant.specifications->>'nominal_device_size',
            'connection_size', variant.specifications->>'connection_size',
            'product_type', 'Smart Water Monitor and Automatic Shutoff',
            'manufacturer_model', variant.model_number
        ),
        updated_at = now()
    from public.catalog_product_variants variant
    where product.master_product_variant_id = variant.id
      and lower(btrim(variant.manufacturer_snapshot)) = 'moen'
      and regexp_replace(lower(variant.model_number), '[^a-z0-9]', '', 'g') in ('900001', '900006', '900002');

    -- Preserve every saved price. The only backfill establishes the minimum
    -- floor when the offering already has an explicit installed/minimum price
    -- and the linked company product has no floor yet.
    update public.company_approved_products product
    set minimum_selling_price = offering.installed_price,
        updated_at = now()
    from public.company_catalog_offerings offering
    join public.catalog_product_variants variant on variant.id = offering.product_variant_id
    where product.id = offering.company_catalog_product_id
      and product.minimum_selling_price is null
      and offering.installed_price is not null
      and lower(btrim(variant.manufacturer_snapshot)) = 'moen'
      and regexp_replace(lower(variant.model_number), '[^a-z0-9]', '', 'g') in ('900001', '900006', '900002');
end;
$$;

-- Any future Management pricing save treats offering.installed_price as the
-- company-private minimum quote floor. This trigger never invents a price and
-- never runs for a blank value.
create or replace function public.sync_company_catalog_offering_minimum_price()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if new.company_catalog_product_id is not null
       and new.installed_price is not null
       and (
           tg_op = 'INSERT'
           or old.company_catalog_product_id is distinct from new.company_catalog_product_id
           or old.installed_price is distinct from new.installed_price
       ) then
        update public.company_approved_products product
        set minimum_selling_price = new.installed_price,
            updated_at = now()
        where product.id = new.company_catalog_product_id
          and product.company_id = new.company_id;
    end if;

    return new;
end;
$$;

drop trigger if exists company_catalog_offering_minimum_price_sync
on public.company_catalog_offerings;

create trigger company_catalog_offering_minimum_price_sync
after insert or update of installed_price, company_catalog_product_id
on public.company_catalog_offerings
for each row
execute function public.sync_company_catalog_offering_minimum_price();

comment on function public.sync_company_catalog_offering_minimum_price() is
'Keeps an explicitly saved company offering minimum price as the linked company product quote floor without creating or copying pricing.';

do $$
declare
    v_variant_count integer;
    v_mapping_count integer;
begin
    select count(*)
    into v_variant_count
    from public.catalog_product_variants variant
    where lower(btrim(variant.manufacturer_snapshot)) = 'moen'
      and variant.status = 'approved'
      and regexp_replace(lower(variant.model_number), '[^a-z0-9]', '', 'g') in ('900001', '900006', '900002');

    if v_variant_count <> 3 then
        raise exception 'Expected exactly three approved Flo size variants, found %.', v_variant_count;
    end if;

    select count(*)
    into v_mapping_count
    from public.homeos_starter_card_catalog_variants mapping
    join public.catalog_product_variants variant on variant.id = mapping.product_variant_id
    where mapping.template_key = 'whole_home:smart_water_shutoff'
      and lower(btrim(variant.manufacturer_snapshot)) = 'moen'
      and variant.status = 'approved'
      and regexp_replace(lower(variant.model_number), '[^a-z0-9]', '', 'g') in ('900001', '900006', '900002');

    if v_mapping_count <> 3 then
        raise exception 'Expected all three Flo size variants on Smart Water Shutoff, found %.', v_mapping_count;
    end if;
end;
$$;

commit;
