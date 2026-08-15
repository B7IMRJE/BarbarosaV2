-- Per-company Catalog activation and package entitlements. Existing companies
-- retain their current full-catalog behavior; newly created companies have no
-- entitlement row and therefore begin inactive until Platform Administration
-- explicitly configures them.

begin;

do $$
begin
    if to_regclass('public.companies') is null
       or to_regclass('public.catalog_product_variants') is null
       or to_regclass('public.company_approved_products') is null
       or to_regclass('public.company_catalog_offerings') is null
       or to_regprocedure('public.homeos_is_platform_admin()') is null
       or to_regprocedure('public.company_user_has_permission(uuid,text)') is null then
        raise exception 'Company, Catalog Factory, product catalog, and authorization helpers are required.';
    end if;
end;
$$;

create table if not exists public.company_catalog_entitlements (
    company_id uuid primary key references public.companies(id) on delete cascade,
    active boolean not null default false,
    package_tier text not null default 'full',
    selection_mode text not null default 'full',
    created_by_user_id uuid references auth.users(id) on delete set null,
    updated_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_catalog_entitlements_package_tier_check
        check (package_tier in ('curated_10', 'curated_20', 'full')),
    constraint company_catalog_entitlements_selection_mode_check
        check (selection_mode in ('package', 'custom', 'full')),
    constraint company_catalog_entitlements_package_mode_check check (
        (package_tier = 'full' and selection_mode in ('full', 'custom'))
        or (package_tier in ('curated_10', 'curated_20') and selection_mode in ('package', 'custom'))
    )
);

create table if not exists public.company_catalog_entitlement_items (
    company_id uuid not null references public.company_catalog_entitlements(company_id) on delete cascade,
    product_variant_id uuid not null references public.catalog_product_variants(id) on delete cascade,
    selection_source text not null default 'package',
    position integer not null default 1,
    created_by_user_id uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    primary key (company_id, product_variant_id),
    constraint company_catalog_entitlement_items_source_check
        check (selection_source in ('package', 'custom')),
    constraint company_catalog_entitlement_items_position_check check (position > 0)
);

create index if not exists company_catalog_entitlement_items_variant_idx
    on public.company_catalog_entitlement_items(product_variant_id, company_id);

-- Preserve all catalog access that existed before this entitlement layer.
insert into public.company_catalog_entitlements(
    company_id,
    active,
    package_tier,
    selection_mode,
    created_at,
    updated_at
)
select company.id, true, 'full', 'full', now(), now()
from public.companies company
on conflict (company_id) do nothing;

alter table public.company_catalog_entitlements enable row level security;
alter table public.company_catalog_entitlement_items enable row level security;

-- All mutations go through the audited, package-limited RPC below.
revoke all on table public.company_catalog_entitlements from public, anon;
revoke all on table public.company_catalog_entitlement_items from public, anon;
revoke insert, update, delete, truncate, references, trigger
    on table public.company_catalog_entitlements from authenticated;
revoke insert, update, delete, truncate, references, trigger
    on table public.company_catalog_entitlement_items from authenticated;
grant select on table public.company_catalog_entitlements to authenticated;
grant select on table public.company_catalog_entitlement_items to authenticated;

create or replace function public.company_catalog_package_limit(p_package_tier text)
returns integer
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select case lower(btrim(coalesce(p_package_tier, '')))
        when 'curated_10' then 10
        when 'curated_20' then 20
        else null
    end;
$$;

create or replace function public.company_catalog_settings_can_view(p_company_id uuid)
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
           or public.company_user_has_permission(p_company_id, 'can_view_techos')
           or public.company_user_has_permission(p_company_id, 'can_view_jobs')
           or public.company_user_has_permission(p_company_id, 'can_manage_price_book')
       );
$$;

