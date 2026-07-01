-- 589_Company_User_Invitation_Delete_Cleanup.sql
-- REVIEW ONLY - do not run automatically.
--
-- Goal:
--   Add a safe cleanup RPC for old company user invitations.
--
-- Product rules:
--   - Only company owner/admin/manager users who pass can_manage_company_users()
--     may delete invitations for that company.
--   - Accepted invitations are retained as history.
--   - Pending invitations may only be deleted after they are expired.
--   - Revoked invitations may be deleted.
--   - Active pending invitations should be revoked first, then deleted after revoke.

do $$
begin
    if to_regclass('public.company_user_invitations') is null then
        raise exception 'public.company_user_invitations is required before invitation cleanup can be installed.';
    end if;

    if to_regprocedure('public.can_manage_company_users(uuid)') is null then
        raise exception 'public.can_manage_company_users(uuid) is required before invitation cleanup can be installed.';
    end if;
end $$;

create or replace function public.delete_company_user_invitation(
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
    v_status text;
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

    v_status := lower(btrim(coalesce(v_invitation.status, '')));

    if v_status = 'accepted' then
        raise exception 'Accepted invitations are retained as history';
    end if;

    if v_status = 'pending'
       and (
           coalesce(
               v_invitation.manual_invite_token_expires_at,
               v_invitation.expires_at
           ) is null
           or coalesce(
               v_invitation.manual_invite_token_expires_at,
               v_invitation.expires_at
           ) > now()
       ) then
        raise exception 'Active pending invitations must be revoked before cleanup';
    end if;

    if v_status not in ('pending', 'revoked', 'expired') then
        raise exception 'Only pending expired, revoked, or expired invitations can be deleted';
    end if;

    delete from public.company_user_invitations invitation
    where invitation.id = v_invitation.id;

    return v_invitation.id;
end;
$$;

revoke all on function public.delete_company_user_invitation(uuid) from public;
revoke all on function public.delete_company_user_invitation(uuid) from anon;
grant execute on function public.delete_company_user_invitation(uuid) to authenticated;

select
    to_regprocedure('public.delete_company_user_invitation(uuid)') is not null as delete_company_user_invitation_rpc_exists;
