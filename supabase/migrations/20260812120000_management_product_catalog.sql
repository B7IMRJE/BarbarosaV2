-- Promote the existing approved-product estimate foundation into a company-owned
-- ManagementOS catalog. Product identity/media remain separate from service
-- scope and labor pricing, while an optional Price Book link connects them.

begin;

do $$
begin
    if to_regclass('public.company_approved_products') is null
       or to_regclass('public.company_product_media') is null
       or to_regclass('public.company_price_book_items') is null then
        raise exception 'Approved products, product media, and the company Price Book are required.';
    end if;
end;
$$;

alter table public.company_approved_products
    add column if not exists product_name text,
    add column if not exists manufacturer_part_number text,
    add column if not exists sku text,
    add column if not exists product_description text,
    add column if not exists catalog_status text not null default 'draft',
    add column if not exists workmanship_warranty text,
    add column if not exists labor_warranty text,
    add column if not exists manufacturer_warranty text;

update public.company_approved_products
set product_name = coalesce(nullif(btrim(product_name), ''), concat_ws(' ', nullif(btrim(brand), ''), nullif(btrim(model), ''))),
    catalog_status = case
        when not active then 'archived'
        when approved then 'approved'
        else 'draft'
    end,
    manufacturer_warranty = coalesce(nullif(btrim(manufacturer_warranty), ''), nullif(btrim(warranty), ''));

alter table public.company_approved_products
    drop constraint if exists company_approved_products_catalog_status_check;
alter table public.company_approved_products
    add constraint company_approved_products_catalog_status_check
    check (catalog_status in ('draft', 'approved', 'archived')) not valid;

alter table public.company_product_media
    add column if not exists media_kind text not null default 'photo',
    add column if not exists file_name text,
    add column if not exists mime_type text,
    add column if not exists size_bytes bigint;

alter table public.company_product_media
    drop constraint if exists company_product_media_kind_check;
alter table public.company_product_media
    add constraint company_product_media_kind_check
    check (media_kind in ('photo', 'manual', 'warranty', 'specification', 'document')) not valid;

alter table public.home_items
    add column if not exists catalog_product_id uuid references public.company_approved_products(id) on delete set null;
alter table public.home_item_service_history
    add column if not exists catalog_product_id uuid references public.company_approved_products(id) on delete set null;

create index if not exists company_approved_products_catalog_lookup_idx
    on public.company_approved_products(company_id, catalog_status, category, brand, model);
create index if not exists home_items_catalog_product_idx
    on public.home_items(catalog_product_id) where catalog_product_id is not null;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values(
    'company-product-catalog',
    'company-product-catalog',
    false,
    26214400,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']::text[]
)
on conflict(id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

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
    return public.company_price_book_can_view(v_company_id)
       and exists (
           select 1 from public.company_approved_products product
           where product.id = v_product_id
             and product.company_id = v_company_id
             and (
                 public.company_price_book_can_manage(v_company_id)
                 or (product.approved and product.active and product.catalog_status = 'approved')
             )
       );
end;
$$;

create or replace function public.company_product_catalog_storage_can_write(p_object_name text)
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
    return public.company_price_book_can_manage(v_company_id)
       and exists (
           select 1 from public.company_approved_products product
           where product.id = v_product_id and product.company_id = v_company_id
       );
end;
$$;

revoke all on function public.company_product_catalog_storage_can_access(text) from public, anon;
revoke all on function public.company_product_catalog_storage_can_write(text) from public, anon;
grant execute on function public.company_product_catalog_storage_can_access(text) to authenticated;
grant execute on function public.company_product_catalog_storage_can_write(text) to authenticated;

drop policy if exists company_product_catalog_objects_select on storage.objects;
create policy company_product_catalog_objects_select on storage.objects
for select to authenticated
using (bucket_id = 'company-product-catalog' and public.company_product_catalog_storage_can_access(name));

drop policy if exists company_product_catalog_objects_insert on storage.objects;
create policy company_product_catalog_objects_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'company-product-catalog' and public.company_product_catalog_storage_can_write(name));