create or replace function public.company_catalog_variant_is_entitled(
    p_company_id uuid,
    p_product_variant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select exists (
        select 1
        from public.company_catalog_entitlements entitlement
        where entitlement.company_id = p_company_id
          and entitlement.active
          and (
              (
                  entitlement.package_tier = 'full'
                  and (
                      p_product_variant_id is null
                      or exists (
                          select 1
                          from public.catalog_product_variants variant
                          join public.catalog_product_families family on family.id = variant.product_family_id
                          where variant.id = p_product_variant_id
                            and variant.status = 'approved'
                            and family.status = 'approved'
                      )
                  )
              )
              or (
                  entitlement.package_tier <> 'full'
                  and exists (
                      select 1
                      from public.company_catalog_entitlement_items selected
                      join public.catalog_product_variants variant on variant.id = selected.product_variant_id
                      join public.catalog_product_families family on family.id = variant.product_family_id
                      where selected.company_id = entitlement.company_id
                        and selected.product_variant_id = p_product_variant_id
                        and variant.status = 'approved'
                        and family.status = 'approved'
                  )
              )
          )
    );
$$;

create or replace function public.company_catalog_product_is_entitled(
    p_company_id uuid,
    p_product_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select coalesce((
        select public.company_catalog_variant_is_entitled(
            product.company_id,
            product.master_product_variant_id
        )
        from public.company_approved_products product
        where product.id = p_product_id
          and product.company_id = p_company_id
    ), false);
$$;

create or replace function public.company_product_catalog_can_view(p_company_id uuid)
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
           or (
               exists (
                   select 1
                   from public.company_catalog_entitlements entitlement
                   where entitlement.company_id = p_company_id
                     and entitlement.active
               )
               and (
                   public.company_user_has_permission(p_company_id, 'can_view_techos')
                   or public.company_user_has_permission(p_company_id, 'can_view_jobs')
               )
           )
       );
$$;

create or replace function public.company_product_catalog_can_manage(p_company_id uuid)
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
           or (
               exists (
                   select 1
                   from public.company_catalog_entitlements entitlement
                   where entitlement.company_id = p_company_id
                     and entitlement.active
                     and entitlement.package_tier = 'full'
               )
               and (
                   public.company_price_book_can_manage(p_company_id)
                   or exists (
                       select 1
                       from public.company_users company_user
                       where company_user.company_id = p_company_id
                         and company_user.auth_user_id = auth.uid()
                         and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                         and lower(btrim(coalesce(company_user.role, ''))) in ('office', 'dispatcher', 'supervisor')
                   )
                   or (
                       public.company_user_has_permission(p_company_id, 'can_view_customers')
                       and public.company_user_has_permission(p_company_id, 'can_view_jobs')
                   )
               )
           )
       );
$$;

