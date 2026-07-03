-- 593_Customer_Invite_In_App_Email_Lookup.sql
-- Review-only proposal. Do not run until reviewed in Supabase.
--
-- Goal:
-- - Let a signed-in homeowner see pending customer/home invites sent to their
--   auth email without pasting an invite link.
-- - Return only safe invitation fields needed to render an in-app Accept Invite
--   card and then call accept_customer_invite_by_code(text, uuid).
-- - Do not expose private HomeOS photos, documents, service history, or item
--   details.

begin;

do $$
begin
    if to_regclass('public.company_customer_invitations') is null then
        raise exception 'public.company_customer_invitations is required.';
    end if;

    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required.';
    end if;

    if to_regprocedure('public.accept_customer_invite_by_code(text,uuid)') is null then
        raise exception 'public.accept_customer_invite_by_code(text, uuid) is required.';
    end if;
end
$$;

create index if not exists company_customer_invitations_invited_email_status_idx
on public.company_customer_invitations (lower(btrim(invited_email)), status, created_at desc)
where invited_email is not null;

create or replace function public.get_my_customer_invites()
returns table (
    invitation_id uuid,
    company_id uuid,
    company_name text,
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
    v_user_email text;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    v_user_email := lower(btrim(coalesce(auth.jwt()->>'email', '')));

    if v_user_email = '' then
        raise exception 'Signed-in account does not have an email address.';
    end if;

    update public.company_customer_invitations invitation
    set status = 'expired',
        updated_at = now()
    where lower(btrim(coalesce(invitation.status, ''))) = 'pending'
      and invitation.expires_at < now()
      and lower(btrim(coalesce(invitation.invited_email, ''))) = v_user_email;

    return query
    select
        invitation.id as invitation_id,
        invitation.company_id as company_id,
        coalesce(company.public_name, company.dba_name, company.name)::text as company_name,
        invitation.invited_email as invited_email,
        invitation.invited_phone as invited_phone,
        invitation.invited_name as invited_name,
        invitation.note as note,
        invitation.status as status,
        invitation.invite_code as invite_code,
        invitation.expires_at as expires_at,
        invitation.created_at as created_at
    from public.company_customer_invitations invitation
    join public.companies company on company.id = invitation.company_id
    where lower(btrim(coalesce(invitation.invited_email, ''))) = v_user_email
      and lower(btrim(coalesce(invitation.status, ''))) = 'pending'
      and invitation.expires_at >= now()
    order by invitation.created_at desc;
end;
$$;

revoke all on function public.get_my_customer_invites() from public;
revoke all on function public.get_my_customer_invites() from anon;
grant execute on function public.get_my_customer_invites() to authenticated;

-- Smoke check after applying:
-- select to_regprocedure('public.get_my_customer_invites()') is not null as lookup_exists;

rollback;
