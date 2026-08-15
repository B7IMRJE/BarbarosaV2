begin;

do $$
declare
    v_definition text;
begin
    if to_regprocedure('public.get_home_item_product_reference(uuid)') is null then
        raise exception 'HomeOS product-reference RPC is missing.';
    end if;

    if to_regprocedure('public.set_company_catalog_file_homeowner_visibility(uuid,uuid,uuid,boolean)') is null then
        raise exception 'Catalog media visibility control is missing.';
    end if;

    select lower(pg_get_functiondef('public.get_home_item_product_reference(uuid)'::regprocedure))
    into v_definition;

    if v_definition ~ '''approved_selling_price'''
       or v_definition ~ '''internal_product_cost'''
       or v_definition ~ '''company_notes'''
       or v_definition ~ '''installation_notes'''
       or v_definition ~ '''work_performed''' then
        raise exception 'HomeOS product reference exposes pricing, private notes, or installation history.';
    end if;

    if v_definition !~ 'homeos_can_read_property_record'
       or v_definition !~ '''home_item_id'''
       or v_definition !~ '''specifications'''
       or v_definition !~ '''assets''' then
        raise exception 'HomeOS product reference is missing its property boundary or safe product fields.';
    end if;
end;
$$;

rollback;
