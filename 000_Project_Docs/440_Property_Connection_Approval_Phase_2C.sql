create or replace function public.approve_connection(connection_id uuid)
returns table (
    result_connection_id uuid,
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
    v_connection public.property_connections%rowtype;
    v_result_connection_id uuid;
    v_result_property_id uuid;
    v_result_company_id uuid;
    v_result_status text;
begin
    v_user_id := auth.uid();

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

    if v_connection.status <> 'pending' then
        raise exception 'Only pending connections can be approved';
    end if;

    if not exists (
        select 1
        from public.property_memberships membership
        where membership.property_id = v_connection.property_id
          and membership.user_id = v_user_id
          and membership.status = 'active'
    ) then
        raise exception 'Not authorized to approve this connection';
    end if;

    update public.property_connections
    set status = 'connected',
        updated_at = now()
    where id = v_connection.id
    returning id, property_id, company_id, status
    into v_result_connection_id, v_result_property_id, v_result_company_id, v_result_status;

    return query
    select
        v_result_connection_id,
        v_result_property_id,
        v_result_company_id,
        v_result_status;
end;
$$;

grant execute on function public.approve_connection(uuid) to authenticated;

create or replace function public.decline_connection(connection_id uuid)
returns table (
    result_connection_id uuid,
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
    v_connection public.property_connections%rowtype;
    v_result_connection_id uuid;
    v_result_property_id uuid;
    v_result_company_id uuid;
    v_result_status text;
begin
    v_user_id := auth.uid();

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

    if v_connection.status <> 'pending' then
        raise exception 'Only pending connections can be declined';
    end if;

    if not exists (
        select 1
        from public.property_memberships membership
        where membership.property_id = v_connection.property_id
          and membership.user_id = v_user_id
          and membership.status = 'active'
    ) then
        raise exception 'Not authorized to decline this connection';
    end if;

    update public.property_connections
    set status = 'declined',
        updated_at = now()
    where id = v_connection.id
    returning id, property_id, company_id, status
    into v_result_connection_id, v_result_property_id, v_result_company_id, v_result_status;

    return query
    select
        v_result_connection_id,
        v_result_property_id,
        v_result_company_id,
        v_result_status;
end;
$$;

grant execute on function public.decline_connection(uuid) to authenticated;
