-- Enforce explicit, active provider category classifications for HomeOS.
--
-- Important data note:
-- - This migration intentionally does not classify companies from their names,
--   descriptions, invitation source, or prior relationships.
-- - Records such as the demo Roto-Rooter company remain hidden when their
--   service_categories value is empty or invalid. Assign Plumbing through the
--   company profile only after the demo/seed owner confirms that intent.

do $$
begin
    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required for provider category visibility.';
    end if;

    if to_regclass('public.property_connections') is null then
        raise exception 'public.property_connections is required for provider category visibility.';
    end if;

    if to_regclass('public.property_preferred_providers') is null then
        raise exception 'public.property_preferred_providers is required for provider category visibility.';
    end if;

    if to_regclass('public.company_property_clients') is null then
        raise exception 'public.company_property_clients is required for provider category visibility.';
    end if;
end
$$;

create or replace function public.homeos_normalize_provider_category(p_category text)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select case regexp_replace(lower(btrim(coalesce(p_category, ''))), '[^a-z0-9]+', ' ', 'g')
        when 'plumbing' then 'plumbing'
        when 'repipe' then 'plumbing'
        when 'water heaters' then 'plumbing'
        when 'leak detection' then 'plumbing'
        when 'slab leak' then 'plumbing'
        when 'drain cleaning' then 'plumbing'
        when 'sewer' then 'plumbing'
        when 'gas' then 'plumbing'
        when 'water treatment' then 'plumbing'
        when 'hvac' then 'hvac'
        when 'electrical' then 'electrical'
        when 'roofing' then 'roofing'
        when 'restoration' then 'restoration'
        when 'remodeling' then 'remodeling'
        when 'handyman' then 'handyman'
        when 'property management' then 'property-management'
        else null
    end;
$$;

create or replace function public.homeos_provider_category_label(p_category_key text)
returns text
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select case public.homeos_normalize_provider_category(p_category_key)
        when 'plumbing' then 'Plumbing'
        when 'hvac' then 'HVAC'
        when 'electrical' then 'Electrical'
        when 'roofing' then 'Roofing'
        when 'restoration' then 'Restoration'
        when 'remodeling' then 'Remodeling'
        when 'handyman' then 'Handyman'
        when 'property-management' then 'Property Management'
        else null
    end;
$$;

create or replace function public.homeos_company_provider_category_keys(p_company_id uuid)
returns table(category_key text)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select distinct public.homeos_normalize_provider_category(category.value) as category_key
    from public.companies as company
    cross join lateral unnest(coalesce(company.service_categories, '{}'::text[])) as category(value)
    where company.id = p_company_id
      and lower(btrim(coalesce(company.status, ''))) = 'active'
      and public.homeos_normalize_provider_category(category.value) is not null;
$$;

revoke all on function public.homeos_company_provider_category_keys(uuid) from public;
revoke all on function public.homeos_company_provider_category_keys(uuid) from anon;
revoke all on function public.homeos_company_provider_category_keys(uuid) from authenticated;

alter table public.property_preferred_providers
    add column if not exists service_category_key text null;

comment on column public.property_preferred_providers.service_category_key is
    'Exact normalized HomeOS category occupied by this active provider relationship.';

drop index if exists public.property_preferred_providers_one_active_property_idx;
drop index if exists public.property_preferred_providers_one_active_property_category_idx;

-- Unclassified legacy rows are archived rather than guessed from company text.
update public.property_preferred_providers as preferred_provider
set status = 'archived',
    archived_at = coalesce(preferred_provider.archived_at, now()),
    updated_at = now()
where preferred_provider.status = 'active'
  and not exists (
      select 1
      from public.homeos_company_provider_category_keys(preferred_provider.company_id)
  );

