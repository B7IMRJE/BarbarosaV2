-- Server-side invitation generation limits for HomeOS customer and company-team invitations.

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.company_invitation_rate_events (
    id uuid primary key default extensions.gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    actor_user_id uuid not null references auth.users(id) on delete cascade,
    action text not null check (action in ('customer_invite', 'customer_login_code', 'team_invite')),
    recipient_hash text,
    outcome text not null check (outcome in ('allowed', 'blocked')),
    reason text,
    created_at timestamptz not null default now()
);

create index if not exists company_invitation_rate_events_actor_created_idx
    on public.company_invitation_rate_events (company_id, actor_user_id, action, created_at desc);

create index if not exists company_invitation_rate_events_company_created_idx
    on public.company_invitation_rate_events (company_id, action, created_at desc);

create index if not exists company_invitation_rate_events_recipient_created_idx
    on public.company_invitation_rate_events (company_id, action, recipient_hash, created_at desc)
    where recipient_hash is not null;

create table if not exists public.company_invitation_abuse_locks (
    company_id uuid not null references public.companies(id) on delete cascade,
    actor_user_id uuid not null references auth.users(id) on delete cascade,
    action text not null check (action in ('customer_invite', 'customer_login_code', 'team_invite')),
    locked_until timestamptz not null,
    reason text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (company_id, actor_user_id, action)
);

alter table public.company_invitation_rate_events enable row level security;
alter table public.company_invitation_abuse_locks enable row level security;

drop policy if exists company_invitation_rate_events_admin_read on public.company_invitation_rate_events;
create policy company_invitation_rate_events_admin_read
on public.company_invitation_rate_events
for select to authenticated
using (public.can_view_company_audit_logs(company_id));

drop policy if exists company_invitation_abuse_locks_admin_read on public.company_invitation_abuse_locks;
create policy company_invitation_abuse_locks_admin_read
on public.company_invitation_abuse_locks
for select to authenticated
using (public.can_view_company_audit_logs(company_id));

grant select on public.company_invitation_rate_events to authenticated;
grant select on public.company_invitation_abuse_locks to authenticated;

