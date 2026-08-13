-- Homeowner-facing technician biographies, company-approved professional contact
-- fields, and verified, job-backed reviews. Personal contact, address, auth, and
-- private HR data are never exposed by these RPCs.

begin;

create table if not exists public.company_technician_public_profiles (
    company_user_id uuid primary key references public.company_users(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    display_name text,
    profile_photo_url text,
    short_bio text,
    general_location text,
    family_note text,
    hobbies text[] not null default '{}',
    specialties text[] not null default '{}',
    languages text[] not null default '{}',
    certifications text[] not null default '{}',
    years_experience integer,
    publication_status text not null default 'draft',
    pending_profile jsonb,
    pending_submitted_at timestamptz,
    approved_by_user_id uuid,
    approved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_technician_public_profiles_experience_check
        check (years_experience is null or years_experience between 0 and 80),
    constraint company_technician_public_profiles_publication_check
        check (publication_status in ('draft', 'published', 'hidden'))
);

create index if not exists company_technician_public_profiles_company_idx
    on public.company_technician_public_profiles(company_id, publication_status);

alter table public.company_technician_public_profiles enable row level security;
revoke all on table public.company_technician_public_profiles from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'technician-profile-photos',
    'technician-profile-photos',
    true,
    8388608,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists technician_profile_photos_self_insert on storage.objects;
create policy technician_profile_photos_self_insert
on storage.objects for insert to authenticated
with check (
    bucket_id = 'technician-profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
        select 1
        from public.company_users as company_user
        where company_user.id::text = (storage.foldername(name))[2]
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.role, ''))) = 'technician'
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    )
);

drop policy if exists technician_profile_photos_self_delete on storage.objects;
create policy technician_profile_photos_self_delete
on storage.objects for delete to authenticated
using (
    bucket_id = 'technician-profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
        select 1
        from public.company_users as company_user
        where company_user.id::text = (storage.foldername(name))[2]
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.role, ''))) = 'technician'
    )
);

