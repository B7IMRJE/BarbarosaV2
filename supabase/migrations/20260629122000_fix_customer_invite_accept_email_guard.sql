-- Preserve live fix for customer invite acceptance.
--
-- Fixes:
-- - Use the insert alias in RETURNING: property_connection.id.
-- - Guard accepted invites by invited_email when present.
-- - Match the live function variable conflict behavior and explicit return aliases.

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
    from public.company_customer_invitations invitation
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

    update public.property_preferred_providers preferred_provider
    set status = 'archived',
        archived_at = now(),
        updated_at = now()
    where preferred_provider.property_id = p_property_id
      and preferred_provider.status = 'active'
      and preferred_provider.company_id <> v_invitation.company_id;

    insert into public.property_preferred_providers as preferred_provider (
        property_id,
        company_id,
        property_connection_id,
        status,
        source,
        selected_by_user_id,
        selected_at,
        created_at,
        updated_at
    )
    values (
        p_property_id,
        v_invitation.company_id,
        v_connection_id,
        'active',
        'company_customer_invite',
        auth.uid(),
        now(),
        now(),
        now()
    )
    on conflict (property_id) where status = 'active' do update
    set company_id = excluded.company_id,
        property_connection_id = excluded.property_connection_id,
        source = excluded.source,
        selected_by_user_id = excluded.selected_by_user_id,
        selected_at = now(),
        updated_at = now();

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
        updated_at = now()
    returning company_client.id
    into v_client_id;

    update public.company_customer_invitations invitation
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
