-- 597_Company_Price_Book_Foundation.sql
-- Review-only proposal. Do not run until reviewed and applied in Supabase.
--
-- Goal:
--   Company-owned Price Book foundation for ManagementOS estimates/proposals.
--   This does not edit homeowner HomeOS records and does not generate fake prices.
--
-- Product rules:
--   - Platform admins can manage any company price book.
--   - Active company owners/admins/managers can manage their company price book.
--   - Active technicians can optionally view, but not edit, if later granted by RLS/RPC.
--   - Homeowners cannot access company price books.

do $$
begin
    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before company price book can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before company price book can be installed.';
    end if;

    if to_regprocedure('public.homeos_is_platform_admin()') is null then
        raise exception 'public.homeos_is_platform_admin() is required before company price book can be installed.';
    end if;
end $$;

create table if not exists public.company_price_book_items (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    price_key text not null,
    name text not null,
    system text not null,
    category text not null,
    unit text not null default 'each',
    base_price numeric(12,2),
    labor_hours numeric(8,2),
    material_cost numeric(12,2),
    customer_description text,
    internal_notes text,
    active boolean not null default true,
    created_by_user_id uuid references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_price_book_items_unit_check
        check (unit in ('each', 'hour', 'linear foot', 'package', 'inspection', 'other')),
    constraint company_price_book_items_price_check
        check (base_price is null or base_price >= 0),
    constraint company_price_book_items_labor_check
        check (labor_hours is null or labor_hours >= 0),
    constraint company_price_book_items_material_check
        check (material_cost is null or material_cost >= 0),
    unique (company_id, price_key)
);

create index if not exists company_price_book_items_company_idx
    on public.company_price_book_items(company_id);

create index if not exists company_price_book_items_company_active_idx
    on public.company_price_book_items(company_id, active);

create index if not exists company_price_book_items_system_category_idx
    on public.company_price_book_items(company_id, system, category);

alter table public.company_price_book_items enable row level security;

create or replace function public.company_price_book_can_manage(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $function$
    select exists (
        select 1
        from public.company_users cu
        where cu.company_id = p_company_id
          and cu.auth_user_id = auth.uid()
          and lower(btrim(coalesce(cu.status, ''))) = 'active'
          and lower(btrim(coalesce(cu.role, ''))) in ('owner', 'admin', 'manager')
    )
    or coalesce(public.homeos_is_platform_admin(), false);
$function$;

create or replace function public.company_price_book_can_view(p_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $function$
    select public.company_price_book_can_manage(p_company_id)
    or exists (
        select 1
        from public.company_users cu
        where cu.company_id = p_company_id
          and cu.auth_user_id = auth.uid()
          and lower(btrim(coalesce(cu.status, ''))) = 'active'
          and lower(btrim(coalesce(cu.role, ''))) in ('technician', 'tech')
    );
$function$;

drop policy if exists company_price_book_items_select on public.company_price_book_items;
create policy company_price_book_items_select
on public.company_price_book_items
for select
to authenticated
using (public.company_price_book_can_view(company_id));

drop policy if exists company_price_book_items_insert on public.company_price_book_items;
create policy company_price_book_items_insert
on public.company_price_book_items
for insert
to authenticated
with check (public.company_price_book_can_manage(company_id));

drop policy if exists company_price_book_items_update on public.company_price_book_items;
create policy company_price_book_items_update
on public.company_price_book_items
for update
to authenticated
using (public.company_price_book_can_manage(company_id))
with check (public.company_price_book_can_manage(company_id));

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
set search_path = public
as $function$
begin
    if auth.uid() is null then
        raise exception 'Sign in to view company price book.';
    end if;

    if not public.company_price_book_can_view(p_company_id) then
        raise exception 'You do not have access to this company price book.';
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
    from public.company_price_book_items item
    where item.company_id = p_company_id
    order by item.system, item.category, item.name;
end;
$function$;

create or replace function public.upsert_company_price_book_item(
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
set search_path = public
as $function$
declare
    v_price_key text := lower(regexp_replace(btrim(coalesce(p_price_key, p_name)), '[^a-zA-Z0-9]+', '-', 'g'));
begin
    if auth.uid() is null then
        raise exception 'Sign in to manage company price book.';
    end if;

    if not public.company_price_book_can_manage(p_company_id) then
        raise exception 'You do not have permission to manage this company price book.';
    end if;

    if btrim(coalesce(p_name, '')) = '' then
        raise exception 'Price book item name is required.';
    end if;

    if btrim(coalesce(v_price_key, '')) = '' then
        raise exception 'Price book item key is required.';
    end if;

    return query
    insert into public.company_price_book_items as item (
        company_id,
        price_key,
        name,
        system,
        category,
        unit,
        base_price,
        labor_hours,
        material_cost,
        customer_description,
        internal_notes,
        active,
        created_by_user_id,
        updated_at
    )
    values (
        p_company_id,
        v_price_key,
        btrim(p_name),
        btrim(coalesce(p_system, 'Other')),
        btrim(coalesce(p_category, 'Service')),
        coalesce(nullif(btrim(p_unit), ''), 'each'),
        p_base_price,
        p_labor_hours,
        p_material_cost,
        nullif(btrim(coalesce(p_customer_description, '')), ''),
        nullif(btrim(coalesce(p_internal_notes, '')), ''),
        coalesce(p_active, true),
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
        labor_hours = excluded.labor_hours,
        material_cost = excluded.material_cost,
        customer_description = excluded.customer_description,
        internal_notes = excluded.internal_notes,
        active = excluded.active,
        updated_at = now()
    returning item.*;
end;
$function$;

create or replace function public.archive_company_price_book_item(
    p_company_id uuid,
    p_price_key text
)
returns setof public.company_price_book_items
language plpgsql
security definer
set search_path = public
as $function$
begin
    if auth.uid() is null then
        raise exception 'Sign in to manage company price book.';
    end if;

    if not public.company_price_book_can_manage(p_company_id) then
        raise exception 'You do not have permission to manage this company price book.';
    end if;

    return query
    update public.company_price_book_items item
       set active = false,
           updated_at = now()
     where item.company_id = p_company_id
       and item.price_key = p_price_key
     returning item.*;
end;
$function$;

revoke all on function public.company_price_book_can_manage(uuid) from public, anon;
revoke all on function public.company_price_book_can_view(uuid) from public, anon;
revoke all on function public.get_company_price_book(uuid) from public, anon;
revoke all on function public.upsert_company_price_book_item(uuid, text, text, text, text, text, numeric, numeric, numeric, text, text, boolean) from public, anon;
revoke all on function public.archive_company_price_book_item(uuid, text) from public, anon;

grant execute on function public.company_price_book_can_manage(uuid) to authenticated;
grant execute on function public.company_price_book_can_view(uuid) to authenticated;
grant execute on function public.get_company_price_book(uuid) to authenticated;
grant execute on function public.upsert_company_price_book_item(uuid, text, text, text, text, text, numeric, numeric, numeric, text, text, boolean) to authenticated;
grant execute on function public.archive_company_price_book_item(uuid, text) to authenticated;
