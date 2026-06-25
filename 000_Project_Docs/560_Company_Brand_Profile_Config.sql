-- Phase 5.6
-- Company brand/profile configuration for ManagementOS, TechOS, and homeowner company cards.

alter table public.companies
    add column if not exists public_name text,
    add column if not exists dba_name text,
    add column if not exists logo_url text,
    add column if not exists primary_color text,
    add column if not exists secondary_color text,
    add column if not exists accent_color text,
    add column if not exists service_categories text[] not null default '{}'::text[],
    add column if not exists homeos_rating numeric(3, 2) not null default 0,
    add column if not exists homeos_rating_count integer not null default 0,
    add column if not exists combined_experience_years integer not null default 0,
    add column if not exists license_number text,
    add column if not exists phone text,
    add column if not exists website text,
    add column if not exists short_description text,
    add column if not exists updated_at timestamptz not null default now();

update public.companies
set
    public_name = coalesce(nullif(trim(public_name), ''), name),
    primary_color = coalesce(nullif(trim(primary_color), ''), nullif(trim(theme_color), ''), '#071B33'),
    secondary_color = coalesce(nullif(trim(secondary_color), ''), '#FFFFFF'),
    accent_color = coalesce(nullif(trim(accent_color), ''), '#0B5FFF')
where public_name is null
   or primary_color is null
   or secondary_color is null
   or accent_color is null;

create or replace function public.update_company_brand_profile(
    p_company_id uuid,
    p_public_name text default null,
    p_dba_name text default null,
    p_logo_url text default null,
    p_primary_color text default null,
    p_secondary_color text default null,
    p_accent_color text default null,
    p_service_categories text[] default '{}'::text[],
    p_homeos_rating numeric default 0,
    p_homeos_rating_count integer default 0,
    p_combined_experience_years integer default 0,
    p_license_number text default null,
    p_phone text default null,
    p_website text default null,
    p_short_description text default null
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
    updated_company public.companies%rowtype;
begin
    if not public.is_platform_admin() then
        raise exception 'Not authorized';
    end if;

    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    update public.companies
    set
        public_name = nullif(trim(p_public_name), ''),
        dba_name = nullif(trim(p_dba_name), ''),
        logo_url = nullif(trim(p_logo_url), ''),
        primary_color = coalesce(nullif(trim(p_primary_color), ''), '#071B33'),
        secondary_color = coalesce(nullif(trim(p_secondary_color), ''), '#FFFFFF'),
        accent_color = coalesce(nullif(trim(p_accent_color), ''), '#0B5FFF'),
        theme_color = coalesce(nullif(trim(p_primary_color), ''), theme_color, '#071B33'),
        service_categories = coalesce(p_service_categories, '{}'::text[]),
        homeos_rating = greatest(0, least(5, coalesce(p_homeos_rating, 0))),
        homeos_rating_count = greatest(0, coalesce(p_homeos_rating_count, 0)),
        combined_experience_years = greatest(0, coalesce(p_combined_experience_years, 0)),
        license_number = nullif(trim(p_license_number), ''),
        phone = nullif(trim(p_phone), ''),
        website = nullif(trim(p_website), ''),
        short_description = nullif(trim(p_short_description), ''),
        updated_at = now()
    where id = p_company_id
    returning * into updated_company;

    if updated_company.id is null then
        raise exception 'Company not found';
    end if;

    return updated_company;
end;
$$;

revoke all on function public.update_company_brand_profile(
    uuid, text, text, text, text, text, text, text[], numeric, integer, integer, text, text, text, text
) from public;

grant execute on function public.update_company_brand_profile(
    uuid, text, text, text, text, text, text, text[], numeric, integer, integer, text, text, text, text
) to authenticated;

notify pgrst, 'reload schema';