create table if not exists public.company_staff_professional_contacts (
    company_user_id uuid primary key references public.company_users(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    professional_title text,
    department text,
    professional_phone text,
    professional_email text,
    extension text,
    professional_website text,
    years_with_company integer,
    shared_fields text[] not null default array[
        'professional_title', 'department', 'professional_phone', 'professional_email',
        'extension', 'professional_website', 'years_with_company'
    ],
    approved_by_user_id uuid,
    approved_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_staff_professional_contacts_years_check
        check (years_with_company is null or years_with_company between 0 and 80),
    constraint company_staff_professional_contacts_email_check
        check (professional_email is null or professional_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
    constraint company_staff_professional_contacts_website_check
        check (professional_website is null or professional_website ~* '^https://[^[:space:]]+$')
);

create index if not exists company_staff_professional_contacts_company_idx
    on public.company_staff_professional_contacts(company_id, updated_at desc);

alter table public.company_staff_professional_contacts enable row level security;
revoke all on table public.company_staff_professional_contacts from public, anon, authenticated;

create or replace function public.get_company_staff_professional_contacts_for_management(
    p_company_id uuid
)
returns setof public.company_staff_professional_contacts
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if p_company_id is null or not public.can_manage_company_users(p_company_id) then
        raise exception 'Company team management access is required.';
    end if;
    return query
    select contact.* from public.company_staff_professional_contacts as contact
    where contact.company_id = p_company_id
    order by contact.updated_at desc, contact.company_user_id;
end;
$$;

revoke all on function public.get_company_staff_professional_contacts_for_management(uuid) from public, anon;
grant execute on function public.get_company_staff_professional_contacts_for_management(uuid) to authenticated;

create or replace function public.get_my_company_staff_professional_contact(
    p_company_user_id uuid
)
returns setof public.company_staff_professional_contacts
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not exists (
        select 1 from public.company_users as company_user
        where company_user.id = p_company_user_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    ) then
        raise exception 'An active company staff login is required.';
    end if;
    return query
    select contact.* from public.company_staff_professional_contacts as contact
    where contact.company_user_id = p_company_user_id;
end;
$$;

revoke all on function public.get_my_company_staff_professional_contact(uuid) from public, anon;
grant execute on function public.get_my_company_staff_professional_contact(uuid) to authenticated;

create or replace function public.save_company_staff_professional_contact(
    p_company_user_id uuid,
    p_professional_title text default null,
    p_department text default null,
    p_professional_phone text default null,
    p_professional_email text default null,
    p_extension text default null,
    p_professional_website text default null,
    p_years_with_company integer default null,
    p_shared_fields text[] default '{}'
)
returns public.company_staff_professional_contacts
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company_user public.company_users%rowtype;
    v_contact public.company_staff_professional_contacts%rowtype;
    v_email text := lower(nullif(btrim(coalesce(p_professional_email, '')), ''));
    v_website text := nullif(btrim(coalesce(p_professional_website, '')), '');
    v_allowed_fields constant text[] := array[
        'professional_title', 'department', 'professional_phone', 'professional_email',
        'extension', 'professional_website', 'years_with_company'
    ];
    v_shared_fields text[];
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    select * into v_company_user from public.company_users where id = p_company_user_id;
    if not found then raise exception 'Company staff member not found.'; end if;
    if not public.can_manage_company_users(v_company_user.company_id) then
        raise exception 'Company team management access is required.';
    end if;
    if p_years_with_company is not null and (p_years_with_company < 0 or p_years_with_company > 80) then
        raise exception 'Years with company must be between 0 and 80.';
    end if;
    if v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise exception 'Enter a valid professional email.';
    end if;
    if v_website is not null and v_website !~* '^https://[^[:space:]]+$' then
        raise exception 'Professional website must use a secure HTTPS address.';
    end if;

    select coalesce(array_agg(distinct field), '{}') into v_shared_fields
    from unnest(coalesce(p_shared_fields, '{}')) field
    where field = any(v_allowed_fields);

    insert into public.company_staff_professional_contacts (
        company_user_id, company_id, professional_title, department, professional_phone,
        professional_email, extension, professional_website, years_with_company,
        shared_fields, approved_by_user_id, approved_at, updated_at
    ) values (
        v_company_user.id, v_company_user.company_id,
        left(nullif(btrim(coalesce(p_professional_title, '')), ''), 120),
        left(nullif(btrim(coalesce(p_department, '')), ''), 120),
        left(nullif(btrim(coalesce(p_professional_phone, '')), ''), 40),
        v_email,
        left(nullif(btrim(coalesce(p_extension, '')), ''), 20),
        v_website,
        p_years_with_company,
        v_shared_fields,
        auth.uid(), now(), now()
    )
    on conflict (company_user_id) do update set
        company_id = excluded.company_id,
        professional_title = excluded.professional_title,
        department = excluded.department,
        professional_phone = excluded.professional_phone,
        professional_email = excluded.professional_email,
        extension = excluded.extension,
        professional_website = excluded.professional_website,
        years_with_company = excluded.years_with_company,
        shared_fields = excluded.shared_fields,
        approved_by_user_id = auth.uid(),
        approved_at = now(),
        updated_at = now()
    returning * into v_contact;

    return v_contact;
end;
$$;

revoke all on function public.save_company_staff_professional_contact(uuid, text, text, text, text, text, text, integer, text[]) from public, anon;
grant execute on function public.save_company_staff_professional_contact(uuid, text, text, text, text, text, text, integer, text[]) to authenticated;

create table if not exists public.home_service_reviews (
    id uuid primary key default gen_random_uuid(),
    service_request_id uuid not null references public.service_requests(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    technician_company_user_id uuid references public.company_users(id) on delete set null,
    target_type text not null,
    star_rating smallint not null,
    category_scores jsonb not null default '{}'::jsonb,
    tags text[] not null default '{}',
    comments text,
    verified_completed_job boolean not null default true,
    moderation_status text not null default 'private',
    created_by_user_id uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint home_service_reviews_target_check check (target_type in ('technician', 'company')),
    constraint home_service_reviews_rating_check check (star_rating between 1 and 5),
    constraint home_service_reviews_moderation_check check (moderation_status in ('private', 'approved', 'rejected')),
    constraint home_service_reviews_target_technician_check check (
        (target_type = 'technician' and technician_company_user_id is not null)
        or target_type = 'company'
    )
);

create index if not exists home_service_reviews_technician_summary_idx
    on public.home_service_reviews(technician_company_user_id, target_type, verified_completed_job);
create index if not exists home_service_reviews_company_summary_idx
    on public.home_service_reviews(company_id, target_type, verified_completed_job);
create unique index if not exists home_service_reviews_one_company_review_idx
    on public.home_service_reviews(service_request_id, created_by_user_id)
    where target_type = 'company';
create unique index if not exists home_service_reviews_one_technician_review_idx
    on public.home_service_reviews(service_request_id, created_by_user_id, technician_company_user_id)
    where target_type = 'technician';

alter table public.home_service_reviews enable row level security;
revoke all on table public.home_service_reviews from public, anon, authenticated;

create or replace function public.get_company_technician_public_profiles_for_management(
    p_company_id uuid
)
returns setof public.company_technician_public_profiles
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_company_id is null or not public.can_manage_company_users(p_company_id) then
        raise exception 'Company team management access is required.';
    end if;

    return query
    select profile.*
    from public.company_technician_public_profiles as profile
    where profile.company_id = p_company_id
    order by profile.updated_at desc, profile.company_user_id;
end;
$$;

revoke all on function public.get_company_technician_public_profiles_for_management(uuid) from public, anon;
grant execute on function public.get_company_technician_public_profiles_for_management(uuid) to authenticated;

create or replace function public.save_company_technician_public_profile(
    p_company_user_id uuid,
    p_display_name text default null,
    p_profile_photo_url text default null,
    p_short_bio text default null,
    p_general_location text default null,
    p_family_note text default null,
    p_hobbies text[] default '{}',
    p_specialties text[] default '{}',
    p_languages text[] default '{}',
    p_certifications text[] default '{}',
    p_years_experience integer default null,
    p_publication_status text default 'draft'
)
returns public.company_technician_public_profiles
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company_user public.company_users%rowtype;
    v_profile public.company_technician_public_profiles%rowtype;
    v_status text := lower(btrim(coalesce(p_publication_status, 'draft')));
    v_photo_url text := nullif(btrim(coalesce(p_profile_photo_url, '')), '');
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select * into v_company_user
    from public.company_users
    where id = p_company_user_id;

    if not found or lower(btrim(coalesce(v_company_user.role, ''))) <> 'technician' then
        raise exception 'An active company technician is required.';
    end if;

    if lower(btrim(coalesce(v_company_user.status, ''))) <> 'active' then
        raise exception 'Only active technicians can have a public profile.';
    end if;

    if not public.can_manage_company_users(v_company_user.company_id) then
        raise exception 'Company team management access is required.';
    end if;

    if v_status not in ('draft', 'published', 'hidden') then
        raise exception 'Publication status must be draft, published, or hidden.';
    end if;

    if p_years_experience is not null and (p_years_experience < 0 or p_years_experience > 80) then
        raise exception 'Years of experience must be between 0 and 80.';
    end if;

    if v_photo_url is not null and v_photo_url !~* '^https://[^[:space:]]+$' then
        raise exception 'Portrait must use a secure HTTPS address.';
    end if;

    insert into public.company_technician_public_profiles (
        company_user_id,
        company_id,
        display_name,
        profile_photo_url,
        short_bio,
        general_location,
        family_note,
        hobbies,
        specialties,
        languages,
        certifications,
        years_experience,
        publication_status,
        approved_by_user_id,
        approved_at,
        pending_profile,
        pending_submitted_at,
        updated_at
    ) values (
        v_company_user.id,
        v_company_user.company_id,
        left(nullif(btrim(coalesce(p_display_name, '')), ''), 100),
        v_photo_url,
        left(nullif(btrim(coalesce(p_short_bio, '')), ''), 1000),
        left(nullif(btrim(coalesce(p_general_location, '')), ''), 120),
        left(nullif(btrim(coalesce(p_family_note, '')), ''), 180),
        coalesce((select array_agg(left(btrim(value), 80)) from unnest(coalesce(p_hobbies, '{}')) value where nullif(btrim(value), '') is not null), '{}'),
        coalesce((select array_agg(left(btrim(value), 80)) from unnest(coalesce(p_specialties, '{}')) value where nullif(btrim(value), '') is not null), '{}'),
        coalesce((select array_agg(left(btrim(value), 80)) from unnest(coalesce(p_languages, '{}')) value where nullif(btrim(value), '') is not null), '{}'),
        coalesce((select array_agg(left(btrim(value), 120)) from unnest(coalesce(p_certifications, '{}')) value where nullif(btrim(value), '') is not null), '{}'),
        p_years_experience,
        v_status,
        case when v_status = 'published' then auth.uid() else null end,
        case when v_status = 'published' then now() else null end,
        null,
        null,
        now()
    )
    on conflict (company_user_id) do update set
        company_id = excluded.company_id,
        display_name = excluded.display_name,
        profile_photo_url = excluded.profile_photo_url,
        short_bio = excluded.short_bio,
        general_location = excluded.general_location,
        family_note = excluded.family_note,
        hobbies = excluded.hobbies,
        specialties = excluded.specialties,
        languages = excluded.languages,
        certifications = excluded.certifications,
        years_experience = excluded.years_experience,
        publication_status = excluded.publication_status,
        approved_by_user_id = excluded.approved_by_user_id,
        approved_at = excluded.approved_at,
        pending_profile = null,
        pending_submitted_at = null,
        updated_at = now()
    returning * into v_profile;

    return v_profile;
end;
$$;

revoke all on function public.save_company_technician_public_profile(uuid, text, text, text, text, text, text[], text[], text[], text[], integer, text) from public, anon;
grant execute on function public.save_company_technician_public_profile(uuid, text, text, text, text, text, text[], text[], text[], text[], integer, text) to authenticated;

create or replace function public.get_my_company_technician_public_profile(
    p_company_user_id uuid
)
returns setof public.company_technician_public_profiles
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not exists (
        select 1 from public.company_users as company_user
        where company_user.id = p_company_user_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.role, ''))) = 'technician'
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    ) then
        raise exception 'An active technician login is required.';
    end if;

    return query
    select profile.*
    from public.company_technician_public_profiles as profile
    where profile.company_user_id = p_company_user_id;
