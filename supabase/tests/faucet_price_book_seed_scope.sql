-- Read-only verification for the Bravo-scoped faucet price-book seed.
-- Run after 20260714210000_seed_faucet_replacement_price_book_options.sql
-- is applied in a safe environment.

begin;

do $$
declare
    v_bravo_company_id constant uuid := 'd2b0192f-ebae-4da0-9a23-5a4140dbf889'::uuid;
    v_seed_keys constant text[] := array[
        'faucet-reinstall-existing',
        'faucet-install-company-approved'
    ]::text[];
begin
    if exists (
        select 1
        from public.company_price_book_items as item
        where item.price_key = any(v_seed_keys)
          and item.company_id <> v_bravo_company_id
    ) then
        raise exception 'Faucet seed price keys exist for a company outside the Bravo test company.';
    end if;

    if (
        select count(*)
        from public.company_price_book_items as item
        where item.company_id = v_bravo_company_id
          and item.price_key = any(v_seed_keys)
          and item.active is true
    ) <> 2 then
        raise exception 'Bravo must have exactly two active faucet seed entries.';
    end if;

    if exists (
        select item.price_key
        from public.company_price_book_items as item
        where item.company_id = v_bravo_company_id
          and item.price_key = any(v_seed_keys)
        group by item.price_key
        having count(*) <> 1
    ) then
        raise exception 'Bravo faucet seed entries must remain idempotent with one row per price key.';
    end if;

    if not exists (
        select 1
        from public.company_price_book_items as item
        where item.company_id = v_bravo_company_id
          and item.price_key = 'faucet-reinstall-existing'
          and item.name = 'Reinstall Existing Faucet'
          and item.unit = 'each'
          and item.recommended_selling_price = 375
          and item.estimated_labor_hours = 1.2
          and item.internal_material_cost = 35
          and item.included_warranty ilike '%no fixture warranty%'
          and item.customer_description ilike '%minor reconnect materials%'
    ) then
        raise exception 'Bravo reinstall-existing faucet seed entry does not match the expected price, scope, material, and warranty details.';
    end if;

    if not exists (
        select 1
        from public.company_price_book_items as item
        where item.company_id = v_bravo_company_id
          and item.price_key = 'faucet-install-company-approved'
          and item.name = 'Install Company-Approved Faucet'
          and item.unit = 'each'
          and item.recommended_selling_price = 725
          and item.estimated_labor_hours = 2.2
          and item.internal_material_cost = 200
          and item.customer_description ilike '%$200 faucet allowance%'
          and item.included_warranty ilike '%workmanship warranty plus manufacturer warranty%'
    ) then
        raise exception 'Bravo company-approved faucet seed entry does not match the expected price, allowance, material, and warranty details.';
    end if;
end;
$$;

rollback;
