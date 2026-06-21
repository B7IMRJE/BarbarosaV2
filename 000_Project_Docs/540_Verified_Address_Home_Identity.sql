begin;

alter table public.properties
    add column if not exists address_line_1 text,
    add column if not exists address_line_2 text,
    add column if not exists postal_code text,
    add column if not exists country_code text,
    add column if not exists formatted_address text,
    add column if not exists latitude double precision,
    add column if not exists longitude double precision,
    add column if not exists google_place_id text,
    add column if not exists address_validation_status text,
    add column if not exists address_validated_at timestamptz;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'properties_address_validation_status_check'
          and conrelid = 'public.properties'::regclass
    ) then
        alter table public.properties
        add constraint properties_address_validation_status_check
        check (
            address_validation_status is null
            or address_validation_status in ('validated')
        );
    end if;
end
$$;

create index if not exists properties_owner_id_idx
on public.properties (owner_id);

create index if not exists properties_google_place_id_idx
on public.properties (google_place_id)
where google_place_id is not null;

create or replace function public.validate_verified_home_identity_input(
    p_name text,
    p_address_line_1 text,
    p_city text,
    p_state text,
    p_postal_code text,
    p_country_code text,
    p_formatted_address text,
    p_latitude double precision,
    p_longitude double precision,
    p_google_place_id text,
    p_property_type text
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
    if p_name is null then
        raise exception 'Home name is required'
            using errcode = '23502';
    end if;

    if p_address_line_1 is null
       or p_city is null
       or p_state is null
       or p_postal_code is null
       or p_country_code is null
       or p_formatted_address is null
       or p_google_place_id is null
       or p_latitude is null
       or p_longitude is null then
        raise exception 'Verified address is required'
            using errcode = '23502';
    end if;

    if p_country_code <> 'US' then
        raise exception 'Only United States addresses are supported'
            using errcode = '22023';
    end if;

    if p_property_type not in (
        'HOUSE',
        'CONDO',
        'TOWNHOME',
        'APARTMENT',
        'MANUFACTURED_HOME',
        'OTHER'
    ) then
        raise exception 'Property type is invalid'
            using errcode = '22023';
    end if;
end;
$$;

create or replace function public.create_homeowner_first_property(
    p_name text,
    p_address_line_1 text,
    p_address_line_2 text,
    p_city text,
    p_state text,
    p_postal_code text,
    p_country_code text,
    p_formatted_address text,
    p_latitude double precision,
    p_longitude double precision,
    p_google_place_id text,
    p_property_type text
)
returns table (
    property_id uuid,
    membership_id uuid,
    created boolean
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_property_id uuid;
    v_membership_id uuid;
    v_name text := nullif(btrim(p_name), '');
    v_address_line_1 text := nullif(btrim(p_address_line_1), '');
    v_address_line_2 text := nullif(btrim(p_address_line_2), '');
    v_city text := nullif(btrim(p_city), '');
    v_state text := upper(nullif(btrim(p_state), ''));
    v_postal_code text := nullif(btrim(p_postal_code), '');
    v_country_code text := upper(nullif(btrim(p_country_code), ''));
    v_formatted_address text := nullif(btrim(p_formatted_address), '');
    v_google_place_id text := nullif(btrim(p_google_place_id), '');
    v_property_type text := nullif(btrim(p_property_type), '');
begin
    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    perform 1
    from public.profiles as profile
    where profile.id = v_user_id
    for update;

    if not found then
        raise exception 'Profile not found for authenticated user'
            using errcode = '23503';
    end if;

    select membership.property_id, membership.id
    into v_property_id, v_membership_id
    from public.property_memberships as membership
    where membership.user_id = v_user_id
      and upper(membership.role) = 'OWNER'
      and membership.status = 'active'
    order by membership.created_at asc, membership.id asc
    limit 1;

    if v_membership_id is not null then
        return query select v_property_id, v_membership_id, false;
        return;
    end if;

    perform public.validate_verified_home_identity_input(
        v_name,
        v_address_line_1,
        v_city,
        v_state,
        v_postal_code,
        v_country_code,
        v_formatted_address,
        p_latitude,
        p_longitude,
        v_google_place_id,
        v_property_type
    );

    select property.id
    into v_property_id
    from public.properties as property
    where property.owner_id = v_user_id
    order by property.created_at asc nulls last, property.id asc
    limit 1;

    if v_property_id is not null then
        update public.properties
        set name = v_name,
            address = v_address_line_1,
            city = v_city,
            state = v_state,
            zip = v_postal_code,
            property_type = v_property_type,
            address_line_1 = v_address_line_1,
            address_line_2 = v_address_line_2,
            postal_code = v_postal_code,
            country_code = v_country_code,
            formatted_address = v_formatted_address,
            latitude = p_latitude,
            longitude = p_longitude,
            google_place_id = v_google_place_id,
            address_validation_status = 'validated',
            address_validated_at = now()
        where id = v_property_id;

        insert into public.property_memberships as membership (
            property_id,
            user_id,
            role,
            status
        )
        values (
            v_property_id,
            v_user_id,
            'OWNER',
            'active'
        )
        on conflict (property_id, user_id)
        do update set
            role = excluded.role,
            status = excluded.status,
            updated_at = now()
        returning membership.id into v_membership_id;

        return query select v_property_id, v_membership_id, false;
        return;
    end if;

    insert into public.properties as property (
        owner_id,
        name,
        address,
        city,
        state,
        zip,
        property_type,
        address_line_1,
        address_line_2,
        postal_code,
        country_code,
        formatted_address,
        latitude,
        longitude,
        google_place_id,
        address_validation_status,
        address_validated_at
    )
    values (
        v_user_id,
        v_name,
        v_address_line_1,
        v_city,
        v_state,
        v_postal_code,
        v_property_type,
        v_address_line_1,
        v_address_line_2,
        v_postal_code,
        v_country_code,
        v_formatted_address,
        p_latitude,
        p_longitude,
        v_google_place_id,
        'validated',
        now()
    )
    returning property.id into v_property_id;

    insert into public.property_memberships as membership (
        property_id,
        user_id,
        role,
        status
    )
    values (
        v_property_id,
        v_user_id,
        'OWNER',
        'active'
    )
    on conflict (property_id, user_id)
    do update set
        role = excluded.role,
        status = excluded.status,
        updated_at = now()
    returning membership.id into v_membership_id;

    return query select v_property_id, v_membership_id, true;
end;
$$;

create or replace function public.update_home_identity(
    p_property_id uuid,
    p_name text,
    p_address_line_1 text,
    p_address_line_2 text,
    p_city text,
    p_state text,
    p_postal_code text,
    p_country_code text,
    p_formatted_address text,
    p_latitude double precision,
    p_longitude double precision,
    p_google_place_id text,
    p_property_type text
)
returns table (
    property_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_name text := nullif(btrim(p_name), '');
    v_address_line_1 text := nullif(btrim(p_address_line_1), '');
    v_address_line_2 text := nullif(btrim(p_address_line_2), '');
    v_city text := nullif(btrim(p_city), '');
    v_state text := upper(nullif(btrim(p_state), ''));
    v_postal_code text := nullif(btrim(p_postal_code), '');
    v_country_code text := upper(nullif(btrim(p_country_code), ''));
    v_formatted_address text := nullif(btrim(p_formatted_address), '');
    v_google_place_id text := nullif(btrim(p_google_place_id), '');
    v_property_type text := nullif(btrim(p_property_type), '');
begin
    if v_user_id is null then
        raise exception 'Authentication required'
            using errcode = '28000';
    end if;

    if p_property_id is null then
        raise exception 'Property is required'
            using errcode = '23502';
    end if;

    if not exists (
        select 1
        from public.property_memberships as membership
        where membership.property_id = p_property_id
          and membership.user_id = v_user_id
          and upper(membership.role) = 'OWNER'
          and membership.status = 'active'
    ) then
        raise exception 'Not authorized to update this home'
            using errcode = '42501';
    end if;

    perform public.validate_verified_home_identity_input(
        v_name,
        v_address_line_1,
        v_city,
        v_state,
        v_postal_code,
        v_country_code,
        v_formatted_address,
        p_latitude,
        p_longitude,
        v_google_place_id,
        v_property_type
    );

    update public.properties
    set name = v_name,
        address = v_address_line_1,
        city = v_city,
        state = v_state,
        zip = v_postal_code,
        property_type = v_property_type,
        address_line_1 = v_address_line_1,
        address_line_2 = v_address_line_2,
        postal_code = v_postal_code,
        country_code = v_country_code,
        formatted_address = v_formatted_address,
        latitude = p_latitude,
        longitude = p_longitude,
        google_place_id = v_google_place_id,
        address_validation_status = 'validated',
        address_validated_at = now()
    where id = p_property_id;

    return query select p_property_id;
end;
$$;

create or replace function public.get_my_active_home_identity()
returns table (
    property_id uuid,
    name text,
    property_type text,
    address_line_1 text,
    address_line_2 text,
    city text,
    state text,
    postal_code text,
    country_code text,
    formatted_address text,
    latitude double precision,
    longitude double precision,
    google_place_id text,
    address_validation_status text,
    address_validated_at timestamptz,
    owner_display_name text,
    membership_role text
)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
    select
        property.id as property_id,
        property.name::text as name,
        property.property_type::text as property_type,
        coalesce(property.address_line_1, property.address)::text as address_line_1,
        property.address_line_2::text as address_line_2,
        coalesce(property.city, '')::text as city,
        coalesce(property.state, '')::text as state,
        coalesce(property.postal_code, property.zip)::text as postal_code,
        coalesce(property.country_code, '')::text as country_code,
        property.formatted_address::text as formatted_address,
        property.latitude,
        property.longitude,
        property.google_place_id::text as google_place_id,
        property.address_validation_status::text as address_validation_status,
        property.address_validated_at,
        coalesce(
            nullif(btrim(owner_profile.full_name), ''),
            nullif(btrim(member_profile.full_name), '')
        )::text as owner_display_name,
        membership.role::text as membership_role
    from public.property_memberships as membership
    join public.properties as property
      on property.id = membership.property_id
    join public.profiles as member_profile
      on member_profile.id = membership.user_id
    left join public.profiles as owner_profile
      on owner_profile.id = property.owner_id
    where membership.user_id = auth.uid()
      and membership.status = 'active'
    order by
        case when upper(membership.role) = 'OWNER' then 0 else 1 end,
        membership.created_at asc,
        membership.id asc
    limit 1;
$$;

revoke all on function public.create_homeowner_first_property(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    double precision,
    double precision,
    text,
    text
) from public;
revoke all on function public.create_homeowner_first_property(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    double precision,
    double precision,
    text,
    text
) from anon;
grant execute on function public.create_homeowner_first_property(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    double precision,
    double precision,
    text,
    text
) to authenticated;

revoke all on function public.update_home_identity(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    double precision,
    double precision,
    text,
    text
) from public;
revoke all on function public.update_home_identity(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    double precision,
    double precision,
    text,
    text
) from anon;
grant execute on function public.update_home_identity(
    uuid,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    double precision,
    double precision,
    text,
    text
) to authenticated;

revoke all on function public.get_my_active_home_identity() from public;
revoke all on function public.get_my_active_home_identity() from anon;
grant execute on function public.get_my_active_home_identity() to authenticated;

revoke all on function public.validate_verified_home_identity_input(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    double precision,
    double precision,
    text,
    text
) from public;
revoke all on function public.validate_verified_home_identity_input(
    text,
    text,
    text,
    text,
    text,
    text,
    text,
    double precision,
    double precision,
    text,
    text
) from anon;

commit;
