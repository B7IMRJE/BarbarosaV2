-- Phase 5.84
-- Review-only SQL for company-created customer/homeowner invite links.
--
-- Purpose:
-- - Let company staff invite a homeowner/customer to connect a HomeOS home.
-- - Keep this separate from company user/team/technician invitations.
-- - Accepting an invite creates/updates safe company/property connection rows.
-- - Do not expose private HomeOS photos, documents, history, or item details.
--
-- Do not apply until reviewed in Supabase SQL Editor.

begin;

do $$
begin
    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before customer invites can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before customer invites can be installed.';
    end if;

    if to_regclass('public.properties') is null then
        raise exception 'public.properties is required before customer invites can be installed.';
    end if;

    if to_regclass('public.property_memberships') is null then
        raise exception 'public.property_memberships is required before customer invites can be installed.';
    end if;

    if to_regclass('public.property_connections') is null then
        raise exception 'public.property_connections is required before customer invites can be installed.';
    end if;

    if to_regclass('public.company_property_clients') is null then
        raise exception 'public.company_property_clients is required before customer invites can be installed.';
    end if;

    if to_regclass('public.property_preferred_providers') is null then
        raise exception 'public.property_preferred_providers is required before customer invites can be installed.';
    end if;

    if to_regprocedure('public.homeos_is_platform_admin()') is null then
        raise exception 'public.homeos_is_platform_admin() is required before customer invites can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null then
        raise exception 'public.homeos_can_read_property_record(uuid) is required before customer invites can be installed.';
    end if;
end
$$;

alter table public.property_connections
    drop constraint if exists property_connections_request_source_check;

alter table public.property_connections
    add constraint property_connections_request_source_check
    check (
        request_source is null
        or request_source in (
            'connection_code',
            'homeowner_provider_request',
            'company_request',
            'company_customer_invite',
            'manual'
        )
    );

alter table public.property_preferred_providers
    drop constraint if exists property_preferred_providers_source_check;

alter table public.property_preferred_providers
    add constraint property_preferred_providers_source_check
    check (source in ('homeowner_provider_request', 'company_customer_invite', 'manual'));

alter table public.company_property_clients
    drop constraint if exists company_property_clients_source_check;

alter table public.company_property_clients
    add constraint company_property_clients_source_check
    check (source in ('homeowner_provider_request', 'connection_code', 'company_customer_invite', 'manual'));

create table if not exists public.company_customer_invitations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    invited_email text null,
    invited_phone text null,
    invited_name text null,
    note text null,
    status text not null default 'pending',
    invite_code text not null default encode(gen_random_bytes(18), 'hex'),
    expires_at timestamptz not null default (now() + interval '30 days'),
    created_by_user_id uuid null,
    accepted_by_user_id uuid null,
    accepted_property_id uuid null references public.properties(id) on delete set null,
    accepted_at timestamptz null,
    revoked_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_customer_invitations_status_check
        check (lower(btrim(status)) in ('pending', 'accepted', 'revoked', 'expired')),
    constraint company_customer_invitations_contact_check
        check (
            nullif(btrim(coalesce(invited_email, '')), '') is not null
            or nullif(btrim(coalesce(invited_phone, '')), '') is not null
            or nullif(btrim(coalesce(invited_name, '')), '') is not null
        )
);

create unique index if not exists company_customer_invitations_invite_code_idx
on public.company_customer_invitations (invite_code);

create index if not exists company_customer_invitations_company_status_idx
on public.company_customer_invitations (company_id, status, created_at desc);

create index if not exists company_customer_invitations_accepted_property_idx
on public.company_customer_invitations (accepted_property_id);

alter table public.company_customer_invitations enable row level security;

drop policy if exists company_customer_invitations_company_select on public.company_customer_invitations;
create policy company_customer_invitations_company_select
on public.company_customer_invitations
for select
to authenticated
using (
    public.homeos_is_platform_admin()
    or exists (
        select 1
        from public.company_users company_user
        where company_user.company_id = company_customer_invitations.company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
          and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'admin', 'manager', 'office', 'dispatcher')
    )
    or accepted_by_user_id = auth.uid()
);

