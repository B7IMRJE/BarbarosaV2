-- REVIEW ONLY - do not run without manual Supabase review.
-- Purpose:
--   Add a safe manual invitation code/link fallback for company team invitations.
--   The current company_user_invitations table stores email delivery state but does
--   not expose a plaintext invitation code or URL that the app can safely copy.
--
-- Design:
--   - Authorized company managers can generate a one-time invite code.
--   - Only a hash and last four characters are stored in company_user_invitations.
--   - The plaintext code is returned only from the generation RPC response.
--   - Accepting by code still calls the existing accept_company_user_invitation()
--     flow, so the authenticated user's verified email must match the invite.
--   - Revoked invitation deletion is limited to revoked rows and company managers.

begin;

create extension if not exists pgcrypto;

alter table public.company_user_invitations
    add column if not exists manual_invite_token_hash text null,
    add column if not exists manual_invite_token_last4 text null,
    add column if not exists manual_invite_token_expires_at timestamptz null,
    add column if not exists manual_invite_token_created_at timestamptz null,
    add column if not exists manual_invite_token_created_by_user_id uuid null;

create index if not exists company_user_invitations_manual_token_hash_idx
on public.company_user_invitations (manual_invite_token_hash)
where manual_invite_token_hash is not null;

create or replace function public.create_company_user_manual_invite_link(
    p_invitation_id uuid,
    p_site_url text default null
)
returns table (
    invitation_id uuid,
    invite_code text,
    invite_url text,
    expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_invitation public.company_user_invitations%rowtype;
    v_plain_code text;
    v_hash text;
    v_base_url text := nullif(btrim(coalesce(p_site_url, '')), '');
    v_expires_at timestamptz;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_invitation_id is null then
        raise exception 'invitation_id is required';
    end if;

    select *
    into v_invitation
    from public.company_user_invitations invitation
    where invitation.id = p_invitation_id
    for update;

    if not found then
        raise exception 'Invitation not found';
    end if;

    if not public.can_manage_company_users(v_invitation.company_id) then
        raise exception 'Not authorized';
    end if;

    if v_invitation.status <> 'pending' then
        raise exception 'Only pending invitations can receive a manual invite code';
    end if;

    if v_invitation.accepted_at is not null
       or v_invitation.accepted_by_user_id is not null then
        raise exception 'Invitation already accepted';
    end if;

    if v_invitation.revoked_at is not null then
        raise exception 'Invitation has been revoked';
    end if;

    if v_invitation.expires_at is not null and v_invitation.expires_at <= now() then
        raise exception 'Invitation has expired';
    end if;

    v_plain_code := upper(encode(gen_random_bytes(18), 'hex'));
    v_hash := encode(digest(v_plain_code, 'sha256'), 'hex');
    v_expires_at := coalesce(v_invitation.expires_at, now() + interval '7 days');

    update public.company_user_invitations
    set manual_invite_token_hash = v_hash,
        manual_invite_token_last4 = right(v_plain_code, 4),
        manual_invite_token_expires_at = v_expires_at,
        manual_invite_token_created_at = now(),
        manual_invite_token_created_by_user_id = v_user_id,
        updated_at = now()
    where id = v_invitation.id;

    return query
    select
        v_invitation.id,
        v_plain_code,
        case
            when v_base_url is null then null
            else regexp_replace(v_base_url, '/+$', '') ||
                 '/onboarding/company-invitations?invitationId=' ||
                 v_invitation.id::text ||
                 '&inviteCode=' ||
                 v_plain_code
        end,
        v_expires_at;
end;
$$;

revoke all on function public.create_company_user_manual_invite_link(uuid, text) from public;
revoke all on function public.create_company_user_manual_invite_link(uuid, text) from anon;
grant execute on function public.create_company_user_manual_invite_link(uuid, text) to authenticated;

create or replace function public.accept_company_user_invitation_by_code(
    p_invitation_id uuid,
    p_invite_code text
)
returns public.company_users
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_invitation public.company_user_invitations%rowtype;
    v_code text := upper(btrim(coalesce(p_invite_code, '')));
    v_hash text;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_invitation_id is null then
        raise exception 'invitation_id is required';
    end if;

    if v_code = '' then
        raise exception 'Invite code is required';
    end if;

    select *
    into v_invitation
    from public.company_user_invitations invitation
    where invitation.id = p_invitation_id;

    if not found then
        raise exception 'Invitation not found';
    end if;

    if v_invitation.status <> 'pending' then
        raise exception 'Only pending invitations can be accepted';
    end if;

    if v_invitation.manual_invite_token_hash is null then
        raise exception 'Manual invite code has not been generated';
    end if;

    if v_invitation.manual_invite_token_expires_at is not null
       and v_invitation.manual_invite_token_expires_at <= now() then
        raise exception 'Invite code has expired';
    end if;

    v_hash := encode(digest(v_code, 'sha256'), 'hex');

    if v_hash <> v_invitation.manual_invite_token_hash then
        raise exception 'Invalid invite code';
    end if;

    return public.accept_company_user_invitation(p_invitation_id);
end;
$$;

revoke all on function public.accept_company_user_invitation_by_code(uuid, text) from public;
revoke all on function public.accept_company_user_invitation_by_code(uuid, text) from anon;
grant execute on function public.accept_company_user_invitation_by_code(uuid, text) to authenticated;

create or replace function public.delete_revoked_company_user_invitation(
    p_invitation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_invitation public.company_user_invitations%rowtype;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_invitation_id is null then
        raise exception 'invitation_id is required';
    end if;

    select *
    into v_invitation
    from public.company_user_invitations invitation
    where invitation.id = p_invitation_id
    for update;

    if not found then
        raise exception 'Invitation not found';
    end if;

    if not public.can_manage_company_users(v_invitation.company_id) then
        raise exception 'Not authorized';
    end if;

    if v_invitation.status <> 'revoked' then
        raise exception 'Only revoked invitations can be deleted';
    end if;

    delete from public.company_user_invitations invitation
    where invitation.id = v_invitation.id
      and invitation.status = 'revoked';

    return v_invitation.id;
end;
$$;

revoke all on function public.delete_revoked_company_user_invitation(uuid) from public;
revoke all on function public.delete_revoked_company_user_invitation(uuid) from anon;
grant execute on function public.delete_revoked_company_user_invitation(uuid) to authenticated;

commit;

select
    to_regprocedure('public.create_company_user_manual_invite_link(uuid,text)') is not null as manual_invite_link_rpc_exists,
    to_regprocedure('public.accept_company_user_invitation_by_code(uuid,text)') is not null as accept_by_code_rpc_exists,
    to_regprocedure('public.delete_revoked_company_user_invitation(uuid)') is not null as delete_revoked_invitation_rpc_exists;
