-- AI-assisted Catalog Factory staging. Research is explicit, drafts are private to
-- platform administrators, and only an explicit approval materializes a product
-- through the existing canonical Catalog Factory tables.

begin;

do $$
begin
    if to_regprocedure('public.catalog_factory_require_admin()') is null
       or to_regprocedure('public.review_catalog_draft(uuid,text,jsonb,uuid)') is null
       or to_regclass('public.catalog_category_templates') is null
       or to_regclass('public.catalog_product_variants') is null
       or to_regclass('public.catalog_source_assets') is null then
        raise exception 'AI Catalog Builder requires the existing Catalog Factory and review workflow.';
    end if;
end;
$$;

alter table public.catalog_category_templates
    add column if not exists primary_item_type text,
    add column if not exists item_subtype text,
    add column if not exists default_tags jsonb not null default '[]'::jsonb;

alter table public.catalog_category_templates
    drop constraint if exists catalog_category_templates_primary_item_type_check;
alter table public.catalog_category_templates
    add constraint catalog_category_templates_primary_item_type_check check (
        primary_item_type is null or primary_item_type in (
            'Fixture', 'Equipment', 'Built-In / Assembly', 'Basin / Receptacle', 'Component'
        )
    );
alter table public.catalog_category_templates
    drop constraint if exists catalog_category_templates_default_tags_check;
alter table public.catalog_category_templates
    add constraint catalog_category_templates_default_tags_check check (jsonb_typeof(default_tags) = 'array');

alter table public.catalog_product_variants
    add column if not exists primary_item_type text,
    add column if not exists item_subtype text,
    add column if not exists catalog_tags jsonb not null default '[]'::jsonb,
    add column if not exists field_provenance jsonb not null default '{}'::jsonb,
    add column if not exists research_metadata jsonb not null default '{}'::jsonb;

alter table public.catalog_product_variants
    drop constraint if exists catalog_product_variants_primary_item_type_check;
alter table public.catalog_product_variants
    add constraint catalog_product_variants_primary_item_type_check check (
        primary_item_type is null or primary_item_type in (
            'Fixture', 'Equipment', 'Built-In / Assembly', 'Basin / Receptacle', 'Component'
        )
    );
alter table public.catalog_product_variants
    drop constraint if exists catalog_product_variants_ai_metadata_check;
alter table public.catalog_product_variants
    add constraint catalog_product_variants_ai_metadata_check check (
        jsonb_typeof(catalog_tags) = 'array'
        and jsonb_typeof(field_provenance) = 'object'
        and jsonb_typeof(research_metadata) = 'object'
    );

create table if not exists public.catalog_ai_drafts (
    id uuid primary key default gen_random_uuid(),
    category_template_id uuid references public.catalog_category_templates(id) on delete restrict,
    draft_payload jsonb not null default '{}'::jsonb,
    status text not null default 'draft',
    catalog_product_variant_id uuid references public.catalog_product_variants(id) on delete set null,
    created_by_user_id uuid not null references auth.users(id) on delete restrict,
    updated_by_user_id uuid not null references auth.users(id) on delete restrict,
    approved_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    approved_at timestamptz,
    constraint catalog_ai_drafts_payload_check check (jsonb_typeof(draft_payload) = 'object'),
    constraint catalog_ai_drafts_status_check check (status in ('draft','approved','cancelled'))
);

create index if not exists catalog_ai_drafts_review_idx
    on public.catalog_ai_drafts(status, updated_at desc);

create table if not exists public.catalog_ai_image_candidates (
    id uuid primary key default gen_random_uuid(),
    catalog_ai_draft_id uuid not null references public.catalog_ai_drafts(id) on delete cascade,
    catalog_product_variant_id uuid references public.catalog_product_variants(id) on delete set null,
    image_url text not null,
    source_url text not null,
    title text,
    alt_text text,
    confidence numeric(4,3),
    copied_bucket text,
    copied_storage_path text,
    file_name text,
    mime_type text,
    size_bytes bigint,
    selection_status text not null default 'pending',
    is_primary boolean not null default false,
    created_by_user_id uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint catalog_ai_image_candidates_urls_present check (
        btrim(image_url) <> '' and btrim(source_url) <> ''
    ),
    constraint catalog_ai_image_candidates_confidence_check check (
        confidence is null or (confidence >= 0 and confidence <= 1)
    ),
    constraint catalog_ai_image_candidates_selection_check check (
        selection_status in ('pending','selected','rejected')
        and (not is_primary or selection_status = 'selected')
    )
);