create or replace function public.catalog_variant_is_visible_to_current_user(p_product_variant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_product_variant_id is not null
       and (
           coalesce(public.homeos_is_platform_admin(), false)
           or exists (
               select 1
               from public.company_catalog_entitlements entitlement
               where entitlement.active
                 and public.company_product_catalog_can_view(entitlement.company_id)
                 and public.company_catalog_variant_is_entitled(
                     entitlement.company_id,
                     p_product_variant_id
                 )
           )
       );
$$;

revoke all on function public.company_catalog_package_limit(text) from public, anon;
revoke all on function public.company_catalog_settings_can_view(uuid) from public, anon;
revoke all on function public.company_catalog_variant_is_entitled(uuid, uuid) from public, anon;
revoke all on function public.company_catalog_product_is_entitled(uuid, uuid) from public, anon;
revoke all on function public.company_product_catalog_can_view(uuid) from public, anon;
revoke all on function public.company_product_catalog_can_manage(uuid) from public, anon;
revoke all on function public.catalog_variant_is_visible_to_current_user(uuid) from public, anon;
grant execute on function public.company_catalog_package_limit(text) to authenticated;
grant execute on function public.company_catalog_settings_can_view(uuid) to authenticated;
grant execute on function public.company_catalog_variant_is_entitled(uuid, uuid) to authenticated;
grant execute on function public.company_catalog_product_is_entitled(uuid, uuid) to authenticated;
grant execute on function public.company_product_catalog_can_view(uuid) to authenticated;
grant execute on function public.company_product_catalog_can_manage(uuid) to authenticated;
grant execute on function public.catalog_variant_is_visible_to_current_user(uuid) to authenticated;

drop policy if exists company_catalog_entitlements_read on public.company_catalog_entitlements;
create policy company_catalog_entitlements_read
on public.company_catalog_entitlements
for select to authenticated
using (public.company_catalog_settings_can_view(company_id));

drop policy if exists company_catalog_entitlements_admin_insert on public.company_catalog_entitlements;
create policy company_catalog_entitlements_admin_insert
on public.company_catalog_entitlements
for insert to authenticated
with check (public.homeos_is_platform_admin());

drop policy if exists company_catalog_entitlements_admin_update on public.company_catalog_entitlements;
create policy company_catalog_entitlements_admin_update
on public.company_catalog_entitlements
for update to authenticated
using (public.homeos_is_platform_admin())
with check (public.homeos_is_platform_admin());

drop policy if exists company_catalog_entitlement_items_read on public.company_catalog_entitlement_items;
create policy company_catalog_entitlement_items_read
on public.company_catalog_entitlement_items
for select to authenticated
using (public.company_catalog_settings_can_view(company_id));

drop policy if exists company_catalog_entitlement_items_admin_insert on public.company_catalog_entitlement_items;
create policy company_catalog_entitlement_items_admin_insert
on public.company_catalog_entitlement_items
for insert to authenticated
with check (public.homeos_is_platform_admin());

drop policy if exists company_catalog_entitlement_items_admin_update on public.company_catalog_entitlement_items;
create policy company_catalog_entitlement_items_admin_update
on public.company_catalog_entitlement_items
for update to authenticated
using (public.homeos_is_platform_admin())
with check (public.homeos_is_platform_admin());

drop policy if exists company_catalog_entitlement_items_admin_delete on public.company_catalog_entitlement_items;
create policy company_catalog_entitlement_items_admin_delete
on public.company_catalog_entitlement_items
for delete to authenticated
using (public.homeos_is_platform_admin());

-- Tighten direct table reads so RPC filtering cannot be bypassed by querying
-- the underlying company or master catalog tables.
drop policy if exists company_approved_products_select_company_estimate_users on public.company_approved_products;
drop policy if exists company_approved_products_manage_company_managers on public.company_approved_products;
create policy company_approved_products_entitled_select
on public.company_approved_products
for select to authenticated
using (
    public.homeos_is_platform_admin()
    or (
        public.company_product_catalog_can_view(company_id)
        and public.company_catalog_variant_is_entitled(company_id, master_product_variant_id)
    )
);
create policy company_approved_products_entitled_insert
on public.company_approved_products
for insert to authenticated
with check (public.company_product_catalog_can_manage(company_id));
create policy company_approved_products_entitled_update
on public.company_approved_products
for update to authenticated
using (public.company_product_catalog_can_manage(company_id))
with check (public.company_product_catalog_can_manage(company_id));
create policy company_approved_products_entitled_delete
on public.company_approved_products
for delete to authenticated
using (public.company_product_catalog_can_manage(company_id));

drop policy if exists company_product_media_select_company_estimate_users on public.company_product_media;
drop policy if exists company_product_media_manage_company_managers on public.company_product_media;
create policy company_product_media_entitled_select
on public.company_product_media
for select to authenticated
using (
    public.homeos_is_platform_admin()
    or (
        public.company_product_catalog_can_view(company_id)
        and public.company_catalog_product_is_entitled(company_id, product_id)
    )
);
create policy company_product_media_entitled_insert
on public.company_product_media
for insert to authenticated
with check (public.company_product_catalog_can_manage(company_id));
create policy company_product_media_entitled_update
on public.company_product_media
for update to authenticated
using (public.company_product_catalog_can_manage(company_id))
with check (public.company_product_catalog_can_manage(company_id));
create policy company_product_media_entitled_delete
on public.company_product_media
for delete to authenticated
using (public.company_product_catalog_can_manage(company_id));

drop policy if exists company_catalog_offerings_company_read on public.company_catalog_offerings;
create policy company_catalog_offerings_company_read
on public.company_catalog_offerings
for select to authenticated
using (
    public.homeos_is_platform_admin()
    or (
        public.company_product_catalog_can_view(company_id)
        and public.company_catalog_variant_is_entitled(company_id, product_variant_id)
    )
);

drop policy if exists catalog_product_families_read on public.catalog_product_families;
create policy catalog_product_families_read
on public.catalog_product_families
for select to authenticated
using (
    public.homeos_is_platform_admin()
    or exists (
        select 1
        from public.catalog_product_variants variant
        where variant.product_family_id = catalog_product_families.id
          and variant.status = 'approved'
          and public.catalog_variant_is_visible_to_current_user(variant.id)
    )
);

drop policy if exists catalog_product_variants_read on public.catalog_product_variants;
create policy catalog_product_variants_read
on public.catalog_product_variants
for select to authenticated
using (
    public.homeos_is_platform_admin()
    or (status = 'approved' and public.catalog_variant_is_visible_to_current_user(id))
);

drop policy if exists catalog_retail_listings_read on public.catalog_retail_listings;
create policy catalog_retail_listings_read
on public.catalog_retail_listings
for select to authenticated
using (public.catalog_variant_is_visible_to_current_user(product_variant_id));

drop policy if exists catalog_price_observations_read on public.catalog_price_observations;
create policy catalog_price_observations_read
on public.catalog_price_observations
for select to authenticated
using (
    public.homeos_is_platform_admin()
    or exists (
        select 1
        from public.catalog_retail_listings listing
        where listing.id = catalog_price_observations.retail_listing_id
          and public.catalog_variant_is_visible_to_current_user(listing.product_variant_id)
    )
);

drop policy if exists catalog_sources_read on public.catalog_sources;
create policy catalog_sources_read
on public.catalog_sources
for select to authenticated
using (
    public.homeos_is_platform_admin()
    or (product_variant_id is not null and public.catalog_variant_is_visible_to_current_user(product_variant_id))
    or (
        product_family_id is not null
        and exists (
            select 1
            from public.catalog_product_variants variant
            where variant.product_family_id = catalog_sources.product_family_id
              and public.catalog_variant_is_visible_to_current_user(variant.id)
        )
    )
);

drop policy if exists catalog_source_assets_read on public.catalog_source_assets;
create policy catalog_source_assets_read
on public.catalog_source_assets
for select to authenticated
using (
    public.homeos_is_platform_admin()
    or public.catalog_variant_is_visible_to_current_user(product_variant_id)
);

create or replace function public.get_company_catalog_entitlement(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_entitlement public.company_catalog_entitlements%rowtype;
    v_selected_ids jsonb := '[]'::jsonb;
    v_selected_count integer := 0;
    v_available_count integer := 0;
    v_assigned_count integer := 0;
begin
    if not public.company_catalog_settings_can_view(p_company_id) then
        raise exception 'Company catalog settings access is required.';
    end if;
    if not exists (select 1 from public.companies company where company.id = p_company_id) then
        raise exception 'Company was not found.';
    end if;

    select entitlement.*
    into v_entitlement
    from public.company_catalog_entitlements entitlement
    where entitlement.company_id = p_company_id;

    select
        coalesce(jsonb_agg(selected.product_variant_id order by selected.position, selected.product_variant_id), '[]'::jsonb),
        count(*)::integer
    into v_selected_ids, v_selected_count
    from public.company_catalog_entitlement_items selected
    where selected.company_id = p_company_id;

    select count(*)::integer
    into v_available_count
    from public.catalog_product_variants variant
    join public.catalog_product_families family on family.id = variant.product_family_id
    where variant.status = 'approved'
      and family.status = 'approved';

    if coalesce(v_entitlement.active, false) then
        if v_entitlement.package_tier = 'full' then
            v_assigned_count := v_available_count;
        else
            select count(*)::integer
            into v_assigned_count
            from public.company_catalog_entitlement_items selected
            join public.catalog_product_variants variant on variant.id = selected.product_variant_id
            join public.catalog_product_families family on family.id = variant.product_family_id
            where selected.company_id = p_company_id
              and variant.status = 'approved'
              and family.status = 'approved';
        end if;
    end if;

    return jsonb_build_object(
        'company_id', p_company_id,
        'active', coalesce(v_entitlement.active, false),
        'package_tier', coalesce(v_entitlement.package_tier, 'full'),
        'selection_mode', coalesce(v_entitlement.selection_mode, 'full'),
        'selected_variant_ids', v_selected_ids,
        'selected_count', v_selected_count,
        'assigned_count', v_assigned_count,
        'available_count', v_available_count,
        'updated_at', v_entitlement.updated_at
    );
end;
$$;

create or replace function public.save_company_catalog_entitlement(
    p_company_id uuid,
    p_active boolean,
    p_package_tier text,
    p_selected_variant_ids uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_package_tier text := lower(btrim(coalesce(p_package_tier, '')));
    v_package_limit integer;
    v_selected_ids uuid[] := array[]::uuid[];
    v_before public.company_catalog_entitlements%rowtype;
    v_after public.company_catalog_entitlements%rowtype;
begin
    if auth.uid() is null or not coalesce(public.homeos_is_platform_admin(), false) then
        raise exception 'Platform Administration access is required.';
    end if;
    if not exists (select 1 from public.companies company where company.id = p_company_id) then
        raise exception 'Company was not found.';
    end if;
    if v_package_tier not in ('curated_10', 'curated_20', 'full') then
        raise exception 'Choose Curated 10, Curated 20, or Full Master Catalog.';
    end if;

    select coalesce(array_agg(selection.product_variant_id order by selection.first_position), array[]::uuid[])
    into v_selected_ids
    from (
        select selected.product_variant_id, min(selected.position) as first_position
        from unnest(coalesce(p_selected_variant_ids, array[]::uuid[]))
            with ordinality as selected(product_variant_id, position)
        where selected.product_variant_id is not null
        group by selected.product_variant_id
    ) selection;

    v_package_limit := public.company_catalog_package_limit(v_package_tier);
    if v_package_limit is not null and cardinality(v_selected_ids) > v_package_limit then
        raise exception '% allows at most % master cards.', replace(initcap(v_package_tier), '_', ' '), v_package_limit;
    end if;
    if coalesce(p_active, false) and v_package_limit is not null and cardinality(v_selected_ids) = 0 then
        raise exception 'Choose at least one approved master card before activating this curated package.';
    end if;
    if exists (
        select 1
        from unnest(v_selected_ids) selected(product_variant_id)
        where not exists (
            select 1
            from public.catalog_product_variants variant
            join public.catalog_product_families family on family.id = variant.product_family_id
            where variant.id = selected.product_variant_id
              and variant.status = 'approved'
              and family.status = 'approved'
        )
    ) then
        raise exception 'Every selected package card must be an approved master product.';
    end if;

    select entitlement.*
    into v_before
    from public.company_catalog_entitlements entitlement
    where entitlement.company_id = p_company_id
    for update;

    insert into public.company_catalog_entitlements(
        company_id,
        active,
        package_tier,
        selection_mode,
        created_by_user_id,
        updated_by_user_id,
        updated_at
    ) values (
        p_company_id,
        coalesce(p_active, false),
        v_package_tier,
        case when v_package_tier = 'full' then 'full' else 'package' end,
        auth.uid(),
        auth.uid(),
        now()
    )
    on conflict (company_id) do update set
        active = excluded.active,
        package_tier = excluded.package_tier,
        selection_mode = excluded.selection_mode,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    returning * into v_after;

    delete from public.company_catalog_entitlement_items selected
    where selected.company_id = p_company_id
      and not (selected.product_variant_id = any(v_selected_ids));

    insert into public.company_catalog_entitlement_items(
        company_id,
        product_variant_id,
        selection_source,
        position,
        created_by_user_id
    )
    select
        p_company_id,
        selected.product_variant_id,
        'package',
        selected.position::integer,
        auth.uid()
    from unnest(v_selected_ids) with ordinality as selected(product_variant_id, position)
    on conflict (company_id, product_variant_id) do update set
        selection_source = excluded.selection_source,
        position = excluded.position;

    if to_regprocedure('public.log_company_audit_event(uuid,text,text,uuid,text,jsonb,jsonb,jsonb)') is not null then
        perform public.log_company_audit_event(
            p_company_id,
            'catalog.entitlement_changed',
            'company_catalog_entitlement',
            p_company_id,
            'Company catalog access',
            case when v_before.company_id is null then null else to_jsonb(v_before) end,
            to_jsonb(v_after),
            jsonb_build_object('selected_variant_count', cardinality(v_selected_ids))
        );
    end if;

    return public.get_company_catalog_entitlement(p_company_id);
end;
$$;

revoke all on function public.get_company_catalog_entitlement(uuid) from public, anon;
revoke all on function public.save_company_catalog_entitlement(uuid, boolean, text, uuid[]) from public, anon;
grant execute on function public.get_company_catalog_entitlement(uuid) to authenticated;
grant execute on function public.save_company_catalog_entitlement(uuid, boolean, text, uuid[]) to authenticated;

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
            select asset.source_url
            from public.catalog_source_assets asset
            where asset.product_variant_id = variant.id
              and asset.asset_type = 'image'
            order by asset.is_primary desc, asset.created_at
            limit 1
        ),
        'entitled', public.company_catalog_variant_is_entitled(p_company_id, variant.id),
        'offering', (
            select to_jsonb(offering)
            from public.company_catalog_offerings offering
            where offering.company_id = p_company_id
              and offering.product_variant_id = variant.id
        )
    ) order by template.category_name, family.brand, family.family_name, variant.model_number), '[]'::jsonb)
    into v_result
    from public.catalog_product_variants variant
    join public.catalog_product_families family on family.id = variant.product_family_id
    join public.catalog_category_templates template on template.id = family.category_template_id
    where variant.status = 'approved'
      and family.status = 'approved'
      and (
          v_is_platform_admin
          or public.company_catalog_variant_is_entitled(p_company_id, variant.id)
      );

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
declare
    v_variant record;
    v_company_product_id uuid;
    v_offering public.company_catalog_offerings%rowtype;
