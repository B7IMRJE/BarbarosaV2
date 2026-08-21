-- Add additional verified properties to one existing HomeOS homeowner account.
-- Active-property choice remains a user-scoped client preference; every data
-- read/write continues to use the selected property_id access boundary.
begin;

do $$
begin
    if to_regclass('public.profiles') is null
       or to_regclass('public.properties') is null
       or to_regclass('public.property_memberships') is null
       or to_regprocedure('public.validate_verified_home_identity_input(text,text,text,text,text,text,text,double precision,double precision,text,text)') is null then
        raise exception 'Verified HomeOS identity and property membership foundations are required.';
    end if;
end;
$$;

create or replace function public.create_homeowner_property(
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
    v_created boolean := false;
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
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    -- Lock the homeowner profile so retries and concurrent taps cannot create
    -- duplicate property rows for the same verified place/unit.
    perform 1
    from public.profiles as profile
    where profile.id = v_user_id
    for update;

    if not found then
        raise exception 'Profile not found for authenticated user' using errcode = '23503';
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
      and property.google_place_id = v_google_place_id
      and coalesce(btrim(property.address_line_2), '') = coalesce(v_address_line_2, '')
    order by property.created_at asc nulls last, property.id asc
    limit 1;

    if v_property_id is null then
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
        v_created := true;
    end if;

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
    on conflict on constraint property_memberships_property_id_user_id_key
    do update set
        role = excluded.role,
        status = excluded.status,
        updated_at = now()
    returning membership.id into v_membership_id;

    return query select v_property_id, v_membership_id, v_created;
end;
$$;

revoke all on function public.create_homeowner_property(
    text, text, text, text, text, text, text, text,
    double precision, double precision, text, text
) from public, anon;
grant execute on function public.create_homeowner_property(
    text, text, text, text, text, text, text, text,
    double precision, double precision, text, text
) to authenticated;

comment on function public.create_homeowner_property(
    text, text, text, text, text, text, text, text,
    double precision, double precision, text, text
) is 'Idempotently adds a verified property and OWNER membership to the current homeowner HomeOS account.';

commit;