-- A legacy active relationship occupies every category explicitly assigned to
-- its company. The first key reuses the original row; remaining keys are cloned.
with explicit_categories as (
    select
        preferred_provider.id,
        min(category.category_key) as first_category_key
    from public.property_preferred_providers as preferred_provider
    cross join lateral public.homeos_company_provider_category_keys(preferred_provider.company_id) as category
    where preferred_provider.status = 'active'
    group by preferred_provider.id
)
update public.property_preferred_providers as preferred_provider
set service_category_key = explicit_categories.first_category_key,
    updated_at = now()
from explicit_categories
where preferred_provider.id = explicit_categories.id
  and (
      preferred_provider.service_category_key is null
      or public.homeos_normalize_provider_category(preferred_provider.service_category_key)
          is distinct from preferred_provider.service_category_key
      or not exists (
          select 1
          from public.homeos_company_provider_category_keys(preferred_provider.company_id) as company_category
          where company_category.category_key = preferred_provider.service_category_key
      )
  );

insert into public.property_preferred_providers (
    property_id,
    company_id,
    property_connection_id,
    status,
    source,
    selected_by_user_id,
    selected_at,
    archived_at,
    created_at,
    updated_at,
    service_category_key
)
select
    preferred_provider.property_id,
    preferred_provider.company_id,
    preferred_provider.property_connection_id,
    'active',
    preferred_provider.source,
    preferred_provider.selected_by_user_id,
    preferred_provider.selected_at,
    null,
    preferred_provider.created_at,
    now(),
    category.category_key
from public.property_preferred_providers as preferred_provider
cross join lateral public.homeos_company_provider_category_keys(preferred_provider.company_id) as category
where preferred_provider.status = 'active'
  and category.category_key <> preferred_provider.service_category_key
  and not exists (
      select 1
      from public.property_preferred_providers as existing_provider
      where existing_provider.property_id = preferred_provider.property_id
        and existing_provider.company_id = preferred_provider.company_id
        and existing_provider.status = 'active'
        and existing_provider.service_category_key = category.category_key
  );

-- Resolve only pre-existing contradictory active rows. The most recently
-- selected explicit relationship wins that category; no category is inferred.
with ranked_active_providers as (
    select
        preferred_provider.id,
        row_number() over (
            partition by preferred_provider.property_id, preferred_provider.service_category_key
            order by preferred_provider.selected_at desc, preferred_provider.created_at desc, preferred_provider.id
        ) as category_rank
    from public.property_preferred_providers as preferred_provider
    where preferred_provider.status = 'active'
)
update public.property_preferred_providers as preferred_provider
set status = 'archived',
    archived_at = coalesce(preferred_provider.archived_at, now()),
    updated_at = now()
from ranked_active_providers
where preferred_provider.id = ranked_active_providers.id
  and ranked_active_providers.category_rank > 1;

alter table public.property_preferred_providers
    drop constraint if exists property_preferred_providers_active_category_check;

alter table public.property_preferred_providers
    add constraint property_preferred_providers_active_category_check
    check (
        status <> 'active'
        or (
            service_category_key is not null
            and public.homeos_normalize_provider_category(service_category_key) = service_category_key
        )
    );

create unique index property_preferred_providers_one_active_property_category_idx
    on public.property_preferred_providers (property_id, service_category_key)
    where status = 'active';

create index if not exists property_preferred_providers_property_category_idx
    on public.property_preferred_providers (property_id, service_category_key, status);

create or replace function public.homeos_validate_preferred_provider_category()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if new.status = 'active' and not exists (
        select 1
        from public.homeos_company_provider_category_keys(new.company_id) as company_category
        where company_category.category_key = new.service_category_key
    ) then
        raise exception 'Active preferred provider category must be explicitly assigned to the active company.';
    end if;

    return new;
end;
$$;

revoke all on function public.homeos_validate_preferred_provider_category() from public;
revoke all on function public.homeos_validate_preferred_provider_category() from anon;
revoke all on function public.homeos_validate_preferred_provider_category() from authenticated;

drop trigger if exists property_preferred_providers_validate_category
on public.property_preferred_providers;