create unique index if not exists catalog_ai_image_candidates_url_uidx
    on public.catalog_ai_image_candidates(catalog_ai_draft_id, md5(lower(btrim(image_url))));
create unique index if not exists catalog_ai_image_candidates_primary_uidx
    on public.catalog_ai_image_candidates(catalog_ai_draft_id)
    where is_primary;

create table if not exists public.catalog_product_placements (
    id uuid primary key default gen_random_uuid(),
    product_variant_id uuid not null references public.catalog_product_variants(id) on delete cascade,
    system_key text,
    area_key text,
    parent_subtype text,
    placement_path jsonb not null default '[]'::jsonb,
    reason text,
    active boolean not null default true,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint catalog_product_placements_path_check check (jsonb_typeof(placement_path) = 'array'),
    constraint catalog_product_placements_target_check check (
        nullif(btrim(coalesce(system_key,'')), '') is not null
        or nullif(btrim(coalesce(area_key,'')), '') is not null
        or nullif(btrim(coalesce(parent_subtype,'')), '') is not null
        or jsonb_array_length(placement_path) > 0
    )
);

create unique index if not exists catalog_product_placements_identity_uidx
    on public.catalog_product_placements(
        product_variant_id,
        lower(coalesce(system_key,'')),
        lower(coalesce(area_key,'')),
        lower(coalesce(parent_subtype,'')),
        md5(placement_path::text)
    ) where active;

alter table public.catalog_ai_drafts enable row level security;
alter table public.catalog_ai_image_candidates enable row level security;
alter table public.catalog_product_placements enable row level security;

drop policy if exists catalog_ai_drafts_admin_read on public.catalog_ai_drafts;
create policy catalog_ai_drafts_admin_read on public.catalog_ai_drafts
for select to authenticated using (coalesce(public.homeos_is_platform_admin(), false));

drop policy if exists catalog_ai_image_candidates_admin_read on public.catalog_ai_image_candidates;
create policy catalog_ai_image_candidates_admin_read on public.catalog_ai_image_candidates
for select to authenticated using (coalesce(public.homeos_is_platform_admin(), false));

drop policy if exists catalog_product_placements_read on public.catalog_product_placements;
create policy catalog_product_placements_read on public.catalog_product_placements
for select to authenticated using (
    coalesce(public.homeos_is_platform_admin(), false)
    or exists (
        select 1 from public.catalog_product_variants variant
        where variant.id = product_variant_id and variant.status = 'approved'
    )
);

