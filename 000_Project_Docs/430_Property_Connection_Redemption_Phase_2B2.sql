create or replace function public.redeem_connection_code(p_code text)
returns table (
    connection_id uuid,
    property_id uuid,
    company_id uuid,
    status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id uuid;
    v_company_id uuid;
    v_clean_code text;
    v_code_hash text;
    v_code_row public.property_connection_codes%rowtype;
    v_connection_id uuid;
    v_connection_property_id uuid;
    v_connection_company_id uuid;
    v_connection_status text;
begin
    v_user_id := auth.uid();

    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    select company_users.company_id
    into v_company_id
    from public.company_users
    where company_users.auth_user_id = v_user_id
      and company_users.status = 'active'
    order by company_users.created_at desc
    limit 1;

    if v_company_id is null then
        raise exception 'No active company membership found';
    end if;

    v_clean_code := upper(trim(coalesce(p_code, '')));

    if v_clean_code = '' then
        raise exception 'Code is required';
    end if;

    v_code_hash := encode(
        digest(v_clean_code, 'sha256'),
        'hex'
    );

    select *
    into v_code_row
    from public.property_connection_codes
    where code_hash = v_code_hash
    for update;

    if not found then
        raise exception 'Connection code not found';
    end if;

    if v_code_row.status <> 'active' then
        raise exception 'Connection code is not active';
    end if;

    if v_code_row.expires_at <= now() then
        raise exception 'Connection code has expired';
    end if;

    if exists (
        select 1
        from public.property_connections connection
        where connection.property_id = v_code_row.property_id
          and connection.company_id = v_company_id
          and connection.status not in ('revoked', 'declined', 'expired')
    ) then
        raise exception 'A live connection already exists for this property and company';
    end if;

    insert into public.property_connections (
        property_id,
        company_id,
        status,
        can_view_documents,
        can_view_photos,
        can_view_service_history,
        can_view_quotes,
        expires_at
    )
    values (
        v_code_row.property_id,
        v_company_id,
        'pending',
        v_code_row.can_view_documents,
        v_code_row.can_view_photos,
        v_code_row.can_view_service_history,
        v_code_row.can_view_quotes,
        null
    )
    on conflict (property_id, company_id) do update
        set status = 'pending',
            can_view_documents = excluded.can_view_documents,
            can_view_photos = excluded.can_view_photos,
            can_view_service_history = excluded.can_view_service_history,
            can_view_quotes = excluded.can_view_quotes,
            expires_at = excluded.expires_at,
            updated_at = now()
        where public.property_connections.status in ('revoked', 'declined', 'expired')
    returning id, property_id, company_id, status
    into v_connection_id, v_connection_property_id, v_connection_company_id, v_connection_status;

    if v_connection_id is null then
        raise exception 'Failed to create property connection';
    end if;

    update public.property_connection_codes
    set status = 'redeemed',
        redeemed_at = now(),
        redeemed_by_company_id = v_company_id,
        redeemed_by_user_id = v_user_id,
        property_connection_id = v_connection_id,
        updated_at = now()
    where id = v_code_row.id;

    return query
    select
        v_connection_id,
        v_connection_property_id,
        v_connection_company_id,
        v_connection_status;
end;
$$;

grant execute on function public.redeem_connection_code(text) to authenticated;
