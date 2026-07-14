-- AI estimate option foundation.
--
-- Additive only:
--   - no production service-request/homeowner data is changed
--   - no fake prices, products, media, or customer records are seeded
--   - AI can reference only approved deterministic records; prices remain in the price book

begin;

do $$
begin
    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before AI estimate options can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before AI estimate options can be installed.';
    end if;

    if to_regclass('public.properties') is null then
        raise exception 'public.properties is required before AI estimate options can be installed.';
    end if;
end;
$$;

create or replace function public.company_price_book_can_manage(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           coalesce(public.homeos_is_platform_admin(), false)
           or exists (
               select 1
               from public.company_users as company_user
               where company_user.company_id = p_company_id
                 and company_user.auth_user_id = auth.uid()
                 and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'admin', 'manager')
           )
       );
$$;

revoke all on function public.company_price_book_can_manage(uuid) from public;
revoke all on function public.company_price_book_can_manage(uuid) from anon;
grant execute on function public.company_price_book_can_manage(uuid) to authenticated;

create or replace function public.company_price_book_can_view(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           public.company_price_book_can_manage(p_company_id)
           or exists (
               select 1
               from public.company_users as company_user
               where company_user.company_id = p_company_id
                 and company_user.auth_user_id = auth.uid()
                 and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 and lower(btrim(coalesce(company_user.role, ''))) in ('technician', 'tech')
           )
       );
$$;

revoke all on function public.company_price_book_can_view(uuid) from public;
revoke all on function public.company_price_book_can_view(uuid) from anon;
grant execute on function public.company_price_book_can_view(uuid) to authenticated;

create or replace function public.company_estimate_options_can_use(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and public.company_price_book_can_view(p_company_id);
$$;

revoke all on function public.company_estimate_options_can_use(uuid) from public;
revoke all on function public.company_estimate_options_can_use(uuid) from anon;
grant execute on function public.company_estimate_options_can_use(uuid) to authenticated;

create table if not exists public.company_price_book_items (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    price_key text not null,
    item_code text,
    service_category text,
    name text not null,
    system text not null default 'Other',
    category text not null default 'Service',
    unit text not null default 'each',
    internal_description text,
    homeowner_description text,
    customer_description text,
    base_price numeric(12,2),
    base_labor_install_price numeric(12,2),
    labor_hours numeric(8,2),
    estimated_labor_hours numeric(8,2),
    internal_labor_cost numeric(12,2),
    material_cost numeric(12,2),
    internal_material_cost numeric(12,2),
    recommended_selling_price numeric(12,2),
    minimum_permitted_selling_price numeric(12,2),
    maximum_permitted_selling_price numeric(12,2),
    required_minimum_gross_margin numeric(8,4),
    tax_behavior text,
    active boolean not null default true,
    effective_at date,
    version_label text,
    included_warranty text,
    eligible_extended_warranties jsonb not null default '[]'::jsonb,
    required_add_on_price_keys text[] not null default array[]::text[],
    incompatible_price_keys text[] not null default array[]::text[],
    applicable_systems text[] not null default array[]::text[],
    applicable_areas text[] not null default array[]::text[],
    applicable_categories text[] not null default array[]::text[],
    management_notes text,
    internal_notes text,
    created_by_user_id uuid,
    updated_by_user_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_price_book_items_price_key_present check (btrim(price_key) <> ''),
    constraint company_price_book_items_name_present check (btrim(name) <> ''),
    constraint company_price_book_items_recommended_nonnegative check (recommended_selling_price is null or recommended_selling_price >= 0),
    constraint company_price_book_items_min_max_order check (
        minimum_permitted_selling_price is null
        or maximum_permitted_selling_price is null
        or minimum_permitted_selling_price <= maximum_permitted_selling_price
    ),
    unique (company_id, price_key)
);

alter table public.company_price_book_items
    add column if not exists item_code text,
    add column if not exists service_category text,
    add column if not exists internal_description text,
    add column if not exists homeowner_description text,
    add column if not exists base_labor_install_price numeric(12,2),
    add column if not exists estimated_labor_hours numeric(8,2),
    add column if not exists internal_labor_cost numeric(12,2),
    add column if not exists internal_material_cost numeric(12,2),
    add column if not exists recommended_selling_price numeric(12,2),
    add column if not exists minimum_permitted_selling_price numeric(12,2),
    add column if not exists maximum_permitted_selling_price numeric(12,2),
    add column if not exists required_minimum_gross_margin numeric(8,4),
    add column if not exists tax_behavior text,
    add column if not exists effective_at date,
    add column if not exists version_label text,
    add column if not exists included_warranty text,
    add column if not exists eligible_extended_warranties jsonb default '[]'::jsonb,
    add column if not exists required_add_on_price_keys text[] default array[]::text[],
    add column if not exists incompatible_price_keys text[] default array[]::text[],
    add column if not exists applicable_systems text[] default array[]::text[],
    add column if not exists applicable_areas text[] default array[]::text[],
    add column if not exists applicable_categories text[] default array[]::text[],
    add column if not exists management_notes text,
    add column if not exists updated_by_user_id uuid;

create index if not exists company_price_book_items_company_active_idx
    on public.company_price_book_items(company_id, active);

create index if not exists company_price_book_items_company_category_idx
    on public.company_price_book_items(company_id, category);

alter table public.company_price_book_items enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'company_price_book_items'
          and policyname = 'company_price_book_items_select_company_estimate_users'
    ) then
        create policy company_price_book_items_select_company_estimate_users
            on public.company_price_book_items
            for select
            to authenticated
            using (public.company_estimate_options_can_use(company_id));
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'company_price_book_items'
          and policyname = 'company_price_book_items_manage_company_managers'
    ) then
        create policy company_price_book_items_manage_company_managers
            on public.company_price_book_items
            for all
            to authenticated
            using (public.company_price_book_can_manage(company_id))
            with check (public.company_price_book_can_manage(company_id));
    end if;
