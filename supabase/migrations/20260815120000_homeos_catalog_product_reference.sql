-- Publish an intentionally narrow product-reference projection for linked
-- HomeOS items. Installation history and company-only price/cost fields remain
-- in their existing boundaries and are never returned by this RPC.

begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or to_regclass('public.company_approved_products') is null
       or to_regclass('public.company_product_media') is null
       or to_regclass('public.catalog_product_variants') is null
       or to_regprocedure('public.homeos_can_read_property_record(uuid)') is null
       or to_regprocedure('public.company_product_catalog_can_manage(uuid)') is null then
        raise exception 'HomeOS items, company catalog, Catalog Factory, and HomeOS access helpers are required.';
    end if;
end;
$$;

alter table public.company_product_media
    add column if not exists homeowner_visible boolean not null default false;

create index if not exists company_product_media_homeowner_reference_idx
    on public.company_product_media(product_id, homeowner_visible, active)
    where homeowner_visible and active;

create or replace function public.company_product_catalog_storage_can_access(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
    v_parts text[];
    v_company_id uuid;
    v_product_id uuid;
begin
    if auth.uid() is null or nullif(btrim(coalesce(p_object_name, '')), '') is null then
        return false;
    end if;

    -- A homeowner may read only media explicitly selected for HomeOS and only
    -- while it is linked to an item in a home they can read.
    if exists (
        select 1
        from public.company_product_media media
        join public.home_items item on item.catalog_product_id = media.product_id
        where media.bucket = 'company-product-catalog'
          and media.storage_path = p_object_name
          and media.active
          and media.homeowner_visible
          and item.property_id is not null
          and public.homeos_can_read_property_record(item.property_id)
    ) then
        return true;
    end if;

    -- Preserve the existing company catalog access path for technicians and
    -- catalog managers.
    v_parts := storage.foldername(p_object_name);
    if coalesce(array_length(v_parts, 1), 0) < 6
       or v_parts[1] <> 'companies'
       or v_parts[3] <> 'catalog' then
        return false;
    end if;
    begin
        v_company_id := v_parts[2]::uuid;
        v_product_id := v_parts[4]::uuid;
    exception when invalid_text_representation then
        return false;
    end;

    return public.company_product_catalog_can_view(v_company_id)
       and exists (
           select 1
           from public.company_approved_products product
           where product.id = v_product_id
             and product.company_id = v_company_id
             and (
                 public.company_product_catalog_can_manage(v_company_id)
                 or (product.approved and product.active and product.catalog_status = 'approved')
             )
       );
end;
$$;

revoke all on function public.company_product_catalog_storage_can_access(text) from public, anon;
grant execute on function public.company_product_catalog_storage_can_access(text) to authenticated;

create or replace function public.set_company_catalog_file_homeowner_visibility(
    p_company_id uuid,
    p_product_id uuid,
    p_file_id uuid,
    p_visible boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_before boolean;
    v_media public.company_product_media%rowtype;
begin
    if not public.company_product_catalog_can_manage(p_company_id) then
        raise exception 'Catalog management access is required.';
    end if;

    select media.homeowner_visible
    into v_before
    from public.company_product_media media
    where media.id = p_file_id
      and media.product_id = p_product_id
      and media.company_id = p_company_id
      and media.active
    for update;

    if not found then
        raise exception 'Catalog file was not found.';
    end if;

    update public.company_product_media media
    set homeowner_visible = coalesce(p_visible, false)
    where media.id = p_file_id
      and media.product_id = p_product_id
      and media.company_id = p_company_id
    returning media.* into v_media;

    if to_regprocedure('public.log_company_audit_event(uuid,text,text,uuid,text,jsonb,jsonb,jsonb)') is not null then
        perform public.log_company_audit_event(
            p_company_id,
            'catalog.homeowner_visibility_changed',
            'company_product_media',
            p_file_id,
            v_media.file_name,
            jsonb_build_object('homeowner_visible', coalesce(v_before, false)),
            jsonb_build_object('homeowner_visible', v_media.homeowner_visible),
            jsonb_build_object('product_id', p_product_id, 'media_kind', v_media.media_kind)
        );
    end if;

    return jsonb_build_object(
        'id', v_media.id,
        'company_id', v_media.company_id,
        'product_id', v_media.product_id,
        'media_kind', v_media.media_kind,
        'bucket', v_media.bucket,
        'storage_path', v_media.storage_path,
        'file_name', v_media.file_name,
        'mime_type', v_media.mime_type,
        'size_bytes', v_media.size_bytes,
        'alt_text', v_media.alt_text,
        'active', v_media.active,
        'homeowner_visible', v_media.homeowner_visible
    );
end;
$$;

revoke all on function public.set_company_catalog_file_homeowner_visibility(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.set_company_catalog_file_homeowner_visibility(uuid, uuid, uuid, boolean) to authenticated;

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
                'active', media.active,
                'homeowner_visible', media.homeowner_visible
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

create or replace function public.get_home_item_product_reference(p_home_item_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_item public.home_items%rowtype;
    v_product public.company_approved_products%rowtype;
    v_variant public.catalog_product_variants%rowtype;
    v_family public.catalog_product_families%rowtype;
    v_category text;
    v_specifications jsonb := '{}'::jsonb;
    v_assets jsonb := '[]'::jsonb;
    v_manufacturer_reference text;
begin
    if auth.uid() is null or p_home_item_id is null then
        raise exception 'Home item access is required.';
    end if;

    select item.*
    into v_item
    from public.home_items item
    where item.id = p_home_item_id
      and item.property_id is not null
      and public.homeos_can_read_property_record(item.property_id)
    limit 1;

    if not found then
        raise exception 'Home item access is required.';
    end if;

    if v_item.catalog_product_id is not null then
        select product.*
        into v_product
        from public.company_approved_products product
        where product.id = v_item.catalog_product_id;
    end if;

    if coalesce(v_item.master_product_variant_id, v_product.master_product_variant_id) is not null then
        select variant.*
        into v_variant
        from public.catalog_product_variants variant
        where variant.id = coalesce(v_item.master_product_variant_id, v_product.master_product_variant_id);

        if v_variant.product_family_id is not null then
            select family.*
            into v_family
            from public.catalog_product_families family
            where family.id = v_variant.product_family_id;

            select template.category_name
            into v_category
            from public.catalog_category_templates template
            where template.id = v_family.category_template_id;
        end if;
    end if;

    if v_product.id is null and v_variant.id is null then
        return null;
    end if;

    v_specifications := coalesce(v_variant.specifications, '{}'::jsonb)
        || coalesce(v_product.product_specifications, '{}'::jsonb);

    select coalesce(jsonb_agg(asset.payload order by asset.sort_order, asset.title), '[]'::jsonb)
    into v_assets
    from (
        select
            case when master_asset.asset_type = 'image' and master_asset.is_primary then 0 else 10 end as sort_order,
            coalesce(master_source.title, case master_asset.asset_type
                when 'image' then 'Product image'
                when 'installation_manual' then 'Manufacturer installation manual'
                when 'specification_sheet' then 'Manufacturer specification sheet'
                when 'warranty_document' then 'Manufacturer warranty document'
                else 'Manufacturer product document'
            end) as title,
            jsonb_build_object(
                'id', 'master-asset-' || master_asset.id::text,
                'kind', case master_asset.asset_type
                    when 'image' then 'photo'
                    when 'installation_manual' then 'manual'
                    when 'specification_sheet' then 'specification'
                    when 'warranty_document' then 'warranty'
                    else 'document'
                end,
                'title', coalesce(master_source.title, case master_asset.asset_type
                    when 'image' then 'Product image'
                    when 'installation_manual' then 'Manufacturer installation manual'
                    when 'specification_sheet' then 'Manufacturer specification sheet'
                    when 'warranty_document' then 'Manufacturer warranty document'
                    else 'Manufacturer product document'
                end),
                'url', master_asset.source_url,
                'bucket', null,
                'storage_path', null,
                'mime_type', case when master_asset.asset_type = 'image' then 'image/external' else 'application/pdf' end
            ) as payload
        from public.catalog_source_assets master_asset
        left join public.catalog_sources master_source on master_source.id = master_asset.source_id
        where master_asset.product_variant_id = v_variant.id

        union all

        select
            case when media.media_kind = 'photo' then 20 else 30 end as sort_order,
            coalesce(media.file_name, 'Product file') as title,
            jsonb_build_object(
                'id', 'company-media-' || media.id::text,
                'kind', media.media_kind,
                'title', coalesce(media.file_name, case media.media_kind
                    when 'photo' then 'Product image'
                    when 'manual' then 'Product manual'
                    when 'specification' then 'Product specification sheet'
                    when 'warranty' then 'Product warranty'
                    else 'Product document'
                end),
                'url', null,
                'bucket', media.bucket,
                'storage_path', media.storage_path,
                'mime_type', media.mime_type
            ) as payload
        from public.company_product_media media
        where media.product_id = v_product.id
          and media.active
          and media.homeowner_visible

        union all

        select
            40 as sort_order,
            coalesce(source.title, 'Manufacturer product page') as title,
            jsonb_build_object(
                'id', 'manufacturer-source-' || source.id::text,
                'kind', 'manufacturer_link',
                'title', coalesce(source.title, 'Manufacturer product page'),
                'url', source.source_url,
                'bucket', null,
                'storage_path', null,
                'mime_type', 'text/html'
            ) as payload
        from public.catalog_sources source
        where source.source_type = 'manufacturer_page'
          and (
              source.product_variant_id = v_variant.id
              or source.product_family_id = v_family.id
          )
    ) asset;

    select source.source_url
    into v_manufacturer_reference
    from public.catalog_sources source
    where source.source_type = 'manufacturer_page'
      and (
          source.product_variant_id = v_variant.id
          or source.product_family_id = v_family.id
      )
    order by source.verified_at desc nulls last, source.created_at desc
    limit 1;

    return jsonb_build_object(
        'home_item_id', v_item.id,
        'product_name', coalesce(
            nullif(btrim(v_product.product_name), ''),
            nullif(btrim(concat_ws(' ', v_family.brand, v_family.family_name, v_variant.model_number)), ''),
            v_item.name
        ),
        'category', coalesce(nullif(btrim(v_category), ''), nullif(btrim(v_product.category), ''), v_item.category),
        'product_type', coalesce(
            nullif(btrim(v_specifications->>'product_type'), ''),
            nullif(btrim(v_specifications->>'type'), ''),
            nullif(btrim(v_category), ''),
            nullif(btrim(v_product.category), '')
        ),
        'manufacturer', coalesce(nullif(btrim(v_family.manufacturer), ''), nullif(btrim(v_product.brand), '')),
        'brand', coalesce(nullif(btrim(v_family.brand), ''), nullif(btrim(v_product.brand), ''), nullif(btrim(v_item.brand), '')),
        'model', coalesce(nullif(btrim(v_variant.model_number), ''), nullif(btrim(v_product.model), ''), nullif(btrim(v_item.model), '')),
        'manufacturer_part_number', coalesce(nullif(btrim(v_variant.manufacturer_part_number), ''), nullif(btrim(v_product.manufacturer_part_number), ''), nullif(btrim(v_item.part_number), '')),
        'finish', coalesce(nullif(btrim(v_variant.finish), ''), nullif(btrim(v_specifications->>'finish'), '')),
        'color', coalesce(nullif(btrim(v_variant.color), ''), nullif(btrim(v_specifications->>'color'), '')),
        'size', coalesce(nullif(btrim(v_variant.size), ''), nullif(btrim(v_specifications->>'size'), '')),
        'capacity', coalesce(nullif(btrim(v_variant.capacity), ''), nullif(btrim(v_specifications->>'capacity'), '')),
        'description', coalesce(nullif(btrim(v_variant.description), ''), nullif(btrim(v_family.description), ''), nullif(btrim(v_product.product_description), '')),
        'specifications', v_specifications,
        'compatible_parts', coalesce(to_jsonb(v_product.compatible_applications), '[]'::jsonb),
        'manufacturer_warranty', coalesce(nullif(btrim(v_product.manufacturer_warranty), ''), nullif(btrim(v_product.warranty), '')),
        'manufacturer_reference', coalesce(nullif(btrim(v_product.manufacturer_reference), ''), v_manufacturer_reference),
        'assets', v_assets
    );
end;
$$;

revoke all on function public.get_home_item_product_reference(uuid) from public, anon;
grant execute on function public.get_home_item_product_reference(uuid) to authenticated;

commit;