begin
    if auth.uid() is null or not (
        coalesce(public.homeos_is_platform_admin(), false)
        or public.company_price_book_can_manage(p_company_id)
    ) then
        raise exception 'Company catalog management access is required.';
    end if;
    if not public.company_catalog_variant_is_entitled(p_company_id, p_variant_id) then
        raise exception 'This master card is not included in the company catalog package.';
    end if;
    if jsonb_typeof(p_payload) <> 'object' then
        raise exception 'Company offering details are required.';
    end if;

    select variant.*, family.manufacturer, family.brand, family.family_name, template.category_name
    into v_variant
    from public.catalog_product_variants variant
    join public.catalog_product_families family on family.id = variant.product_family_id
    join public.catalog_category_templates template on template.id = family.category_template_id
    where variant.id = p_variant_id
      and variant.status = 'approved'
      and family.status = 'approved';
    if not found then
        raise exception 'Only approved master products can be added to a company catalog.';
    end if;

    select offering.company_catalog_product_id
    into v_company_product_id
    from public.company_catalog_offerings offering
    where offering.company_id = p_company_id
      and offering.product_variant_id = p_variant_id;

    if v_company_product_id is null then
        insert into public.company_approved_products(
            company_id, product_name, category, brand, model, manufacturer_part_number, product_description,
            product_specifications, warranty, catalog_status, approved, active, master_product_variant_id,
            internal_product_cost, approved_selling_price, created_by_user_id, updated_by_user_id
        ) values (
            p_company_id,
            concat_ws(' ', v_variant.brand, v_variant.family_name, v_variant.model_number),
            v_variant.category_name,
            v_variant.brand,
            v_variant.model_number,
            v_variant.manufacturer_part_number,
            coalesce(v_variant.description, v_variant.family_name),
            v_variant.specifications,
            nullif(btrim(coalesce(p_payload->>'company_warranty', '')), ''),
            'approved',
            true,
            coalesce((p_payload->>'active')::boolean, true),
            p_variant_id,
            nullif(p_payload->>'material_cost', '')::numeric,
            nullif(p_payload->>'installed_price', '')::numeric,
            auth.uid(),
            auth.uid()
        ) returning id into v_company_product_id;
    else
        update public.company_approved_products product
        set internal_product_cost = nullif(p_payload->>'material_cost', '')::numeric,
            approved_selling_price = nullif(p_payload->>'installed_price', '')::numeric,
            warranty = nullif(btrim(coalesce(p_payload->>'company_warranty', '')), ''),
            approved = true,
            active = coalesce((p_payload->>'active')::boolean, true),
            catalog_status = case when coalesce((p_payload->>'active')::boolean, true) then 'approved' else 'archived' end,
            updated_by_user_id = auth.uid(),
            updated_at = now()
        where product.id = v_company_product_id
          and product.company_id = p_company_id;
    end if;

    insert into public.company_catalog_offerings(
        company_id, product_variant_id, company_catalog_product_id, material_cost, markup, labor_amount,
        installed_price, preferred_supplier, company_warranty, active, created_by_user_id,
        updated_by_user_id, updated_at
    ) values (
        p_company_id,
        p_variant_id,
        v_company_product_id,
        nullif(p_payload->>'material_cost', '')::numeric,
        nullif(p_payload->>'markup', '')::numeric,
        nullif(p_payload->>'labor_amount', '')::numeric,
        nullif(p_payload->>'installed_price', '')::numeric,
        nullif(btrim(coalesce(p_payload->>'preferred_supplier', '')), ''),
        nullif(btrim(coalesce(p_payload->>'company_warranty', '')), ''),
        coalesce((p_payload->>'active')::boolean, true),
        auth.uid(),
        auth.uid(),
        now()
    )
    on conflict (company_id, product_variant_id) do update set
        company_catalog_product_id = excluded.company_catalog_product_id,
        material_cost = excluded.material_cost,
        markup = excluded.markup,
        labor_amount = excluded.labor_amount,
        installed_price = excluded.installed_price,
        preferred_supplier = excluded.preferred_supplier,
        company_warranty = excluded.company_warranty,
        active = excluded.active,
        updated_by_user_id = auth.uid(),
        updated_at = now()
    returning * into v_offering;

    return to_jsonb(v_offering);