create or replace function public.can_create_company_customer_invites(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select public.homeos_is_platform_admin()
        or (
            auth.uid() is not null
            and p_company_id is not null
            and exists (
                select 1
                from public.company_users company_user
                where company_user.company_id = p_company_id
                  and company_user.auth_user_id = auth.uid()
                  and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                  and lower(btrim(coalesce(company_user.role, ''))) in ('owner', 'admin', 'manager', 'office', 'dispatcher')
            )
        );
$$;

create or replace function public.create_company_customer_invite(
    p_company_id uuid,
    p_invited_email text default null,
    p_invited_phone text default null,
    p_invited_name text default null,
    p_note text default null
)
returns table (
    invitation_id uuid,
    company_id uuid,
    invited_email text,
    invited_phone text,
    invited_name text,
    note text,
    status text,
    invite_code text,
    expires_at timestamptz,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_invitation public.company_customer_invitations%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not public.can_create_company_customer_invites(p_company_id) then
        raise exception 'Not authorized to create customer invites for this company.';
    end if;

    if nullif(btrim(coalesce(p_invited_email, '')), '') is null
       and nullif(btrim(coalesce(p_invited_phone, '')), '') is null
       and nullif(btrim(coalesce(p_invited_name, '')), '') is null then
        raise exception 'Customer name, email, or phone is required.';
    end if;

    insert into public.company_customer_invitations (
        company_id,
        invited_email,
        invited_phone,
        invited_name,
        note,
        created_by_user_id
    )
    values (
        p_company_id,
        nullif(btrim(coalesce(p_invited_email, '')), ''),
        nullif(btrim(coalesce(p_invited_phone, '')), ''),
        nullif(btrim(coalesce(p_invited_name, '')), ''),
        nullif(btrim(coalesce(p_note, '')), ''),
        auth.uid()
    )
    returning *
    into v_invitation;

    return query
    select
        v_invitation.id,
        v_invitation.company_id,
        v_invitation.invited_email,
        v_invitation.invited_phone,
        v_invitation.invited_name,
        v_invitation.note,
        v_invitation.status,
        v_invitation.invite_code,
        v_invitation.expires_at,
        v_invitation.created_at;
end;
$$;

create or replace function public.get_company_customer_invites(p_company_id uuid)
returns table (
    invitation_id uuid,
    company_id uuid,
    invited_email text,
    invited_phone text,
    invited_name text,
    note text,
    status text,
    invite_code text,
    expires_at timestamptz,
    accepted_property_id uuid,
    accepted_at timestamptz,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not public.can_create_company_customer_invites(p_company_id) then
        raise exception 'Not authorized to view customer invites for this company.';
    end if;

    update public.company_customer_invitations invitation
    set status = 'expired',
        updated_at = now()
    where invitation.company_id = p_company_id
      and lower(btrim(coalesce(invitation.status, ''))) = 'pending'
      and invitation.expires_at < now();

    return query
    select
        invitation.id,
        invitation.company_id,
        invitation.invited_email,
        invitation.invited_phone,
        invitation.invited_name,
        invitation.note,
        invitation.status,
        invitation.invite_code,
        invitation.expires_at,
        invitation.accepted_property_id,
        invitation.accepted_at,
        invitation.created_at
    from public.company_customer_invitations invitation
    where invitation.company_id = p_company_id
    order by invitation.created_at desc;
end;
$$;

create or replace function public.get_customer_invite_by_code(p_invite_code text)
returns table (
    invitation_id uuid,
    company_id uuid,
    company_name text,
    invited_email text,
    invited_phone text,
    invited_name text,
    note text,
    status text,
    expires_at timestamptz,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if nullif(btrim(coalesce(p_invite_code, '')), '') is null then
        raise exception 'Invite code is required.';
    end if;

    return query
    select
        invitation.id,
        invitation.company_id,
        coalesce(company.public_name, company.dba_name, company.name)::text as company_name,
        invitation.invited_email,
        invitation.invited_phone,
        invitation.invited_name,
        invitation.note,
        case
            when lower(btrim(coalesce(invitation.status, ''))) = 'pending'
             and invitation.expires_at < now()
                then 'expired'
            else invitation.status
        end as status,
        invitation.expires_at,
        invitation.created_at
    from public.company_customer_invitations invitation
    join public.companies company on company.id = invitation.company_id
    where invitation.invite_code = btrim(p_invite_code)
    limit 1;
end;
$$;

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
as $$
declare
    v_invitation public.company_customer_invitations%rowtype;
    v_connection_id uuid;
    v_client_id uuid;
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
    returning property_connections.id
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
        v_invitation.id,
        v_invitation.company_id,
        p_property_id,
        v_client_id,
        v_connection_id,
        'accepted'::text;
end;
$$;

create or replace function public.revoke_company_customer_invite(
    p_invitation_id uuid,
    p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_invitation public.company_customer_invitations%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select *
    into v_invitation
    from public.company_customer_invitations
    where id = p_invitation_id;

    if not found then
        raise exception 'Customer invite not found.';
    end if;

    if not public.can_create_company_customer_invites(v_invitation.company_id) then
        raise exception 'Not authorized to revoke customer invites for this company.';
    end if;

    update public.company_customer_invitations
    set status = 'revoked',
        note = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), note),
        revoked_at = now(),
        updated_at = now()
    where id = p_invitation_id
      and lower(btrim(coalesce(status, ''))) = 'pending';
end;
$$;

create or replace function public.delete_revoked_customer_invite(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_invitation public.company_customer_invitations%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    select *
    into v_invitation
    from public.company_customer_invitations
    where id = p_invitation_id;

    if not found then
        return;
    end if;

    if not public.can_create_company_customer_invites(v_invitation.company_id) then
        raise exception 'Not authorized to delete revoked customer invites for this company.';
    end if;

    delete from public.company_customer_invitations
    where id = p_invitation_id
      and lower(btrim(coalesce(status, ''))) = 'revoked';
end;
$$;

revoke all on table public.company_customer_invitations from public;
revoke all on table public.company_customer_invitations from anon;
revoke insert, update, delete on table public.company_customer_invitations from authenticated;
grant select on table public.company_customer_invitations to authenticated;

revoke all on function public.can_create_company_customer_invites(uuid) from public;
revoke all on function public.can_create_company_customer_invites(uuid) from anon;
grant execute on function public.can_create_company_customer_invites(uuid) to authenticated;

revoke all on function public.create_company_customer_invite(uuid, text, text, text, text) from public;
revoke all on function public.create_company_customer_invite(uuid, text, text, text, text) from anon;
grant execute on function public.create_company_customer_invite(uuid, text, text, text, text) to authenticated;

revoke all on function public.get_company_customer_invites(uuid) from public;
revoke all on function public.get_company_customer_invites(uuid) from anon;
grant execute on function public.get_company_customer_invites(uuid) to authenticated;

revoke all on function public.get_customer_invite_by_code(text) from public;
grant execute on function public.get_customer_invite_by_code(text) to anon, authenticated;

revoke all on function public.accept_customer_invite_by_code(text, uuid) from public;
revoke all on function public.accept_customer_invite_by_code(text, uuid) from anon;
grant execute on function public.accept_customer_invite_by_code(text, uuid) to authenticated;

revoke all on function public.revoke_company_customer_invite(uuid, text) from public;
revoke all on function public.revoke_company_customer_invite(uuid, text) from anon;
grant execute on function public.revoke_company_customer_invite(uuid, text) to authenticated;

revoke all on function public.delete_revoked_customer_invite(uuid) from public;
revoke all on function public.delete_revoked_customer_invite(uuid) from anon;
grant execute on function public.delete_revoked_customer_invite(uuid) to authenticated;

commit;

-- Verification after review/install:
-- select
--   to_regclass('public.company_customer_invitations') is not null as customer_invites_table_exists,
--   to_regprocedure('public.create_company_customer_invite(uuid,text,text,text,text)') is not null as create_invite_rpc_exists,
--   to_regprocedure('public.get_company_customer_invites(uuid)') is not null as list_invites_rpc_exists,
--   to_regprocedure('public.get_customer_invite_by_code(text)') is not null as lookup_invite_rpc_exists,
--   to_regprocedure('public.accept_customer_invite_by_code(text,uuid)') is not null as accept_invite_rpc_exists;
