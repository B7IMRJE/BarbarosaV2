begin;

alter table public.company_customer_invitations
    add column if not exists login_code text null,
    add column if not exists login_code_created_at timestamptz null,
    add column if not exists login_code_expires_at timestamptz null,
    add column if not exists login_code_used_at timestamptz null;

create unique index if not exists company_customer_invitations_login_code_idx
    on public.company_customer_invitations (login_code)
    where login_code is not null;

drop function if exists public.get_company_customer_invites(uuid);

create function public.get_company_customer_invites(p_company_id uuid)
returns table (
    invitation_id uuid,
    company_id uuid,
    invited_email text,
    invited_phone text,
    invited_name text,
    note text,
    status text,
    invite_code text,
    login_code text,
    login_code_expires_at timestamptz,
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
        invitation.login_code,
        invitation.login_code_expires_at,
        invitation.expires_at,
        invitation.accepted_property_id,
        invitation.accepted_at,
        invitation.created_at
    from public.company_customer_invitations invitation
    where invitation.company_id = p_company_id
    order by invitation.created_at desc;
end;
$$;

revoke all on function public.get_company_customer_invites(uuid) from public;
revoke all on function public.get_company_customer_invites(uuid) from anon;
grant execute on function public.get_company_customer_invites(uuid) to authenticated;

comment on column public.company_customer_invitations.invite_code is
    'Internal customer connection token. Never present this value as a login code.';
comment on column public.company_customer_invitations.login_code is
    'Six-digit Supabase email OTP used for one-time customer invitation login.';

commit;