end;
$$;

revoke all on function public.save_company_catalog_offering(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_company_catalog_offering(uuid, uuid, jsonb) to authenticated;

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
        'master_product_variant_id', product.master_product_variant_id,
        'entitled', public.company_catalog_variant_is_entitled(product.company_id, product.master_product_variant_id),
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
                'active', media.active,
                'homeowner_visible', media.homeowner_visible
            ) order by media.created_at)
            from public.company_product_media media
            where media.product_id = product.id
              and media.active
        ), '[]'::jsonb)
    )
    from public.company_approved_products product
    left join public.company_price_book_items price_item
      on price_item.id = product.price_book_item_id
     and price_item.company_id = product.company_id
    where product.company_id = p_company_id
      and public.company_product_catalog_can_view(p_company_id)
      and (
          coalesce(public.homeos_is_platform_admin(), false)
          or public.company_catalog_variant_is_entitled(p_company_id, product.master_product_variant_id)
      )
      and (
          public.company_product_catalog_can_manage(p_company_id)
          or (product.approved and product.active and product.catalog_status = 'approved')
      )
    order by product.catalog_status, product.category, product.brand, product.model;
$$;

revoke all on function public.get_company_product_catalog(uuid) from public, anon;
grant execute on function public.get_company_product_catalog(uuid) to authenticated;

create or replace function public.get_company_approved_products(p_company_id uuid)
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
      and product.active
      and product.approved
      and public.company_catalog_variant_is_entitled(
          product.company_id,
          product.master_product_variant_id
      )
    order by product.category, product.tier, product.brand, product.model;
$$;

revoke all on function public.get_company_approved_products(uuid) from public, anon;
grant execute on function public.get_company_approved_products(uuid) to authenticated;

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

    -- Installed HomeOS product history remains readable even when the source
    -- company's live catalog is later deactivated.
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
       and (
           coalesce(public.homeos_is_platform_admin(), false)
           or public.company_catalog_product_is_entitled(v_company_id, v_product_id)
       )
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

commit;
