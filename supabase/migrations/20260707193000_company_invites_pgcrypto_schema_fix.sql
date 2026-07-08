-- Fix company invite code generation on Supabase projects where pgcrypto
-- functions live in the extensions schema and are not visible through the RPC
-- search_path.

begin;

create extension if not exists pgcrypto with schema extensions;

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
set search_path = pg_catalog, public, extensions, pg_temp
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
    from public.company_user_invitations as invitation
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

    v_plain_code := upper(encode(extensions.gen_random_bytes(12), 'hex'));
    v_hash := encode(extensions.digest(v_plain_code, 'sha256'), 'hex');
    v_expires_at := coalesce(
        v_invitation.manual_invite_expires_at,
        v_invitation.manual_invite_token_expires_at,
        v_invitation.expires_at,
        now() + interval '7 days'
    );

    update public.company_user_invitations
    set manual_invite_code = v_plain_code,
        manual_invite_expires_at = v_expires_at,
        manual_invite_created_at = now(),
        manual_invite_token_hash = v_hash,
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
                 '/company-invite?code=' ||
                 v_plain_code
        end,
        v_expires_at;
end;
$$;

revoke all on function public.create_company_user_manual_invite_link(uuid, text) from public;
revoke all on function public.create_company_user_manual_invite_link(uuid, text) from anon;
grant execute on function public.create_company_user_manual_invite_link(uuid, text) to authenticated;

create or replace function public.get_company_user_invitation_by_code(
    p_invite_code text
)
returns table (
    invitation_id uuid,
    invited_email text,
    role text,
    status text,
    manual_invite_expires_at timestamptz,
    company_id uuid,
    company_name text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
    v_code text := upper(btrim(coalesce(p_invite_code, '')));
    v_hash text;
begin
    if v_code = '' then
        raise exception 'Invite code is required';
    end if;

    v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');

    return query
    select
        invitation.id as invitation_id,
        invitation.email as invited_email,
        invitation.role,
        case
            when invitation.status = 'pending'
                 and invitation.revoked_at is not null then 'revoked'
            when invitation.status = 'pending'
                 and invitation.accepted_at is not null then 'accepted'
            when invitation.status = 'pending'
                 and coalesce(invitation.manual_invite_expires_at, invitation.manual_invite_token_expires_at) is not null
                 and coalesce(invitation.manual_invite_expires_at, invitation.manual_invite_token_expires_at) <= now() then 'expired'
            when invitation.status = 'pending'
                 and invitation.expires_at is not null
                 and invitation.expires_at <= now() then 'expired'
            else invitation.status
        end as status,
        coalesce(invitation.manual_invite_expires_at, invitation.manual_invite_token_expires_at) as manual_invite_expires_at,
        invitation.company_id,
        coalesce(company.public_name, company.dba_name, company.name) as company_name
    from public.company_user_invitations as invitation
    left join public.companies as company
      on company.id = invitation.company_id
    where (
        upper(btrim(coalesce(invitation.manual_invite_code, ''))) = v_code
        or invitation.manual_invite_token_hash = v_hash
    )
    order by
        case
            when invitation.status = 'pending'
             and invitation.revoked_at is null
             and invitation.accepted_at is null
             and (
                 coalesce(invitation.manual_invite_expires_at, invitation.manual_invite_token_expires_at) is null
                 or coalesce(invitation.manual_invite_expires_at, invitation.manual_invite_token_expires_at) > now()
             )
             and (invitation.expires_at is null or invitation.expires_at > now())
            then 0
            else 1
        end,
        coalesce(invitation.manual_invite_created_at, invitation.manual_invite_token_created_at) desc nulls last,
        invitation.created_at desc nulls last,
        invitation.id desc
    limit 1;
end;
$$;

revoke all on function public.get_company_user_invitation_by_code(text) from public;
grant execute on function public.get_company_user_invitation_by_code(text) to anon;
grant execute on function public.get_company_user_invitation_by_code(text) to authenticated;

create or replace function public.accept_company_user_invitation_by_code(
    p_invitation_id uuid,
    p_invite_code text
)
returns public.company_users
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_invitation public.company_user_invitations%rowtype;
    v_code text := upper(btrim(coalesce(p_invite_code, '')));
    v_hash text;
    v_code_matches boolean := false;
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
    from public.company_user_invitations as invitation
    where invitation.id = p_invitation_id
    for update;

    if not found then
        raise exception 'Invitation not found';
    end if;

    if v_invitation.status <> 'pending' then
        raise exception 'Only pending invitations can be accepted';
    end if;

    if v_invitation.revoked_at is not null then
        raise exception 'Invitation has been revoked';
    end if;

    if v_invitation.accepted_at is not null
       or v_invitation.accepted_by_user_id is not null then
        raise exception 'Invitation already accepted';
    end if;

    if coalesce(v_invitation.manual_invite_expires_at, v_invitation.manual_invite_token_expires_at) is not null
       and coalesce(v_invitation.manual_invite_expires_at, v_invitation.manual_invite_token_expires_at) <= now() then
        raise exception 'Invite code has expired';
    end if;

    if v_invitation.expires_at is not null
       and v_invitation.expires_at <= now() then
        raise exception 'Invitation has expired';
    end if;

    v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');
    v_code_matches :=
        upper(btrim(coalesce(v_invitation.manual_invite_code, ''))) = v_code
        or coalesce(v_invitation.manual_invite_token_hash, '') = v_hash;

    if not v_code_matches then
        raise exception 'Invalid invite code';
    end if;

    return public.accept_company_user_invitation(p_invitation_id);
end;
$$;

revoke all on function public.accept_company_user_invitation_by_code(uuid, text) from public;
revoke all on function public.accept_company_user_invitation_by_code(uuid, text) from anon;
grant execute on function public.accept_company_user_invitation_by_code(uuid, text) to authenticated;

commit;
