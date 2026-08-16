-- Make approved Catalog Factory products available to companies by default.
-- Existing company pricing, activation choices, and custom/package eligibility
-- remain authoritative; this migration only fills missing company products and
-- offerings and gives future companies the same active/full default.

begin;

do $$
begin
    if to_regclass('public.companies') is null
       or to_regclass('public.catalog_product_variants') is null
       or to_regclass('public.catalog_product_families') is null
       or to_regclass('public.catalog_category_templates') is null
       or to_regclass('public.company_approved_products') is null
       or to_regclass('public.company_catalog_offerings') is null
       or to_regclass('public.company_catalog_entitlements') is null then
        raise exception 'Default company catalog activation requires Catalog Factory, companies, offerings, and entitlements.';
    end if;
end;
$$;

create or replace function public.seed_default_approved_company_catalog(
    p_company_id uuid,
    p_variant_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_variant record;
    v_company_product_id uuid;
    v_seeded_count integer := 0;
begin
    if p_company_id is null
       or not exists (select 1 from public.companies company where company.id = p_company_id) then
        raise exception 'Company was not found.';
    end if;

    -- Missing entitlements default to the complete approved catalog. Existing
    -- package/custom settings are intentionally never rewritten here.
    insert into public.company_catalog_entitlements(
        company_id,
        active,
        package_tier,
        selection_mode,
        created_at,
        updated_at
    ) values (
        p_company_id,
        true,
        'full',
        'full',
        now(),
        now()
    )
    on conflict (company_id) do nothing;

    for v_variant in
        select
            variant.id,
            variant.model_number,
            variant.manufacturer_part_number,
            variant.description,
            variant.specifications,
            family.brand,
            family.family_name,
            template.category_name
        from public.catalog_product_variants variant
        join public.catalog_product_families family on family.id = variant.product_family_id
        join public.catalog_category_templates template on template.id = family.category_template_id
        where variant.status = 'approved'
          and family.status = 'approved'
          and (p_variant_id is null or variant.id = p_variant_id)
        order by variant.created_at, variant.id
    loop
        v_company_product_id := null;

        select offering.company_catalog_product_id
        into v_company_product_id
        from public.company_catalog_offerings offering
        where offering.company_id = p_company_id
          and offering.product_variant_id = v_variant.id
          and offering.company_catalog_product_id is not null
        limit 1;

        if v_company_product_id is null then
            select product.id
            into v_company_product_id
            from public.company_approved_products product
            where product.company_id = p_company_id
              and product.master_product_variant_id = v_variant.id
            order by
                (product.approved and product.active and product.catalog_status = 'approved') desc,
                product.created_at,
                product.id
            limit 1;
        end if;

        if v_company_product_id is null then
            insert into public.company_approved_products(
                company_id,
                product_name,
                category,
                brand,
                model,
                manufacturer_part_number,
                product_description,
                product_specifications,
                catalog_status,
                approved,
                active,
                master_product_variant_id,
                internal_product_cost,
                approved_selling_price,
                minimum_selling_price,
                maximum_selling_price,
                price_book_item_id,
                created_by_user_id,
                updated_by_user_id
            ) values (
                p_company_id,
                concat_ws(' ', v_variant.brand, v_variant.family_name, v_variant.model_number),
                v_variant.category_name,
                v_variant.brand,
                v_variant.model_number,
                v_variant.manufacturer_part_number,
                coalesce(v_variant.description, v_variant.family_name),
                coalesce(v_variant.specifications, '{}'::jsonb),
                'approved',
                true,
                true,
                v_variant.id,
                null,
                null,
                null,
                null,
                null,
                null,
                null
            )
            returning id into v_company_product_id;
        end if;

        -- A pre-existing offering wins in full: active/inactive state, costs,
        -- prices, supplier, warranty, and audit fields are never reset. The
        -- update only repairs a missing company-product link.
        insert into public.company_catalog_offerings(
            company_id,
            product_variant_id,
            company_catalog_product_id,
            material_cost,
            markup,
            labor_amount,
            installed_price,
            preferred_supplier,
            company_warranty,
            active,
            created_by_user_id,
            updated_by_user_id,
            created_at,
            updated_at
        ) values (
            p_company_id,
            v_variant.id,
            v_company_product_id,
            null,
            null,
            null,
            null,
            null,
            null,
            true,
            null,
            null,
            now(),
            now()
        )
        on conflict (company_id, product_variant_id) do update
        set company_catalog_product_id = coalesce(
                company_catalog_offerings.company_catalog_product_id,
                excluded.company_catalog_product_id
            )
        where company_catalog_offerings.company_catalog_product_id is null;

        v_seeded_count := v_seeded_count + 1;
    end loop;

    return v_seeded_count;
end;
$$;

revoke all on function public.seed_default_approved_company_catalog(uuid, uuid) from public, anon, authenticated;

create or replace function public.seed_new_company_default_catalog()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    perform public.seed_default_approved_company_catalog(new.id, null);
    return new;
end;
$$;

drop trigger if exists companies_seed_default_approved_catalog on public.companies;
create trigger companies_seed_default_approved_catalog
after insert on public.companies
for each row execute function public.seed_new_company_default_catalog();

create or replace function public.seed_newly_approved_catalog_variant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company record;
begin
    if new.status = 'approved'
       and (tg_op = 'INSERT' or old.status is distinct from new.status) then
        for v_company in select company.id from public.companies company loop
            perform public.seed_default_approved_company_catalog(v_company.id, new.id);
        end loop;
    end if;
    return new;
end;
$$;

drop trigger if exists catalog_variants_seed_company_defaults on public.catalog_product_variants;
create trigger catalog_variants_seed_company_defaults
after insert or update of status on public.catalog_product_variants
for each row execute function public.seed_newly_approved_catalog_variant();

create or replace function public.seed_newly_approved_catalog_family()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company record;
    v_variant record;
begin
    if new.status = 'approved'
       and (tg_op = 'INSERT' or old.status is distinct from new.status) then
        for v_variant in
            select variant.id
            from public.catalog_product_variants variant
            where variant.product_family_id = new.id
              and variant.status = 'approved'
        loop
            for v_company in select company.id from public.companies company loop
                perform public.seed_default_approved_company_catalog(v_company.id, v_variant.id);
            end loop;
        end loop;
    end if;
    return new;
end;
$$;

drop trigger if exists catalog_families_seed_company_defaults on public.catalog_product_families;
create trigger catalog_families_seed_company_defaults
after insert or update of status on public.catalog_product_families
for each row execute function public.seed_newly_approved_catalog_family();

do $$
declare
    v_company record;
begin
    for v_company in select company.id from public.companies company loop
        perform public.seed_default_approved_company_catalog(v_company.id, null);
    end loop;
end;
$$;

commit;
