-- Company User Invitation Email Delivery - Phase 1C
-- Adds secure delivery tracking and RPCs used by the Edge Function that sends
-- Supabase Auth invitation emails for existing pending company invitations.

begin;

alter table public.company_user_invitations
    add column if not exists last_email_attempted_at timestamptz null,
    add column if not exists last_email_sent_at timestamptz null,
    add column if not exists email_send_count integer not null default 0,
    add column if not exists email_delivery_status text not null default 'not_sent',
    add column if not exists email_delivery_error text null;

update public.company_user_invitations
set email_send_count = greatest(coalesce(email_send_count, 0), 0),
    email_delivery_status = case
        when lower(btrim(coalesce(email_delivery_status, ''))) in ('not_sent', 'sending', 'sent', 'failed')
            then lower(btrim(email_delivery_status))
        when last_email_sent_at is not null
            then 'sent'
        else 'not_sent'
    end,
    email_delivery_error = nullif(btrim(email_delivery_error), '')
where email_send_count is null
   or email_send_count < 0
   or email_delivery_status is null
   or lower(btrim(coalesce(email_delivery_status, ''))) not in ('not_sent', 'sending', 'sent', 'failed')
   or email_delivery_error is distinct from nullif(btrim(email_delivery_error), '');

alter table public.company_user_invitations
    alter column email_send_count set default 0,
    alter column email_send_count set not null,
    alter column email_delivery_status set default 'not_sent',
    alter column email_delivery_status set not null;

alter table public.company_user_invitations
    drop constraint if exists company_user_invitations_email_send_count_check,
    drop constraint if exists company_user_invitations_email_delivery_status_check;

alter table public.company_user_invitations
    add constraint company_user_invitations_email_send_count_check
        check (email_send_count >= 0),
    add constraint company_user_invitations_email_delivery_status_check
        check (email_delivery_status in ('not_sent', 'sending', 'sent', 'failed'));

create index if not exists company_user_invitations_email_delivery_status_idx
on public.company_user_invitations (email_delivery_status);

create index if not exists company_user_invitations_last_email_attempted_at_idx
on public.company_user_invitations (last_email_attempted_at)
where last_email_attempted_at is not null;