end;
$$;

create table if not exists public.company_approved_products (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    category text not null,
    brand text not null,
    model text not null,
    tier text not null default 'Professional'
        check (tier in ('Essential', 'Professional', 'Premium')),
    internal_product_cost numeric(12,2),
    approved_selling_price numeric(12,2),
    price_book_item_id uuid references public.company_price_book_items(id) on delete set null,
    minimum_selling_price numeric(12,2),
    maximum_selling_price numeric(12,2),
    main_product_media_id uuid,
    product_specifications jsonb not null default '{}'::jsonb,
    compatible_applications text[] not null default array[]::text[],
    required_accessory_ids uuid[] not null default array[]::uuid[],
    installation_requirements text[] not null default array[]::text[],
    warranty text,
    extended_warranty_eligible boolean not null default false,
    availability_note text,
    manufacturer_reference text,
    company_notes text,
    approved boolean not null default false,
    active boolean not null default true,
    created_by_user_id uuid,
    updated_by_user_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_approved_products_name_present check (btrim(category) <> '' and btrim(brand) <> '' and btrim(model) <> ''),
    constraint company_approved_products_min_max_order check (
        minimum_selling_price is null
        or maximum_selling_price is null
        or minimum_selling_price <= maximum_selling_price
    )
);

create index if not exists company_approved_products_company_category_idx
    on public.company_approved_products(company_id, category, active, approved);

alter table public.company_approved_products enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'company_approved_products'
          and policyname = 'company_approved_products_select_company_estimate_users'
    ) then
        create policy company_approved_products_select_company_estimate_users
            on public.company_approved_products
            for select
            to authenticated
            using (public.company_estimate_options_can_use(company_id));
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'company_approved_products'
          and policyname = 'company_approved_products_manage_company_managers'
    ) then
        create policy company_approved_products_manage_company_managers
            on public.company_approved_products
            for all
            to authenticated
            using (public.company_price_book_can_manage(company_id))
            with check (public.company_price_book_can_manage(company_id));
    end if;
end;
$$;

create table if not exists public.company_product_media (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    product_id uuid not null references public.company_approved_products(id) on delete cascade,
    bucket text not null,
    storage_path text not null,
    alt_text text,
    active boolean not null default true,
    created_by_user_id uuid,
    created_at timestamptz not null default now(),
    unique (company_id, bucket, storage_path)
);

create index if not exists company_product_media_product_idx
    on public.company_product_media(product_id, active);

alter table public.company_product_media enable row level security;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'company_product_media'
          and policyname = 'company_product_media_select_company_estimate_users'
    ) then
        create policy company_product_media_select_company_estimate_users
            on public.company_product_media
            for select
            to authenticated
            using (public.company_estimate_options_can_use(company_id));
    end if;

    if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = 'company_product_media'
          and policyname = 'company_product_media_manage_company_managers'
    ) then
        create policy company_product_media_manage_company_managers
            on public.company_product_media
            for all
            to authenticated
            using (public.company_price_book_can_manage(company_id))
            with check (public.company_price_book_can_manage(company_id));
    end if;