drop policy if exists company_product_catalog_objects_delete on storage.objects;
create policy company_product_catalog_objects_delete on storage.objects
for delete to authenticated
using (bucket_id = 'company-product-catalog' and public.company_product_catalog_storage_can_write(name));

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
      and public.company_price_book_can_view(p_company_id)
      and (
          public.company_price_book_can_manage(p_company_id)
          or (product.approved and product.active and product.catalog_status = 'approved')
      )
    order by product.catalog_status, product.category, product.brand, product.model;
$$;

revoke all on function public.get_company_product_catalog(uuid) from public, anon;
grant execute on function public.get_company_product_catalog(uuid) to authenticated;

create or replace function public.save_company_product_catalog_item(
    p_company_id uuid,
    p_product_id uuid,
    p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_product public.company_approved_products%rowtype;
    v_status text := lower(btrim(coalesce(p_payload->>'status', 'draft')));
    v_tier text := nullif(btrim(coalesce(p_payload->>'tier', 'Professional')), '');
    v_price_book_id uuid;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.company_price_book_can_manage(p_company_id) then raise exception 'Catalog management access is required.'; end if;
    if jsonb_typeof(p_payload) <> 'object' then raise exception 'Catalog card details are required.'; end if;
    if nullif(btrim(coalesce(p_payload->>'category', '')), '') is null
       or nullif(btrim(coalesce(p_payload->>'brand', '')), '') is null
       or nullif(btrim(coalesce(p_payload->>'model', '')), '') is null then
        raise exception 'Category, brand, and model are required.';
    end if;
    if v_status not in ('draft', 'approved', 'archived') then raise exception 'Invalid catalog status.'; end if;
    if v_tier not in ('Essential', 'Professional', 'Premium') then raise exception 'Invalid product tier.'; end if;
    if jsonb_typeof(coalesce(p_payload->'specifications', '{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(p_payload->'compatible_applications', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p_payload->'installation_requirements', '[]'::jsonb)) <> 'array' then
        raise exception 'Catalog specifications and application lists are invalid.';
    end if;
    begin
        v_price_book_id := nullif(p_payload->>'price_book_item_id', '')::uuid;
    exception when invalid_text_representation then
        raise exception 'Linked Price Book item is invalid.';
    end;
    if v_price_book_id is not null and not exists (
        select 1 from public.company_price_book_items item
        where item.id = v_price_book_id and item.company_id = p_company_id
    ) then
        raise exception 'Linked Price Book item does not belong to this company.';
    end if;

    insert into public.company_approved_products(
        id, company_id, product_name, category, brand, model,
        manufacturer_part_number, sku, product_description, tier,
        approved_selling_price, price_book_item_id, minimum_selling_price, maximum_selling_price,
        product_specifications, compatible_applications, installation_requirements,
        workmanship_warranty, labor_warranty, manufacturer_warranty, warranty,
        availability_note, manufacturer_reference, company_notes,
        catalog_status, approved, active, created_by_user_id, updated_by_user_id, updated_at
    ) values (
        coalesce(p_product_id, gen_random_uuid()), p_company_id,
        coalesce(nullif(btrim(p_payload->>'product_name'), ''), concat_ws(' ', btrim(p_payload->>'brand'), btrim(p_payload->>'model'))),
        btrim(p_payload->>'category'), btrim(p_payload->>'brand'), btrim(p_payload->>'model'),
        nullif(btrim(coalesce(p_payload->>'manufacturer_part_number', '')), ''),
        nullif(btrim(coalesce(p_payload->>'sku', '')), ''),
        nullif(btrim(coalesce(p_payload->>'description', '')), ''), v_tier,
        nullif(p_payload->>'approved_selling_price', '')::numeric, v_price_book_id,
        nullif(p_payload->>'minimum_selling_price', '')::numeric,
        nullif(p_payload->>'maximum_selling_price', '')::numeric,
        coalesce(p_payload->'specifications', '{}'::jsonb),
        array(select jsonb_array_elements_text(coalesce(p_payload->'compatible_applications', '[]'::jsonb))),
        array(select jsonb_array_elements_text(coalesce(p_payload->'installation_requirements', '[]'::jsonb))),
        nullif(btrim(coalesce(p_payload->>'workmanship_warranty', '')), ''),
        nullif(btrim(coalesce(p_payload->>'labor_warranty', '')), ''),
        nullif(btrim(coalesce(p_payload->>'manufacturer_warranty', '')), ''),
        nullif(btrim(coalesce(p_payload->>'manufacturer_warranty', '')), ''),
        nullif(btrim(coalesce(p_payload->>'availability_note', '')), ''),
        nullif(btrim(coalesce(p_payload->>'manufacturer_reference', '')), ''),
        nullif(btrim(coalesce(p_payload->>'company_notes', '')), ''),
        v_status, v_status = 'approved', v_status <> 'archived', auth.uid(), auth.uid(), now()
    )
    on conflict (id) do update set
        product_name = excluded.product_name,
        category = excluded.category,
        brand = excluded.brand,
        model = excluded.model,
        manufacturer_part_number = excluded.manufacturer_part_number,
        sku = excluded.sku,
        product_description = excluded.product_description,
        tier = excluded.tier,
        approved_selling_price = excluded.approved_selling_price,
        price_book_item_id = excluded.price_book_item_id,
        minimum_selling_price = excluded.minimum_selling_price,
        maximum_selling_price = excluded.maximum_selling_price,
        product_specifications = excluded.product_specifications,
        compatible_applications = excluded.compatible_applications,
        installation_requirements = excluded.installation_requirements,
        workmanship_warranty = excluded.workmanship_warranty,
        labor_warranty = excluded.labor_warranty,
        manufacturer_warranty = excluded.manufacturer_warranty,
        warranty = excluded.warranty,
        availability_note = excluded.availability_note,
        manufacturer_reference = excluded.manufacturer_reference,
        company_notes = excluded.company_notes,
        catalog_status = excluded.catalog_status,
        approved = excluded.approved,
        active = excluded.active,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    where company_approved_products.company_id = p_company_id
    returning * into v_product;

    if v_product.id is null then raise exception 'Catalog card is unavailable.'; end if;
    return (select catalog_row from public.get_company_product_catalog(p_company_id) catalog_row where catalog_row->>'id' = v_product.id::text limit 1);
end;
$$;

revoke all on function public.save_company_product_catalog_item(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_company_product_catalog_item(uuid, uuid, jsonb) to authenticated;

create or replace function public.record_company_product_catalog_file(
    p_company_id uuid,
    p_product_id uuid,
    p_file_id uuid,
    p_kind text,
    p_storage_path text,
    p_file_name text,
    p_mime_type text,
    p_size_bytes bigint,
    p_alt_text text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
    v_media public.company_product_media%rowtype;
begin
    if not public.company_price_book_can_manage(p_company_id) then raise exception 'Catalog management access is required.'; end if;
    if p_kind not in ('photo', 'manual', 'warranty', 'specification', 'document') then raise exception 'Unsupported catalog file type.'; end if;
    if not exists (select 1 from public.company_approved_products where id = p_product_id and company_id = p_company_id) then raise exception 'Catalog card was not found.'; end if;
    if p_storage_path not like 'companies/' || p_company_id::text || '/catalog/' || p_product_id::text || '/%' then raise exception 'Catalog file path is invalid.'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'company-product-catalog' and name = p_storage_path) then raise exception 'Uploaded catalog file was not found.'; end if;
    insert into public.company_product_media(
        id, company_id, product_id, media_kind, bucket, storage_path,
        file_name, mime_type, size_bytes, alt_text, active, created_by_user_id
    ) values (
        p_file_id, p_company_id, p_product_id, p_kind, 'company-product-catalog', p_storage_path,
        left(btrim(p_file_name), 180), nullif(btrim(p_mime_type), ''), p_size_bytes,
        nullif(btrim(coalesce(p_alt_text, '')), ''), true, auth.uid()
    ) returning * into v_media;
    if p_kind = 'photo' then
        update public.company_approved_products
        set main_product_media_id = coalesce(main_product_media_id, v_media.id), updated_at = now()
        where id = p_product_id and company_id = p_company_id;
    end if;
    return to_jsonb(v_media);
end;
$$;

revoke all on function public.record_company_product_catalog_file(uuid, uuid, uuid, text, text, text, text, bigint, text) from public, anon;
grant execute on function public.record_company_product_catalog_file(uuid, uuid, uuid, text, text, text, text, bigint, text) to authenticated;

create or replace function public.get_company_job_selected_catalog_product(p_workflow_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_workflow public.company_job_workflows%rowtype;
    v_product_id uuid;
begin
    select * into v_workflow from public.company_job_workflows where id = p_workflow_id;
    if not found or not public.company_estimate_options_can_use(v_workflow.company_id) then raise exception 'Job workflow is unavailable.'; end if;
    begin
        select nullif(option_value->'productIds'->>0, '')::uuid
        into v_product_id
        from jsonb_array_elements(
            case
                when jsonb_typeof(v_workflow.selected_options_snapshot) = 'array' then v_workflow.selected_options_snapshot
                when v_workflow.selected_option_snapshot is not null then jsonb_build_array(v_workflow.selected_option_snapshot)
                else '[]'::jsonb
            end
        ) option(option_value)
        where jsonb_array_length(coalesce(option_value->'productIds', '[]'::jsonb)) > 0
        limit 1;
    exception when invalid_text_representation then
        v_product_id := null;
    end;
    if v_product_id is null then return null; end if;
    return (
        select catalog_row
        from public.get_company_product_catalog(v_workflow.company_id) catalog_row
        where catalog_row->>'id' = v_product_id::text
        limit 1
    );
end;
$$;

revoke all on function public.get_company_job_selected_catalog_product(uuid) from public, anon;
grant execute on function public.get_company_job_selected_catalog_product(uuid) to authenticated;

create or replace function public.sync_company_job_homeos_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_result jsonb;
    v_catalog jsonb;
    v_catalog_id uuid;
    v_completed_item_id uuid;
begin
    if new.status = 'work_complete' and old.status is distinct from new.status and new.home_item_id is not null then
        v_result := public.apply_company_job_homeos_closeout(new.id);
        v_catalog := public.get_company_job_selected_catalog_product(new.id);
        begin
            v_catalog_id := nullif(v_catalog->>'id', '')::uuid;
            v_completed_item_id := nullif(v_result->>'home_item_id', '')::uuid;
        exception when invalid_text_representation then
            v_catalog_id := null;
            v_completed_item_id := null;
        end;
        if v_catalog_id is not null and v_completed_item_id is not null then
            update public.home_items set catalog_product_id = v_catalog_id where id = v_completed_item_id;
            update public.home_item_service_history set catalog_product_id = v_catalog_id where workflow_id = new.id and home_item_id = v_completed_item_id;
        end if;
    end if;

    if new.completion_accepted_at is distinct from old.completion_accepted_at and new.completion_accepted_at is not null then
        update public.home_item_service_history
        set completion_homeowner_name = new.completion_homeowner_name,
            completion_accepted_at = new.completion_accepted_at,
            customer_signature_recorded = new.completion_homeowner_signature is not null,
            updated_at = now()
        where workflow_id = new.id;
    end if;

    if new.invoice_sent_at is distinct from old.invoice_sent_at and new.invoice_sent_at is not null then
        update public.home_item_service_history
        set invoice_reference = coalesce(invoice_reference, new.id::text), updated_at = now()
        where workflow_id = new.id;
    end if;
    return new;
end;
$$;

commit;