end;
$$;

revoke all on function public.get_my_company_technician_public_profile(uuid) from public, anon;
grant execute on function public.get_my_company_technician_public_profile(uuid) to authenticated;

create or replace function public.submit_my_company_technician_public_profile(
    p_company_user_id uuid,
    p_display_name text default null,
    p_profile_photo_url text default null,
    p_short_bio text default null,
    p_general_location text default null,
    p_family_note text default null,
    p_hobbies text[] default '{}',
    p_specialties text[] default '{}',
    p_languages text[] default '{}',
    p_certifications text[] default '{}',
    p_years_experience integer default null
)
returns public.company_technician_public_profiles
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company_user public.company_users%rowtype;
    v_profile public.company_technician_public_profiles%rowtype;
    v_photo_url text := nullif(btrim(coalesce(p_profile_photo_url, '')), '');
    v_pending jsonb;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_company_user
    from public.company_users
    where id = p_company_user_id
      and auth_user_id = auth.uid()
      and lower(btrim(coalesce(role, ''))) = 'technician'
      and lower(btrim(coalesce(status, ''))) = 'active';

    if not found then raise exception 'An active technician login is required.'; end if;
    if p_years_experience is not null and (p_years_experience < 0 or p_years_experience > 80) then
        raise exception 'Years of experience must be between 0 and 80.';
    end if;
    if v_photo_url is not null and v_photo_url !~* '^https://[^[:space:]]+$' then
        raise exception 'Portrait must use a secure HTTPS address.';
    end if;

    v_pending := jsonb_build_object(
        'display_name', left(nullif(btrim(coalesce(p_display_name, '')), ''), 100),
        'profile_photo_url', v_photo_url,
        'short_bio', left(nullif(btrim(coalesce(p_short_bio, '')), ''), 1000),
        'general_location', left(nullif(btrim(coalesce(p_general_location, '')), ''), 120),
        'family_note', left(nullif(btrim(coalesce(p_family_note, '')), ''), 180),
        'hobbies', to_jsonb(coalesce((select array_agg(left(btrim(value), 80)) from unnest(coalesce(p_hobbies, '{}')) value where nullif(btrim(value), '') is not null), '{}')),
        'specialties', to_jsonb(coalesce((select array_agg(left(btrim(value), 80)) from unnest(coalesce(p_specialties, '{}')) value where nullif(btrim(value), '') is not null), '{}')),
        'languages', to_jsonb(coalesce((select array_agg(left(btrim(value), 80)) from unnest(coalesce(p_languages, '{}')) value where nullif(btrim(value), '') is not null), '{}')),
        'certifications', to_jsonb(coalesce((select array_agg(left(btrim(value), 120)) from unnest(coalesce(p_certifications, '{}')) value where nullif(btrim(value), '') is not null), '{}')),
        'years_experience', p_years_experience
    );

    insert into public.company_technician_public_profiles (
        company_user_id, company_id, publication_status, pending_profile, pending_submitted_at, updated_at
    ) values (
        v_company_user.id, v_company_user.company_id, 'draft', v_pending, now(), now()
    )
    on conflict (company_user_id) do update set
        company_id = excluded.company_id,
        pending_profile = excluded.pending_profile,
        pending_submitted_at = excluded.pending_submitted_at,
        updated_at = now()
    returning * into v_profile;

    return v_profile;
