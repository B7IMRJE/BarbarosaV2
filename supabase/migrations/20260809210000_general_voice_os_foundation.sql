begin;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.general_user_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    home_avatar text not null default 'home' check (home_avatar in ('home', 'dot', 'car', 'photo')),
    custom_avatar_url text null,
    trade text not null default 'general' check (trade in ('general', 'plumbing', 'electrical', 'hvac')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create table if not exists public.general_activation_invitations (
    id uuid primary key default extensions.gen_random_uuid(),
    target_user_id uuid not null references auth.users(id) on delete cascade,
    target_email text not null,
    intended_surface text not null check (intended_surface in ('administration', 'techos', 'homeos')),
    intended_role text not null,
    company_id uuid null references public.companies(id) on delete cascade,
    code_hash text not null,
    code_last4 text not null,
    expires_at timestamptz not null,
    claimed_at timestamptz null,
    claim_nonce uuid null,
    redeemed_at timestamptz null,
    redeemed_by_user_id uuid null references auth.users(id) on delete set null,
    revoked_at timestamptz null,
    created_by_user_id uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    constraint general_activation_company_scope_check check (
        (intended_surface = 'techos' and company_id is not null)
        or intended_surface <> 'techos'
    )
);
create index if not exists general_activation_invitations_active_idx
    on public.general_activation_invitations (expires_at desc)
    where redeemed_at is null and revoked_at is null;
create table if not exists public.general_activation_attempts (
    id bigint generated always as identity primary key,
    invitation_id uuid null references public.general_activation_invitations(id) on delete cascade,
    ip_hash text not null,
    code_hash text not null,
    outcome text not null check (outcome in ('invalid', 'expired', 'locked', 'verified', 'auth_failed')),
    succeeded boolean not null default false,
    created_at timestamptz not null default now()
);
create index if not exists general_activation_attempts_ip_idx on public.general_activation_attempts (ip_hash, created_at desc);
create index if not exists general_activation_attempts_code_idx on public.general_activation_attempts (code_hash, created_at desc);
create table if not exists public.general_action_previews (
    id uuid primary key default extensions.gen_random_uuid(),
    actor_user_id uuid not null references auth.users(id) on delete cascade,
    action_id text not null,
    risk text not null check (risk in ('read', 'low', 'consequential', 'protected')),
    summary text not null,
    company_id uuid null references public.companies(id) on delete set null,
    property_id uuid null references public.properties(id) on delete set null,
    job_id uuid null references public.jobs(id) on delete set null,
    context jsonb not null default '{}'::jsonb,
    payload jsonb not null default '{}'::jsonb,
    status text not null default 'awaiting_confirmation' check (status in ('awaiting_confirmation', 'claimed', 'executed', 'cancelled', 'expired', 'failed')),
    expires_at timestamptz not null default (now() + interval '10 minutes'),
    claimed_at timestamptz null,
    executed_at timestamptz null,
    result jsonb null,
    error_code text null,
    created_at timestamptz not null default now()
);
create index if not exists general_action_previews_actor_idx on public.general_action_previews (actor_user_id, created_at desc);
create index if not exists general_action_previews_company_idx on public.general_action_previews (company_id, created_at desc) where company_id is not null;
create table if not exists public.general_recording_sessions (
    id uuid primary key default extensions.gen_random_uuid(),
    actor_user_id uuid not null references auth.users(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    job_id uuid not null references public.jobs(id) on delete cascade,
    schedule_slot_id uuid null,
    state text not null check (state in ('recording', 'paused', 'stopped', 'declined')),
    consent_notice text not null,
    consent_confirmed_at timestamptz null,
    started_at timestamptz null,
    paused_at timestamptz null,
    stopped_at timestamptz null,
    stopped_reason text null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create table if not exists public.general_recording_events (
    id bigint generated always as identity primary key,
    session_id uuid not null references public.general_recording_sessions(id) on delete cascade,
    actor_user_id uuid not null references auth.users(id) on delete cascade,
    event_type text not null check (event_type in ('notice', 'consent_confirmed', 'started', 'paused', 'resumed', 'stopped', 'declined', 'error')),
    detail text null,
    created_at timestamptz not null default now()
);
create table if not exists public.company_inventory_locations (
    id uuid primary key default extensions.gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    parent_location_id uuid null references public.company_inventory_locations(id) on delete set null,
    location_type text not null check (location_type in ('van', 'toolbox', 'warehouse', 'shelf', 'bin', 'job_site', 'other')),
    label text not null,
    assigned_company_user_id uuid null references public.company_users(id) on delete set null,
    active boolean not null default true,
    created_by_user_id uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (company_id, id)
);
create table if not exists public.company_inventory_items (
    id uuid primary key default extensions.gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    kind text not null check (kind in ('consumable', 'tool', 'equipment')),
    name text not null,
    description text null,
    sku text null,
    quantity numeric null check (quantity is null or quantity >= 0),
    unit text null,
    reorder_point numeric null check (reorder_point is null or reorder_point >= 0),
    storage_location_id uuid null references public.company_inventory_locations(id) on delete set null,
    purchased_at timestamptz null,
    vendor text null,
    purchase_amount_cents bigint null check (purchase_amount_cents is null or purchase_amount_cents >= 0),
    purchase_reference text null,
    archived boolean not null default false,
    created_by_user_id uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (company_id, id)
);
create index if not exists company_inventory_items_lookup_idx on public.company_inventory_items (company_id, lower(name)) where archived = false;
create index if not exists company_inventory_items_location_idx on public.company_inventory_items (company_id, storage_location_id) where archived = false;
create table if not exists public.company_inventory_media (
    id uuid primary key default extensions.gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    inventory_item_id uuid null references public.company_inventory_items(id) on delete cascade,
    media_kind text not null check (media_kind in ('photo', 'video', 'receipt', 'document', 'other')),
    file_name text not null,
    file_url text null,
    storage_path text null,
    mime_type text null,
    size_bytes bigint null check (size_bytes is null or size_bytes > 0),
    duration_seconds integer null check (duration_seconds is null or duration_seconds between 0 and 60),
    created_by_user_id uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    constraint company_inventory_media_reference_check check (inventory_item_id is not null)
);
create table if not exists public.company_inventory_adjustments (
    id uuid primary key default extensions.gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    inventory_item_id uuid not null references public.company_inventory_items(id) on delete cascade,
    action_preview_id uuid not null references public.general_action_previews(id) on delete restrict,
    previous_quantity numeric null,
    next_quantity numeric null,
    reason text not null,
    actor_user_id uuid not null references auth.users(id) on delete restrict,
    created_at timestamptz not null default now()
);
alter table public.general_user_preferences enable row level security;
alter table public.general_activation_invitations enable row level security;
alter table public.general_activation_attempts enable row level security;
alter table public.general_action_previews enable row level security;
alter table public.general_recording_sessions enable row level security;
alter table public.general_recording_events enable row level security;
alter table public.company_inventory_locations enable row level security;
alter table public.company_inventory_items enable row level security;
alter table public.company_inventory_media enable row level security;
alter table public.company_inventory_adjustments enable row level security;
revoke all on table public.general_activation_invitations from public, anon, authenticated;
revoke all on table public.general_activation_attempts from public, anon, authenticated;
revoke insert, update, delete on table public.general_action_previews from public, anon, authenticated;
revoke insert, update, delete on table public.general_recording_sessions from public, anon, authenticated;
revoke insert, update, delete on table public.general_recording_events from public, anon, authenticated;
revoke insert, update, delete on table public.company_inventory_locations from public, anon, authenticated;
revoke insert, update, delete on table public.company_inventory_items from public, anon, authenticated;
revoke insert, update, delete on table public.company_inventory_media from public, anon, authenticated;
revoke insert, update, delete on table public.company_inventory_adjustments from public, anon, authenticated;
grant select, insert, update on table public.general_activation_invitations to service_role;
grant select, insert on table public.general_activation_attempts to service_role;
grant usage, select on sequence public.general_activation_attempts_id_seq to service_role;
grant select, update on table public.general_action_previews to service_role;
grant select on table public.general_action_previews to authenticated;
grant select, insert, update on table public.general_user_preferences to authenticated;
grant select on table public.general_recording_sessions, public.general_recording_events to authenticated;
grant select on table public.company_inventory_locations, public.company_inventory_items, public.company_inventory_media, public.company_inventory_adjustments to authenticated;
drop policy if exists general_preferences_own_read on public.general_user_preferences;
create policy general_preferences_own_read on public.general_user_preferences for select to authenticated using (user_id = auth.uid());
drop policy if exists general_preferences_own_insert on public.general_user_preferences;
create policy general_preferences_own_insert on public.general_user_preferences for insert to authenticated with check (user_id = auth.uid());
drop policy if exists general_preferences_own_update on public.general_user_preferences;
create policy general_preferences_own_update on public.general_user_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists general_action_own_read on public.general_action_previews;
create policy general_action_own_read on public.general_action_previews for select to authenticated using (actor_user_id = auth.uid() or public.homeos_is_platform_admin());
create or replace function public.general_can_access_company(p_company_id uuid)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null and p_company_id is not null and (
        public.homeos_is_platform_admin()
        or exists (
            select 1 from public.company_users as cu
            where cu.auth_user_id = auth.uid()
              and cu.company_id = p_company_id
              and lower(coalesce(cu.status, '')) in ('active', 'accepted', 'approved')
        )
    );
$$;
revoke all on function public.general_can_access_company(uuid) from public, anon;
grant execute on function public.general_can_access_company(uuid) to authenticated;
drop policy if exists general_recording_company_read on public.general_recording_sessions;
create policy general_recording_company_read on public.general_recording_sessions for select to authenticated using (actor_user_id = auth.uid() or public.general_can_access_company(company_id));
drop policy if exists general_recording_events_read on public.general_recording_events;
create policy general_recording_events_read on public.general_recording_events for select to authenticated using (exists (select 1 from public.general_recording_sessions s where s.id = session_id and (s.actor_user_id = auth.uid() or public.general_can_access_company(s.company_id))));
drop policy if exists company_inventory_locations_read on public.company_inventory_locations;
create policy company_inventory_locations_read on public.company_inventory_locations for select to authenticated using (public.general_can_access_company(company_id));
drop policy if exists company_inventory_items_read on public.company_inventory_items;
create policy company_inventory_items_read on public.company_inventory_items for select to authenticated using (public.general_can_access_company(company_id));
drop policy if exists company_inventory_media_read on public.company_inventory_media;
create policy company_inventory_media_read on public.company_inventory_media for select to authenticated using (public.general_can_access_company(company_id));
drop policy if exists company_inventory_adjustments_read on public.company_inventory_adjustments;
create policy company_inventory_adjustments_read on public.company_inventory_adjustments for select to authenticated using (public.general_can_access_company(company_id));
create or replace function public.general_list_authorized_companies()
returns table (
    id uuid, name text, public_name text, dba_name text, status text, logo_url text,
    service_categories text[], license_number text, short_description text
)
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select c.id, c.name, c.public_name, c.dba_name, c.status, c.logo_url,
           c.service_categories, c.license_number, c.short_description
      from public.companies c
     where auth.uid() is not null
       and (
           public.homeos_is_platform_admin()
           or exists (
               select 1 from public.company_users cu
                where cu.company_id = c.id
                  and cu.auth_user_id = auth.uid()
                  and lower(coalesce(cu.status, '')) in ('active', 'accepted', 'approved')
           )
       )
     order by coalesce(c.public_name, c.dba_name, c.name), c.id;
$$;
revoke all on function public.general_list_authorized_companies() from public, anon;
grant execute on function public.general_list_authorized_companies() to authenticated;
create or replace function public.general_create_activation_invitation(
    p_target_email text,
    p_intended_surface text,
    p_intended_role text,
    p_code text,
    p_company_id uuid default null,
    p_expires_at timestamptz default (now() + interval '30 minutes')
)
returns table (invitation_id uuid, target_user_id uuid, target_email text, expires_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, auth, extensions, pg_temp
as $$
declare
    v_actor uuid := auth.uid();
    v_target auth.users%rowtype;
    v_profile jsonb;
    v_invitation public.general_activation_invitations%rowtype;
    v_surface text := lower(btrim(coalesce(p_intended_surface, '')));
    v_role text := upper(btrim(coalesce(p_intended_role, '')));
    v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
begin
    if v_actor is null or not public.homeos_is_platform_admin() then raise exception 'Platform Administration access is required.'; end if;
    if v_surface not in ('administration', 'techos', 'homeos') then raise exception 'Unsupported General surface.'; end if;
    if v_surface='administration' and v_role not in ('SUPER_ADMIN','ADMINISTRATION','MANAGEMENT') then raise exception 'Administration invitations must name an established Administration role.'; end if;
    if v_surface='techos' and v_role not in ('TECHNICIAN','TECH','MANAGER','ADMIN','OWNER','DISPATCHER','DISPATCH') then raise exception 'Unsupported TechOS or management role.'; end if;
    if v_code !~ '^\d{6}$' then raise exception 'Activation code must contain six digits.'; end if;
    if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then raise exception 'Activation expiry must be within the next 24 hours.'; end if;

    select * into v_target from auth.users where lower(email) = lower(btrim(p_target_email)) limit 1;
    if not found then raise exception 'The intended account must already exist in the established authentication channel.'; end if;
    select to_jsonb(profile) into v_profile from public.profiles profile where profile.id = v_target.id;

    if v_surface = 'administration' and not (
        upper(coalesce(v_profile->>'role', '')) = 'SUPER_ADMIN'
        or lower(coalesce(v_profile->>'is_platform_admin', 'false')) in ('true','1','yes')
    ) then raise exception 'The intended account is not already authorized for platform Administration.'; end if;

    if v_surface = 'techos' and not exists (
        select 1 from public.company_users cu where cu.auth_user_id = v_target.id and cu.company_id = p_company_id
          and lower(coalesce(cu.status, '')) in ('active', 'accepted', 'approved')
    ) then raise exception 'The intended account does not have active access to this company.'; end if;

    update public.general_activation_invitations
       set revoked_at = now()
     where target_user_id = v_target.id and redeemed_at is null and revoked_at is null;

    insert into public.general_activation_invitations (
        target_user_id, target_email, intended_surface, intended_role, company_id,
        code_hash, code_last4, expires_at, created_by_user_id
    ) values (
        v_target.id, lower(v_target.email), v_surface, v_role, p_company_id,
        extensions.crypt(v_code, extensions.gen_salt('bf', 12)), right(v_code, 4), p_expires_at, v_actor
    ) returning * into v_invitation;

    return query select v_invitation.id, v_invitation.target_user_id, v_invitation.target_email, v_invitation.expires_at;
end;
$$;
revoke all on function public.general_create_activation_invitation(text, text, text, text, uuid, timestamptz) from public, anon;
grant execute on function public.general_create_activation_invitation(text, text, text, text, uuid, timestamptz) to authenticated;
create or replace function public.general_resolve_activation_invitation(p_code text)
returns table (invitation_id uuid, target_user_id uuid, target_email text, intended_surface text, intended_role text, company_id uuid, expires_at timestamptz)
language sql security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
    select i.id, i.target_user_id, i.target_email, i.intended_surface, i.intended_role, i.company_id, i.expires_at
      from public.general_activation_invitations i
     where i.redeemed_at is null and i.revoked_at is null and i.expires_at > now()
       and extensions.crypt(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), i.code_hash) = i.code_hash
     order by i.created_at desc
     limit 1;
$$;
revoke all on function public.general_resolve_activation_invitation(text) from public, anon, authenticated;
grant execute on function public.general_resolve_activation_invitation(text) to service_role;
create or replace function public.general_claim_activation_invitation(p_code text)
returns table (invitation_id uuid, target_user_id uuid, target_email text, intended_surface text, intended_role text, company_id uuid, expires_at timestamptz, claim_nonce uuid)
language plpgsql security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare v_row public.general_activation_invitations%rowtype; v_nonce uuid := extensions.gen_random_uuid();
begin
    select * into v_row
      from public.general_activation_invitations i
     where i.redeemed_at is null and i.revoked_at is null and i.expires_at > now()
       and (i.claimed_at is null or i.claimed_at < now() - interval '2 minutes')
       and extensions.crypt(regexp_replace(coalesce(p_code, ''), '\D', '', 'g'), i.code_hash) = i.code_hash
     order by i.created_at desc
     limit 1
     for update skip locked;
    if not found then return; end if;
    update public.general_activation_invitations set claimed_at=now(), claim_nonce=v_nonce where id=v_row.id;
    return query select v_row.id, v_row.target_user_id, v_row.target_email, v_row.intended_surface, v_row.intended_role, v_row.company_id, v_row.expires_at, v_nonce;
end;
$$;
revoke all on function public.general_claim_activation_invitation(text) from public, anon, authenticated;
grant execute on function public.general_claim_activation_invitation(text) to service_role;
create or replace function public.general_mark_activation_redeemed(p_invitation_id uuid, p_user_id uuid, p_claim_nonce uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    update public.general_activation_invitations
       set redeemed_at = now(), redeemed_by_user_id = p_user_id
     where id = p_invitation_id and target_user_id = p_user_id and claim_nonce=p_claim_nonce and redeemed_at is null and revoked_at is null and expires_at > now();
    return found;
end;
$$;
revoke all on function public.general_mark_activation_redeemed(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.general_mark_activation_redeemed(uuid, uuid, uuid) to service_role;
create or replace function public.general_release_activation_claim(p_invitation_id uuid, p_claim_nonce uuid)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    update public.general_activation_invitations set claimed_at=null, claim_nonce=null
     where id=p_invitation_id and claim_nonce=p_claim_nonce and redeemed_at is null and revoked_at is null;
    return found;
end;
$$;
revoke all on function public.general_release_activation_claim(uuid,uuid) from public, anon, authenticated;
grant execute on function public.general_release_activation_claim(uuid,uuid) to service_role;
create or replace function public.general_prepare_action(
    p_action_id text, p_summary text, p_company_id uuid default null, p_property_id uuid default null,
    p_job_id uuid default null, p_context jsonb default '{}'::jsonb, p_payload jsonb default '{}'::jsonb
)
returns table (id uuid, summary text, context jsonb, payload jsonb, expires_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_actor uuid := auth.uid();
    v_action text := lower(btrim(coalesce(p_action_id, '')));
    v_risk text;
    v_row public.general_action_previews%rowtype;
begin
    if v_actor is null then raise exception 'Not authenticated.'; end if;
    v_risk := case
        when v_action = 'admin.protected_change' then 'protected'
        when v_action in ('tech.create_quote_draft','tech.clock_in','tech.clock_out','tech.update_job_status','tech.inventory_store','common.recording_start','common.recording_resume','home.emergency_create','home.quote_approve') then 'consequential'
        when v_action in ('common.recording_pause','common.recording_stop') then 'low'
        else null end;
    if v_risk is null then raise exception 'Action is not available in the controlled confirmation registry.'; end if;
    if v_action like 'admin.%' and not public.homeos_is_platform_admin() then raise exception 'Administration permission is required.'; end if;
    if (v_action like 'tech.%' or v_action like 'common.recording%') and not public.general_can_access_company(p_company_id) then raise exception 'Active company access is required.'; end if;
    if v_action like 'home.%' and (p_property_id is null or not public.homeos_can_read_property_record(p_property_id)) then raise exception 'Home access is required.'; end if;

    insert into public.general_action_previews (actor_user_id, action_id, risk, summary, company_id, property_id, job_id, context, payload)
    values (v_actor, v_action, v_risk, left(btrim(coalesce(p_summary, 'Review action')), 500), p_company_id, p_property_id, p_job_id, coalesce(p_context, '{}'::jsonb), coalesce(p_payload, '{}'::jsonb))
    returning * into v_row;
    return query select v_row.id, v_row.summary, v_row.context, v_row.payload, v_row.expires_at;
end;
$$;
revoke all on function public.general_prepare_action(text, text, uuid, uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.general_prepare_action(text, text, uuid, uuid, uuid, jsonb, jsonb) to authenticated;
create or replace function public.general_claim_confirmed_action(p_preview_id uuid)
returns setof public.general_action_previews
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_actor uuid := auth.uid(); v_row public.general_action_previews%rowtype;
begin
    if v_actor is null then raise exception 'Not authenticated.'; end if;
    select * into v_row from public.general_action_previews where id = p_preview_id for update;
    if not found or v_row.actor_user_id <> v_actor then raise exception 'Action preview not found.'; end if;
    if v_row.status <> 'awaiting_confirmation' then raise exception 'Action preview is no longer awaiting confirmation.'; end if;
    if v_row.expires_at <= now() then update public.general_action_previews set status = 'expired' where id = p_preview_id; raise exception 'Action preview expired.'; end if;
    update public.general_action_previews set status = 'claimed', claimed_at = now() where id = p_preview_id returning * into v_row;
    return next v_row;
end;
$$;
revoke all on function public.general_claim_confirmed_action(uuid) from public, anon;
grant execute on function public.general_claim_confirmed_action(uuid) to authenticated;
create or replace function public.general_complete_action(p_preview_id uuid, p_actor_user_id uuid, p_succeeded boolean, p_result jsonb default '{}'::jsonb, p_error_code text default null)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    update public.general_action_previews
       set status = case when p_succeeded then 'executed' else 'failed' end,
           executed_at = now(), result = coalesce(p_result, '{}'::jsonb), error_code = nullif(btrim(coalesce(p_error_code, '')), '')
     where id = p_preview_id and actor_user_id = p_actor_user_id and status = 'claimed';
    return found;
end;
$$;
revoke all on function public.general_complete_action(uuid, uuid, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.general_complete_action(uuid, uuid, boolean, jsonb, text) to service_role;
create or replace function public.general_list_my_action_audit(p_limit integer default 25)
returns table (id uuid, action_id text, status text, summary text, created_at timestamptz)
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select a.id, a.action_id, a.status, a.summary, a.created_at
      from public.general_action_previews a
     where a.actor_user_id = auth.uid()
     order by a.created_at desc
     limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;
revoke all on function public.general_list_my_action_audit(integer) from public, anon;
grant execute on function public.general_list_my_action_audit(integer) to authenticated;
create or replace function public.general_inventory_store_item(
    p_preview_id uuid, p_kind text, p_name text, p_description text default null,
    p_quantity numeric default null, p_unit text default null, p_location_type text default 'other',
    p_location_label text default null, p_purchased_at timestamptz default null,
    p_vendor text default null, p_purchase_amount_cents bigint default null
)
returns public.company_inventory_items
language plpgsql security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare v_actor uuid := auth.uid(); v_preview public.general_action_previews%rowtype; v_location uuid; v_item public.company_inventory_items%rowtype;
begin
    select * into v_preview from public.general_action_previews where id = p_preview_id and actor_user_id = v_actor and status = 'claimed' and action_id = 'tech.inventory_store' for update;
    if not found then raise exception 'A claimed inventory confirmation is required.'; end if;
    if not public.general_can_access_company(v_preview.company_id) then raise exception 'Company access is required.'; end if;
    if lower(btrim(p_kind)) not in ('consumable','tool','equipment') then raise exception 'Unsupported inventory kind.'; end if;
    if nullif(btrim(p_name), '') is null then raise exception 'Item name is required.'; end if;
    if nullif(btrim(coalesce(p_location_label, '')), '') is not null then
        select id into v_location from public.company_inventory_locations where company_id = v_preview.company_id and lower(label) = lower(btrim(p_location_label)) and active limit 1;
        if v_location is null then
            insert into public.company_inventory_locations(company_id, location_type, label, created_by_user_id)
            values(v_preview.company_id, lower(btrim(p_location_type)), btrim(p_location_label), v_actor) returning id into v_location;
        end if;
    end if;
    insert into public.company_inventory_items(company_id, kind, name, description, quantity, unit, storage_location_id, purchased_at, vendor, purchase_amount_cents, created_by_user_id)
    values(v_preview.company_id, lower(btrim(p_kind)), btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_quantity, nullif(btrim(coalesce(p_unit, '')), ''), v_location, p_purchased_at, nullif(btrim(coalesce(p_vendor, '')), ''), p_purchase_amount_cents, v_actor)
    returning * into v_item;
    return v_item;
end;
$$;
revoke all on function public.general_inventory_store_item(uuid, text, text, text, numeric, text, text, text, timestamptz, text, bigint) from public, anon;
grant execute on function public.general_inventory_store_item(uuid, text, text, text, numeric, text, text, text, timestamptz, text, bigint) to authenticated;
create or replace function public.general_recording_transition(
    p_preview_id uuid, p_session_id uuid, p_company_id uuid, p_job_id uuid, p_schedule_slot_id uuid,
    p_transition text, p_detail text default null
)
returns public.general_recording_sessions
language plpgsql security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare v_actor uuid := auth.uid(); v_transition text := lower(btrim(coalesce(p_transition, ''))); v_session public.general_recording_sessions%rowtype;
begin
    if v_actor is null or not public.general_can_access_company(p_company_id) then raise exception 'Active company access is required.'; end if;
    if v_transition in ('start','resume') and not exists (
        select 1
          from public.job_schedule_slots slot
          join public.company_users technician
            on technician.id=slot.technician_company_user_id
           and technician.company_id=slot.company_id
         where slot.id=p_schedule_slot_id
           and slot.company_id=p_company_id
           and slot.job_id=p_job_id
           and technician.auth_user_id=v_actor
           and lower(btrim(coalesce(technician.status,'')))='active'
           and lower(btrim(coalesce(technician.role,''))) in ('technician','tech','field_tech','field-tech','field technician')
    ) then raise exception 'Recording is available only for the technician actively assigned to this saved job visit.'; end if;
    if v_transition in ('start','resume') and not exists (
        select 1 from public.general_action_previews p where p.id = p_preview_id and p.actor_user_id = v_actor and p.status = 'claimed'
          and p.action_id = case when v_transition = 'start' then 'common.recording_start' else 'common.recording_resume' end
    ) then raise exception 'A claimed recording confirmation is required.'; end if;
    if v_transition = 'start' then
        insert into public.general_recording_sessions(actor_user_id, company_id, job_id, schedule_slot_id, state, consent_notice, consent_confirmed_at, started_at)
        values(v_actor, p_company_id, p_job_id, p_schedule_slot_id, 'recording', 'This work conversation is being recorded for the job record. You can ask me to stop at any time.', now(), now()) returning * into v_session;
        insert into public.general_recording_events(session_id, actor_user_id, event_type, detail) values(v_session.id, v_actor, 'notice', v_session.consent_notice), (v_session.id, v_actor, 'consent_confirmed', 'Consent confirmed before recording.'), (v_session.id, v_actor, 'started', null);
    else
        select * into v_session from public.general_recording_sessions where id = p_session_id and actor_user_id = v_actor for update;
        if not found then raise exception 'Recording session not found.'; end if;
        if v_session.company_id<>p_company_id or v_session.job_id<>p_job_id or v_session.schedule_slot_id is distinct from p_schedule_slot_id then
            raise exception 'Recording session context does not match the active job visit.';
        end if;
        if v_transition = 'pause' then update public.general_recording_sessions set state='paused', paused_at=now(), updated_at=now() where id=v_session.id returning * into v_session;
        elsif v_transition = 'resume' then update public.general_recording_sessions set state='recording', paused_at=null, updated_at=now() where id=v_session.id returning * into v_session;
        elsif v_transition in ('stop','decline') then update public.general_recording_sessions set state=case when v_transition='decline' then 'declined' else 'stopped' end, stopped_at=now(), stopped_reason=left(coalesce(p_detail, v_transition), 500), updated_at=now() where id=v_session.id returning * into v_session;
        else raise exception 'Unsupported recording transition.'; end if;
        insert into public.general_recording_events(session_id, actor_user_id, event_type, detail) values(v_session.id, v_actor, case when v_transition='decline' then 'declined' else v_transition end, left(p_detail,500));
    end if;
    return v_session;
end;
$$;
revoke all on function public.general_recording_transition(uuid, uuid, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.general_recording_transition(uuid, uuid, uuid, uuid, uuid, text, text) to authenticated;
comment on table public.general_activation_invitations is 'Server-only, hashed, expiring, one-time General activation invitations bound to pre-authorized auth users.';
comment on table public.general_action_previews is 'Confirmation and audit boundary for General controlled actions. No arbitrary actions are accepted.';
comment on table public.general_recording_sessions is 'Consent and state metadata only. General never creates an always-on recording session.';
comment on table public.company_inventory_adjustments is 'Every quantity change must reference a confirmed General action preview.';
commit;
