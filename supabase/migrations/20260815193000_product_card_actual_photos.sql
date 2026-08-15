begin;

create or replace function public.get_company_product_catalog(p_company_id uuid)
returns setof jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select jsonb_build_object(
        'id', product.id,
        'company_id', product.company_id,
        'product_name', coalesce(nullif(btrim(product.product_name), ''), concat_ws(' ', product.brand, product.model)),
        'category', product.category,
        'brand', product.brand,
        'model', product.model,
        'manufacturer_part_number', product.manufacturer_part_number,
        'sku', product.sku,
        'product_description', product.product_description,
        'tier', product.tier,
        'catalog_status', product.catalog_status,
        'approved_selling_price', product.approved_selling_price,
        'price_book_item_id', product.price_book_item_id,
        'price_book_item_name', price_item.name,
        'minimum_selling_price', product.minimum_selling_price,
        'maximum_selling_price', product.maximum_selling_price,
        'product_specifications', product.product_specifications,
        'compatible_applications', to_jsonb(product.compatible_applications),
        'installation_requirements', to_jsonb(product.installation_requirements),
        'workmanship_warranty', product.workmanship_warranty,
        'labor_warranty', product.labor_warranty,
        'manufacturer_warranty', coalesce(product.manufacturer_warranty, product.warranty),
        'warranty', product.warranty,
        'availability_note', product.availability_note,
        'manufacturer_reference', product.manufacturer_reference,
        'company_notes', product.company_notes,
        'master_primary_image_url', (
            select asset.source_url
            from public.catalog_source_assets asset
            where asset.product_variant_id = product.master_product_variant_id
              and asset.asset_type = 'image'
            order by asset.is_primary desc, asset.created_at
            limit 1
        ),
        'created_at', product.created_at,
        'updated_at', product.updated_at,
        'files', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', media.id,
                'company_id', media.company_id,
                'product_id', media.product_id,
                'media_kind', media.media_kind,
                'bucket', media.bucket,
                'storage_path', media.storage_path,
                'file_name', media.file_name,
                'mime_type', media.mime_type,
                'size_bytes', media.size_bytes,
                'alt_text', media.alt_text,
                'active', media.active
            ) order by media.created_at)
            from public.company_product_media media
            where media.product_id = product.id and media.active
        ), '[]'::jsonb)
    )
    from public.company_approved_products product
    left join public.company_price_book_items price_item
      on price_item.id = product.price_book_item_id
     and price_item.company_id = product.company_id
    where product.company_id = p_company_id
      and public.company_product_catalog_can_view(p_company_id)
      and (
          public.company_product_catalog_can_manage(p_company_id)
          or (product.approved and product.active and product.catalog_status = 'approved')
      )
    order by product.catalog_status, product.category, product.brand, product.model;
$$;

revoke all on function public.get_company_product_catalog(uuid) from public, anon;
grant execute on function public.get_company_product_catalog(uuid) to authenticated;

drop function if exists public.get_company_approved_products(uuid);

create function public.get_company_approved_products(p_company_id uuid)
returns setof jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select jsonb_build_object(
        'id', product.id,
        'company_id', product.company_id,
        'category', product.category,
        'brand', product.brand,
        'model', product.model,
        'tier', product.tier,
        'approved_selling_price', product.approved_selling_price,
        'price_book_item_id', product.price_book_item_id,
        'minimum_selling_price', product.minimum_selling_price,
        'maximum_selling_price', product.maximum_selling_price,
        'product_specifications', product.product_specifications,
        'compatible_applications', to_jsonb(product.compatible_applications),
        'required_accessory_ids', to_jsonb(product.required_accessory_ids),
        'installation_requirements', to_jsonb(product.installation_requirements),
        'warranty', product.warranty,
        'extended_warranty_eligible', product.extended_warranty_eligible,
        'availability_note', product.availability_note,
        'manufacturer_reference', product.manufacturer_reference,
        'approved', product.approved,
        'active', product.active,
        'master_primary_image_url', (
            select asset.source_url
            from public.catalog_source_assets asset
            where asset.product_variant_id = product.master_product_variant_id
              and asset.asset_type = 'image'
            order by asset.is_primary desc, asset.created_at
            limit 1
        ),
        'main_media', (
            select jsonb_build_object(
                'id', media.id,
                'company_id', media.company_id,
                'product_id', media.product_id,
                'bucket', media.bucket,
                'storage_path', media.storage_path,
                'alt_text', media.alt_text,
                'active', media.active
            )
            from public.company_product_media media
            where media.id = product.main_product_media_id
              and media.product_id = product.id
              and media.active
        ),
        'additional_media', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', media.id,
                'company_id', media.company_id,
                'product_id', media.product_id,
                'bucket', media.bucket,
                'storage_path', media.storage_path,
                'alt_text', media.alt_text,
                'active', media.active
            ) order by media.created_at)
            from public.company_product_media media
            where media.product_id = product.id
              and media.active
              and media.id is distinct from product.main_product_media_id
        ), '[]'::jsonb)
    )
    from public.company_approved_products product
    where product.company_id = p_company_id
      and public.company_estimate_options_can_use(p_company_id)
      and product.active = true
      and product.approved = true
    order by product.category, product.tier, product.brand, product.model;
$$;

revoke all on function public.get_company_approved_products(uuid) from public, anon;
grant execute on function public.get_company_approved_products(uuid) to authenticated;

commit;
