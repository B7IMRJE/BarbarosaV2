-- REVIEW ONLY - do not run without manual Supabase review.
-- Purpose:
--   Let the public /company-invite page load only the company invitation that
--   matches a manual invite code. This prevents accepting an older pending
--   invitation for the same email when multiple invitations exist.
--
-- Safety:
--   - The plaintext invite code is never stored or returned.
--   - The function returns data only when the supplied code hashes to an
--     existing manual invite token.
--   - Returned fields are limited to invitation metadata needed by the public
--     invite accept page.
--   - The existing accept_company_user_invitation_by_code(uuid,text) RPC still
--     enforces authentication, verified email matching, status, and token match.

begin;

create extension if not exists pgcrypto;

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
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_code text := upper(btrim(coalesce(p_invite_code, '')));
    v_hash text;
begin
    if v_code = '' then
        raise exception 'Invite code is required';
    end if;

    v_hash := encode(digest(v_code, 'sha256'), 'hex');

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
                 and invitation.manual_invite_token_expires_at is not null
                 and invitation.manual_invite_token_expires_at <= now() then 'expired'
            when invitation.status = 'pending'
                 and invitation.expires_at is not null
                 and invitation.expires_at <= now() then 'expired'
            else invitation.status
        end as status,
        invitation.manual_invite_token_expires_at,
        invitation.company_id,
        company.name as company_name
    from public.company_user_invitations invitation
    left join public.companies company
      on company.id = invitation.company_id
    where invitation.manual_invite_token_hash = v_hash
    order by invitation.manual_invite_token_created_at desc nulls last,
             invitation.created_at desc nulls last,
             invitation.id desc
    limit 1;
end;
$$;

revoke all on function public.get_company_user_invitation_by_code(text) from public;
grant execute on function public.get_company_user_invitation_by_code(text) to anon;
grant execute on function public.get_company_user_invitation_by_code(text) to authenticated;

commit;

select
    to_regprocedure('public.get_company_user_invitation_by_code(text)') is not null as invite_by_code_rpc_exists;
