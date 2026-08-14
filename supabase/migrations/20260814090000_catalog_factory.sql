-- Catalog Factory: platform-owned product facts, draft import/review, append-only
-- retail observations, company-specific offerings, and HomeOS master references.

begin;

do $$
begin
    if to_regprocedure('public.homeos_is_platform_admin()') is null
       or to_regclass('public.companies') is null
       or to_regclass('public.company_approved_products') is null
       or to_regclass('public.home_items') is null then
        raise exception 'Catalog Factory requires platform administration, companies, the company catalog, and HomeOS items.';
    end if;
end;
$$;

create table if not exists public.catalog_category_templates (
    id uuid primary key default gen_random_uuid(),
    template_key text not null,
    category_name text not null,
    description text,
    universal_fields jsonb not null default '[]'::jsonb,
    specification_fields jsonb not null default '[]'::jsonb,
    required_fields jsonb not null default '[]'::jsonb,
    status text not null default 'draft',
    version integer not null default 1,
    created_by_user_id uuid references auth.users(id) on delete set null,
    updated_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint catalog_category_templates_key_present check (btrim(template_key) <> ''),
    constraint catalog_category_templates_name_present check (btrim(category_name) <> ''),
    constraint catalog_category_templates_status_check check (status in ('draft','needs_review','approved','rejected','archived')),
    constraint catalog_category_templates_fields_check check (
        jsonb_typeof(universal_fields) = 'array'
        and jsonb_typeof(specification_fields) = 'array'
        and jsonb_typeof(required_fields) = 'array'
    )
);

create unique index if not exists catalog_category_templates_key_active_uidx
    on public.catalog_category_templates(lower(btrim(template_key)))
    where status <> 'archived';

