-- Rollback-only structural security checks for Catalog Factory media removal.

begin;

do $$
declare
    v_function_def text;
    v_config text[];
begin
    select pg_get_functiondef(proc.oid), proc.proconfig
    into v_function_def, v_config
    from pg_proc proc
    where proc.oid = 'public.remove_catalog_factory_photo(uuid,uuid)'::regprocedure;

    if v_function_def !~* 'security definer'
       or not coalesce(v_config, array[]::text[]) @> array['search_path=pg_catalog, public, pg_temp']
       or v_function_def !~* 'catalog_factory_require_admin'
       or v_function_def !~* 'asset[.]id = p_asset_id'
       or v_function_def !~* 'asset[.]product_variant_id = p_variant_id'
       or v_function_def !~* 'for update'
       or v_function_def !~* 'delete from public[.]catalog_source_assets'
       or v_function_def !~* 'v_asset[.]asset_type <> ''image'''
       or v_function_def !~* 'asset[.]active'
       or v_function_def !~* 'set is_primary = coalesce'
       or v_function_def !~* 'v_primary_asset_id' then
        raise exception 'Catalog Factory media removal must remain admin-only, exact-product scoped, locked, and primary-image safe.';
    end if;

    if has_function_privilege('anon', 'public.remove_catalog_factory_photo(uuid,uuid)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.remove_catalog_factory_photo(uuid,uuid)', 'EXECUTE') then
        raise exception 'Catalog Factory media removal RPC execution grants are incorrect.';
    end if;

    if has_table_privilege('anon', 'public.catalog_source_assets', 'INSERT, UPDATE, DELETE')
       or has_table_privilege('authenticated', 'public.catalog_source_assets', 'INSERT, UPDATE, DELETE') then
        raise exception 'Catalog Factory media metadata must remain RPC-write-only.';
    end if;
end;
$$;

rollback;
