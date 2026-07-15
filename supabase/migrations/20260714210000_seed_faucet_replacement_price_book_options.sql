-- Seed minimum faucet replacement price-book options into Bravo's existing company price book.
--
-- Additive/idempotent:
--   - uses public.company_price_book_items, not a faucet-only store
--   - targets only the current Bravo test company; this is not platform-wide pricing
--   - does not create service requests, estimate sessions, customer records, or demo records
--   - updates only the two stable seeded faucet price keys if they already exist

begin;

do $$
declare
    v_bravo_company_id constant uuid := 'd2b0192f-ebae-4da0-9a23-5a4140dbf889'::uuid;
begin
    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before faucet price-book options can be seeded.';
    end if;

    if to_regclass('public.company_price_book_items') is null then
        raise exception 'public.company_price_book_items is required before faucet price-book options can be seeded.';
    end if;

    if not exists (
        select 1
        from public.companies as company
        where company.id = v_bravo_company_id
          and lower(btrim(coalesce(company.status, 'active'))) not in (
              'inactive',
              'archived',
              'cancelled',
              'canceled',
              'disabled',
              'suspended'
          )
          and lower(company.name) like '%bravo%'
    ) then
        raise exception 'Bravo test company % was not found as an active Bravo company; faucet seed was not applied.', v_bravo_company_id;
    end if;
end;
$$;

with target_company as (
    select 'd2b0192f-ebae-4da0-9a23-5a4140dbf889'::uuid as company_id
),
seed_options as (
    select *
    from (
        values
            (
                'faucet-reinstall-existing'::text,
                'Reinstall Existing Faucet'::text,
                'Remove, clean, reseat, secure, reconnect, and test the existing or homeowner-supplied faucet. Includes labor and minor reconnect materials only. No fixture warranty is included for existing or homeowner-supplied faucets.'::text,
                375::numeric,
                1.2::numeric,
                35::numeric,
                'labor_and_minor_reconnect_materials_only'::text,
                'no_fixture_warranty'::text,
                'Existing/homeowner-supplied faucet: no fixture warranty.'::text,
                'Existing or homeowner-supplied faucet path. Includes labor and minor reconnect materials only. No fixture warranty on existing or homeowner-supplied faucets. Company-owned Bravo test price; editable in the company price book.'::text,
                array[
                    'faucet replacement',
                    'single hole',
                    '4 in centerset',
                    '8 in widespread',
                    'wall mount',
                    'unknown'
                ]::text[]
            ),
            (
                'faucet-install-company-approved'::text,
                'Install Company-Approved Faucet'::text,
                'Remove the existing faucet, install a company-approved replacement, reconnect applicable supply and drain components, and test operation. Includes a configurable $200 faucet allowance; approved product amount above that allowance must be added deterministically to the estimate.'::text,
                725::numeric,
                2.2::numeric,
                200::numeric,
                'configurable_faucet_allowance_200'::text,
                'workmanship_plus_manufacturer_where_applicable'::text,
                'Company-approved faucet: workmanship warranty plus manufacturer warranty where applicable.'::text,
                'Company-approved replacement path. Includes a configurable $200 faucet allowance; any approved faucet amount above $200 must be added as a separate deterministic price-book/product line. Workmanship warranty plus manufacturer warranty where applicable. Company-owned Bravo test price; editable in the company price book.'::text,
                array[
                    'faucet replacement',
                    'single hole',
                    '4 in centerset',
                    '8 in widespread'
                ]::text[]
            )
    ) as seed(
        price_key,
        name,
        description,
        recommended_selling_price,
        estimated_labor_hours,
        internal_material_cost,
        allowance_code,
        warranty_code,
        included_warranty,
        management_notes,
        applicable_categories
    )
)
insert into public.company_price_book_items (
    company_id,
    price_key,
    name,
    system,
    category,
    service_category,
    unit,
    base_price,
    base_labor_install_price,
    labor_hours,
    estimated_labor_hours,
    material_cost,
    internal_material_cost,
    recommended_selling_price,
    customer_description,
    homeowner_description,
    internal_notes,
    management_notes,
    applicable_systems,
    applicable_categories,
    active,
    effective_at,
    version_label,
    included_warranty,
    created_at,
    updated_at
)
select
    target_company.company_id,
    seed_options.price_key,
    seed_options.name,
    'Plumbing',
    'Faucets / Sinks',
    'Faucets / Sinks',
    'each',
    seed_options.recommended_selling_price,
    seed_options.recommended_selling_price,
    seed_options.estimated_labor_hours,
    seed_options.estimated_labor_hours,
    seed_options.internal_material_cost,
    seed_options.internal_material_cost,
    seed_options.recommended_selling_price,
    seed_options.description,
    seed_options.description,
    seed_options.management_notes || ' Allowance code: ' || seed_options.allowance_code || '. Warranty code: ' || seed_options.warranty_code || '.',
    seed_options.management_notes,
    array['Plumbing']::text[],
    seed_options.applicable_categories,
    true,
    current_date,
    'faucet-minimum-v1',
    seed_options.included_warranty,
    now(),
    now()
from target_company
cross join seed_options
on conflict (company_id, price_key) do update
set name = excluded.name,
    system = excluded.system,
    category = excluded.category,
    service_category = excluded.service_category,
    unit = excluded.unit,
    base_price = excluded.base_price,
    base_labor_install_price = excluded.base_labor_install_price,
    labor_hours = excluded.labor_hours,
    estimated_labor_hours = excluded.estimated_labor_hours,
    material_cost = excluded.material_cost,
    internal_material_cost = excluded.internal_material_cost,
    recommended_selling_price = excluded.recommended_selling_price,
    customer_description = excluded.customer_description,
    homeowner_description = excluded.homeowner_description,
    internal_notes = excluded.internal_notes,
    management_notes = excluded.management_notes,
    applicable_systems = excluded.applicable_systems,
    applicable_categories = excluded.applicable_categories,
    active = excluded.active,
    effective_at = excluded.effective_at,
    version_label = excluded.version_label,
    included_warranty = excluded.included_warranty,
    updated_at = now();

commit;
