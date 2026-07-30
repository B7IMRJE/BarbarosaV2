begin;

create or replace function public.resolve_customer_login_invitation(p_login_code text)
returns table (
    invitation_id uuid,
    invited_email text,
    invite_code text,
    login_code_expires_at timestamptz,
    expires_at timestamptz
)
language sql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select
        invitation.id,
        invitation.invited_email,
        invitation.invite_code,
        invitation.login_code_expires_at,
        invitation.expires_at
    from public.company_customer_invitations invitation
    where invitation.login_code = btrim(p_login_code)
      and lower(btrim(coalesce(invitation.status, ''))) = 'pending'
      and invitation.revoked_at is null
      and invitation.login_code_used_at is null
      and coalesce(invitation.login_code_expires_at, invitation.expires_at) > now()
    limit 1;
$$;

revoke all on function public.resolve_customer_login_invitation(text) from public;
revoke all on function public.resolve_customer_login_invitation(text) from anon;
revoke all on function public.resolve_customer_login_invitation(text) from authenticated;
grant execute on function public.resolve_customer_login_invitation(text) to service_role;

comment on function public.resolve_customer_login_invitation(text) is
    'Resolves an unused customer login code independently from customer connection acceptance.';

commit;