create or replace function public.prepare_company_user_invitation_email_delivery(
    p_invitation_id uuid
)
returns table (
    invitation_id uuid,
    company_id uuid,
    company_name text,
    email text,
    invited_role text,
    full_name text,
    expires_at timestamptz,
    last_email_attempted_at timestamptz,
    last_email_sent_at timestamptz,
    email_send_count integer,
    cooldown_ends_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_invitation public.company_user_invitations%rowtype;
    v_updated_invitation public.company_user_invitations%rowtype;
    v_company_name text;
    v_cooldown interval := interval '60 seconds';
    v_cooldown_ends_at timestamptz;
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

    if v_invitation.status = 'accepted'
       or v_invitation.accepted_at is not null
       or v_invitation.accepted_by_user_id is not null then
        raise exception 'Invitation already accepted';
    end if;

    if v_invitation.status = 'revoked'
       or v_invitation.revoked_at is not null then
        raise exception 'Invitation has been revoked';
    end if;

    if v_invitation.status = 'expired'
       or (v_invitation.expires_at is not null and v_invitation.expires_at <= now()) then
        raise exception 'Invitation has expired';
    end if;

    if v_invitation.status <> 'pending' then
        raise exception 'Only pending invitations can be emailed';
    end if;

    if nullif(btrim(v_invitation.email), '') is null then
        raise exception 'Invitation email is required';
    end if;

    v_cooldown_ends_at := v_invitation.last_email_attempted_at + v_cooldown;

    if v_invitation.last_email_attempted_at is not null
       and v_cooldown_ends_at > now() then
        raise exception 'Please wait before sending another invitation email';
    end if;

    update public.company_user_invitations
    set last_email_attempted_at = now(),
        email_delivery_status = 'sending',
        email_delivery_error = null,
        updated_at = now()
    where id = v_invitation.id
    returning * into v_updated_invitation;

    select company.name
    into v_company_name
    from public.companies company
    where company.id = v_updated_invitation.company_id;

    return query
    select
        v_updated_invitation.id,
        v_updated_invitation.company_id,
        v_company_name,
        lower(btrim(v_updated_invitation.email)),
        v_updated_invitation.role,
        v_updated_invitation.full_name,
        v_updated_invitation.expires_at,
        v_updated_invitation.last_email_attempted_at,
        v_updated_invitation.last_email_sent_at,
        v_updated_invitation.email_send_count,
        v_updated_invitation.last_email_attempted_at + v_cooldown;
end;
$$;

revoke all on function public.prepare_company_user_invitation_email_delivery(uuid) from public;
revoke all on function public.prepare_company_user_invitation_email_delivery(uuid) from anon;
grant execute on function public.prepare_company_user_invitation_email_delivery(uuid) to authenticated;

create or replace function public.record_company_user_invitation_email_delivery(
    p_invitation_id uuid,
    p_delivery_status text,
    p_delivery_error text default null
)
returns table (
    invitation_id uuid,
    email_delivery_status text,
    last_email_attempted_at timestamptz,
    last_email_sent_at timestamptz,
    email_send_count integer,
    email_delivery_error text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_delivery_status text := lower(btrim(coalesce(p_delivery_status, '')));
    v_delivery_error text := left(nullif(btrim(coalesce(p_delivery_error, '')), ''), 500);
    v_invitation public.company_user_invitations%rowtype;
    v_updated_invitation public.company_user_invitations%rowtype;
begin
    if v_user_id is null then
        raise exception 'Not authenticated';
    end if;

    if p_invitation_id is null then
        raise exception 'invitation_id is required';
    end if;

    if v_delivery_status not in ('sent', 'failed') then
        raise exception 'Invalid delivery status';
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

    if v_invitation.status = 'accepted'
       or v_invitation.accepted_at is not null
       or v_invitation.accepted_by_user_id is not null then
        raise exception 'Invitation already accepted';
    end if;

    if v_invitation.status = 'revoked'
       or v_invitation.revoked_at is not null then
        raise exception 'Invitation has been revoked';
    end if;

    if v_invitation.status = 'expired'
       or (v_invitation.expires_at is not null and v_invitation.expires_at <= now()) then
        raise exception 'Invitation has expired';
    end if;

    if v_invitation.status <> 'pending' then
        raise exception 'Only pending invitations can be emailed';
    end if;

    if v_invitation.email_delivery_status <> 'sending'
       or v_invitation.last_email_attempted_at is null
       or v_invitation.last_email_attempted_at < now() - interval '10 minutes' then
        raise exception 'Invitation email delivery was not prepared';
    end if;

    update public.company_user_invitations
    set email_delivery_status = v_delivery_status,
        email_delivery_error = case
            when v_delivery_status = 'failed' then coalesce(v_delivery_error, 'Email delivery failed')
            else null
        end,
        last_email_sent_at = case
            when v_delivery_status = 'sent' then now()
            else public.company_user_invitations.last_email_sent_at
        end,
        email_send_count = case
            when v_delivery_status = 'sent' then public.company_user_invitations.email_send_count + 1
            else public.company_user_invitations.email_send_count
        end,
        updated_at = now()
    where id = v_invitation.id
    returning * into v_updated_invitation;

    return query
    select
        v_updated_invitation.id,
        v_updated_invitation.email_delivery_status,
        v_updated_invitation.last_email_attempted_at,
        v_updated_invitation.last_email_sent_at,
        v_updated_invitation.email_send_count,
        v_updated_invitation.email_delivery_error;
end;
$$;

revoke all on function public.record_company_user_invitation_email_delivery(uuid, text, text) from public;
revoke all on function public.record_company_user_invitation_email_delivery(uuid, text, text) from anon;
grant execute on function public.record_company_user_invitation_email_delivery(uuid, text, text) to authenticated;

revoke insert, update, delete on table public.company_user_invitations from public;
revoke insert, update, delete on table public.company_user_invitations from anon;
revoke insert, update, delete on table public.company_user_invitations from authenticated;

revoke insert, update, delete on table public.company_users from public;
revoke insert, update, delete on table public.company_users from anon;
revoke insert, update, delete on table public.company_users from authenticated;

commit;
