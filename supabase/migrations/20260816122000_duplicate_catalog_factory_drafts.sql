-- Super Admin-only product duplication. The copy is always a draft, reuses the
-- source family and reference media, clears unique product identifiers unless
-- explicitly supplied, and never creates company offerings, mappings, or price.

begin;

do $$
begin
    if to_regclass('public.catalog_product_variants') is null
       or to_regclass('public.catalog_product_families') is null
       or to_regclass('public.catalog_sources') is null
       or to_regclass('public.catalog_source_assets') is null
       or to_regprocedure('public.catalog_factory_require_admin()') is null then
        raise exception 'Catalog Factory product duplication requires variants, sources, media, and the admin guard.';
    end if;
end;
$$;

create or replace function public.duplicate_catalog_factory_product(
    p_source_variant_id uuid,
    p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_source public.catalog_product_variants%rowtype;
    v_duplicate public.catalog_product_variants%rowtype;
    v_source_row record;
    v_asset_row record;
    v_source_map jsonb := '{}'::jsonb;
    v_new_source_id uuid;
    v_new_model text := nullif(btrim(coalesce(p_payload->>'model_number', '')), '');
    v_new_mpn text := nullif(btrim(coalesce(p_payload->>'manufacturer_part_number', '')), '');
    v_new_upc text := nullif(btrim(coalesce(p_payload->>'upc_gtin', '')), '');
    v_new_finish text := nullif(btrim(coalesce(p_payload->>'finish', '')), '');
    v_specifications jsonb;
    v_reference_count integer := 0;
    v_asset_count integer := 0;
begin
    perform public.catalog_factory_require_admin();

    if jsonb_typeof(p_payload) <> 'object' then
        raise exception 'Duplicate product details are required.';
    end if;
    if v_new_model is null then
        raise exception 'Enter the exact model for the new draft.';
    end if;

    select variant.*
    into v_source
    from public.catalog_product_variants variant
    where variant.id = p_source_variant_id
      and variant.status <> 'archived';
    if not found then
        raise exception 'The source master product was not found.';
    end if;
    if lower(v_new_model) = lower(v_source.model_number)
       and coalesce(lower(v_new_mpn), '') = coalesce(lower(v_source.manufacturer_part_number), '') then
        raise exception 'Change the model or manufacturer part number so the draft is distinguishable from its source.';
    end if;
    if v_new_upc is not null and exists (
        select 1
        from public.catalog_product_variants variant
        where variant.id <> p_source_variant_id
          and regexp_replace(lower(coalesce(variant.upc_gtin, '')), '[^a-z0-9]', '', 'g')
              = regexp_replace(lower(v_new_upc), '[^a-z0-9]', '', 'g')
          and nullif(regexp_replace(lower(v_new_upc), '[^a-z0-9]', '', 'g'), '') is not null
          and variant.status <> 'archived'
    ) then
        raise exception 'That UPC / GTIN already belongs to another catalog product.';
    end if;

    v_specifications := case
        when jsonb_typeof(p_payload->'specifications') = 'object' then p_payload->'specifications'
        else v_source.specifications
    end;

    insert into public.catalog_product_variants(
        product_family_id,
        manufacturer_snapshot,
        model_number,
        manufacturer_part_number,
        upc_gtin,
        color,
        finish,
        size,
        capacity,
        variant_name,
        description,
        specifications,
        status,
        confidence,
        validation_warnings,
        duplicate_warnings,
        missing_fields,
        merged_into_variant_id,
        last_verified_at,
        approved_at,
        approved_by_user_id,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
    ) values (
        v_source.product_family_id,
        v_source.manufacturer_snapshot,
        v_new_model,
        v_new_mpn,
        v_new_upc,
        null,
        coalesce(v_new_finish, v_source.finish, v_source.color),
        null,
        null,
        nullif(btrim(coalesce(p_payload->>'product_title', '')), ''),
        v_source.description,
        coalesce(v_specifications, '{}'::jsonb),
        'draft',
        null,
        jsonb_build_array('Duplicated draft: verify identifiers, compatibility, specifications, and media before approval.'),
        '[]'::jsonb,
        case
            when v_new_mpn is null then '["manufacturer_part_number"]'::jsonb
            else '[]'::jsonb
        end,
        null,
        null,
        null,
        null,
        auth.uid(),
        auth.uid(),
        now(),
        now()
    )
    returning * into v_duplicate;

    for v_source_row in
        select source.*
        from public.catalog_sources source
        where source.product_variant_id = p_source_variant_id
        order by source.created_at, source.id
    loop
        v_new_source_id := gen_random_uuid();
        insert into public.catalog_sources(
            id,
            product_family_id,
            product_variant_id,
            source_type,
            source_url,
            title,
            verified_at,
            confidence,
            notes,
            created_by_user_id,
            created_at
        ) values (
            v_new_source_id,
            null,
            v_duplicate.id,
            v_source_row.source_type,
            v_source_row.source_url,
            v_source_row.title,
            v_source_row.verified_at,
            v_source_row.confidence,
            v_source_row.notes,
            auth.uid(),
            now()
        );
        v_source_map := v_source_map || jsonb_build_object(v_source_row.id::text, v_new_source_id::text);
        v_reference_count := v_reference_count + 1;
    end loop;

    for v_asset_row in
        select asset.*
        from public.catalog_source_assets asset
        where asset.product_variant_id = p_source_variant_id
        order by asset.created_at, asset.id
    loop
        insert into public.catalog_source_assets(
            id,
            product_variant_id,
            source_id,
            asset_type,
            source_url,
            is_primary,
            approved_for_copy,
            copied_bucket,
            copied_storage_path,
            verified_at,
            confidence,
            file_name,
            mime_type,
            size_bytes,
            homeowner_visible,
            active,
            created_by_user_id,
            created_at
        ) values (
            gen_random_uuid(),
            v_duplicate.id,
            case
                when v_asset_row.source_id is not null
                     and v_source_map ? v_asset_row.source_id::text
                then (v_source_map->>v_asset_row.source_id::text)::uuid
                else null
            end,
            v_asset_row.asset_type,
            v_asset_row.source_url,
            v_asset_row.is_primary,
            v_asset_row.approved_for_copy,
            v_asset_row.copied_bucket,
            v_asset_row.copied_storage_path,
            v_asset_row.verified_at,
            v_asset_row.confidence,
            v_asset_row.file_name,
            v_asset_row.mime_type,
            v_asset_row.size_bytes,
            v_asset_row.homeowner_visible,
            v_asset_row.active,
            auth.uid(),
            now()
        );
        v_asset_count := v_asset_count + 1;
    end loop;

    return jsonb_build_object(
        'variant_id', v_duplicate.id,
        'status', v_duplicate.status,
        'copied_reference_count', v_reference_count,
        'copied_asset_count', v_asset_count,
        'company_offerings_created', 0,
        'starter_mappings_created', 0,
        'prices_copied', false
    );
end;
$$;

revoke all on function public.duplicate_catalog_factory_product(uuid, jsonb) from public, anon;
grant execute on function public.duplicate_catalog_factory_product(uuid, jsonb) to authenticated;

commit;