create trigger property_preferred_providers_validate_category
before insert or update of status, service_category_key, company_id
on public.property_preferred_providers
for each row
execute function public.homeos_validate_preferred_provider_category();

create or replace function public.homeos_provider_visible_for_property(
    p_property_id uuid,
    p_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select
        public.homeos_can_read_property_record(p_property_id)
        and exists (
            select 1
            from public.homeos_company_provider_category_keys(p_company_id) as company_category
            where exists (
                select 1
                from public.property_preferred_providers as current_provider
                where current_provider.property_id = p_property_id
                  and current_provider.company_id = p_company_id
                  and current_provider.status = 'active'
                  and current_provider.service_category_key = company_category.category_key
            )
            or not exists (
                select 1
                from public.property_preferred_providers as occupied_provider
                where occupied_provider.property_id = p_property_id
                  and occupied_provider.status = 'active'
                  and occupied_provider.service_category_key = company_category.category_key
                  and occupied_provider.company_id <> p_company_id
                  and exists (
                      select 1
                      from public.homeos_company_provider_category_keys(
                          occupied_provider.company_id
                      ) as occupied_company_category
                      where occupied_company_category.category_key = occupied_provider.service_category_key
                  )
            )
        );
$$;

create or replace function public.homeos_current_provider_company_visible(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select exists (
        select 1
        from public.property_preferred_providers as preferred_provider
        where preferred_provider.company_id = p_company_id
          and preferred_provider.status = 'active'
          and public.homeos_can_read_property_record(preferred_provider.property_id)
          and exists (
              select 1
              from public.homeos_company_provider_category_keys(p_company_id) as company_category
              where company_category.category_key = preferred_provider.service_category_key
          )
    );
$$;

create or replace function public.homeos_preferred_provider_visible(
    p_property_id uuid,
    p_company_id uuid,
    p_service_category_key text,
    p_status text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select
        lower(btrim(coalesce(p_status, ''))) = 'active'
        and public.homeos_can_read_property_record(p_property_id)
        and exists (
            select 1
            from public.homeos_company_provider_category_keys(p_company_id) as company_category
            where company_category.category_key = p_service_category_key
        );
$$;

revoke all on function public.homeos_provider_visible_for_property(uuid, uuid) from public;
revoke all on function public.homeos_provider_visible_for_property(uuid, uuid) from anon;
grant execute on function public.homeos_provider_visible_for_property(uuid, uuid) to authenticated;

revoke all on function public.homeos_current_provider_company_visible(uuid) from public;
revoke all on function public.homeos_current_provider_company_visible(uuid) from anon;
grant execute on function public.homeos_current_provider_company_visible(uuid) to authenticated;

revoke all on function public.homeos_preferred_provider_visible(uuid, uuid, text, text) from public;
revoke all on function public.homeos_preferred_provider_visible(uuid, uuid, text, text) from anon;
grant execute on function public.homeos_preferred_provider_visible(uuid, uuid, text, text) to authenticated;

drop policy if exists companies_select_active_approved on public.companies;
drop policy if exists companies_select_access on public.companies;
drop policy if exists companies_select_provider_access on public.companies;

create policy companies_select_provider_access
on public.companies
for select
to authenticated
using (
    public.homeos_is_platform_admin()
    or public.is_active_company_member(companies.id)
    or public.homeos_current_provider_company_visible(companies.id)
);

drop policy if exists property_connections_select_members on public.property_connections;
drop policy if exists property_connections_select_provider_visibility on public.property_connections;

create policy property_connections_select_provider_visibility
on public.property_connections
for select
to authenticated
using (
    public.homeos_is_platform_admin()
    or public.is_active_company_member(property_connections.company_id)
    or public.homeos_provider_visible_for_property(
        property_connections.property_id,
        property_connections.company_id
    )
);

drop policy if exists property_preferred_providers_select_members on public.property_preferred_providers;
drop policy if exists property_preferred_providers_select_strict_categories on public.property_preferred_providers;

create policy property_preferred_providers_select_strict_categories
on public.property_preferred_providers
for select
to authenticated
using (
    public.homeos_is_platform_admin()
    or public.is_active_company_member(property_preferred_providers.company_id)
    or public.homeos_preferred_provider_visible(
        property_preferred_providers.property_id,
        property_preferred_providers.company_id,
        property_preferred_providers.service_category_key,
        property_preferred_providers.status
    )
);

create or replace function public.get_homeowner_connection_providers(p_property_id uuid)
returns table (
    id uuid,
    name text,
    public_name text,
    dba_name text,
    logo_url text,
    primary_color text,
    secondary_color text,
    accent_color text,
    service_categories text[],
    homeos_rating numeric,
    homeos_rating_count integer,
    combined_experience_years integer,
    license_number text,
    phone text,
    website text,
    short_description text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    with explicit_company_categories as (
        select company.id as company_id, category.category_key
        from public.companies as company
        cross join lateral public.homeos_company_provider_category_keys(company.id) as category
        where lower(btrim(coalesce(company.status, ''))) = 'active'
    ),
    visible_company_categories as (
        select explicit_category.company_id, explicit_category.category_key
        from explicit_company_categories as explicit_category
        where exists (
            select 1
            from public.property_preferred_providers as current_provider
            where current_provider.property_id = p_property_id
              and current_provider.company_id = explicit_category.company_id
              and current_provider.status = 'active'
              and current_provider.service_category_key = explicit_category.category_key
        )
        or (
            not exists (
                select 1
                from public.property_preferred_providers as current_company_provider
                where current_company_provider.property_id = p_property_id
                  and current_company_provider.company_id = explicit_category.company_id
                  and current_company_provider.status = 'active'
            )
            and not exists (
                select 1
                from public.property_preferred_providers as occupied_provider
                where occupied_provider.property_id = p_property_id
                  and occupied_provider.status = 'active'
                  and occupied_provider.service_category_key = explicit_category.category_key
                  and occupied_provider.company_id <> explicit_category.company_id
                  and exists (
                      select 1
                      from public.homeos_company_provider_category_keys(
                          occupied_provider.company_id
                      ) as occupied_company_category
                      where occupied_company_category.category_key = occupied_provider.service_category_key
                  )
            )
        )
    ),
    visible_companies as (
        select
            visible_category.company_id,
            array_agg(
                public.homeos_provider_category_label(visible_category.category_key)
                order by visible_category.category_key
            ) as service_categories
        from visible_company_categories as visible_category
        group by visible_category.company_id
    )
    select
        company.id,
        company.name,
        company.public_name,
        company.dba_name,
        company.logo_url,
        company.primary_color,
        company.secondary_color,
        company.accent_color,
        visible_company.service_categories,
        company.homeos_rating,
        company.homeos_rating_count,
        company.combined_experience_years,
        company.license_number,
        company.phone,
        company.website,
        company.short_description
    from visible_companies as visible_company
    join public.companies as company on company.id = visible_company.company_id
    where public.homeos_can_read_property_record(p_property_id)
    order by coalesce(company.public_name, company.name), company.id;
$$;

revoke all on function public.get_homeowner_connection_providers(uuid) from public;
revoke all on function public.get_homeowner_connection_providers(uuid) from anon;
grant execute on function public.get_homeowner_connection_providers(uuid) to authenticated;

create or replace function public.homeos_activate_provider_categories(
    p_property_id uuid,
    p_company_id uuid,
    p_property_connection_id uuid,
    p_source text,
    p_selected_by_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_category_key text;
    v_preferred_provider_id uuid;
    v_first_preferred_provider_id uuid;
begin
    if not exists (
        select 1
        from public.homeos_company_provider_category_keys(p_company_id)
    ) then
        raise exception 'Provider requires an explicit active service category before it can be connected.';
    end if;

    for v_category_key in
        select company_category.category_key
        from public.homeos_company_provider_category_keys(p_company_id) as company_category
        where not exists (
            select 1
            from public.property_preferred_providers as occupied_provider
            where occupied_provider.property_id = p_property_id
              and occupied_provider.status = 'active'
              and occupied_provider.service_category_key = company_category.category_key
              and occupied_provider.company_id <> p_company_id
              and exists (
                  select 1
                  from public.homeos_company_provider_category_keys(
                      occupied_provider.company_id
                  ) as occupied_company_category
                  where occupied_company_category.category_key = occupied_provider.service_category_key
              )
        )
        order by company_category.category_key
    loop
        v_preferred_provider_id := null;

        insert into public.property_preferred_providers as preferred_provider (
            property_id,
            company_id,
            property_connection_id,
            status,
            source,
            selected_by_user_id,
            selected_at,
            archived_at,
            created_at,
            updated_at,
            service_category_key
        )
        values (
            p_property_id,
            p_company_id,
            p_property_connection_id,
            'active',
            p_source,
            p_selected_by_user_id,
            now(),
            null,
            now(),
            now(),
            v_category_key
        )
        on conflict (property_id, service_category_key) where status = 'active' do update
        set property_connection_id = excluded.property_connection_id,
            source = excluded.source,
            selected_by_user_id = excluded.selected_by_user_id,
            selected_at = excluded.selected_at,
            archived_at = null,
            updated_at = now()
        where preferred_provider.company_id = excluded.company_id
        returning preferred_provider.id
        into v_preferred_provider_id;

        v_first_preferred_provider_id := coalesce(
            v_first_preferred_provider_id,
            v_preferred_provider_id
        );
    end loop;

    if v_first_preferred_provider_id is null then
        raise exception 'Every explicitly assigned provider category already has an active provider for this home.';
    end if;

    return v_first_preferred_provider_id;
end;
$$;

revoke all on function public.homeos_activate_provider_categories(uuid, uuid, uuid, text, uuid) from public;
revoke all on function public.homeos_activate_provider_categories(uuid, uuid, uuid, text, uuid) from anon;
revoke all on function public.homeos_activate_provider_categories(uuid, uuid, uuid, text, uuid) from authenticated;

create or replace function public.request_property_provider_connection(
    p_property_id uuid,
    p_company_id uuid
)
returns table (
    connection_id uuid,
    preferred_provider_id uuid,
    company_property_client_id uuid,
    property_id uuid,
    company_id uuid,
    status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_property_name text;
    v_connection_id uuid;
    v_connection_status text;
    v_preferred_provider_id uuid;
    v_company_property_client_id uuid;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_property_id is null then
        raise exception 'property_id is required';
    end if;

    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    select property.name
    into v_property_name
    from public.properties as property
    where property.id = p_property_id
    for share;

    if not found then
        raise exception 'Property not found';
    end if;

    if not exists (
        select 1
        from public.property_memberships as membership
        where membership.property_id = p_property_id
          and membership.user_id = v_user_id
          and lower(btrim(coalesce(membership.status, ''))) = 'active'
    ) then
        raise exception 'Not authorized to choose a provider for this property';
    end if;

    if not exists (
        select 1
        from public.homeos_company_provider_category_keys(p_company_id)
    ) then
        raise exception 'Provider requires an explicit active service category before it can be connected.';
    end if;

    insert into public.property_connections as property_connection (
        property_id,
        company_id,
        status,
        can_view_documents,
        can_view_photos,
        can_view_service_history,
        can_view_quotes,
        expires_at,
        requested_by_user_id,
        requested_at,
        request_source
    )
    values (
        p_property_id,
        p_company_id,
        'connected',
        false,
        false,
        false,
        false,
        null,
        v_user_id,
        now(),
        'homeowner_provider_request'
    )
    on conflict on constraint property_connections_property_id_company_id_key do update
    set status = 'connected',
        can_view_documents = false,
        can_view_photos = false,
        can_view_service_history = false,
        can_view_quotes = false,
        expires_at = null,
        requested_by_user_id = v_user_id,
        requested_at = now(),
        request_source = 'homeowner_provider_request',
        updated_at = now()
    returning property_connection.id, property_connection.status
    into v_connection_id, v_connection_status;

    v_preferred_provider_id := public.homeos_activate_provider_categories(
        p_property_id,
        p_company_id,
        v_connection_id,
        'homeowner_provider_request',
        v_user_id
    );

    insert into public.company_property_clients as company_client (
        company_id,
        property_id,
        property_connection_id,
        display_name,
        status,
        source,
        first_requested_by_user_id,
        last_requested_by_user_id,
        first_requested_at,
        last_requested_at,
        connected_at
    )
    values (
        p_company_id,
        p_property_id,
        v_connection_id,
        nullif(btrim(v_property_name), ''),
        'active',
        'homeowner_provider_request',
        v_user_id,
        v_user_id,
        now(),
        now(),
        now()
    )
    on conflict on constraint company_property_clients_company_property_key do update
    set property_connection_id = excluded.property_connection_id,
        display_name = coalesce(excluded.display_name, company_client.display_name),
        status = 'active',
        source = excluded.source,
        last_requested_by_user_id = excluded.last_requested_by_user_id,
        last_requested_at = excluded.last_requested_at,
        connected_at = coalesce(company_client.connected_at, now()),
        archived_at = null,
        updated_at = now()
    returning company_client.id
    into v_company_property_client_id;

    return query
    select
        v_connection_id,
        v_preferred_provider_id,
        v_company_property_client_id,
        p_property_id,
        p_company_id,
        v_connection_status;
end;
$$;

revoke all on function public.request_property_provider_connection(uuid, uuid) from public;
revoke all on function public.request_property_provider_connection(uuid, uuid) from anon;
grant execute on function public.request_property_provider_connection(uuid, uuid) to authenticated;

create or replace function public.approve_connection(connection_id uuid)
returns table (
    result_connection_id uuid,
    property_id uuid,
    company_id uuid,
    status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_connection public.property_connections%rowtype;
    v_result_connection_id uuid;
    v_result_property_id uuid;
    v_result_company_id uuid;
    v_result_status text;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    select *
    into v_connection
    from public.property_connections
    where id = connection_id
    for update;

    if not found then
        raise exception 'Connection not found';
    end if;

    if lower(btrim(coalesce(v_connection.status, ''))) <> 'pending' then
        raise exception 'Only pending connections can be approved';
    end if;

    if not exists (
        select 1
        from public.property_memberships as membership
        where membership.property_id = v_connection.property_id
          and membership.user_id = v_user_id
          and lower(btrim(coalesce(membership.status, ''))) = 'active'
    ) then
        raise exception 'Not authorized to approve this connection';
    end if;

    perform public.homeos_activate_provider_categories(
        v_connection.property_id,
        v_connection.company_id,
        v_connection.id,
        'manual',
        v_user_id
    );

    update public.property_connections as property_connection
    set status = 'connected',
        updated_at = now()
    where property_connection.id = v_connection.id
    returning
        property_connection.id,
        property_connection.property_id,
        property_connection.company_id,
        property_connection.status
    into
        v_result_connection_id,
        v_result_property_id,
        v_result_company_id,
        v_result_status;

    return query
    select
        v_result_connection_id,
        v_result_property_id,
        v_result_company_id,
        v_result_status;
end;
$$;

revoke all on function public.approve_connection(uuid) from public;
revoke all on function public.approve_connection(uuid) from anon;
grant execute on function public.approve_connection(uuid) to authenticated;

create or replace function public.accept_customer_invite_by_code(
    p_invite_code text,
    p_property_id uuid
)
returns table (
    invitation_id uuid,
    company_id uuid,
    property_id uuid,
    company_property_client_id uuid,
    property_connection_id uuid,
    status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
#variable_conflict use_column
declare
    v_invitation public.company_customer_invitations%rowtype;
    v_connection_id uuid;
    v_client_id uuid;
    v_signed_in_email text := lower(btrim(coalesce(auth.jwt()->>'email', '')));
    v_invited_email text;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if p_property_id is null then
        raise exception 'Choose a HomeOS home before accepting this customer invite.';
    end if;

    select *
    into v_invitation
    from public.company_customer_invitations as invitation
    where invitation.invite_code = btrim(coalesce(p_invite_code, ''))
    limit 1;

    if not found then
        raise exception 'Customer invite not found.';
    end if;

    if lower(btrim(coalesce(v_invitation.status, ''))) <> 'pending'
       or v_invitation.expires_at < now() then
        raise exception 'This customer invite is not active. Ask the company for a new invite link.';
    end if;

    v_invited_email := lower(btrim(coalesce(v_invitation.invited_email, '')));

    if v_invited_email <> '' and v_invited_email <> v_signed_in_email then
        raise exception 'This invite was sent to a different email. Sign out and use the invited email address.';
    end if;

    if not public.homeos_can_read_property_record(p_property_id) then
        raise exception 'You can only connect a home that belongs to your account.';
    end if;

    if not exists (
        select 1
        from public.homeos_company_provider_category_keys(v_invitation.company_id)
    ) then
        raise exception 'Invited provider requires an explicit active service category before it can be connected.';
    end if;

    insert into public.property_connections as property_connection (
        property_id,
        company_id,
        status,
        requested_by_user_id,
        requested_at,
        request_source,
        created_at,
        updated_at
    )
    values (
        p_property_id,
        v_invitation.company_id,
        'connected',
        auth.uid(),
        now(),
        'company_customer_invite',
        now(),
        now()
    )
    on conflict on constraint property_connections_property_id_company_id_key do update
    set status = 'connected',
        requested_by_user_id = auth.uid(),
        requested_at = now(),
        request_source = 'company_customer_invite',
        updated_at = now()
    returning property_connection.id
    into v_connection_id;

    perform public.homeos_activate_provider_categories(
        p_property_id,
        v_invitation.company_id,
        v_connection_id,
        'company_customer_invite',
        auth.uid()
    );

    insert into public.company_property_clients as company_client (
        company_id,
        property_id,
        property_connection_id,
        display_name,
        status,
        source,
        first_requested_by_user_id,
        last_requested_by_user_id,
        first_requested_at,
        last_requested_at,
        connected_at,
        created_at,
        updated_at
    )
    values (
        v_invitation.company_id,
        p_property_id,
        v_connection_id,
        nullif(btrim(coalesce(v_invitation.invited_name, '')), ''),
        'active',
        'company_customer_invite',
        auth.uid(),
        auth.uid(),
        now(),
        now(),
        now(),
        now(),
        now()
    )
    on conflict on constraint company_property_clients_company_property_key do update
    set property_connection_id = excluded.property_connection_id,
        status = 'active',
        source = 'company_customer_invite',
        display_name = coalesce(company_client.display_name, excluded.display_name),
        last_requested_by_user_id = auth.uid(),
        last_requested_at = now(),
        connected_at = coalesce(company_client.connected_at, now()),
        archived_at = null,
        updated_at = now()
    returning company_client.id
    into v_client_id;

    update public.company_customer_invitations as invitation
    set status = 'accepted',
        accepted_by_user_id = auth.uid(),
        accepted_property_id = p_property_id,
        accepted_at = now(),
        updated_at = now()
    where invitation.id = v_invitation.id;

    return query
    select
        v_invitation.id as invitation_id,
        v_invitation.company_id as company_id,
        p_property_id as property_id,
        v_client_id as company_property_client_id,
        v_connection_id as property_connection_id,
        'accepted'::text as status;
end;
$function$;

revoke all on function public.accept_customer_invite_by_code(text, uuid) from public;
revoke all on function public.accept_customer_invite_by_code(text, uuid) from anon;
grant execute on function public.accept_customer_invite_by_code(text, uuid) to authenticated;

notify pgrst, 'reload schema';
