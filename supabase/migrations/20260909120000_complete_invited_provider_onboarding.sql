-- Complete the invited provider connection once, with safe retries during home setup.
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
    limit 1
    for update;

    if not found then
        raise exception 'Customer invite not found.';
    end if;

    v_invited_email := lower(btrim(coalesce(v_invitation.invited_email, '')));

    if v_invited_email <> '' and v_invited_email <> v_signed_in_email then
        raise exception 'This invite was sent to a different email. Sign out and use the invited email address.';
    end if;

    if not public.homeos_can_read_property_record(p_property_id) then
        raise exception 'You can only connect a home that belongs to your account.';
    end if;

    -- Automatic onboarding may retry after a slow response or a page reload.
    -- Reuse only this user's existing connection to this same home; never move
    -- an accepted invite to another home or restore a removed relationship.
    if v_invitation.status = 'accepted' then
        if v_invitation.accepted_by_user_id is distinct from auth.uid()
           or v_invitation.accepted_property_id is distinct from p_property_id
           or v_invitation.revoked_at is not null then
            raise exception 'This invitation was already used for another home or account, or was revoked.';
        end if;
        select client.id, connection.id into v_client_id, v_connection_id
        from public.company_property_clients client
        join public.property_connections connection on connection.id = client.property_connection_id
        where client.property_id = p_property_id and client.company_id = v_invitation.company_id
          and client.status = 'active' and connection.status = 'connected'
          and connection.property_id = p_property_id and connection.company_id = v_invitation.company_id
          and exists (
              select 1 from public.property_preferred_providers preferred
              where preferred.property_id = p_property_id and preferred.company_id = v_invitation.company_id
                and preferred.status = 'active'
          )
          and exists (select 1 from public.homeos_company_provider_category_keys(v_invitation.company_id))
        limit 1;
        if v_client_id is null then
            raise exception 'The previous company connection is no longer active. Review this home’s company connections.';
        end if;
        return query select v_invitation.id, v_invitation.company_id, p_property_id,
            v_client_id, v_connection_id, 'accepted'::text;
        return;
    end if;

    if lower(btrim(coalesce(v_invitation.status, ''))) <> 'pending'
       or v_invitation.expires_at <= now()
       or v_invitation.revoked_at is not null then
        raise exception 'This customer invite is not active. Ask the company for a new invite link.';
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

-- A first home and its invited provider become visible together. Any connection
-- failure rolls back home creation, while retries reuse the first-home identity.
create or replace function public.create_invited_homeowner_first_property(p_home jsonb, p_invite_code text)
returns table (property_id uuid, membership_id uuid, created boolean)
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_home record;
begin
    if nullif(btrim(p_invite_code), '') is null then
        raise exception 'The company invitation is missing.';
    end if;
    select * into v_home from public.create_homeowner_first_property(
        p_home->>'p_name', p_home->>'p_address_line_1', p_home->>'p_address_line_2',
        p_home->>'p_city', p_home->>'p_state', p_home->>'p_postal_code',
        p_home->>'p_country_code', p_home->>'p_formatted_address',
        (p_home->>'p_latitude')::double precision, (p_home->>'p_longitude')::double precision,
        p_home->>'p_google_place_id', p_home->>'p_property_type'
    );
    perform public.accept_customer_invite_by_code(p_invite_code, v_home.property_id);
    return query select v_home.property_id::uuid, v_home.membership_id::uuid, v_home.created::boolean;
end;
$$;
revoke all on function public.create_invited_homeowner_first_property(jsonb, text) from public, anon;
grant execute on function public.create_invited_homeowner_first_property(jsonb, text) to authenticated;
notify pgrst, 'reload schema';
