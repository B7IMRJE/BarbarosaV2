-- 592_Category_Scoped_Preferred_Providers.sql
-- Review-only proposal. Do not run until reviewed in Supabase.
--
-- Product goal:
-- - A property can have one active preferred provider per service category.
-- - Selecting Bravo for Plumbing should hide competing Plumbing providers.
-- - Selecting an Electrical or HVAC provider later should not archive Bravo's
--   active Plumbing relationship.
--
-- Current limitation:
-- - public.property_preferred_providers currently has a unique active row per
--   property_id. The existing request_property_provider_connection and
--   accept_customer_invite_by_code flows archive all other active providers for
--   the property, regardless of service category.

begin;

do $$
begin
    if to_regclass('public.property_preferred_providers') is null then
        raise exception 'public.property_preferred_providers is required.';
    end if;

    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required.';
    end if;
end
$$;

alter table public.property_preferred_providers
    add column if not exists service_category_key text null;

comment on column public.property_preferred_providers.service_category_key is
    'Normalized provider category for category-scoped preferred provider selection, such as plumbing, hvac, electrical, or roofing.';

create or replace function public.homeos_normalize_provider_category(p_category text)
returns text
language sql
immutable
as $$
    select case
        when p_category is null or btrim(p_category) = '' then null
        when regexp_replace(lower(p_category), '[^a-z0-9]+', ' ', 'g') ~
            '(plumb|water heater|water heaters|drain|sewer|repipe|pipe|leak|gas|water treatment|water quality)'
            then 'plumbing'
        when regexp_replace(lower(p_category), '[^a-z0-9]+', ' ', 'g') ~
            '(hvac|heating|cooling|air conditioning|air conditioner|furnace)'
            then 'hvac'
        when regexp_replace(lower(p_category), '[^a-z0-9]+', ' ', 'g') ~
            '(electric|electrical|outlet|breaker|panel)'
            then 'electrical'
        when regexp_replace(lower(p_category), '[^a-z0-9]+', ' ', 'g') ~
            '(roof|roofing|gutter)'
            then 'roofing'
        else regexp_replace(btrim(lower(p_category)), '[^a-z0-9]+', '-', 'g')
    end;
$$;

create or replace function public.homeos_company_provider_category_keys(p_company_id uuid)
returns table(category_key text)
language sql
stable
security definer
set search_path = public
as $$
    select distinct public.homeos_normalize_provider_category(category) as category_key
    from public.companies company
    cross join unnest(coalesce(company.service_categories, '{}'::text[])) as category
    where company.id = p_company_id
      and public.homeos_normalize_provider_category(category) is not null;
$$;

-- Backfill existing rows with the first normalized category for that company.
-- Companies without categories stay null and continue to behave as general
-- provider rows until a category is configured.
with first_company_category as (
    select
        company.id as company_id,
        min(public.homeos_normalize_provider_category(category)) as category_key
    from public.companies company
    cross join unnest(coalesce(company.service_categories, '{}'::text[])) as category
    where public.homeos_normalize_provider_category(category) is not null
    group by company.id
)
update public.property_preferred_providers preferred_provider
set service_category_key = first_company_category.category_key,
    updated_at = now()
from first_company_category
where preferred_provider.company_id = first_company_category.company_id
  and preferred_provider.service_category_key is null;

-- Replace the one-active-provider-per-property index with one active provider
-- per property/category. Review existing duplicate data before dropping the old
-- index in production.
drop index if exists property_preferred_providers_one_active_property_idx;

create unique index if not exists property_preferred_providers_one_active_property_category_idx
on public.property_preferred_providers (property_id, coalesce(service_category_key, 'general'))
where status = 'active';

create index if not exists property_preferred_providers_property_category_idx
on public.property_preferred_providers (property_id, service_category_key, status);

-- Follow-up function work required before deploy:
-- 1. Update public.request_property_provider_connection(uuid, uuid) so it:
--    - gets category keys for p_company_id
--    - archives only active preferred providers for overlapping category keys
--    - inserts/updates one active preferred provider row per category key
--    - preserves active providers in non-overlapping categories
-- 2. Update public.accept_customer_invite_by_code(text, uuid) with the same
--    category-scoped preferred-provider behavior.
-- 3. Keep company_property_clients active per company/property.
-- 4. Keep property_connections scoped to property/company and do not expose
--    HomeOS private photos, documents, or history.

rollback;