create or replace function public.catalog_factory_media_storage_can_write(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
    v_parts text[];
    v_target_id uuid;
    v_asset_id uuid;
begin
    if auth.uid() is null
       or not coalesce(public.homeos_is_platform_admin(), false)
       or nullif(btrim(coalesce(p_object_name, '')), '') is null then
        return false;
    end if;
    v_parts := storage.foldername(p_object_name);
    if coalesce(array_length(v_parts, 1), 0) < 3
       or v_parts[1] not in ('variants', 'ai-drafts') then return false; end if;
    begin
        v_target_id := v_parts[2]::uuid;
        v_asset_id := v_parts[3]::uuid;
    exception when invalid_text_representation then
        return false;
    end;
    if v_parts[1] = 'variants' then
        return exists (select 1 from public.catalog_product_variants where id = v_target_id);
    end if;
    return exists (select 1 from public.catalog_ai_drafts where id = v_target_id and status = 'draft');
end;
$$;

revoke all on function public.catalog_factory_media_storage_can_write(text) from public, anon;
grant execute on function public.catalog_factory_media_storage_can_write(text) to authenticated;

create or replace function public.catalog_ai_source_db_type(p_type text)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select case p_type
        when 'manufacturer_product' then 'manufacturer_page'
        when 'installation_manual' then 'installation_manual'
        when 'specification_sheet' then 'specification_sheet'
        when 'warranty_document' then 'warranty_document'
        else 'other'
    end
$$;

revoke all on function public.catalog_ai_source_db_type(text) from public, anon;
grant execute on function public.catalog_ai_source_db_type(text) to authenticated;

create or replace function public.catalog_ai_validate_payload(p_payload jsonb, p_for_approval boolean default false)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_source_count integer;
    v_distinct_source_count integer;
    v_distinct_source_type_count integer;
    v_primary_type text := nullif(btrim(coalesce(p_payload->>'primary_item_type','')), '');
    v_provenance jsonb := coalesce(p_payload->'field_provenance', '{}'::jsonb);
begin
    perform public.catalog_factory_require_admin();
    if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
        raise exception 'A valid AI catalog draft is required.';
    end if;
    if v_primary_type is not null and v_primary_type not in (
        'Fixture', 'Equipment', 'Built-In / Assembly', 'Basin / Receptacle', 'Component'
    ) then raise exception 'Choose a supported primary item type.'; end if;
    if jsonb_typeof(coalesce(p_payload->'specifications','{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(p_payload->'tags','[]'::jsonb)) <> 'array'
       or jsonb_typeof(v_provenance) <> 'object'
       or jsonb_typeof(coalesce(p_payload->'placements','[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p_payload->'sources','[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p_payload->'candidate_images','[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p_payload->'research_metadata','{}'::jsonb)) <> 'object' then
        raise exception 'AI catalog draft metadata has an invalid shape.';
    end if;

    select count(*), count(distinct lower(btrim(value->>'url'))), count(distinct value->>'type')
    into v_source_count, v_distinct_source_count, v_distinct_source_type_count
    from jsonb_array_elements(coalesce(p_payload->'sources','[]'::jsonb));
    if v_source_count > 4 then raise exception 'Keep catalog sources to four curated references or fewer.'; end if;
    if v_source_count <> v_distinct_source_count or v_source_count <> v_distinct_source_type_count then
        raise exception 'Catalog sources must use unique URLs and one reference per source type.';
    end if;
    if exists (
        select 1 from jsonb_array_elements(coalesce(p_payload->'sources','[]'::jsonb)) source
        where coalesce(source->>'type','') not in (
            'manufacturer_product','installation_manual','owner_manual','specification_sheet','warranty_document'
        ) or nullif(btrim(coalesce(source->>'url','')), '') is null
          or source->>'url' !~* '^https?://'
    ) then raise exception 'Catalog sources must be curated HTTP(S) manufacturer references.'; end if;

    if exists (
        select 1 from jsonb_each(v_provenance) entry
        where jsonb_typeof(entry.value) <> 'object'
           or coalesce(entry.value->>'kind','') not in ('admin_entered','verified','ai_inferred','unverified')
           or jsonb_typeof(coalesce(entry.value->'source_urls','[]'::jsonb)) <> 'array'
    ) then raise exception 'Field provenance is invalid.'; end if;

    if p_for_approval then
        if nullif(btrim(coalesce(p_payload->>'category_template_id','')), '') is null
           or not exists (
               select 1 from public.catalog_category_templates template
               where template.id = (p_payload->>'category_template_id')::uuid and template.status <> 'archived'
           ) then raise exception 'Choose an active catalog category before approval.'; end if;
        if nullif(btrim(coalesce(p_payload->>'manufacturer','')), '') is null
           or nullif(btrim(coalesce(p_payload->>'brand','')), '') is null
           or nullif(btrim(coalesce(p_payload->>'family_name','')), '') is null
           or nullif(btrim(coalesce(p_payload->>'model_number','')), '') is null
           or nullif(btrim(coalesce(p_payload->>'subtype','')), '') is null
           or v_primary_type is null then
            raise exception 'Manufacturer, brand, family, verified model, primary item type, and subtype are required before approval.';
        end if;
        if lower(btrim(p_payload->>'model_number')) in ('unknown','not provided','missing information','unverified') then
            raise exception 'A verified or administrator-entered model number is required before approval.';
        end if;
        if coalesce(v_provenance->'model_number'->>'kind','unverified') not in ('admin_entered','verified') then
            raise exception 'The model number must be administrator-entered or source-verified before approval.';
        end if;
        if jsonb_array_length(coalesce(p_payload->'missing_fields','[]'::jsonb)) > 0
           or jsonb_array_length(coalesce(p_payload->'validation_warnings','[]'::jsonb)) > 0
           or jsonb_array_length(coalesce(p_payload->'duplicate_warnings','[]'::jsonb)) > 0 then
            raise exception 'Resolve all missing fields, validation warnings, and duplicate warnings before approval.';
        end if;
    end if;
end;
$$;

revoke all on function public.catalog_ai_validate_payload(jsonb, boolean) from public, anon;
grant execute on function public.catalog_ai_validate_payload(jsonb, boolean) to authenticated;

create or replace function public.get_catalog_ai_builder_config()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_result jsonb;
begin
    perform public.catalog_factory_require_admin();
    select jsonb_build_object(
        'primary_item_types', jsonb_build_array(
            'Fixture','Equipment','Built-In / Assembly','Basin / Receptacle','Component'
        ),
        'templates', coalesce(jsonb_agg(jsonb_build_object(
            'id', template.id,
            'template_key', template.template_key,
            'category_name', template.category_name,
            'primary_item_type', template.primary_item_type,
            'subtype', coalesce(template.item_subtype, template.category_name),
            'default_tags', template.default_tags,
            'universal_fields', template.universal_fields,
            'specification_fields', template.specification_fields,
            'required_fields', template.required_fields
        ) order by template.category_name) filter (where template.id is not null), '[]'::jsonb)
    ) into v_result
    from public.catalog_category_templates template
    where template.status <> 'archived';
    return v_result;
end;
$$;

revoke all on function public.get_catalog_ai_builder_config() from public, anon;
grant execute on function public.get_catalog_ai_builder_config() to authenticated;

create or replace function public.save_catalog_ai_draft(p_draft_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_draft public.catalog_ai_drafts%rowtype;
    v_candidate jsonb;
begin
    perform public.catalog_factory_require_admin();
    perform public.catalog_ai_validate_payload(p_payload, false);
    if p_draft_id is not null then
        select * into v_draft from public.catalog_ai_drafts
        where id = p_draft_id for update;
        if not found then raise exception 'AI catalog draft was not found.'; end if;
        if v_draft.status <> 'draft' then raise exception 'Only an open AI catalog draft can be edited.'; end if;
        update public.catalog_ai_drafts
        set category_template_id = nullif(p_payload->>'category_template_id','')::uuid,
            draft_payload = p_payload,
            updated_by_user_id = auth.uid(),
            updated_at = now()
        where id = p_draft_id returning * into v_draft;
    else
        insert into public.catalog_ai_drafts(
            category_template_id, draft_payload, created_by_user_id, updated_by_user_id
        ) values (
            nullif(p_payload->>'category_template_id','')::uuid, p_payload, auth.uid(), auth.uid()
        ) returning * into v_draft;
    end if;

    delete from public.catalog_ai_image_candidates candidate
    where candidate.catalog_ai_draft_id = v_draft.id;
    for v_candidate in select value from jsonb_array_elements(coalesce(p_payload->'candidate_images','[]'::jsonb)) loop
        if nullif(btrim(coalesce(v_candidate->>'image_url','')), '') is null
           or nullif(btrim(coalesce(v_candidate->>'source_url','')), '') is null then continue; end if;
        if v_candidate->>'image_url' !~* '^https?://'
           and not (
               v_candidate->>'copied_bucket' = 'catalog-factory-media'
               and v_candidate->>'copied_storage_path' like 'ai-drafts/' || v_draft.id::text || '/%'
               and v_candidate->>'image_url' = 'storage://catalog-factory-media/' || (v_candidate->>'copied_storage_path')
               and exists (
                   select 1 from storage.objects object
                   where object.bucket_id = 'catalog-factory-media'
                     and object.name = v_candidate->>'copied_storage_path'
               )
           ) then continue; end if;
        if v_candidate->>'source_url' !~* '^https?://'
           and v_candidate->>'source_url' <> v_candidate->>'image_url' then continue; end if;
        insert into public.catalog_ai_image_candidates(
            catalog_ai_draft_id, image_url, source_url, title, alt_text,
            confidence, copied_bucket, copied_storage_path, file_name, mime_type,
            size_bytes, created_by_user_id
        ) values (
            v_draft.id, btrim(v_candidate->>'image_url'), btrim(v_candidate->>'source_url'),
            nullif(btrim(coalesce(v_candidate->>'title','')), ''),
            nullif(btrim(coalesce(v_candidate->>'alt_text','')), ''),
            case when nullif(v_candidate->>'confidence','') is null then null
                 else greatest(0, least(1, (v_candidate->>'confidence')::numeric)) end,
            nullif(btrim(coalesce(v_candidate->>'copied_bucket','')), ''),
            nullif(btrim(coalesce(v_candidate->>'copied_storage_path','')), ''),
            nullif(btrim(coalesce(v_candidate->>'file_name','')), ''),
            nullif(btrim(coalesce(v_candidate->>'mime_type','')), ''),
            nullif(v_candidate->>'size_bytes','')::bigint,
            auth.uid()
        ) on conflict (catalog_ai_draft_id, md5(lower(btrim(image_url)))) do update set
            source_url = excluded.source_url,
            title = excluded.title,
            alt_text = excluded.alt_text,
            confidence = excluded.confidence,
            copied_bucket = excluded.copied_bucket,
            copied_storage_path = excluded.copied_storage_path,
            file_name = excluded.file_name,
            mime_type = excluded.mime_type,
            size_bytes = excluded.size_bytes,
            updated_at = now();
        if coalesce((v_candidate->>'selected')::boolean, false) then
            if coalesce((v_candidate->>'primary')::boolean, false) then
                update public.catalog_ai_image_candidates set is_primary = false, updated_at = now()
                where catalog_ai_draft_id = v_draft.id;
            end if;
            update public.catalog_ai_image_candidates
            set selection_status = 'selected',
                is_primary = coalesce((v_candidate->>'primary')::boolean, false),
                updated_at = now()
            where catalog_ai_draft_id = v_draft.id
              and lower(btrim(image_url)) = lower(btrim(v_candidate->>'image_url'));
        end if;
    end loop;

    return jsonb_build_object('draft_id', v_draft.id, 'status', v_draft.status, 'updated_at', v_draft.updated_at);
end;
$$;

revoke all on function public.save_catalog_ai_draft(uuid, jsonb) from public, anon;
grant execute on function public.save_catalog_ai_draft(uuid, jsonb) to authenticated;

create or replace function public.get_catalog_ai_draft(p_draft_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_result jsonb;
begin
    perform public.catalog_factory_require_admin();
    select to_jsonb(draft) || jsonb_build_object(
        'candidate_images', coalesce((
            select jsonb_agg(to_jsonb(candidate) order by candidate.is_primary desc, candidate.created_at)
            from public.catalog_ai_image_candidates candidate
            where candidate.catalog_ai_draft_id = draft.id
        ), '[]'::jsonb)
    ) into v_result
    from public.catalog_ai_drafts draft
    where draft.id = p_draft_id;
    if v_result is null then raise exception 'AI catalog draft was not found.'; end if;
    return v_result;
end;
$$;

revoke all on function public.get_catalog_ai_draft(uuid) from public, anon;
grant execute on function public.get_catalog_ai_draft(uuid) to authenticated;

create or replace function public.review_catalog_ai_image_candidate(
    p_draft_id uuid,
    p_candidate_id uuid,
    p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_candidate public.catalog_ai_image_candidates%rowtype;
begin
    perform public.catalog_factory_require_admin();
    if p_action not in ('select_primary','select_supporting','reject','reset') then
        raise exception 'Unsupported candidate-image action.';
    end if;
    if not exists (select 1 from public.catalog_ai_drafts where id = p_draft_id and status = 'draft') then
        raise exception 'Only an open AI catalog draft can change candidate images.';
    end if;
    select * into v_candidate from public.catalog_ai_image_candidates
    where id = p_candidate_id and catalog_ai_draft_id = p_draft_id for update;
    if not found then raise exception 'Candidate image was not found.'; end if;
    if p_action = 'select_primary' then
        update public.catalog_ai_image_candidates set is_primary = false, updated_at = now()
        where catalog_ai_draft_id = p_draft_id and id <> p_candidate_id;
        update public.catalog_ai_image_candidates
        set selection_status = 'selected', is_primary = true, updated_at = now()
        where id = p_candidate_id returning * into v_candidate;
    elsif p_action = 'select_supporting' then
        update public.catalog_ai_image_candidates
        set selection_status = 'selected', is_primary = false, updated_at = now()
        where id = p_candidate_id returning * into v_candidate;
    elsif p_action = 'reject' then
        update public.catalog_ai_image_candidates
        set selection_status = 'rejected', is_primary = false, updated_at = now()
        where id = p_candidate_id returning * into v_candidate;
    else
        update public.catalog_ai_image_candidates
        set selection_status = 'pending', is_primary = false, updated_at = now()
        where id = p_candidate_id returning * into v_candidate;
    end if;
    return to_jsonb(v_candidate);
end;
$$;

revoke all on function public.review_catalog_ai_image_candidate(uuid, uuid, text) from public, anon;
grant execute on function public.review_catalog_ai_image_candidate(uuid, uuid, text) to authenticated;

create or replace function public.approve_catalog_ai_draft(p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_draft public.catalog_ai_drafts%rowtype;
    v_payload jsonb;
    v_family_id uuid;
    v_variant_id uuid;
    v_source jsonb;
    v_placement jsonb;
    v_candidate public.catalog_ai_image_candidates%rowtype;
    v_source_type text;
begin
    perform public.catalog_factory_require_admin();
    select * into v_draft from public.catalog_ai_drafts where id = p_draft_id for update;
    if not found then raise exception 'AI catalog draft was not found.'; end if;
    if v_draft.status <> 'draft' then raise exception 'Only an open AI catalog draft can be approved.'; end if;
    v_payload := v_draft.draft_payload;
    perform public.catalog_ai_validate_payload(v_payload, true);

    if exists (
        select 1 from public.catalog_product_variants variant
        where variant.status <> 'archived' and (
            (nullif(public.catalog_normalize_identifier(v_payload->>'upc_gtin'), '') is not null
             and public.catalog_normalize_identifier(variant.upc_gtin) = public.catalog_normalize_identifier(v_payload->>'upc_gtin'))
            or
            (nullif(public.catalog_normalize_identifier(v_payload->>'manufacturer_part_number'), '') is not null
             and lower(btrim(variant.manufacturer_snapshot)) = lower(btrim(v_payload->>'manufacturer'))
             and public.catalog_normalize_identifier(variant.manufacturer_part_number) = public.catalog_normalize_identifier(v_payload->>'manufacturer_part_number'))
            or
            (lower(btrim(variant.manufacturer_snapshot)) = lower(btrim(v_payload->>'manufacturer'))
             and lower(btrim(variant.model_number)) = lower(btrim(v_payload->>'model_number')))
        )
    ) then raise exception 'A canonical product already uses this UPC, manufacturer part number, or manufacturer/model identity. Merge or use the existing product.'; end if;

    if exists (
        select 1 from public.catalog_ai_image_candidates candidate
        where candidate.catalog_ai_draft_id = p_draft_id and candidate.selection_status = 'selected'
    ) and (
        select count(*) from public.catalog_ai_image_candidates candidate
        where candidate.catalog_ai_draft_id = p_draft_id and candidate.is_primary
    ) <> 1 then raise exception 'Choose exactly one primary image when including candidate images.'; end if;

    if exists (
        select 1
        from public.catalog_ai_image_candidates candidate
        where candidate.catalog_ai_draft_id = p_draft_id
          and candidate.selection_status = 'selected'
          and (candidate.copied_bucket is null or candidate.copied_storage_path is null)
          and not exists (
              select 1
              from jsonb_array_elements(coalesce(v_payload->'sources','[]'::jsonb)) source
              where lower(regexp_replace(split_part(btrim(source->>'url'), '#', 1), '/+$', ''))
                  = lower(regexp_replace(split_part(btrim(candidate.source_url), '#', 1), '/+$', ''))
          )
    ) then
        raise exception 'Every selected external image must come from one of the curated product sources.';
    end if;

    select family.id into v_family_id
    from public.catalog_product_families family
    where family.category_template_id = (v_payload->>'category_template_id')::uuid
      and lower(btrim(family.manufacturer)) = lower(btrim(v_payload->>'manufacturer'))
      and lower(btrim(family.brand)) = lower(btrim(v_payload->>'brand'))
      and lower(btrim(family.family_name)) = lower(btrim(v_payload->>'family_name'))
      and family.status <> 'archived'
    order by case family.status when 'approved' then 0 else 1 end, family.updated_at desc
    limit 1;
    if v_family_id is null then
        insert into public.catalog_product_families(
            category_template_id, manufacturer, brand, family_name, description,
            shared_product_data, status, confidence, created_by_user_id, updated_by_user_id
        ) values (
            (v_payload->>'category_template_id')::uuid, btrim(v_payload->>'manufacturer'),
            btrim(v_payload->>'brand'), btrim(v_payload->>'family_name'),
            nullif(btrim(coalesce(v_payload->>'description','')), ''), '{}'::jsonb,
            'draft', nullif(v_payload->>'confidence','')::numeric, auth.uid(), auth.uid()
        ) returning id into v_family_id;
    end if;

    insert into public.catalog_product_variants(
        product_family_id, manufacturer_snapshot, model_number, manufacturer_part_number,
        upc_gtin, description, specifications, status, confidence, validation_warnings,
        duplicate_warnings, missing_fields, primary_item_type, item_subtype, catalog_tags,
        field_provenance, research_metadata, last_verified_at, created_by_user_id, updated_by_user_id
    ) values (
        v_family_id, btrim(v_payload->>'manufacturer'), btrim(v_payload->>'model_number'),
        nullif(btrim(coalesce(v_payload->>'manufacturer_part_number','')), ''),
        nullif(btrim(coalesce(v_payload->>'upc_gtin','')), ''),
        nullif(btrim(coalesce(v_payload->>'description','')), ''),
        coalesce(v_payload->'specifications','{}'::jsonb), 'draft',
        nullif(v_payload->>'confidence','')::numeric, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
        v_payload->>'primary_item_type', btrim(v_payload->>'subtype'),
        coalesce(v_payload->'tags','[]'::jsonb), coalesce(v_payload->'field_provenance','{}'::jsonb),
        coalesce(v_payload->'research_metadata','{}'::jsonb), now(), auth.uid(), auth.uid()
    ) returning id into v_variant_id;

    update public.catalog_product_variants
    set specifications = specifications || jsonb_build_object('product_name', v_payload->>'product_name')
    where id = v_variant_id and nullif(btrim(coalesce(v_payload->>'product_name','')), '') is not null;

    for v_source in select value from jsonb_array_elements(coalesce(v_payload->'sources','[]'::jsonb)) loop
        v_source_type := public.catalog_ai_source_db_type(v_source->>'type');
        insert into public.catalog_sources(
            product_variant_id, source_type, source_url, title, verified_at, confidence, notes, created_by_user_id
        ) values (
            v_variant_id, v_source_type, btrim(v_source->>'url'),
            nullif(btrim(coalesce(v_source->>'title','')), ''), now(),
            nullif(v_payload->>'confidence','')::numeric,
            case when v_source->>'type' = 'owner_manual' then 'AI Catalog Builder source type: owner_manual' else null end,
            auth.uid()
        );
    end loop;

    for v_placement in select value from jsonb_array_elements(coalesce(v_payload->'placements','[]'::jsonb)) loop
        if nullif(btrim(coalesce(v_placement->>'system_key','')), '') is null
           and nullif(btrim(coalesce(v_placement->>'area_key','')), '') is null
           and nullif(btrim(coalesce(v_placement->>'parent_subtype','')), '') is null
           and jsonb_array_length(coalesce(v_placement->'path','[]'::jsonb)) = 0 then continue; end if;
        insert into public.catalog_product_placements(
            product_variant_id, system_key, area_key, parent_subtype, placement_path,
            reason, created_by_user_id
        ) values (
            v_variant_id, nullif(btrim(coalesce(v_placement->>'system_key','')), ''),
            nullif(btrim(coalesce(v_placement->>'area_key','')), ''),
            nullif(btrim(coalesce(v_placement->>'parent_subtype','')), ''),
            coalesce(v_placement->'path','[]'::jsonb),
            nullif(btrim(coalesce(v_placement->>'reason','')), ''), auth.uid()
        ) on conflict do nothing;
    end loop;

    for v_candidate in select * from public.catalog_ai_image_candidates
        where catalog_ai_draft_id = p_draft_id and selection_status = 'selected'
        order by is_primary desc, created_at
    loop
        insert into public.catalog_source_assets(
            product_variant_id, asset_type, source_url, is_primary, approved_for_copy,
            copied_bucket, copied_storage_path, verified_at, confidence, file_name,
            mime_type, size_bytes, homeowner_visible, active, created_by_user_id
        ) values (
            v_variant_id, 'image', v_candidate.image_url, v_candidate.is_primary,
            v_candidate.copied_bucket is not null and v_candidate.copied_storage_path is not null,
            v_candidate.copied_bucket, v_candidate.copied_storage_path, now(), v_candidate.confidence,
            coalesce(v_candidate.file_name, v_candidate.title, 'Product image'),
            v_candidate.mime_type, v_candidate.size_bytes, true, true, auth.uid()
        );
        update public.catalog_ai_image_candidates
        set catalog_product_variant_id = v_variant_id, updated_at = now()
        where id = v_candidate.id;
    end loop;

    perform public.review_catalog_draft(v_variant_id, 'approve', '{}'::jsonb, null);
    update public.catalog_ai_drafts
    set status = 'approved', catalog_product_variant_id = v_variant_id,
        approved_by_user_id = auth.uid(), approved_at = now(),
        updated_by_user_id = auth.uid(), updated_at = now()
    where id = p_draft_id returning * into v_draft;
    return jsonb_build_object(
        'draft_id', v_draft.id,
        'variant_id', v_variant_id,
        'status', v_draft.status,
        'approved_at', v_draft.approved_at
    );
end;
$$;

revoke all on function public.approve_catalog_ai_draft(uuid) from public, anon;
grant execute on function public.approve_catalog_ai_draft(uuid) to authenticated;

revoke all on table public.catalog_ai_drafts from anon;
revoke all on table public.catalog_ai_image_candidates from anon;
revoke all on table public.catalog_product_placements from anon;
revoke insert, update, delete on table public.catalog_ai_drafts from authenticated;
revoke insert, update, delete on table public.catalog_ai_image_candidates from authenticated;
revoke insert, update, delete on table public.catalog_product_placements from authenticated;
grant select on table public.catalog_ai_drafts to authenticated;
grant select on table public.catalog_ai_image_candidates to authenticated;
grant select on table public.catalog_product_placements to authenticated;

commit;
