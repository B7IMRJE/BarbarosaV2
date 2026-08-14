-- One active six-digit login-code namespace across homeowner and company-user invitations.

begin;

create or replace function public.enforce_global_invitation_login_code_namespace()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_code text;
    v_collision boolean := false;
begin
    if tg_table_name = 'company_customer_invitations' then
        v_code := nullif(btrim(coalesce(new.login_code, '')), '');
    elsif tg_table_name = 'company_user_invitations' then
        v_code := nullif(btrim(coalesce(new.manual_invite_code, '')), '');
    else
        raise exception 'Unsupported invitation code table.';
    end if;

    if v_code is null then return new; end if;

    -- The shared advisory lock closes the race between the two invitation tables.
    perform pg_advisory_xact_lock(hashtextextended('invitation-login-code:' || v_code, 0));

    if tg_table_name = 'company_customer_invitations' then
        select exists (
            select 1
            from public.company_user_invitations invitation
            where invitation.manual_invite_code = v_code
              and invitation.status = 'pending'
              and invitation.revoked_at is null
              and invitation.accepted_at is null
              and invitation.login_code_used_at is null
              and coalesce(invitation.manual_invite_expires_at, invitation.expires_at) > now()
        ) into v_collision;
    else
        select exists (
            select 1
            from public.company_customer_invitations invitation
            where invitation.login_code = v_code
              and invitation.status in ('pending', 'accepted')
              and invitation.revoked_at is null
              and invitation.login_code_used_at is null
              and coalesce(invitation.login_code_expires_at, invitation.expires_at) > now()
        ) into v_collision;
    end if;

    if v_collision then
        raise unique_violation using message = 'Invitation login code is already active in the global code namespace.';
    end if;

    return new;
end;
$$;

revoke all on function public.enforce_global_invitation_login_code_namespace() from public, anon;

-- A customer code that already collides with an active work invitation is invalidated.
-- It can be regenerated safely by the company; the resolver previously preferred the
-- work invitation, so this does not remove a customer code that could have worked safely.
update public.company_customer_invitations customer_invitation
set login_code = null,
    login_code_created_at = null,
    login_code_expires_at = null,
    login_code_used_at = null
where customer_invitation.login_code is not null
  and customer_invitation.login_code_used_at is null
  and customer_invitation.revoked_at is null
  and customer_invitation.status in ('pending', 'accepted')
  and coalesce(customer_invitation.login_code_expires_at, customer_invitation.expires_at) > now()
  and exists (
      select 1
      from public.company_user_invitations company_invitation
      where company_invitation.manual_invite_code = customer_invitation.login_code
        and company_invitation.status = 'pending'
        and company_invitation.revoked_at is null
        and company_invitation.accepted_at is null
        and company_invitation.login_code_used_at is null
        and coalesce(company_invitation.manual_invite_expires_at, company_invitation.expires_at) > now()
  );

drop trigger if exists company_customer_invitation_global_code_trigger
on public.company_customer_invitations;
create trigger company_customer_invitation_global_code_trigger
before insert or update on public.company_customer_invitations
for each row execute function public.enforce_global_invitation_login_code_namespace();

drop trigger if exists company_user_invitation_global_code_trigger
on public.company_user_invitations;
create trigger company_user_invitation_global_code_trigger
before insert or update on public.company_user_invitations
for each row execute function public.enforce_global_invitation_login_code_namespace();

commit;
