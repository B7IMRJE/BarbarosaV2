-- Platform-admin removal for one exact Catalog Factory media asset. The client
-- deletes the returned private Storage object after this atomic metadata change.

do $$
begin
    if to_regclass('public.catalog_source_assets') is null
       or to_regprocedure('public.catalog_factory_require_admin()') is null then
        raise exception 'Catalog Factory media removal requires the existing Catalog Factory authorization and media tables.';
    end if;
end;
$$;

create or replace function public.remove_catalog_factory_photo(
    p_variant_id uuid,
    p_asset_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_asset public.catalog_source_assets%rowtype;
    v_primary_asset_id uuid;
begin
    perform public.catalog_factory_require_admin();
    if p_variant_id is null or p_asset_id is null then
        raise exception 'A master product and media file are required.';
    end if;

    perform 1
    from public.catalog_product_variants variant
    where variant.id = p_variant_id
    for update;
    if not found then
        raise exception 'Catalog variant was not found.';
    end if;

    select asset.*
    into v_asset
    from public.catalog_source_assets asset
    where asset.id = p_asset_id
      and asset.product_variant_id = p_variant_id
    for update;
    if not found then
        raise exception 'Master media was not found for this product.';
    end if;
    if v_asset.asset_type <> 'image' then
        raise exception 'Only a master product photo can be removed with this action.';
    end if;

    delete from public.catalog_source_assets asset
    where asset.id = p_asset_id
      and asset.product_variant_id = p_variant_id;

    select asset.id
    into v_primary_asset_id
    from public.catalog_source_assets asset
    where asset.product_variant_id = p_variant_id
      and asset.asset_type = 'image'
      and asset.active
    order by asset.is_primary desc, asset.created_at, asset.id
    limit 1
    for update;

    update public.catalog_source_assets asset
    set is_primary = coalesce(asset.id = v_primary_asset_id, false)
    where asset.product_variant_id = p_variant_id
      and asset.asset_type = 'image';

    return jsonb_build_object(
        'asset_id', v_asset.id,
        'product_variant_id', v_asset.product_variant_id,
        'primary_asset_id', v_primary_asset_id,
        'storage_bucket', v_asset.copied_bucket,
        'storage_path', v_asset.copied_storage_path
    );
end;
$$;

revoke all on function public.remove_catalog_factory_photo(uuid, uuid) from public, anon;
grant execute on function public.remove_catalog_factory_photo(uuid, uuid) to authenticated;

-- Catalog Factory metadata stays RPC-write-only. Existing read policies remain
-- unchanged, and the Storage delete policy still requires platform admin.
revoke insert, update, delete on table public.catalog_source_assets from anon, authenticated;

comment on function public.remove_catalog_factory_photo(uuid, uuid) is
'Removes one exact Catalog Factory product photo for a platform admin, promotes the next active product image when needed, and returns the trusted private Storage path for client cleanup.';