create table if not exists public.catalog_product_families (
    id uuid primary key default gen_random_uuid(),
    category_template_id uuid not null references public.catalog_category_templates(id) on delete restrict,
    manufacturer text not null,
    brand text not null,
    family_name text not null,
    description text,
    shared_product_data jsonb not null default '{}'::jsonb,
    status text not null default 'draft',
    confidence numeric(4,3),
    approved_at timestamptz,
    approved_by_user_id uuid references auth.users(id) on delete set null,
    created_by_user_id uuid references auth.users(id) on delete set null,
    updated_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint catalog_product_families_names_present check (
        btrim(manufacturer) <> '' and btrim(brand) <> '' and btrim(family_name) <> ''
    ),
    constraint catalog_product_families_status_check check (status in ('draft','needs_review','approved','rejected','archived')),
    constraint catalog_product_families_shared_data_check check (jsonb_typeof(shared_product_data) = 'object'),
    constraint catalog_product_families_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists catalog_product_families_lookup_idx
    on public.catalog_product_families(category_template_id, lower(manufacturer), lower(brand), lower(family_name), status);

create table if not exists public.catalog_product_variants (
    id uuid primary key default gen_random_uuid(),
    product_family_id uuid not null references public.catalog_product_families(id) on delete restrict,
    manufacturer_snapshot text not null,
    model_number text not null,
    manufacturer_part_number text,
    upc_gtin text,
    color text,
    finish text,
    size text,
    capacity text,
    variant_name text,
    description text,
    specifications jsonb not null default '{}'::jsonb,
    status text not null default 'draft',
    confidence numeric(4,3),
    validation_warnings jsonb not null default '[]'::jsonb,
    duplicate_warnings jsonb not null default '[]'::jsonb,
    missing_fields jsonb not null default '[]'::jsonb,
    merged_into_variant_id uuid references public.catalog_product_variants(id) on delete set null,
    last_verified_at timestamptz,
    approved_at timestamptz,
    approved_by_user_id uuid references auth.users(id) on delete set null,
    created_by_user_id uuid references auth.users(id) on delete set null,
    updated_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint catalog_product_variants_model_present check (btrim(model_number) <> ''),
    constraint catalog_product_variants_manufacturer_present check (btrim(manufacturer_snapshot) <> ''),
    constraint catalog_product_variants_status_check check (status in ('draft','needs_review','approved','rejected','archived')),
    constraint catalog_product_variants_specifications_check check (jsonb_typeof(specifications) = 'object'),
    constraint catalog_product_variants_warning_shapes_check check (
        jsonb_typeof(validation_warnings) = 'array'
        and jsonb_typeof(duplicate_warnings) = 'array'
        and jsonb_typeof(missing_fields) = 'array'
    ),
    constraint catalog_product_variants_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists catalog_product_variants_review_idx
    on public.catalog_product_variants(status, updated_at desc);
create index if not exists catalog_product_variants_family_idx
    on public.catalog_product_variants(product_family_id, status);
create index if not exists catalog_product_variants_gtin_idx
    on public.catalog_product_variants(regexp_replace(lower(coalesce(upc_gtin,'')), '[^a-z0-9]', '', 'g'))
    where upc_gtin is not null;
create index if not exists catalog_product_variants_mpn_idx
    on public.catalog_product_variants(
        lower(btrim(manufacturer_snapshot)),
        regexp_replace(lower(coalesce(manufacturer_part_number,'')), '[^a-z0-9]', '', 'g')
    ) where manufacturer_part_number is not null;
create unique index if not exists catalog_product_variants_approved_gtin_uidx
    on public.catalog_product_variants(regexp_replace(lower(upc_gtin), '[^a-z0-9]', '', 'g'))
    where status = 'approved' and nullif(regexp_replace(lower(coalesce(upc_gtin,'')), '[^a-z0-9]', '', 'g'), '') is not null;
create unique index if not exists catalog_product_variants_approved_mpn_uidx
    on public.catalog_product_variants(
        lower(btrim(manufacturer_snapshot)),
        regexp_replace(lower(manufacturer_part_number), '[^a-z0-9]', '', 'g')
    ) where status = 'approved' and nullif(regexp_replace(lower(coalesce(manufacturer_part_number,'')), '[^a-z0-9]', '', 'g'), '') is not null;

create table if not exists public.catalog_retail_listings (
    id uuid primary key default gen_random_uuid(),
    product_variant_id uuid not null references public.catalog_product_variants(id) on delete restrict,
    retailer text not null,
    retailer_sku text,
    product_url text,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint catalog_retail_listings_retailer_present check (btrim(retailer) <> '')
);

create index if not exists catalog_retail_listings_variant_idx
    on public.catalog_retail_listings(product_variant_id, lower(retailer));

create table if not exists public.catalog_price_observations (
    id uuid primary key default gen_random_uuid(),
    retail_listing_id uuid not null references public.catalog_retail_listings(id) on delete restrict,
    regular_price numeric(12,2),
    sale_price numeric(12,2),
    currency text not null default 'USD',
    availability text,
    zip_code text,
    market text,
    observed_at timestamptz not null,
    imported_batch_id uuid,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint catalog_price_observations_price_check check (
        (regular_price is null or regular_price >= 0)
        and (sale_price is null or sale_price >= 0)
        and (regular_price is not null or sale_price is not null or availability is not null)
    )
);

create index if not exists catalog_price_observations_history_idx
    on public.catalog_price_observations(retail_listing_id, observed_at desc);

create table if not exists public.catalog_sources (
    id uuid primary key default gen_random_uuid(),
    product_family_id uuid references public.catalog_product_families(id) on delete restrict,
    product_variant_id uuid references public.catalog_product_variants(id) on delete restrict,
    source_type text not null,
    source_url text not null,
    title text,
    verified_at timestamptz,
    confidence numeric(4,3),
    notes text,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint catalog_sources_target_check check ((product_family_id is null) <> (product_variant_id is null)),
    constraint catalog_sources_type_check check (source_type in ('manufacturer_page','retailer_page','installation_manual','specification_sheet','warranty_document','other')),
    constraint catalog_sources_url_present check (btrim(source_url) <> ''),
    constraint catalog_sources_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists catalog_sources_variant_idx on public.catalog_sources(product_variant_id, source_type);
create index if not exists catalog_sources_family_idx on public.catalog_sources(product_family_id, source_type);

create table if not exists public.catalog_source_assets (
    id uuid primary key default gen_random_uuid(),
    product_variant_id uuid not null references public.catalog_product_variants(id) on delete restrict,
    source_id uuid references public.catalog_sources(id) on delete set null,
    asset_type text not null,
    source_url text not null,
    is_primary boolean not null default false,
    approved_for_copy boolean not null default false,
    copied_bucket text,
    copied_storage_path text,
    verified_at timestamptz,
    confidence numeric(4,3),
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint catalog_source_assets_type_check check (asset_type in ('image','installation_manual','specification_sheet','warranty_document','other')),
    constraint catalog_source_assets_url_present check (btrim(source_url) <> ''),
    constraint catalog_source_assets_confidence_check check (confidence is null or (confidence >= 0 and confidence <= 1)),
    constraint catalog_source_assets_copy_check check (
        (copied_bucket is null and copied_storage_path is null)
        or approved_for_copy
    )
);

create index if not exists catalog_source_assets_variant_idx
    on public.catalog_source_assets(product_variant_id, asset_type, is_primary desc);

create table if not exists public.catalog_import_batches (
    id uuid primary key default gen_random_uuid(),
    file_name text,
    import_format text not null,
    original_data text not null,
    status text not null default 'draft',
    total_rows integer not null default 0,
    created_count integer not null default 0,
    duplicate_count integer not null default 0,
    warning_count integer not null default 0,
    failed_count integer not null default 0,
    summary jsonb not null default '{}'::jsonb,
    created_by_user_id uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    constraint catalog_import_batches_format_check check (import_format in ('json','csv')),
    constraint catalog_import_batches_status_check check (status in ('draft','needs_review','approved','rejected','archived')),
    constraint catalog_import_batches_original_present check (char_length(original_data) > 0),
    constraint catalog_import_batches_summary_check check (jsonb_typeof(summary) = 'object')
);

alter table public.catalog_price_observations
    drop constraint if exists catalog_price_observations_imported_batch_id_fkey;
alter table public.catalog_price_observations
    add constraint catalog_price_observations_imported_batch_id_fkey
    foreign key (imported_batch_id) references public.catalog_import_batches(id) on delete set null;

create table if not exists public.catalog_import_rows (
    id uuid primary key default gen_random_uuid(),
    import_batch_id uuid not null references public.catalog_import_batches(id) on delete restrict,
    row_number integer not null,
    original_row jsonb not null,
    normalized_row jsonb,
    outcome text not null,
    validation_errors jsonb not null default '[]'::jsonb,
    warnings jsonb not null default '[]'::jsonb,
    duplicate_variant_ids uuid[] not null default array[]::uuid[],
    created_family_id uuid references public.catalog_product_families(id) on delete set null,
    created_variant_id uuid references public.catalog_product_variants(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint catalog_import_rows_outcome_check check (outcome in ('created','duplicate','warning','failed')),
    constraint catalog_import_rows_json_check check (
        jsonb_typeof(original_row) = 'object'
        and (normalized_row is null or jsonb_typeof(normalized_row) = 'object')
        and jsonb_typeof(validation_errors) = 'array'
        and jsonb_typeof(warnings) = 'array'
    ),
    unique(import_batch_id, row_number)
);

create index if not exists catalog_import_rows_batch_idx
    on public.catalog_import_rows(import_batch_id, row_number);

create table if not exists public.company_catalog_offerings (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    product_variant_id uuid not null references public.catalog_product_variants(id) on delete restrict,
    company_catalog_product_id uuid references public.company_approved_products(id) on delete set null,
    material_cost numeric(12,2),
    markup numeric(12,2),
    labor_amount numeric(12,2),
    installed_price numeric(12,2),
    preferred_supplier text,
    company_warranty text,
    active boolean not null default true,
    created_by_user_id uuid references auth.users(id) on delete set null,
    updated_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_catalog_offerings_prices_check check (
        (material_cost is null or material_cost >= 0)
        and (markup is null or markup >= 0)
        and (labor_amount is null or labor_amount >= 0)
        and (installed_price is null or installed_price >= 0)
    ),
    unique(company_id, product_variant_id)
);

create index if not exists company_catalog_offerings_company_idx
    on public.company_catalog_offerings(company_id, active, updated_at desc);

alter table public.company_approved_products
    add column if not exists master_product_variant_id uuid references public.catalog_product_variants(id) on delete set null;
alter table public.home_items
    add column if not exists master_product_variant_id uuid references public.catalog_product_variants(id) on delete set null;
alter table public.home_item_service_history
    add column if not exists master_product_variant_id uuid references public.catalog_product_variants(id) on delete set null;

create index if not exists company_approved_products_master_variant_idx
    on public.company_approved_products(master_product_variant_id) where master_product_variant_id is not null;
create index if not exists home_items_master_variant_idx
    on public.home_items(master_product_variant_id) where master_product_variant_id is not null;

alter table public.catalog_category_templates enable row level security;
alter table public.catalog_product_families enable row level security;
alter table public.catalog_product_variants enable row level security;
alter table public.catalog_retail_listings enable row level security;
alter table public.catalog_price_observations enable row level security;
alter table public.catalog_sources enable row level security;
alter table public.catalog_source_assets enable row level security;
alter table public.catalog_import_batches enable row level security;
alter table public.catalog_import_rows enable row level security;
alter table public.company_catalog_offerings enable row level security;

create policy catalog_category_templates_admin_read on public.catalog_category_templates
for select to authenticated using (public.homeos_is_platform_admin());
create policy catalog_product_families_read on public.catalog_product_families
for select to authenticated using (public.homeos_is_platform_admin() or status = 'approved');
create policy catalog_product_variants_read on public.catalog_product_variants
for select to authenticated using (public.homeos_is_platform_admin() or status = 'approved');
create policy catalog_retail_listings_read on public.catalog_retail_listings
for select to authenticated using (
    public.homeos_is_platform_admin()
    or exists (select 1 from public.catalog_product_variants v where v.id = product_variant_id and v.status = 'approved')
);
create policy catalog_price_observations_read on public.catalog_price_observations
for select to authenticated using (
    public.homeos_is_platform_admin()
    or exists (
        select 1 from public.catalog_retail_listings l
        join public.catalog_product_variants v on v.id = l.product_variant_id
        where l.id = retail_listing_id and v.status = 'approved'
    )
);
create policy catalog_sources_read on public.catalog_sources
for select to authenticated using (
    public.homeos_is_platform_admin()
    or exists (select 1 from public.catalog_product_variants v where v.id = product_variant_id and v.status = 'approved')
    or exists (select 1 from public.catalog_product_families f where f.id = product_family_id and f.status = 'approved')
);
create policy catalog_source_assets_read on public.catalog_source_assets
for select to authenticated using (
    public.homeos_is_platform_admin()
    or exists (select 1 from public.catalog_product_variants v where v.id = product_variant_id and v.status = 'approved')
);
create policy catalog_import_batches_admin_read on public.catalog_import_batches
for select to authenticated using (public.homeos_is_platform_admin());
create policy catalog_import_rows_admin_read on public.catalog_import_rows
for select to authenticated using (public.homeos_is_platform_admin());
create policy company_catalog_offerings_company_read on public.company_catalog_offerings
for select to authenticated using (
    public.homeos_is_platform_admin() or public.company_price_book_can_view(company_id)
);

create or replace function public.catalog_factory_require_admin()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null or not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Platform Administration access is required.';
    end if;
end;
$$;

revoke all on function public.catalog_factory_require_admin() from public, anon;
grant execute on function public.catalog_factory_require_admin() to authenticated;

create or replace function public.catalog_normalize_identifier(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select nullif(regexp_replace(lower(coalesce(p_value,'')), '[^a-z0-9]', '', 'g'), '')
$$;

revoke all on function public.catalog_normalize_identifier(text) from public, anon;
grant execute on function public.catalog_normalize_identifier(text) to authenticated;

create or replace function public.get_catalog_template(p_category text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_result jsonb;
begin
    perform public.catalog_factory_require_admin();
    select coalesce(jsonb_agg(to_jsonb(t) order by t.category_name), '[]'::jsonb)
    into v_result
    from public.catalog_category_templates t
    where t.status <> 'archived'
      and (nullif(btrim(coalesce(p_category,'')), '') is null
           or lower(t.template_key) = lower(btrim(p_category))
           or lower(t.category_name) = lower(btrim(p_category)));
    return v_result;
end;
$$;

revoke all on function public.get_catalog_template(text) from public, anon;
grant execute on function public.get_catalog_template(text) to authenticated;

create or replace function public.save_catalog_template(p_template_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_row public.catalog_category_templates%rowtype;
begin
    perform public.catalog_factory_require_admin();
    if jsonb_typeof(p_payload) <> 'object' then raise exception 'Template details are required.'; end if;
    if nullif(btrim(coalesce(p_payload->>'template_key','')), '') is null
       or nullif(btrim(coalesce(p_payload->>'category_name','')), '') is null then
        raise exception 'Template key and category name are required.';
    end if;
    if jsonb_typeof(coalesce(p_payload->'universal_fields','[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p_payload->'specification_fields','[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p_payload->'required_fields','[]'::jsonb)) <> 'array' then
        raise exception 'Template field definitions must be arrays.';
    end if;
    insert into public.catalog_category_templates(
        id, template_key, category_name, description, universal_fields,
        specification_fields, required_fields, status, created_by_user_id,
        updated_by_user_id, updated_at
    ) values (
        coalesce(p_template_id, gen_random_uuid()), lower(regexp_replace(btrim(p_payload->>'template_key'), '\\s+', '_', 'g')),
        btrim(p_payload->>'category_name'), nullif(btrim(coalesce(p_payload->>'description','')), ''),
        coalesce(p_payload->'universal_fields','[]'::jsonb), coalesce(p_payload->'specification_fields','[]'::jsonb),
        coalesce(p_payload->'required_fields','[]'::jsonb),
        case when p_payload->>'status' in ('draft','needs_review','approved','rejected','archived') then p_payload->>'status' else 'draft' end,
        auth.uid(), auth.uid(), now()
    )
    on conflict (id) do update set
        template_key = excluded.template_key,
        category_name = excluded.category_name,
        description = excluded.description,
        universal_fields = excluded.universal_fields,
        specification_fields = excluded.specification_fields,
        required_fields = excluded.required_fields,
        status = excluded.status,
        version = catalog_category_templates.version + 1,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    returning * into v_row;
    return to_jsonb(v_row);
end;
$$;

revoke all on function public.save_catalog_template(uuid, jsonb) from public, anon;
grant execute on function public.save_catalog_template(uuid, jsonb) to authenticated;

create or replace function public.search_existing_products(p_query jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_upc text := public.catalog_normalize_identifier(p_query->>'upc_gtin');
    v_mpn text := public.catalog_normalize_identifier(p_query->>'manufacturer_part_number');
    v_manufacturer text := lower(btrim(coalesce(p_query->>'manufacturer','')));
    v_text text := lower(btrim(coalesce(p_query->>'query','')));
    v_result jsonb;
begin
    perform public.catalog_factory_require_admin();
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'status', v.status, 'manufacturer', f.manufacturer,
        'brand', f.brand, 'family_name', f.family_name, 'model_number', v.model_number,
        'manufacturer_part_number', v.manufacturer_part_number, 'upc_gtin', v.upc_gtin,
        'match_reason', case
            when v_upc is not null and public.catalog_normalize_identifier(v.upc_gtin) = v_upc then 'UPC/GTIN'
            when v_mpn is not null and lower(btrim(v.manufacturer_snapshot)) = v_manufacturer
                 and public.catalog_normalize_identifier(v.manufacturer_part_number) = v_mpn then 'Manufacturer + part number'
            else 'Text similarity'
        end
    ) order by v.updated_at desc), '[]'::jsonb)
    into v_result
    from public.catalog_product_variants v
    join public.catalog_product_families f on f.id = v.product_family_id
    where v.status <> 'archived'
      and (
        (v_upc is not null and public.catalog_normalize_identifier(v.upc_gtin) = v_upc)
        or (v_mpn is not null and lower(btrim(v.manufacturer_snapshot)) = v_manufacturer
            and public.catalog_normalize_identifier(v.manufacturer_part_number) = v_mpn)
        or (v_text <> '' and lower(concat_ws(' ', f.manufacturer, f.brand, f.family_name, v.model_number, v.manufacturer_part_number)) like '%' || v_text || '%')
      );
    return v_result;
end;
$$;

revoke all on function public.search_existing_products(jsonb) from public, anon;
grant execute on function public.search_existing_products(jsonb) to authenticated;

create or replace function public.attach_catalog_sources(p_variant_id uuid, p_sources jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_source jsonb; v_source_id uuid; v_count integer := 0; v_type text;
begin
    perform public.catalog_factory_require_admin();
    if not exists (
        select 1 from public.catalog_product_variants
        where id = p_variant_id and status in ('draft','needs_review')
    ) then raise exception 'Sources may only be attached to draft products.'; end if;
    if jsonb_typeof(coalesce(p_sources,'[]'::jsonb)) <> 'array' then raise exception 'Sources must be an array.'; end if;
    for v_source in select value from jsonb_array_elements(coalesce(p_sources,'[]'::jsonb)) loop
        if nullif(btrim(coalesce(v_source->>'url','')), '') is null then continue; end if;
        v_type := case v_source->>'type'
            when 'manufacturer_page' then 'manufacturer_page'
            when 'retailer_page' then 'retailer_page'
            when 'installation_manual' then 'installation_manual'
            when 'specification_sheet' then 'specification_sheet'
            when 'warranty_document' then 'warranty_document'
            else 'other' end;
        insert into public.catalog_sources(
            product_variant_id, source_type, source_url, title, verified_at,
            confidence, notes, created_by_user_id
        ) values (
            p_variant_id, v_type, btrim(v_source->>'url'), nullif(btrim(coalesce(v_source->>'title','')), ''),
            nullif(v_source->>'verified_at','')::timestamptz,
            case when nullif(v_source->>'confidence','') is null then null else greatest(0, least(1, (v_source->>'confidence')::numeric)) end,
            nullif(btrim(coalesce(v_source->>'notes','')), ''), auth.uid()
        ) returning id into v_source_id;
        if v_type in ('installation_manual','specification_sheet','warranty_document') then
            insert into public.catalog_source_assets(
                product_variant_id, source_id, asset_type, source_url, verified_at, confidence, created_by_user_id
            ) values (
                p_variant_id, v_source_id, v_type, btrim(v_source->>'url'),
                nullif(v_source->>'verified_at','')::timestamptz,
                case when nullif(v_source->>'confidence','') is null then null else greatest(0, least(1, (v_source->>'confidence')::numeric)) end,
                auth.uid()
            );
        end if;
        v_count := v_count + 1;
    end loop;
    return jsonb_build_object('variant_id', p_variant_id, 'attached_count', v_count);
end;
$$;

revoke all on function public.attach_catalog_sources(uuid, jsonb) from public, anon;
grant execute on function public.attach_catalog_sources(uuid, jsonb) to authenticated;

create or replace function public.create_catalog_drafts(
    p_import_rows jsonb,
    p_file_name text default null,
    p_format text default 'json',
    p_original_data text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_batch_id uuid;
    v_row jsonb;
    v_row_number integer := 0;
    v_template public.catalog_category_templates%rowtype;
    v_family_id uuid;
    v_variant_id uuid;
    v_errors jsonb;
    v_warnings jsonb;
    v_duplicates uuid[];
    v_required jsonb;
    v_field text;
    v_created integer := 0;
    v_duplicate integer := 0;
    v_warning integer := 0;
    v_failed integer := 0;
    v_manufacturer text;
    v_brand text;
    v_family text;
    v_model text;
    v_mpn text;
    v_gtin text;
    v_specs jsonb;
    v_listing jsonb;
    v_listing_id uuid;
    v_source jsonb;
    v_source_payload jsonb;
    v_image text;
begin
    perform public.catalog_factory_require_admin();
    if p_format not in ('json','csv') then raise exception 'Import format must be JSON or CSV.'; end if;
    if jsonb_typeof(p_import_rows) <> 'array' then raise exception 'Import rows must be an array.'; end if;
    insert into public.catalog_import_batches(
        file_name, import_format, original_data, status, total_rows, created_by_user_id
    ) values (
        nullif(btrim(coalesce(p_file_name,'')), ''), p_format,
        coalesce(nullif(p_original_data,''), p_import_rows::text), 'draft',
        jsonb_array_length(p_import_rows), auth.uid()
    ) returning id into v_batch_id;

    for v_row in select value from jsonb_array_elements(p_import_rows) loop
      begin
        v_row_number := v_row_number + 1;
        v_errors := '[]'::jsonb;
        v_warnings := '[]'::jsonb;
        v_duplicates := array[]::uuid[];
        if jsonb_typeof(v_row) <> 'object' then
            v_errors := jsonb_build_array('Row must be an object.');
        else
            v_manufacturer := nullif(btrim(coalesce(v_row->>'manufacturer','')), '');
            v_brand := nullif(btrim(coalesce(v_row->>'brand','')), '');
            v_family := nullif(btrim(coalesce(v_row->>'family_name', v_row->>'family','')), '');
            v_model := nullif(btrim(coalesce(v_row->>'model_number', v_row->>'model','')), '');
            v_mpn := nullif(btrim(coalesce(v_row->>'manufacturer_part_number', v_row->>'mpn','')), '');
            v_gtin := nullif(btrim(coalesce(v_row->>'upc_gtin', v_row->>'upc','')), '');
            v_specs := coalesce(v_row->'specifications','{}'::jsonb);
            select * into v_template
            from public.catalog_category_templates t
            where t.status = 'approved'
              and (lower(t.template_key) = lower(btrim(coalesce(v_row->>'category','')))
                   or lower(t.category_name) = lower(btrim(coalesce(v_row->>'category',''))))
            limit 1;
            if nullif(btrim(coalesce(v_row->>'category','')), '') is null then v_errors := v_errors || '"Category is required."'::jsonb;
            elsif v_template.id is null then v_errors := v_errors || '"An approved category template is required."'::jsonb; end if;
            if v_manufacturer is null then v_errors := v_errors || '"Manufacturer is required."'::jsonb; end if;
            if v_brand is null then v_errors := v_errors || '"Brand is required."'::jsonb; end if;
            if v_family is null then v_errors := v_errors || '"Family name is required."'::jsonb; end if;
            if v_model is null then v_errors := v_errors || '"Exact model number is required."'::jsonb; end if;
            if jsonb_typeof(v_specs) <> 'object' then v_errors := v_errors || '"Specifications must be an object."'::jsonb; v_specs := '{}'::jsonb; end if;
            if v_template.id is not null then
                for v_required in select value from jsonb_array_elements(v_template.required_fields) loop
                    v_field := case when jsonb_typeof(v_required) = 'string' then trim(both '"' from v_required::text) else v_required->>'key' end;
                    if nullif(v_field,'') is not null
                       and nullif(btrim(coalesce(v_row->>v_field, v_specs->>v_field, '')), '') is null then
                        v_errors := v_errors || jsonb_build_array('Missing required field: ' || v_field);
                    end if;
                end loop;
            end if;
            select coalesce(array_agg(v.id), array[]::uuid[]) into v_duplicates
            from public.catalog_product_variants v
            where v.status <> 'archived'
              and (
                (public.catalog_normalize_identifier(v_gtin) is not null
                 and public.catalog_normalize_identifier(v.upc_gtin) = public.catalog_normalize_identifier(v_gtin))
                or (public.catalog_normalize_identifier(v_mpn) is not null
                    and lower(btrim(v.manufacturer_snapshot)) = lower(v_manufacturer)
                    and public.catalog_normalize_identifier(v.manufacturer_part_number) = public.catalog_normalize_identifier(v_mpn))
              );
        end if;

        if jsonb_array_length(v_errors) > 0 then
            insert into public.catalog_import_rows(import_batch_id,row_number,original_row,normalized_row,outcome,validation_errors,warnings)
            values(v_batch_id,v_row_number,case when jsonb_typeof(v_row)='object' then v_row else jsonb_build_object('value',v_row) end,null,'failed',v_errors,v_warnings);
            v_failed := v_failed + 1;
            continue;
        end if;
        if cardinality(v_duplicates) > 0 then
            insert into public.catalog_import_rows(import_batch_id,row_number,original_row,normalized_row,outcome,validation_errors,warnings,duplicate_variant_ids)
            values(v_batch_id,v_row_number,v_row,v_row,'duplicate','[]'::jsonb,jsonb_build_array('Exact duplicate candidate found.'),v_duplicates);
            v_duplicate := v_duplicate + 1;
            continue;
        end if;

        select f.id into v_family_id
        from public.catalog_product_families f
        where f.category_template_id = v_template.id
          and lower(btrim(f.manufacturer)) = lower(v_manufacturer)
          and lower(btrim(f.brand)) = lower(v_brand)
          and lower(btrim(f.family_name)) = lower(v_family)
          and f.status <> 'archived'
        order by case f.status when 'approved' then 0 else 1 end, f.created_at
        limit 1;
        if v_family_id is null then
            insert into public.catalog_product_families(
                category_template_id,manufacturer,brand,family_name,description,shared_product_data,
                status,confidence,created_by_user_id,updated_by_user_id
            ) values(
                v_template.id,v_manufacturer,v_brand,v_family,nullif(btrim(coalesce(v_row->>'family_description',v_row->>'description','')),''),
                coalesce(v_row->'shared_product_data','{}'::jsonb),'draft',
                case when nullif(v_row->>'confidence','') is null then null else greatest(0,least(1,(v_row->>'confidence')::numeric)) end,
                auth.uid(),auth.uid()
            ) returning id into v_family_id;
        end if;
        v_warnings := case when v_gtin is null and v_mpn is null
            then jsonb_build_array('UPC/GTIN and manufacturer part number are both missing.') else '[]'::jsonb end;
        insert into public.catalog_product_variants(
            product_family_id,manufacturer_snapshot,model_number,manufacturer_part_number,upc_gtin,
            color,finish,size,capacity,variant_name,description,specifications,status,confidence,
            validation_warnings,duplicate_warnings,missing_fields,last_verified_at,created_by_user_id,updated_by_user_id
        ) values(
            v_family_id,v_manufacturer,v_model,v_mpn,v_gtin,nullif(btrim(coalesce(v_row->>'color','')),''),
            nullif(btrim(coalesce(v_row->>'finish','')),''),nullif(btrim(coalesce(v_row->>'size','')),''),
            nullif(btrim(coalesce(v_row->>'capacity','')),''),nullif(btrim(coalesce(v_row->>'variant_name','')),''),
            nullif(btrim(coalesce(v_row->>'description','')),''),v_specs,'draft',
            case when nullif(v_row->>'confidence','') is null then null else greatest(0,least(1,(v_row->>'confidence')::numeric)) end,
            v_warnings,'[]'::jsonb,'[]'::jsonb,nullif(v_row->>'verified_at','')::timestamptz,auth.uid(),auth.uid()
        ) returning id into v_variant_id;

        v_source_payload := coalesce(v_row->'sources','[]'::jsonb);
        if jsonb_typeof(v_source_payload) = 'array' then perform public.attach_catalog_sources(v_variant_id,v_source_payload); end if;
        if nullif(btrim(coalesce(v_row->>'primary_image_url','')), '') is not null then
            insert into public.catalog_source_assets(product_variant_id,asset_type,source_url,is_primary,verified_at,confidence,created_by_user_id)
            values(v_variant_id,'image',btrim(v_row->>'primary_image_url'),true,nullif(v_row->>'verified_at','')::timestamptz,
                case when nullif(v_row->>'confidence','') is null then null else greatest(0,least(1,(v_row->>'confidence')::numeric)) end,auth.uid());
        end if;
        if jsonb_typeof(coalesce(v_row->'additional_image_urls','[]'::jsonb)) = 'array' then
            for v_image in select jsonb_array_elements_text(coalesce(v_row->'additional_image_urls','[]'::jsonb)) loop
                if nullif(btrim(v_image),'') is not null then
                    insert into public.catalog_source_assets(product_variant_id,asset_type,source_url,is_primary,verified_at,confidence,created_by_user_id)
                    values(v_variant_id,'image',btrim(v_image),false,nullif(v_row->>'verified_at','')::timestamptz,
                        case when nullif(v_row->>'confidence','') is null then null else greatest(0,least(1,(v_row->>'confidence')::numeric)) end,auth.uid());
                end if;
            end loop;
        end if;
        if jsonb_typeof(coalesce(v_row->'retail_listings','[]'::jsonb)) = 'array' then
            for v_listing in select value from jsonb_array_elements(coalesce(v_row->'retail_listings','[]'::jsonb)) loop
                if nullif(btrim(coalesce(v_listing->>'retailer','')), '') is null then continue; end if;
                select l.id into v_listing_id from public.catalog_retail_listings l
                where l.product_variant_id=v_variant_id and lower(l.retailer)=lower(btrim(v_listing->>'retailer'))
                  and coalesce(l.retailer_sku,'')=coalesce(nullif(btrim(coalesce(v_listing->>'retailer_sku','')),''),'')
                  and coalesce(l.product_url,'')=coalesce(nullif(btrim(coalesce(v_listing->>'product_url','')),''),'') limit 1;
                if v_listing_id is null then
                    insert into public.catalog_retail_listings(product_variant_id,retailer,retailer_sku,product_url,created_by_user_id)
                    values(v_variant_id,btrim(v_listing->>'retailer'),nullif(btrim(coalesce(v_listing->>'retailer_sku','')),''),
                        nullif(btrim(coalesce(v_listing->>'product_url','')),''),auth.uid()) returning id into v_listing_id;
                end if;
                if nullif(v_listing->>'regular_price','') is not null or nullif(v_listing->>'sale_price','') is not null or nullif(v_listing->>'availability','') is not null then
                    insert into public.catalog_price_observations(
                        retail_listing_id,regular_price,sale_price,availability,zip_code,market,observed_at,imported_batch_id,created_by_user_id
                    ) values(
                        v_listing_id,nullif(v_listing->>'regular_price','')::numeric,nullif(v_listing->>'sale_price','')::numeric,
                        nullif(btrim(coalesce(v_listing->>'availability','')),''),nullif(btrim(coalesce(v_listing->>'zip_code','')),''),
                        nullif(btrim(coalesce(v_listing->>'market','')),''),coalesce(nullif(v_listing->>'observed_at','')::timestamptz,now()),v_batch_id,auth.uid()
                    );
                end if;
            end loop;
        end if;
        insert into public.catalog_import_rows(
            import_batch_id,row_number,original_row,normalized_row,outcome,validation_errors,warnings,created_family_id,created_variant_id
        ) values(
            v_batch_id,v_row_number,v_row,v_row,case when jsonb_array_length(v_warnings)>0 then 'warning' else 'created' end,
            '[]'::jsonb,v_warnings,v_family_id,v_variant_id
        );
        v_created := v_created + 1;
        if jsonb_array_length(v_warnings)>0 then v_warning := v_warning + 1; end if;
      exception when others then
        insert into public.catalog_import_rows(
            import_batch_id,row_number,original_row,normalized_row,outcome,validation_errors,warnings
        ) values(
            v_batch_id,v_row_number,
            case when jsonb_typeof(v_row)='object' then v_row else jsonb_build_object('value',v_row) end,
            null,'failed',jsonb_build_array(sqlerrm),'[]'::jsonb
        ) on conflict(import_batch_id,row_number) do update set
            outcome='failed',validation_errors=excluded.validation_errors;
        v_failed := v_failed + 1;
      end;
    end loop;

    update public.catalog_import_batches set
        status='needs_review',created_count=v_created,duplicate_count=v_duplicate,warning_count=v_warning,failed_count=v_failed,
        summary=jsonb_build_object('created',v_created,'duplicate',v_duplicate,'warning',v_warning,'failed',v_failed),completed_at=now()
    where id=v_batch_id;
    return jsonb_build_object('batch_id',v_batch_id,'total',v_row_number,'created',v_created,'duplicate',v_duplicate,'warning',v_warning,'failed',v_failed);
end;
$$;

revoke all on function public.create_catalog_drafts(jsonb,text,text,text) from public, anon;
grant execute on function public.create_catalog_drafts(jsonb,text,text,text) to authenticated;

create or replace function public.get_catalog_factory_records(p_filters jsonb default '{}'::jsonb)
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
        'templates', coalesce((select jsonb_agg(to_jsonb(t) order by t.category_name) from public.catalog_category_templates t where t.status <> 'archived'),'[]'::jsonb),
        'records', coalesce((
            select jsonb_agg(record order by record->>'manufacturer',record->>'brand',record->>'model_number')
            from (
                select jsonb_build_object(
                    'id',v.id,'status',v.status,'manufacturer',f.manufacturer,'brand',f.brand,'family_name',f.family_name,
                    'family_id',f.id,'category',t.category_name,'template_id',t.id,'model_number',v.model_number,
                    'manufacturer_part_number',v.manufacturer_part_number,'upc_gtin',v.upc_gtin,'color',v.color,'finish',v.finish,
                    'size',v.size,'capacity',v.capacity,'description',coalesce(v.description,f.description),'specifications',v.specifications,
                    'confidence',v.confidence,'validation_warnings',v.validation_warnings,'duplicate_warnings',v.duplicate_warnings,
                    'missing_fields',v.missing_fields,'last_verified_at',v.last_verified_at,'updated_at',v.updated_at,
                    'primary_image_url',(select a.source_url from public.catalog_source_assets a where a.product_variant_id=v.id and a.asset_type='image' order by a.is_primary desc,a.created_at limit 1),
                    'assets',coalesce((select jsonb_agg(to_jsonb(a) order by a.is_primary desc,a.created_at) from public.catalog_source_assets a where a.product_variant_id=v.id),'[]'::jsonb),
                    'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.source_type,s.created_at) from public.catalog_sources s where s.product_variant_id=v.id),'[]'::jsonb),
                    'retail_listings',coalesce((select jsonb_agg(jsonb_build_object(
                        'id',l.id,'retailer',l.retailer,'retailer_sku',l.retailer_sku,'product_url',l.product_url,
                        'observations',coalesce((select jsonb_agg(to_jsonb(o) order by o.observed_at desc) from public.catalog_price_observations o where o.retail_listing_id=l.id),'[]'::jsonb)
                    ) order by l.retailer) from public.catalog_retail_listings l where l.product_variant_id=v.id),'[]'::jsonb)
                ) record
                from public.catalog_product_variants v
                join public.catalog_product_families f on f.id=v.product_family_id
                join public.catalog_category_templates t on t.id=f.category_template_id
                where (nullif(p_filters->>'category','') is null or lower(t.category_name)=lower(p_filters->>'category'))
                  and (nullif(p_filters->>'manufacturer','') is null or lower(f.manufacturer) like '%'||lower(p_filters->>'manufacturer')||'%')
                  and (nullif(p_filters->>'brand','') is null or lower(f.brand) like '%'||lower(p_filters->>'brand')||'%')
                  and (nullif(p_filters->>'status','') is null or v.status=p_filters->>'status')
                  and (coalesce((p_filters->>'missing')::boolean,false)=false or jsonb_array_length(v.missing_fields)+jsonb_array_length(v.validation_warnings)>0)
                  and (coalesce((p_filters->>'duplicates')::boolean,false)=false or jsonb_array_length(v.duplicate_warnings)>0)
                  and (nullif(p_filters->>'last_verified_before','') is null or v.last_verified_at < (p_filters->>'last_verified_before')::timestamptz or v.last_verified_at is null)
                  and (nullif(p_filters->>'retailer','') is null or exists(select 1 from public.catalog_retail_listings rl where rl.product_variant_id=v.id and lower(rl.retailer) like '%'||lower(p_filters->>'retailer')||'%'))
            ) records
        ),'[]'::jsonb),
        'imports',coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at desc) from (select * from public.catalog_import_batches order by created_at desc limit 20) b),'[]'::jsonb)
    ) into v_result;
    return v_result;
end;
$$;

revoke all on function public.get_catalog_factory_records(jsonb) from public, anon;
grant execute on function public.get_catalog_factory_records(jsonb) to authenticated;

create or replace function public.review_catalog_draft(
    p_variant_id uuid,
    p_action text,
    p_payload jsonb default '{}'::jsonb,
    p_merge_target_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_row public.catalog_product_variants%rowtype; v_target public.catalog_product_variants%rowtype;
begin
    perform public.catalog_factory_require_admin();
    select * into v_row from public.catalog_product_variants where id=p_variant_id for update;
    if not found then raise exception 'Catalog variant was not found.'; end if;
    if p_action='approve' then
        if jsonb_array_length(v_row.validation_warnings)+jsonb_array_length(v_row.duplicate_warnings)+jsonb_array_length(v_row.missing_fields)>0 then
            raise exception 'Resolve duplicate and validation warnings before approval.';
        end if;
        update public.catalog_product_variants set status='approved',approved_at=now(),approved_by_user_id=auth.uid(),updated_by_user_id=auth.uid(),updated_at=now() where id=p_variant_id returning * into v_row;
        update public.catalog_product_families set status='approved',approved_at=coalesce(approved_at,now()),approved_by_user_id=coalesce(approved_by_user_id,auth.uid()),updated_by_user_id=auth.uid(),updated_at=now() where id=v_row.product_family_id and status in ('draft','needs_review');
    elsif p_action='reject' then
        update public.catalog_product_variants set status='rejected',updated_by_user_id=auth.uid(),updated_at=now() where id=p_variant_id returning * into v_row;
    elsif p_action='archive' then
        update public.catalog_product_variants set status='archived',updated_by_user_id=auth.uid(),updated_at=now() where id=p_variant_id returning * into v_row;
    elsif p_action='needs_review' then
        update public.catalog_product_variants set status='needs_review',updated_by_user_id=auth.uid(),updated_at=now() where id=p_variant_id returning * into v_row;
    elsif p_action='edit' then
        update public.catalog_product_variants set
            model_number=coalesce(nullif(btrim(p_payload->>'model_number'),''),model_number),
            manufacturer_part_number=case when p_payload ? 'manufacturer_part_number' then nullif(btrim(p_payload->>'manufacturer_part_number'),'') else manufacturer_part_number end,
            upc_gtin=case when p_payload ? 'upc_gtin' then nullif(btrim(p_payload->>'upc_gtin'),'') else upc_gtin end,
            color=case when p_payload ? 'color' then nullif(btrim(p_payload->>'color'),'') else color end,
            finish=case when p_payload ? 'finish' then nullif(btrim(p_payload->>'finish'),'') else finish end,
            size=case when p_payload ? 'size' then nullif(btrim(p_payload->>'size'),'') else size end,
            capacity=case when p_payload ? 'capacity' then nullif(btrim(p_payload->>'capacity'),'') else capacity end,
            description=case when p_payload ? 'description' then nullif(btrim(p_payload->>'description'),'') else description end,
            specifications=case when jsonb_typeof(p_payload->'specifications')='object' then p_payload->'specifications' else specifications end,
            confidence=case when p_payload ? 'confidence' then greatest(0,least(1,(p_payload->>'confidence')::numeric)) else confidence end,
            validation_warnings=case when p_payload ? 'validation_warnings' and jsonb_typeof(p_payload->'validation_warnings')='array' then p_payload->'validation_warnings' else validation_warnings end,
            duplicate_warnings=case when p_payload ? 'duplicate_warnings' and jsonb_typeof(p_payload->'duplicate_warnings')='array' then p_payload->'duplicate_warnings' else duplicate_warnings end,
            missing_fields=case when p_payload ? 'missing_fields' and jsonb_typeof(p_payload->'missing_fields')='array' then p_payload->'missing_fields' else missing_fields end,
            updated_by_user_id=auth.uid(),updated_at=now()
        where id=p_variant_id returning * into v_row;
    elsif p_action='merge' then
        if p_merge_target_id is null or p_merge_target_id=p_variant_id then raise exception 'Choose a different merge target.'; end if;
        select * into v_target from public.catalog_product_variants where id=p_merge_target_id for update;
        if not found or v_target.status='archived' then raise exception 'Merge target is unavailable.'; end if;
        update public.catalog_sources set product_variant_id=p_merge_target_id where product_variant_id=p_variant_id;
        update public.catalog_source_assets set product_variant_id=p_merge_target_id where product_variant_id=p_variant_id;
        update public.catalog_retail_listings set product_variant_id=p_merge_target_id where product_variant_id=p_variant_id;
        update public.catalog_import_rows set created_variant_id=p_merge_target_id where created_variant_id=p_variant_id;
        update public.catalog_product_variants set status='archived',merged_into_variant_id=p_merge_target_id,updated_by_user_id=auth.uid(),updated_at=now() where id=p_variant_id returning * into v_row;
    else raise exception 'Unsupported review action.';
    end if;
    return to_jsonb(v_row);
end;
$$;

revoke all on function public.review_catalog_draft(uuid,text,jsonb,uuid) from public, anon;
grant execute on function public.review_catalog_draft(uuid,text,jsonb,uuid) to authenticated;

create or replace function public.bulk_approve_catalog_drafts(p_variant_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_id uuid; v_count integer:=0;
begin
    perform public.catalog_factory_require_admin();
    if coalesce(cardinality(p_variant_ids),0)=0 then raise exception 'Select at least one draft.'; end if;
    if exists(select 1 from public.catalog_product_variants v where v.id=any(p_variant_ids) and (
        v.status not in ('draft','needs_review') or jsonb_array_length(v.validation_warnings)+jsonb_array_length(v.duplicate_warnings)+jsonb_array_length(v.missing_fields)>0
    )) then raise exception 'Bulk approval is blocked until all selected drafts have no unresolved warnings.'; end if;
    foreach v_id in array p_variant_ids loop perform public.review_catalog_draft(v_id,'approve','{}'::jsonb,null); v_count:=v_count+1; end loop;
    return jsonb_build_object('approved_count',v_count);
end;
$$;

revoke all on function public.bulk_approve_catalog_drafts(uuid[]) from public, anon;
grant execute on function public.bulk_approve_catalog_drafts(uuid[]) to authenticated;

create or replace function public.get_approved_master_catalog_for_company(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_result jsonb;
begin
    if auth.uid() is null or not (public.homeos_is_platform_admin() or public.company_price_book_can_view(p_company_id)) then raise exception 'Company catalog access is required.'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'id',v.id,'category',t.category_name,'manufacturer',f.manufacturer,'brand',f.brand,'family_name',f.family_name,
        'model_number',v.model_number,'manufacturer_part_number',v.manufacturer_part_number,'upc_gtin',v.upc_gtin,
        'description',coalesce(v.description,f.description),'specifications',v.specifications,
        'primary_image_url',(select a.source_url from public.catalog_source_assets a where a.product_variant_id=v.id and a.asset_type='image' order by a.is_primary desc,a.created_at limit 1),
        'offering',(select to_jsonb(o) from public.company_catalog_offerings o where o.company_id=p_company_id and o.product_variant_id=v.id)
    ) order by t.category_name,f.brand,f.family_name,v.model_number),'[]'::jsonb) into v_result
    from public.catalog_product_variants v
    join public.catalog_product_families f on f.id=v.product_family_id
    join public.catalog_category_templates t on t.id=f.category_template_id
    where v.status='approved' and f.status='approved';
    return v_result;
end;
$$;

revoke all on function public.get_approved_master_catalog_for_company(uuid) from public, anon;
grant execute on function public.get_approved_master_catalog_for_company(uuid) to authenticated;

create or replace function public.save_company_catalog_offering(
    p_company_id uuid,
    p_variant_id uuid,
    p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_variant record; v_company_product_id uuid; v_offering public.company_catalog_offerings%rowtype;
begin
    if auth.uid() is null or not (public.homeos_is_platform_admin() or public.company_price_book_can_manage(p_company_id)) then raise exception 'Company catalog management access is required.'; end if;
    select v.*,f.manufacturer,f.brand,f.family_name,t.category_name into v_variant
    from public.catalog_product_variants v join public.catalog_product_families f on f.id=v.product_family_id
    join public.catalog_category_templates t on t.id=f.category_template_id
    where v.id=p_variant_id and v.status='approved' and f.status='approved';
    if not found then raise exception 'Only approved master products can be added to a company catalog.'; end if;
    select company_catalog_product_id into v_company_product_id from public.company_catalog_offerings where company_id=p_company_id and product_variant_id=p_variant_id;
    if v_company_product_id is null then
        insert into public.company_approved_products(
            company_id,product_name,category,brand,model,manufacturer_part_number,product_description,
            product_specifications,warranty,catalog_status,approved,active,master_product_variant_id,
            internal_product_cost,approved_selling_price,created_by_user_id,updated_by_user_id
        ) values(
            p_company_id,concat_ws(' ',v_variant.brand,v_variant.family_name,v_variant.model_number),v_variant.category_name,
            v_variant.brand,v_variant.model_number,v_variant.manufacturer_part_number,coalesce(v_variant.description,v_variant.family_name),
            v_variant.specifications,nullif(btrim(coalesce(p_payload->>'company_warranty','')),''),'approved',true,
            coalesce((p_payload->>'active')::boolean,true),p_variant_id,nullif(p_payload->>'material_cost','')::numeric,
            nullif(p_payload->>'installed_price','')::numeric,auth.uid(),auth.uid()
        ) returning id into v_company_product_id;
    else
        update public.company_approved_products set
            internal_product_cost=nullif(p_payload->>'material_cost','')::numeric,
            approved_selling_price=nullif(p_payload->>'installed_price','')::numeric,
            warranty=nullif(btrim(coalesce(p_payload->>'company_warranty','')),''),
            approved=true,active=coalesce((p_payload->>'active')::boolean,true),catalog_status=case when coalesce((p_payload->>'active')::boolean,true) then 'approved' else 'archived' end,
            updated_by_user_id=auth.uid(),updated_at=now()
        where id=v_company_product_id and company_id=p_company_id;
    end if;
    insert into public.company_catalog_offerings(
        company_id,product_variant_id,company_catalog_product_id,material_cost,markup,labor_amount,installed_price,
        preferred_supplier,company_warranty,active,created_by_user_id,updated_by_user_id,updated_at
    ) values(
        p_company_id,p_variant_id,v_company_product_id,nullif(p_payload->>'material_cost','')::numeric,
        nullif(p_payload->>'markup','')::numeric,nullif(p_payload->>'labor_amount','')::numeric,
        nullif(p_payload->>'installed_price','')::numeric,nullif(btrim(coalesce(p_payload->>'preferred_supplier','')),''),
        nullif(btrim(coalesce(p_payload->>'company_warranty','')),''),coalesce((p_payload->>'active')::boolean,true),auth.uid(),auth.uid(),now()
    ) on conflict(company_id,product_variant_id) do update set
        company_catalog_product_id=excluded.company_catalog_product_id,material_cost=excluded.material_cost,markup=excluded.markup,
        labor_amount=excluded.labor_amount,installed_price=excluded.installed_price,preferred_supplier=excluded.preferred_supplier,
        company_warranty=excluded.company_warranty,active=excluded.active,updated_by_user_id=auth.uid(),updated_at=now()
    returning * into v_offering;
    return to_jsonb(v_offering);
end;
$$;

revoke all on function public.save_company_catalog_offering(uuid,uuid,jsonb) from public, anon;
grant execute on function public.save_company_catalog_offering(uuid,uuid,jsonb) to authenticated;

create or replace function public.catalog_price_observations_immutable()
returns trigger language plpgsql set search_path=pg_catalog,public,pg_temp as $$
begin raise exception 'Retail price observations are historical and cannot be overwritten or deleted.'; end;
$$;
drop trigger if exists catalog_price_observations_immutable_trigger on public.catalog_price_observations;
create trigger catalog_price_observations_immutable_trigger before update or delete on public.catalog_price_observations
for each row execute function public.catalog_price_observations_immutable();

create or replace function public.sync_homeos_master_product_variant()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
    if tg_op = 'INSERT' or new.catalog_product_id is distinct from old.catalog_product_id or new.master_product_variant_id is null then
        select p.master_product_variant_id into new.master_product_variant_id
        from public.company_approved_products p where p.id=new.catalog_product_id;
    end if;
    return new;
end;
$$;
drop trigger if exists sync_homeos_master_product_variant_trigger on public.home_items;
create trigger sync_homeos_master_product_variant_trigger before insert or update on public.home_items
for each row execute function public.sync_homeos_master_product_variant();

update public.home_items item set master_product_variant_id=product.master_product_variant_id
from public.company_approved_products product
where product.id=item.catalog_product_id and item.master_product_variant_id is null and product.master_product_variant_id is not null;

insert into public.catalog_category_templates(
    template_key,category_name,description,universal_fields,specification_fields,required_fields,status,created_by_user_id,updated_by_user_id
) select
    seed.key,seed.name,seed.description,
    '[{"key":"manufacturer","label":"Manufacturer"},{"key":"brand","label":"Brand"},{"key":"family_name","label":"Family name"},{"key":"model_number","label":"Model number"},{"key":"manufacturer_part_number","label":"Manufacturer part number"},{"key":"upc_gtin","label":"UPC / GTIN"}]'::jsonb,
    seed.fields,seed.required,'approved',auth.uid(),auth.uid()
from (values
    ('water_heater','Water Heater','Tank and hybrid water heaters.','[{"key":"fuel_type","label":"Fuel type"},{"key":"capacity_gallons","label":"Capacity (gallons)"},{"key":"input_btu","label":"Input BTU"},{"key":"vent_type","label":"Vent type"}]'::jsonb,'["fuel_type","capacity_gallons"]'::jsonb),
    ('tankless_water_heater','Tankless Water Heater','Tankless water-heating equipment.','[{"key":"fuel_type","label":"Fuel type"},{"key":"max_gpm","label":"Maximum GPM"},{"key":"input_btu","label":"Input BTU"},{"key":"recirculation","label":"Recirculation"}]'::jsonb,'["fuel_type","max_gpm"]'::jsonb),
    ('shower_valve','Shower Valve','Valve bodies, trim and shower kits.','[{"key":"valve_type","label":"Valve type"},{"key":"connection_size","label":"Connection size"},{"key":"trim_included","label":"Trim included"},{"key":"tub_spout_included","label":"Tub spout included"}]'::jsonb,'["valve_type","connection_size"]'::jsonb),
    ('pressure_regulator','Pressure Regulator','Residential water-pressure regulating valves.','[{"key":"connection_type","label":"Connection type"},{"key":"connection_size","label":"Connection size"},{"key":"pressure_range","label":"Pressure range"}]'::jsonb,'["connection_type","connection_size"]'::jsonb),
    ('garbage_disposal','Garbage Disposal','Residential food-waste disposers.','[{"key":"horsepower","label":"Horsepower"},{"key":"feed_type","label":"Feed type"},{"key":"voltage","label":"Voltage"}]'::jsonb,'["horsepower"]'::jsonb),
    ('toilet','Toilet','Residential toilets and toilet systems.','[{"key":"bowl_shape","label":"Bowl shape"},{"key":"rough_in","label":"Rough-in"},{"key":"gallons_per_flush","label":"Gallons per flush"},{"key":"height_class","label":"Height class"}]'::jsonb,'["bowl_shape","rough_in"]'::jsonb),
    ('water_filtration','Water Filtration','Whole-home filtration, softening and reverse osmosis.','[{"key":"system_type","label":"System type"},{"key":"flow_rate","label":"Flow rate"},{"key":"media_or_membrane","label":"Media or membrane"}]'::jsonb,'["system_type"]'::jsonb),
    ('smart_water_monitor','Smart Water Monitor','Leak detection and automatic shutoff systems.','[{"key":"pipe_size","label":"Pipe size"},{"key":"shutoff_included","label":"Automatic shutoff"},{"key":"connectivity","label":"Connectivity"}]'::jsonb,'["pipe_size"]'::jsonb),
    ('faucet','Faucet','Kitchen, bathroom and utility faucets.','[{"key":"application","label":"Application"},{"key":"mounting_type","label":"Mounting type"},{"key":"hole_count","label":"Hole count"}]'::jsonb,'["application"]'::jsonb),
    ('other','Other Product','Products without a dedicated template yet.','[]'::jsonb,'[]'::jsonb)
) seed(key,name,description,fields,required)
where not exists(select 1 from public.catalog_category_templates t where lower(t.template_key)=lower(seed.key) and t.status<>'archived');

commit;