end;
$$;

revoke all on function public.submit_my_company_technician_public_profile(uuid, text, text, text, text, text, text[], text[], text[], text[], integer) from public, anon;
grant execute on function public.submit_my_company_technician_public_profile(uuid, text, text, text, text, text, text[], text[], text[], text[], integer) to authenticated;

create or replace function public.get_homeowner_technician_public_profile(
    p_company_user_id uuid,
    p_service_request_id uuid
)
returns table (
    company_user_id uuid,
    company_id uuid,
    display_name text,
    company_name text,
    profile_photo_url text,
    short_bio text,
    general_location text,
    family_note text,
    hobbies text[],
    specialties text[],
    languages text[],
    certifications text[],
    years_experience integer,
    profile_published boolean,
    public_rating numeric,
    public_review_count bigint,
    public_category_scores jsonb,
    professional_title text,
    department text,
    professional_phone text,
    professional_email text,
    extension text,
    professional_website text,
    years_with_company integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select * into v_request
    from public.service_requests
    where id = p_service_request_id;

    if not found or not public.homeos_can_read_property_record(v_request.property_id) then
        raise exception 'Homeowner access to this service request is required.';
    end if;

    if not exists (
        select 1
        from public.job_schedule_slots as slot
        where slot.service_request_id = v_request.id
          and slot.company_id = v_request.company_id
          and slot.technician_company_user_id = p_company_user_id
    ) then
        raise exception 'This technician is not assigned to the service request.';
    end if;

    return query
    with verified_reviews as (
        select review.star_rating, review.category_scores
        from public.home_service_reviews as review
        where review.target_type = 'technician'
          and review.technician_company_user_id = p_company_user_id
          and review.verified_completed_job
          and review.moderation_status <> 'rejected'
    ), review_summary as (
        select count(*)::bigint as review_count, round(avg(star_rating)::numeric, 1) as average_rating
        from verified_reviews
    ), category_summary as (
        select coalesce(jsonb_object_agg(category_key, average_score), '{}'::jsonb) as scores
        from (
            select category.key as category_key, round(avg((category.value #>> '{}')::numeric), 1) as average_score
            from verified_reviews
            cross join lateral jsonb_each(category_scores) as category(key, value)
            where jsonb_typeof(category.value) = 'number'
            group by category.key
        ) summarized_categories
    )
    select
        technician.id,
        technician.company_id,
        coalesce(
            case when profile.publication_status = 'published' then nullif(profile.display_name, '') end,
            nullif(technician.full_name, ''),
            'Your technician'
        )::text,
        coalesce(company.public_name, company.dba_name, company.name, 'Service company')::text,
        case when profile.publication_status = 'published' then profile.profile_photo_url end,
        case when profile.publication_status = 'published' then profile.short_bio end,
        case when profile.publication_status = 'published' then profile.general_location end,
        case when profile.publication_status = 'published' then profile.family_note end,
        case when profile.publication_status = 'published' then profile.hobbies else '{}'::text[] end,
        case when profile.publication_status = 'published' then profile.specialties else '{}'::text[] end,
        case when profile.publication_status = 'published' then profile.languages else '{}'::text[] end,
        case when profile.publication_status = 'published' then profile.certifications else '{}'::text[] end,
        case when profile.publication_status = 'published' then profile.years_experience end,
        coalesce(profile.publication_status = 'published', false),
        case when review_summary.review_count >= 5 then review_summary.average_rating else null end,
        case when review_summary.review_count >= 5 then review_summary.review_count else 0 end,
        case when review_summary.review_count >= 5 then category_summary.scores else '{}'::jsonb end,
        case when 'professional_title' = any(coalesce(contact.shared_fields, '{}')) then contact.professional_title end,
        case when 'department' = any(coalesce(contact.shared_fields, '{}')) then contact.department end,
        case when 'professional_phone' = any(coalesce(contact.shared_fields, '{}')) then contact.professional_phone end,
        case when 'professional_email' = any(coalesce(contact.shared_fields, '{}')) then contact.professional_email end,
        case when 'extension' = any(coalesce(contact.shared_fields, '{}')) then contact.extension end,
        case when 'professional_website' = any(coalesce(contact.shared_fields, '{}')) then contact.professional_website end,
        case when 'years_with_company' = any(coalesce(contact.shared_fields, '{}')) then contact.years_with_company end
    from public.company_users as technician
    join public.companies as company on company.id = technician.company_id
    left join public.company_technician_public_profiles as profile on profile.company_user_id = technician.id
    left join public.company_staff_professional_contacts as contact on contact.company_user_id = technician.id
    cross join review_summary
    cross join category_summary
    where technician.id = p_company_user_id
      and technician.company_id = v_request.company_id
      and lower(btrim(coalesce(technician.role, ''))) = 'technician'
      and lower(btrim(coalesce(technician.status, ''))) = 'active';
end;
$$;

revoke all on function public.get_homeowner_technician_public_profile(uuid, uuid) from public, anon;
grant execute on function public.get_homeowner_technician_public_profile(uuid, uuid) to authenticated;

create or replace function public.save_verified_home_service_review(
    p_service_request_id uuid,
    p_target_type text,
    p_star_rating integer,
    p_category_scores jsonb default '{}'::jsonb,
    p_tags text[] default '{}',
    p_comments text default null,
    p_technician_company_user_id uuid default null
)
returns public.home_service_reviews
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_target text := lower(btrim(coalesce(p_target_type, '')));
    v_technician_id uuid;
    v_review public.home_service_reviews%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_request from public.service_requests where id = p_service_request_id;
    if not found or not public.homeos_can_read_property_record(v_request.property_id) then
        raise exception 'Homeowner access to this completed service request is required.';
    end if;

    if lower(btrim(coalesce(v_request.status, ''))) not in ('complete', 'completed', 'closed', 'done', 'resolved')
       and not exists (
           select 1 from public.job_schedule_slots as slot
           where slot.service_request_id = v_request.id
             and lower(btrim(coalesce(slot.status, ''))) in ('complete', 'completed', 'closed', 'done')
       ) then
        raise exception 'Reviews are available after the service visit is completed.';
    end if;

    if v_target not in ('technician', 'company') then raise exception 'Review target is invalid.'; end if;
    if p_star_rating is null or p_star_rating not between 1 and 5 then raise exception 'Rating must be from 1 to 5.'; end if;
    if coalesce(jsonb_typeof(p_category_scores), 'object') <> 'object' then raise exception 'Category scores must be an object.'; end if;
    if exists (
        select 1 from jsonb_each(coalesce(p_category_scores, '{}'::jsonb)) as score
        where jsonb_typeof(score.value) <> 'number' or (score.value #>> '{}')::numeric not between 1 and 5
    ) then raise exception 'Each category score must be from 1 to 5.'; end if;

    if v_target = 'technician' then
        if p_technician_company_user_id is not null then
            select slot.technician_company_user_id into v_technician_id
            from public.job_schedule_slots as slot
            where slot.service_request_id = v_request.id
              and slot.company_id = v_request.company_id
              and slot.technician_company_user_id = p_technician_company_user_id
            order by slot.updated_at desc nulls last, slot.id desc
            limit 1;
        else
            select slot.technician_company_user_id into v_technician_id
            from public.job_schedule_slots as slot
            where slot.service_request_id = v_request.id
              and slot.company_id = v_request.company_id
              and slot.technician_company_user_id is not null
            order by slot.updated_at desc nulls last, slot.id desc
            limit 1;
        end if;
        if v_technician_id is null then raise exception 'No technician is attached to this completed service visit.'; end if;
    end if;

    insert into public.home_service_reviews (
        service_request_id, property_id, company_id, technician_company_user_id,
        target_type, star_rating, category_scores, tags, comments,
        verified_completed_job, moderation_status, created_by_user_id, updated_at
    ) values (
        v_request.id, v_request.property_id, v_request.company_id, v_technician_id,
        v_target, p_star_rating, coalesce(p_category_scores, '{}'::jsonb),
        coalesce((select array_agg(left(btrim(value), 80)) from unnest(coalesce(p_tags, '{}')) value where nullif(btrim(value), '') is not null), '{}'),
        left(nullif(btrim(coalesce(p_comments, '')), ''), 2000),
        true, 'private', auth.uid(), now()
    )
    on conflict do nothing
    returning * into v_review;

    if v_review.id is null then
        update public.home_service_reviews as review set
            star_rating = p_star_rating,
            category_scores = coalesce(p_category_scores, '{}'::jsonb),
            tags = coalesce((select array_agg(left(btrim(value), 80)) from unnest(coalesce(p_tags, '{}')) value where nullif(btrim(value), '') is not null), '{}'),
            comments = left(nullif(btrim(coalesce(p_comments, '')), ''), 2000),
            moderation_status = 'private',
            updated_at = now()
        where review.service_request_id = v_request.id
          and review.target_type = v_target
          and review.created_by_user_id = auth.uid()
          and (
              (v_target = 'company' and review.technician_company_user_id is null)
              or (v_target = 'technician' and review.technician_company_user_id = v_technician_id)
          )
        returning * into v_review;
    end if;

    return v_review;
end;
$$;

revoke all on function public.save_verified_home_service_review(uuid, text, integer, jsonb, text[], text, uuid) from public, anon;
grant execute on function public.save_verified_home_service_review(uuid, text, integer, jsonb, text[], text, uuid) to authenticated;

create or replace function public.get_verified_home_service_reviews_for_request(
    p_service_request_id uuid
)
returns setof public.home_service_reviews
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_property_id uuid;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    select property_id into v_property_id from public.service_requests where id = p_service_request_id;
    if v_property_id is null or not public.homeos_can_read_property_record(v_property_id) then
        raise exception 'Homeowner access to this service request is required.';
    end if;
    return query
    select review.* from public.home_service_reviews as review
    where review.service_request_id = p_service_request_id
      and review.created_by_user_id = auth.uid()
    order by review.updated_at desc;
end;
$$;

revoke all on function public.get_verified_home_service_reviews_for_request(uuid) from public, anon;
grant execute on function public.get_verified_home_service_reviews_for_request(uuid) to authenticated;

-- Add the assigned technician identifier to the existing homeowner tracker RPC.
drop function if exists public.get_homeowner_active_service_requests(uuid);
create function public.get_homeowner_active_service_requests(p_property_id uuid)
returns table (
    id uuid, display_sequence bigint, display_code text, company_id uuid, property_id uuid,
    request_type text, status text, priority text, issue_summary text, provider_name text,
    schedule_slot_id uuid, schedule_status text, technician_company_user_id uuid, technician_name text,
    arrival_window_start timestamptz, arrival_window_end timestamptz, eta_range text,
    created_at timestamptz, updated_at timestamptz, converted_job_id uuid
)
language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if p_property_id is null then raise exception 'Property is required.'; end if;
    if not public.homeos_can_read_property_record(p_property_id) then
        raise exception 'Not authorized to view active requests for this property.';
    end if;
    return query
    select request.id, request.display_sequence, request.display_code, request.company_id, request.property_id,
        request.request_type, request.status, request.priority, request.issue_summary,
        coalesce(company.public_name, company.dba_name, company.name, request.customer_display_name)::text,
        active_slot.id, active_slot.status, active_slot.technician_company_user_id,
        coalesce(nullif(btrim(technician.full_name), ''), 'Assigned technician')::text,
        active_slot.arrival_window_start, active_slot.arrival_window_end, null::text,
        request.created_at, request.updated_at, request.converted_job_id
    from public.service_requests as request
    left join public.companies as company on company.id = request.company_id
    left join lateral (
        select slot.* from public.job_schedule_slots as slot
        where slot.company_id = request.company_id and slot.service_request_id = request.id
          and lower(btrim(coalesce(slot.status, ''))) not in ('cancelled','canceled','completed','complete','closed','archived','void')
        order by slot.start_at asc nulls last, slot.updated_at desc nulls last, slot.id desc limit 1
    ) active_slot on true
    left join public.company_users as technician on technician.id = active_slot.technician_company_user_id
    where request.property_id = p_property_id
      and lower(btrim(coalesce(request.status, ''))) not in ('archived','cancelled','canceled','closed','complete','completed','done','resolved','void')
    order by case when lower(btrim(coalesce(request.request_type, ''))) = 'emergency' or lower(btrim(coalesce(request.priority, ''))) = 'emergency' then 0 else 1 end,
        coalesce(request.updated_at, request.created_at) desc nulls last, request.id desc;
end;
$$;
revoke all on function public.get_homeowner_active_service_requests(uuid) from public, anon;
grant execute on function public.get_homeowner_active_service_requests(uuid) to authenticated;

commit;