end;
$$;

create table if not exists public.company_estimate_option_sessions (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    property_id uuid references public.properties(id) on delete set null,
    service_request_id uuid,
    job_id uuid,
    schedule_slot_id uuid,
    home_item_id uuid,
    category text not null,
    status text not null default 'draft'
        check (status in ('draft', 'technician_review', 'presentation_ready', 'presented', 'archived')),
    source text not null default 'techos'
        check (source in ('techos', 'provider_mode', 'management', 'homeos')),
    created_by_company_user_id uuid references public.company_users(id) on delete set null,
    technician_approved_at timestamptz,
    presented_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists company_estimate_option_sessions_company_status_idx
    on public.company_estimate_option_sessions(company_id, status);

create index if not exists company_estimate_option_sessions_property_idx
    on public.company_estimate_option_sessions(property_id);

alter table public.company_estimate_option_sessions enable row level security;

create table if not exists public.company_estimate_option_answers (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.company_estimate_option_sessions(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    question_id text not null,
    answer jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (session_id, question_id)
);

alter table public.company_estimate_option_answers enable row level security;

create table if not exists public.company_estimate_repipe_blocks (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.company_estimate_option_sessions(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    block_type text not null,
    label text not null,
    fixtures jsonb not null default '{}'::jsonb,
    infrastructure jsonb not null default '{}'::jsonb,
    calculated_totals jsonb not null default '{}'::jsonb,
    override_reason text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.company_estimate_repipe_blocks enable row level security;

create table if not exists public.company_estimate_options (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.company_estimate_option_sessions(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    kind text not null check (kind in ('individual', 'package')),
    title text not null,
    short_summary text,
    homeowner_explanation text,
    key_benefits jsonb not null default '[]'::jsonb,
    why_it_differs text,
    recommended_reason text,
    deterministic_total numeric(12,2) not null,
    price_book_snapshot jsonb not null,
    approved_product_ids uuid[] not null default array[]::uuid[],
    approved_scope_ids uuid[] not null default array[]::uuid[],
    approved_warranty_ids uuid[] not null default array[]::uuid[],
    inclusion_ids text[] not null default array[]::text[],
    exclusion_ids text[] not null default array[]::text[],
    display_order integer not null default 1,
    recommended boolean not null default false,
    technician_approved boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists company_estimate_options_session_idx
    on public.company_estimate_options(session_id, display_order);

alter table public.company_estimate_options enable row level security;

create table if not exists public.company_estimate_option_lines (
    id uuid primary key default gen_random_uuid(),
    option_id uuid not null references public.company_estimate_options(id) on delete cascade,
    session_id uuid not null references public.company_estimate_option_sessions(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    price_book_item_id uuid not null references public.company_price_book_items(id) on delete restrict,
    quantity numeric(12,2) not null default 1,
    unit_amount numeric(12,2) not null,
    total_amount numeric(12,2) not null,
    cost_amount numeric(12,2),
    required boolean not null default false,
    source text not null default 'base_installation',
    created_at timestamptz not null default now()
);

alter table public.company_estimate_option_lines enable row level security;

create table if not exists public.company_estimate_ai_generations (
    id uuid primary key default gen_random_uuid(),
    session_id uuid references public.company_estimate_option_sessions(id) on delete set null,
    company_id uuid not null references public.companies(id) on delete cascade,
    model text not null,
    request_payload jsonb not null,
    response_payload jsonb,
    validation_errors text[] not null default array[]::text[],
    status text not null default 'requested'
        check (status in ('requested', 'validated', 'rejected', 'failed')),
    created_by_user_id uuid,
    created_at timestamptz not null default now()
);

alter table public.company_estimate_ai_generations enable row level security;

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'company_estimate_option_sessions',
        'company_estimate_option_answers',
        'company_estimate_repipe_blocks',
        'company_estimate_options',
        'company_estimate_option_lines',
        'company_estimate_ai_generations'
    ]
    loop
        if not exists (
            select 1 from pg_policies
            where schemaname = 'public'
              and tablename = table_name
              and policyname = table_name || '_select_company_estimate_users'
        ) then
            execute format(
                'create policy %I on public.%I for select to authenticated using (public.company_estimate_options_can_use(company_id))',
                table_name || '_select_company_estimate_users',
                table_name
            );
        end if;

        if not exists (
            select 1 from pg_policies
            where schemaname = 'public'
              and tablename = table_name
              and policyname = table_name || '_mutate_company_estimate_users'
        ) then
            execute format(
                'create policy %I on public.%I for all to authenticated using (public.company_estimate_options_can_use(company_id)) with check (public.company_estimate_options_can_use(company_id))',
                table_name || '_mutate_company_estimate_users',
                table_name
            );
        end if;
    end loop;
end;
$$;

create or replace function public.get_company_price_book(p_company_id uuid)
returns table (
    id uuid,
    company_id uuid,
    price_key text,
    name text,
    system text,
    category text,
    unit text,
    base_price numeric,
    labor_hours numeric,
    material_cost numeric,
    customer_description text,
    internal_notes text,
    active boolean,
    created_by_user_id uuid,
    created_at timestamptz,
    updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not public.company_price_book_can_view(p_company_id) then
        raise exception 'Not authorized';
    end if;

    return query
    select
        item.id,
        item.company_id,
        item.price_key,
        item.name,
        item.system,
        item.category,
        item.unit,
        item.base_price,
        item.labor_hours,
        item.material_cost,
        item.customer_description,
        item.internal_notes,
        item.active,
        item.created_by_user_id,
        item.created_at,
        item.updated_at
    from public.company_price_book_items as item
    where item.company_id = p_company_id
    order by item.system, item.category, item.name;
end;
$$;

revoke all on function public.get_company_price_book(uuid) from public;
revoke all on function public.get_company_price_book(uuid) from anon;
grant execute on function public.get_company_price_book(uuid) to authenticated;

create or replace function public.get_company_price_book_v2(p_company_id uuid)
returns table (
    id uuid,
    company_id uuid,
    price_key text,
    name text,
    system text,
    category text,
    unit text,
    base_price numeric,
    labor_hours numeric,
    material_cost numeric,
    customer_description text,
    internal_notes text,
    active boolean,
    created_by_user_id uuid,
    created_at timestamptz,
    updated_at timestamptz,
    service_category text,
    internal_description text,
    homeowner_description text,
    base_labor_install_price numeric,
    estimated_labor_hours numeric,
    internal_labor_cost numeric,
    internal_material_cost numeric,
    recommended_selling_price numeric,
    minimum_permitted_selling_price numeric,
    maximum_permitted_selling_price numeric,
    required_minimum_gross_margin numeric,
    tax_behavior text,
    effective_at date,
    version_label text,
    included_warranty text,
    eligible_extended_warranties jsonb,
    required_add_on_price_keys text[],
    incompatible_price_keys text[],
    applicable_systems text[],
    applicable_areas text[],
    applicable_categories text[],
    management_notes text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not public.company_estimate_options_can_use(p_company_id) then
        raise exception 'Not authorized';
    end if;

    return query
    select
        item.id,
        item.company_id,
        item.price_key,
        item.name,
        item.system,
        item.category,
        item.unit,
        item.base_price,
        item.labor_hours,
        item.material_cost,
        item.customer_description,
        item.internal_notes,
        item.active,
        item.created_by_user_id,
        item.created_at,
        item.updated_at,
        item.service_category,
        item.internal_description,
        item.homeowner_description,
        item.base_labor_install_price,
        item.estimated_labor_hours,
        item.internal_labor_cost,
        item.internal_material_cost,
        item.recommended_selling_price,
        item.minimum_permitted_selling_price,
        item.maximum_permitted_selling_price,
        item.required_minimum_gross_margin,
        item.tax_behavior,
        item.effective_at,
        item.version_label,
        item.included_warranty,
        item.eligible_extended_warranties,
        item.required_add_on_price_keys,
        item.incompatible_price_keys,
        item.applicable_systems,
        item.applicable_areas,
        item.applicable_categories,
        item.management_notes
    from public.company_price_book_items as item
    where item.company_id = p_company_id
    order by item.system, item.category, item.name;
end;
$$;

revoke all on function public.get_company_price_book_v2(uuid) from public;
revoke all on function public.get_company_price_book_v2(uuid) from anon;
grant execute on function public.get_company_price_book_v2(uuid) to authenticated;

create or replace function public.upsert_company_price_book_item_v2(
    p_company_id uuid,
    p_price_key text,
    p_name text,
    p_system text,
    p_category text,
    p_unit text default 'each',
    p_base_price numeric default null,
    p_labor_hours numeric default null,
    p_material_cost numeric default null,
    p_customer_description text default null,
    p_internal_notes text default null,
    p_active boolean default true
)
returns setof public.company_price_book_items
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_price_key text := lower(regexp_replace(btrim(coalesce(p_price_key, p_name, 'price-item')), '[^a-zA-Z0-9]+', '-', 'g'));
    v_item public.company_price_book_items%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not public.company_price_book_can_manage(p_company_id) then
        raise exception 'Not authorized';
    end if;

    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    if btrim(coalesce(p_name, '')) = '' then
        raise exception 'name is required';
    end if;

    insert into public.company_price_book_items (
        company_id,
        price_key,
        name,
        system,
        category,
        unit,
        base_price,
        base_labor_install_price,
        labor_hours,
        estimated_labor_hours,
        material_cost,
        internal_material_cost,
        recommended_selling_price,
        customer_description,
        homeowner_description,
        internal_notes,
        management_notes,
        active,
        updated_by_user_id,
        created_by_user_id,
        updated_at
    )
    values (
        p_company_id,
        v_price_key,
        btrim(p_name),
        coalesce(nullif(btrim(p_system), ''), 'Other'),
        coalesce(nullif(btrim(p_category), ''), 'Service'),
        coalesce(nullif(btrim(p_unit), ''), 'each'),
        p_base_price,
        p_base_price,
        p_labor_hours,
        p_labor_hours,
        p_material_cost,
        p_material_cost,
        p_base_price,
        nullif(btrim(coalesce(p_customer_description, '')), ''),
        nullif(btrim(coalesce(p_customer_description, '')), ''),
        nullif(btrim(coalesce(p_internal_notes, '')), ''),
        nullif(btrim(coalesce(p_internal_notes, '')), ''),
        coalesce(p_active, true),
        auth.uid(),
        auth.uid(),
        now()
    )
    on conflict (company_id, price_key)
    do update set
        name = excluded.name,
        system = excluded.system,
        category = excluded.category,
        unit = excluded.unit,
        base_price = excluded.base_price,
        base_labor_install_price = excluded.base_labor_install_price,
        labor_hours = excluded.labor_hours,
        estimated_labor_hours = excluded.estimated_labor_hours,
        material_cost = excluded.material_cost,
        internal_material_cost = excluded.internal_material_cost,
        recommended_selling_price = excluded.recommended_selling_price,
        customer_description = excluded.customer_description,
        homeowner_description = excluded.homeowner_description,
        internal_notes = excluded.internal_notes,
        management_notes = excluded.management_notes,
        active = excluded.active,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    returning * into v_item;

    return next v_item;
end;
$$;

revoke all on function public.upsert_company_price_book_item_v2(uuid, text, text, text, text, text, numeric, numeric, numeric, text, text, boolean) from public;
revoke all on function public.upsert_company_price_book_item_v2(uuid, text, text, text, text, text, numeric, numeric, numeric, text, text, boolean) from anon;
grant execute on function public.upsert_company_price_book_item_v2(uuid, text, text, text, text, text, numeric, numeric, numeric, text, text, boolean) to authenticated;

create or replace function public.get_company_approved_products(p_company_id uuid)
returns table (
    id uuid,
    company_id uuid,
    category text,
    brand text,
    model text,
    tier text,
    approved_selling_price numeric,
    price_book_item_id uuid,
    minimum_selling_price numeric,
    maximum_selling_price numeric,
    main_product_media_id uuid,
    product_specifications jsonb,
    compatible_applications text[],
    required_accessory_ids uuid[],
    installation_requirements text[],
    warranty text,
    extended_warranty_eligible boolean,
    availability_note text,
    manufacturer_reference text,
    approved boolean,
    active boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not public.company_estimate_options_can_use(p_company_id) then
        raise exception 'Not authorized';
    end if;

    return query
    select
        product.id,
        product.company_id,
        product.category,
        product.brand,
        product.model,
        product.tier,
        product.approved_selling_price,
        product.price_book_item_id,
        product.minimum_selling_price,
        product.maximum_selling_price,
        product.main_product_media_id,
        product.product_specifications,
        product.compatible_applications,
        product.required_accessory_ids,
        product.installation_requirements,
        product.warranty,
        product.extended_warranty_eligible,
        product.availability_note,
        product.manufacturer_reference,
        product.approved,
        product.active
    from public.company_approved_products as product
    where product.company_id = p_company_id
      and product.active = true
      and product.approved = true
    order by product.category, product.tier, product.brand, product.model;
end;
$$;

revoke all on function public.get_company_approved_products(uuid) from public;
revoke all on function public.get_company_approved_products(uuid) from anon;
grant execute on function public.get_company_approved_products(uuid) to authenticated;

commit;