create or replace function public.check_and_record_company_invitation_rate(
    p_company_id uuid,
    p_action text,
    p_recipient_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_actor_user_id uuid := auth.uid();
    v_action text := lower(btrim(coalesce(p_action, '')));
    v_recipient_hash text;
    v_now timestamptz := clock_timestamp();
    v_lock_until timestamptz;
    v_last_allowed_at timestamptz;
    v_actor_hour_count integer := 0;
    v_actor_day_count integer := 0;
    v_company_hour_count integer := 0;
    v_company_day_count integer := 0;
    v_duplicate_count integer := 0;
    v_reason text;
    v_message text;
    v_retry_after integer := 0;
    v_should_lock boolean := false;
begin
    if v_actor_user_id is null then
        raise exception 'Not authenticated';
    end if;
    if p_company_id is null then
        raise exception 'Company id is required.';
    end if;
    if v_action not in ('customer_invite', 'customer_login_code', 'team_invite') then
        raise exception 'Unsupported invitation action.';
    end if;

    if v_action in ('customer_invite', 'customer_login_code') then
        if not public.can_create_company_customer_invites(p_company_id) then
            raise exception 'Not authorized to create customer invitations for this company.';
        end if;
    elsif not public.can_manage_company_users(p_company_id) then
        raise exception 'Not authorized to create company invitations.';
    end if;

    if nullif(lower(btrim(coalesce(p_recipient_key, ''))), '') is not null then
        v_recipient_hash := encode(
            extensions.digest(lower(btrim(p_recipient_key)) || ':' || p_company_id::text, 'sha256'),
            'hex'
        );
    end if;

    -- Serialize checks for one actor/action so two phones cannot pass together.
    perform pg_advisory_xact_lock(
        hashtextextended(p_company_id::text || ':' || v_actor_user_id::text || ':' || v_action, 0)
    );

    select abuse_lock.locked_until
    into v_lock_until
    from public.company_invitation_abuse_locks as abuse_lock
    where abuse_lock.company_id = p_company_id
      and abuse_lock.actor_user_id = v_actor_user_id
      and abuse_lock.action = v_action
      and abuse_lock.locked_until > v_now;

    select max(rate_event.created_at)
    into v_last_allowed_at
    from public.company_invitation_rate_events as rate_event
    where rate_event.company_id = p_company_id
      and rate_event.actor_user_id = v_actor_user_id
      and rate_event.action = v_action
      and rate_event.outcome = 'allowed';

    select
        count(*) filter (where rate_event.actor_user_id = v_actor_user_id and rate_event.created_at >= v_now - interval '1 hour'),
        count(*) filter (where rate_event.actor_user_id = v_actor_user_id and rate_event.created_at >= v_now - interval '24 hours'),
        count(*) filter (where rate_event.created_at >= v_now - interval '1 hour'),
        count(*) filter (where rate_event.created_at >= v_now - interval '24 hours'),
        count(*) filter (
            where v_recipient_hash is not null
              and rate_event.actor_user_id = v_actor_user_id
              and rate_event.recipient_hash = v_recipient_hash
              and rate_event.created_at >= v_now - interval '15 minutes'
        )
    into v_actor_hour_count, v_actor_day_count, v_company_hour_count, v_company_day_count, v_duplicate_count
    from public.company_invitation_rate_events as rate_event
    where rate_event.company_id = p_company_id
      and rate_event.action = v_action
      and rate_event.outcome = 'allowed'
      and rate_event.created_at >= v_now - interval '24 hours';

    if v_lock_until is not null then
        v_reason := 'temporary_lock';
        v_message := 'Invitation creation is temporarily locked after unusual activity. An owner or administrator can review the audit log.';
        v_retry_after := greatest(1, ceil(extract(epoch from (v_lock_until - v_now)))::integer);
    elsif v_last_allowed_at is not null and v_last_allowed_at > v_now - interval '5 seconds' then
        v_reason := 'cooldown';
        v_message := 'Please wait a few seconds before creating another invitation.';
        v_retry_after := greatest(1, ceil(extract(epoch from ((v_last_allowed_at + interval '5 seconds') - v_now)))::integer);
    elsif v_duplicate_count >= 3 then
        v_reason := 'duplicate_recipient';
        v_message := 'Too many invitations were requested for the same recipient. Try again later.';
        v_retry_after := 900;
        v_should_lock := true;
    elsif v_actor_hour_count >= 30 then
        v_reason := 'actor_hour_limit';
        v_message := 'This account reached its hourly invitation limit.';
        v_retry_after := 3600;
        v_should_lock := true;
    elsif v_actor_day_count >= 150 then
        v_reason := 'actor_day_limit';
        v_message := 'This account reached its daily invitation limit.';
        v_retry_after := 86400;
        v_should_lock := true;
    elsif v_company_hour_count >= 100 then
        v_reason := 'company_hour_limit';
        v_message := 'This company reached its hourly invitation limit.';
        v_retry_after := 3600;
        v_should_lock := true;
    elsif v_company_day_count >= 500 then
        v_reason := 'company_day_limit';
        v_message := 'This company reached its daily invitation limit.';
        v_retry_after := 86400;
        v_should_lock := true;
    end if;

    if v_reason is not null then
        insert into public.company_invitation_rate_events (
            company_id, actor_user_id, action, recipient_hash, outcome, reason
        ) values (
            p_company_id, v_actor_user_id, v_action, v_recipient_hash, 'blocked', v_reason
        );

        if v_should_lock then
            v_lock_until := v_now + interval '15 minutes';
            insert into public.company_invitation_abuse_locks (
                company_id, actor_user_id, action, locked_until, reason
            ) values (
                p_company_id, v_actor_user_id, v_action, v_lock_until, v_reason
            )
            on conflict (company_id, actor_user_id, action) do update set
                locked_until = greatest(public.company_invitation_abuse_locks.locked_until, excluded.locked_until),
                reason = excluded.reason,
                updated_at = now();
        end if;

        perform public.log_company_audit_event(
            p_company_id,
            'invitation_rate_blocked',
            'invitation_security',
            null,
            v_action,
            null,
            null,
            jsonb_build_object(
                'action', v_action,
                'reason', v_reason,
                'retry_after_seconds', v_retry_after,
                'recipient_hash', v_recipient_hash
            )
        );

        return jsonb_build_object(
            'allowed', false,
            'message', v_message,
            'reason', v_reason,
            'retry_after_seconds', v_retry_after,
            'actor_hour_count', v_actor_hour_count,
            'actor_day_count', v_actor_day_count,
            'company_hour_count', v_company_hour_count,
            'company_day_count', v_company_day_count
        );
    end if;

    insert into public.company_invitation_rate_events (
        company_id, actor_user_id, action, recipient_hash, outcome
    ) values (
        p_company_id, v_actor_user_id, v_action, v_recipient_hash, 'allowed'
    );

    return jsonb_build_object(
        'allowed', true,
        'actor_hour_count', v_actor_hour_count + 1,
        'actor_day_count', v_actor_day_count + 1,
        'company_hour_count', v_company_hour_count + 1,
        'company_day_count', v_company_day_count + 1
    );
end;
$$;

revoke all on function public.check_and_record_company_invitation_rate(uuid, text, text) from public, anon;
grant execute on function public.check_and_record_company_invitation_rate(uuid, text, text) to authenticated;

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
    v_rate_result jsonb;
    v_recipient_key text;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;
    if not public.can_create_company_customer_invites(p_company_id) then
        raise exception 'Not authorized to create customer invites for this company.';
    end if;
    if nullif(btrim(coalesce(p_invited_email, '')), '') is null
       and nullif(btrim(coalesce(p_invited_phone, '')), '') is null
       and nullif(btrim(coalesce(p_invited_name, '')), '') is null then
        raise exception 'Customer name, email, or phone is required.';
    end if;

    v_recipient_key := coalesce(
        nullif(lower(btrim(coalesce(p_invited_email, ''))), ''),
        nullif(regexp_replace(coalesce(p_invited_phone, ''), '[^0-9]+', '', 'g'), ''),
        nullif(lower(btrim(coalesce(p_invited_name, ''))), '')
    );
    v_rate_result := public.check_and_record_company_invitation_rate(p_company_id, 'customer_invite', v_recipient_key);
    if not coalesce((v_rate_result->>'allowed')::boolean, false) then
        raise exception '%', coalesce(v_rate_result->>'message', 'Invitation rate limit reached.');
    end if;

    insert into public.company_customer_invitations (
        company_id, invited_email, invited_phone, invited_name, note, created_by_user_id
    ) values (
        p_company_id,
        nullif(btrim(coalesce(p_invited_email, '')), ''),
        nullif(btrim(coalesce(p_invited_phone, '')), ''),
        nullif(btrim(coalesce(p_invited_name, '')), ''),
        nullif(btrim(coalesce(p_note, '')), ''),
        auth.uid()
    ) returning * into v_invitation;

    return query select
        v_invitation.id, v_invitation.company_id, v_invitation.invited_email,
        v_invitation.invited_phone, v_invitation.invited_name, v_invitation.note,
        v_invitation.status, v_invitation.invite_code, v_invitation.expires_at,
        v_invitation.created_at;
end;
$$;

revoke all on function public.create_company_customer_invite(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_company_customer_invite(uuid, text, text, text, text) to authenticated;

create or replace function public.create_company_user_invitation(
    p_company_id uuid,
    p_email text,
    p_full_name text default null,
    p_role text default 'technician'
)
returns public.company_user_invitations
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_email text := lower(btrim(coalesce(p_email, '')));
    v_role text := lower(btrim(coalesce(p_role, 'technician')));
    v_invitation public.company_user_invitations%rowtype;
    v_rate_result jsonb;
begin
    if v_user_id is null then raise exception 'Not authenticated'; end if;
    if p_company_id is null then raise exception 'company_id is required'; end if;
    if not public.can_manage_company_users(p_company_id) then raise exception 'Not authorized'; end if;
    if v_email = '' then raise exception 'Email is required'; end if;
    if v_role not in ('owner', 'admin', 'manager', 'office', 'dispatcher', 'supervisor', 'technician') then
        raise exception 'Invalid company invitation role: %', p_role;
    end if;
    if exists (
        select 1 from public.company_users company_user
        where company_user.company_id = p_company_id
          and (lower(btrim(coalesce(company_user.email, ''))) = v_email or exists (
              select 1 from public.profiles profile
              where profile.id = company_user.auth_user_id
                and lower(btrim(coalesce(profile.email, ''))) = v_email
          ))
    ) then raise exception 'A company membership already exists for this email'; end if;
    if exists (
        select 1 from public.company_user_invitations invitation
        where invitation.company_id = p_company_id
          and invitation.status = 'pending'
          and lower(btrim(invitation.email)) = v_email
    ) then raise exception 'A pending invitation already exists for this email'; end if;

    v_rate_result := public.check_and_record_company_invitation_rate(p_company_id, 'team_invite', v_email);
    if not coalesce((v_rate_result->>'allowed')::boolean, false) then
        raise exception '%', coalesce(v_rate_result->>'message', 'Invitation rate limit reached.');
    end if;

    insert into public.company_user_invitations (
        company_id, email, full_name, role, status, invited_by_user_id
    ) values (
        p_company_id, v_email, nullif(btrim(p_full_name), ''), v_role, 'pending', v_user_id
    ) returning * into v_invitation;
    return v_invitation;
end;
$$;

revoke all on function public.create_company_user_invitation(uuid, text, text, text) from public, anon;
grant execute on function public.create_company_user_invitation(uuid, text, text, text) to authenticated;

commit;
