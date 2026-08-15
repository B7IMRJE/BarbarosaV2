begin;

alter table public.catalog_source_assets
    add column if not exists file_name text,
    add column if not exists mime_type text,
    add column if not exists size_bytes bigint,
    add column if not exists homeowner_visible boolean not null default true,
    add column if not exists active boolean not null default true;

create index if not exists catalog_source_assets_storage_idx
    on public.catalog_source_assets(copied_bucket, copied_storage_path)
    where copied_bucket is not null and copied_storage_path is not null;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
    'catalog-factory-media',
    'catalog-factory-media',
    false,
    26214400,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.catalog_factory_media_storage_can_write(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
    v_parts text[];
    v_variant_id uuid;
    v_asset_id uuid;
begin
    if auth.uid() is null
       or not coalesce(public.homeos_is_platform_admin(), false)
       or nullif(btrim(coalesce(p_object_name, '')), '') is null then
        return false;
    end if;

    v_parts := storage.foldername(p_object_name);
    if coalesce(array_length(v_parts, 1), 0) < 3 or v_parts[1] <> 'variants' then
        return false;
    end if;
    begin
        v_variant_id := v_parts[2]::uuid;
        v_asset_id := v_parts[3]::uuid;
    exception when invalid_text_representation then
        return false;
    end;

    return v_variant_id is not null
       and v_asset_id is not null
       and exists (select 1 from public.catalog_product_variants variant where variant.id = v_variant_id);
end;
$$;

create or replace function public.catalog_factory_media_storage_can_access(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
    v_asset public.catalog_source_assets%rowtype;
begin
    if auth.uid() is null or nullif(btrim(coalesce(p_object_name, '')), '') is null then
        return false;
    end if;
    if coalesce(public.homeos_is_platform_admin(), false) then
        return true;
    end if;

    select asset.*
    into v_asset
    from public.catalog_source_assets asset
    where asset.copied_bucket = 'catalog-factory-media'
      and asset.copied_storage_path = p_object_name
      and asset.active
    limit 1;
    if not found then return false; end if;

    if public.catalog_variant_is_visible_to_current_user(v_asset.product_variant_id) then
        return true;
    end if;

    return v_asset.homeowner_visible
       and exists (
           select 1
           from public.home_items item
           left join public.company_approved_products product on product.id = item.catalog_product_id
           where coalesce(item.master_product_variant_id, product.master_product_variant_id) = v_asset.product_variant_id
             and item.property_id is not null
             and public.homeos_can_read_property_record(item.property_id)
       );
end;
$$;

revoke all on function public.catalog_factory_media_storage_can_write(text) from public, anon;
revoke all on function public.catalog_factory_media_storage_can_access(text) from public, anon;
grant execute on function public.catalog_factory_media_storage_can_write(text) to authenticated;
grant execute on function public.catalog_factory_media_storage_can_access(text) to authenticated;

drop policy if exists catalog_factory_media_objects_select on storage.objects;
create policy catalog_factory_media_objects_select on storage.objects
for select to authenticated
using (bucket_id = 'catalog-factory-media' and public.catalog_factory_media_storage_can_access(name));

drop policy if exists catalog_factory_media_objects_insert on storage.objects;
create policy catalog_factory_media_objects_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'catalog-factory-media' and public.catalog_factory_media_storage_can_write(name));

drop policy if exists catalog_factory_media_objects_update on storage.objects;
create policy catalog_factory_media_objects_update on storage.objects
for update to authenticated
using (bucket_id = 'catalog-factory-media' and public.catalog_factory_media_storage_can_write(name))
with check (bucket_id = 'catalog-factory-media' and public.catalog_factory_media_storage_can_write(name));

drop policy if exists catalog_factory_media_objects_delete on storage.objects;
create policy catalog_factory_media_objects_delete on storage.objects
for delete to authenticated
using (bucket_id = 'catalog-factory-media' and public.catalog_factory_media_storage_can_write(name));

create or replace function public.save_catalog_factory_product(p_variant_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_variant public.catalog_product_variants%rowtype;
    v_source jsonb;
    v_source_type text;
begin
    perform public.catalog_factory_require_admin();
    if p_variant_id is null or jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
        raise exception 'A master product and valid editor payload are required.';
    end if;

    select variant.* into v_variant
    from public.catalog_product_variants variant
    where variant.id = p_variant_id
    for update;
    if not found then raise exception 'Catalog variant was not found.'; end if;

    if nullif(btrim(coalesce(p_payload->>'category_template_id', '')), '') is null
       or not exists (select 1 from public.catalog_category_templates template where template.id = (p_payload->>'category_template_id')::uuid and template.status <> 'archived') then
        raise exception 'Choose an active catalog category.';
    end if;
    if nullif(btrim(coalesce(p_payload->>'manufacturer', '')), '') is null
       or nullif(btrim(coalesce(p_payload->>'brand', '')), '') is null
       or nullif(btrim(coalesce(p_payload->>'family_name', '')), '') is null
       or nullif(btrim(coalesce(p_payload->>'model_number', '')), '') is null then
        raise exception 'Manufacturer, brand, family, and model are required.';
    end if;
    if jsonb_typeof(coalesce(p_payload->'specifications', '{}'::jsonb)) <> 'object' then
        raise exception 'Specifications must be a JSON object.';
    end if;
    if jsonb_typeof(coalesce(p_payload->'sources', '[]'::jsonb)) <> 'array' then
        raise exception 'Sources must be a JSON array.';
    end if;

    update public.catalog_product_families
    set category_template_id = (p_payload->>'category_template_id')::uuid,
        manufacturer = btrim(p_payload->>'manufacturer'),
        brand = btrim(p_payload->>'brand'),
        family_name = btrim(p_payload->>'family_name'),
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where id = v_variant.product_family_id;

    update public.catalog_product_variants
    set model_number = btrim(p_payload->>'model_number'),
        manufacturer_part_number = nullif(btrim(coalesce(p_payload->>'manufacturer_part_number', '')), ''),
        upc_gtin = nullif(btrim(coalesce(p_payload->>'upc_gtin', '')), ''),
        color = nullif(btrim(coalesce(p_payload->>'color', '')), ''),
        finish = nullif(btrim(coalesce(p_payload->>'finish', '')), ''),
        size = nullif(btrim(coalesce(p_payload->>'size', '')), ''),
        capacity = nullif(btrim(coalesce(p_payload->>'capacity', '')), ''),
        description = nullif(btrim(coalesce(p_payload->>'description', '')), ''),
        specifications = coalesce(p_payload->'specifications', '{}'::jsonb),
        confidence = nullif(p_payload->>'confidence', '')::numeric,
        validation_warnings = coalesce(p_payload->'validation_warnings', '[]'::jsonb),
        duplicate_warnings = coalesce(p_payload->'duplicate_warnings', '[]'::jsonb),
        missing_fields = coalesce(p_payload->'missing_fields', '[]'::jsonb),
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where id = p_variant_id
    returning * into v_variant;

    delete from public.catalog_sources source where source.product_variant_id = p_variant_id;
    for v_source in select value from jsonb_array_elements(coalesce(p_payload->'sources', '[]'::jsonb)) loop
        if nullif(btrim(coalesce(v_source->>'url', '')), '') is null then continue; end if;
        v_source_type := case v_source->>'type'
            when 'manufacturer_page' then 'manufacturer_page'
            when 'retailer_page' then 'retailer_page'
            when 'installation_manual' then 'installation_manual'
            when 'specification_sheet' then 'specification_sheet'
            when 'warranty_document' then 'warranty_document'
            else 'other'
        end;
        insert into public.catalog_sources(
            product_variant_id, source_type, source_url, title, verified_at, created_by_user_id
        ) values (
            p_variant_id, v_source_type, btrim(v_source->>'url'),
            nullif(btrim(coalesce(v_source->>'title', '')), ''), now(), auth.uid()
        );
    end loop;

    return to_jsonb(v_variant);
end;
$$;

revoke all on function public.save_catalog_factory_product(uuid, jsonb) from public, anon;
grant execute on function public.save_catalog_factory_product(uuid, jsonb) to authenticated;

create or replace function public.record_catalog_factory_media(
    p_variant_id uuid,
    p_asset_id uuid,
    p_asset_type text,
    p_storage_path text,
    p_file_name text,
    p_mime_type text,
    p_size_bytes bigint,
    p_homeowner_visible boolean default true,
    p_is_primary boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
    v_asset public.catalog_source_assets%rowtype;
begin
    perform public.catalog_factory_require_admin();
    if p_asset_type not in ('image','installation_manual','specification_sheet','warranty_document','other') then
        raise exception 'Unsupported master media type.';
    end if;
    if not exists (select 1 from public.catalog_product_variants variant where variant.id = p_variant_id) then
        raise exception 'Catalog variant was not found.';
    end if;
    if p_storage_path not like 'variants/' || p_variant_id::text || '/' || p_asset_id::text || '/%' then
        raise exception 'Master media path is invalid.';
    end if;
    if not exists (select 1 from storage.objects object where object.bucket_id = 'catalog-factory-media' and object.name = p_storage_path) then
        raise exception 'Uploaded master media was not found.';
    end if;
    if coalesce(p_is_primary, false) and p_asset_type <> 'image' then
        raise exception 'Only a product photo can be the primary card image.';
    end if;

    if coalesce(p_is_primary, false) then
        update public.catalog_source_assets
        set is_primary = false
        where product_variant_id = p_variant_id and asset_type = 'image';
    end if;

    insert into public.catalog_source_assets(
        id, product_variant_id, asset_type, source_url, is_primary,
        approved_for_copy, copied_bucket, copied_storage_path,
        file_name, mime_type, size_bytes, homeowner_visible, active,
        verified_at, created_by_user_id
    ) values (
        p_asset_id, p_variant_id, p_asset_type,
        'storage://catalog-factory-media/' || p_storage_path,
        coalesce(p_is_primary, false), true, 'catalog-factory-media', p_storage_path,
        left(btrim(coalesce(p_file_name, 'Master product reference')), 180),
        nullif(btrim(coalesce(p_mime_type, '')), ''), p_size_bytes,
        coalesce(p_homeowner_visible, true), true, now(), auth.uid()
    ) returning * into v_asset;
    return to_jsonb(v_asset);
end;
$$;

revoke all on function public.record_catalog_factory_media(uuid, uuid, text, text, text, text, bigint, boolean, boolean) from public, anon;
grant execute on function public.record_catalog_factory_media(uuid, uuid, text, text, text, text, bigint, boolean, boolean) to authenticated;

create or replace function public.update_catalog_factory_media(
    p_variant_id uuid,
    p_asset_id uuid,
    p_is_primary boolean default null,
    p_homeowner_visible boolean default null,
    p_active boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_asset public.catalog_source_assets%rowtype;
begin
    perform public.catalog_factory_require_admin();
    select asset.* into v_asset
    from public.catalog_source_assets asset
    where asset.id = p_asset_id and asset.product_variant_id = p_variant_id
    for update;
    if not found then raise exception 'Master media was not found.'; end if;
    if p_is_primary is true and v_asset.asset_type <> 'image' then
        raise exception 'Only a product photo can be the primary card image.';
    end if;
    if p_is_primary is true then
        update public.catalog_source_assets
        set is_primary = false
        where product_variant_id = p_variant_id and asset_type = 'image' and id <> p_asset_id;
    end if;
    update public.catalog_source_assets
    set is_primary = case when p_active is false then false else coalesce(p_is_primary, is_primary) end,
        homeowner_visible = coalesce(p_homeowner_visible, homeowner_visible),
        active = coalesce(p_active, active)
    where id = p_asset_id and product_variant_id = p_variant_id
    returning * into v_asset;
    return to_jsonb(v_asset);
end;
$$;

revoke all on function public.update_catalog_factory_media(uuid, uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.update_catalog_factory_media(uuid, uuid, boolean, boolean, boolean) to authenticated;

create or replace function public.get_approved_master_catalog_for_company(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_is_platform_admin boolean := coalesce(public.homeos_is_platform_admin(), false);
    v_result jsonb;
begin
    if not public.company_catalog_settings_can_view(p_company_id) then
        raise exception 'Company catalog access is required.';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'id', variant.id,
        'category', template.category_name,
        'manufacturer', family.manufacturer,
        'brand', family.brand,
        'family_name', family.family_name,
        'model_number', variant.model_number,
        'manufacturer_part_number', variant.manufacturer_part_number,
        'upc_gtin', variant.upc_gtin,
        'description', coalesce(variant.description, family.description),
        'specifications', variant.specifications,
        'primary_image_url', (
            select case when asset.copied_storage_path is null then asset.source_url else null end
            from public.catalog_source_assets asset
            where asset.product_variant_id = variant.id and asset.asset_type = 'image' and asset.active
            order by asset.is_primary desc, asset.created_at limit 1
        ),
        'primary_image_bucket', (
            select asset.copied_bucket from public.catalog_source_assets asset
            where asset.product_variant_id = variant.id and asset.asset_type = 'image' and asset.active
            order by asset.is_primary desc, asset.created_at limit 1
        ),
        'primary_image_path', (
            select asset.copied_storage_path from public.catalog_source_assets asset
            where asset.product_variant_id = variant.id and asset.asset_type = 'image' and asset.active
            order by asset.is_primary desc, asset.created_at limit 1
        ),
        'entitled', public.company_catalog_variant_is_entitled(p_company_id, variant.id),
        'offering', (
            select to_jsonb(offering) from public.company_catalog_offerings offering
            where offering.company_id = p_company_id and offering.product_variant_id = variant.id
        )
    ) order by template.category_name, family.brand, family.family_name, variant.model_number), '[]'::jsonb)
    into v_result
    from public.catalog_product_variants variant
    join public.catalog_product_families family on family.id = variant.product_family_id
    join public.catalog_category_templates template on template.id = family.category_template_id
    where variant.status = 'approved'
      and family.status = 'approved'
      and (v_is_platform_admin or public.company_catalog_variant_is_entitled(p_company_id, variant.id));

    return v_result;
end;
$$;

revoke all on function public.get_approved_master_catalog_for_company(uuid) from public, anon;
grant execute on function public.get_approved_master_catalog_for_company(uuid) to authenticated;

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
    if auth.uid() is null or p_home_item_id is null then raise exception 'Home item access is required.'; end if;
    select item.* into v_item from public.home_items item
    where item.id = p_home_item_id and item.property_id is not null
      and public.homeos_can_read_property_record(item.property_id) limit 1;
    if not found then raise exception 'Home item access is required.'; end if;

    if v_item.catalog_product_id is not null then
        select product.* into v_product from public.company_approved_products product where product.id = v_item.catalog_product_id;
    end if;
    if coalesce(v_item.master_product_variant_id, v_product.master_product_variant_id) is not null then
        select variant.* into v_variant from public.catalog_product_variants variant
        where variant.id = coalesce(v_item.master_product_variant_id, v_product.master_product_variant_id);
        if v_variant.product_family_id is not null then
            select family.* into v_family from public.catalog_product_families family where family.id = v_variant.product_family_id;
            select template.category_name into v_category from public.catalog_category_templates template where template.id = v_family.category_template_id;
        end if;
    end if;
    if v_product.id is null and v_variant.id is null then return null; end if;

    v_specifications := coalesce(v_variant.specifications, '{}'::jsonb) || coalesce(v_product.product_specifications, '{}'::jsonb);
    select coalesce(jsonb_agg(asset.payload order by asset.sort_order, asset.title), '[]'::jsonb)
    into v_assets
    from (
        select
            case when master_asset.asset_type = 'image' and master_asset.is_primary then 0 else 10 end as sort_order,
            coalesce(master_asset.file_name, master_source.title, case master_asset.asset_type
                when 'image' then 'Product image'
                when 'installation_manual' then 'Manufacturer installation manual'
                when 'specification_sheet' then 'Manufacturer specification sheet'
                when 'warranty_document' then 'Manufacturer warranty document'
                else 'Manufacturer product document' end) as title,
            jsonb_build_object(
                'id', 'master-asset-' || master_asset.id::text,
                'kind', case master_asset.asset_type when 'image' then 'photo' when 'installation_manual' then 'manual' when 'specification_sheet' then 'specification' when 'warranty_document' then 'warranty' else 'document' end,
                'title', coalesce(master_asset.file_name, master_source.title, 'Manufacturer product reference'),
                'url', case when master_asset.copied_storage_path is null then master_asset.source_url else null end,
                'bucket', master_asset.copied_bucket,
                'storage_path', master_asset.copied_storage_path,
                'mime_type', coalesce(master_asset.mime_type, case when master_asset.asset_type = 'image' then 'image/external' else 'application/pdf' end)
            ) as payload
        from public.catalog_source_assets master_asset
        left join public.catalog_sources master_source on master_source.id = master_asset.source_id
        where master_asset.product_variant_id = v_variant.id
          and master_asset.active
          and master_asset.homeowner_visible

        union all

        select case when media.media_kind = 'photo' then 20 else 30 end,
            coalesce(media.file_name, 'Product file'),
            jsonb_build_object('id', 'company-media-' || media.id::text, 'kind', media.media_kind,
                'title', coalesce(media.file_name, 'Product file'), 'url', null,
                'bucket', media.bucket, 'storage_path', media.storage_path, 'mime_type', media.mime_type)
        from public.company_product_media media
        where media.product_id = v_product.id and media.active and media.homeowner_visible

        union all

        select 40, coalesce(source.title, 'Manufacturer product page'),
            jsonb_build_object('id', 'manufacturer-source-' || source.id::text, 'kind', 'manufacturer_link',
                'title', coalesce(source.title, 'Manufacturer product page'), 'url', source.source_url,
                'bucket', null, 'storage_path', null, 'mime_type', 'text/html')
        from public.catalog_sources source
        where source.source_type = 'manufacturer_page'
          and (source.product_variant_id = v_variant.id or source.product_family_id = v_family.id)
    ) asset;

    select source.source_url into v_manufacturer_reference
    from public.catalog_sources source
    where source.source_type = 'manufacturer_page'
      and (source.product_variant_id = v_variant.id or source.product_family_id = v_family.id)
    order by source.verified_at desc nulls last, source.created_at desc limit 1;

    return jsonb_build_object(
        'home_item_id', v_item.id,
        'product_name', coalesce(nullif(btrim(v_specifications->>'product_name'), ''), nullif(btrim(v_product.product_name), ''), nullif(btrim(concat_ws(' ', v_family.brand, v_family.family_name, v_variant.model_number)), ''), v_item.name),
        'category', coalesce(nullif(btrim(v_category), ''), nullif(btrim(v_product.category), ''), v_item.category),
        'product_type', coalesce(nullif(btrim(v_specifications->>'product_type'), ''), nullif(btrim(v_specifications->>'type'), ''), nullif(btrim(v_category), ''), nullif(btrim(v_product.category), '')),
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
        'compatible_parts', coalesce(v_specifications->'compatible_parts', to_jsonb(v_product.compatible_applications), '[]'::jsonb),
        'manufacturer_warranty', coalesce(nullif(btrim(v_specifications->>'manufacturer_warranty'), ''), nullif(btrim(v_product.manufacturer_warranty), ''), nullif(btrim(v_product.warranty), '')),
        'manufacturer_reference', coalesce(nullif(btrim(v_product.manufacturer_reference), ''), v_manufacturer_reference),
        'assets', v_assets
    );
end;
$$;

revoke all on function public.get_home_item_product_reference(uuid) from public, anon;
grant execute on function public.get_home_item_product_reference(uuid) to authenticated;

commit;
