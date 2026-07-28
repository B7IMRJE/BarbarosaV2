begin;

create table if not exists public.communication_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    job_updates boolean not null default true,
    company_announcements boolean not null default true,
    homeos_product_news boolean not null default false,
    promotions boolean not null default false,
    push_enabled boolean not null default false,
    email_opt_in boolean not null default false,
    sms_opt_in boolean not null default false,
    updated_at timestamptz not null default now()
);

create table if not exists public.communication_push_devices (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    expo_push_token text not null unique,
    platform text not null check (platform in ('ios', 'android')),
    device_label text,
    active boolean not null default true,
    last_seen_at timestamptz not null default now(),
    revoked_at timestamptz
);

create table if not exists public.platform_announcements (
    id uuid primary key default gen_random_uuid(),
    sender_scope text not null default 'platform' check (sender_scope in ('platform', 'company')),
    company_id uuid references public.companies(id) on delete cascade,
    title text not null check (length(btrim(title)) between 1 and 100),
    body text not null check (length(btrim(body)) between 1 and 1000),
    category text not null check (category in ('account_security', 'job_update', 'company_announcement', 'product_news', 'promotion')),
    destination_route text,
    audience_type text not null check (audience_type in ('individual', 'selected', 'company', 'platform')),
    status text not null default 'sent' check (status in ('draft', 'scheduled', 'sent', 'cancelled')),
    scheduled_at timestamptz,
    sent_at timestamptz,
    created_by uuid not null references auth.users(id),
    created_at timestamptz not null default now()
);

create table if not exists public.platform_announcement_recipients (
    announcement_id uuid not null references public.platform_announcements(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    in_app_status text not null default 'delivered' check (in_app_status in ('delivered', 'read', 'opted_out')),
    push_status text not null default 'not_requested' check (push_status in ('not_requested', 'queued', 'delivered', 'failed', 'opted_out', 'unavailable')),
    email_status text not null default 'not_configured',
    sms_status text not null default 'not_configured',
    delivered_at timestamptz,
    read_at timestamptz,
    created_at timestamptz not null default now(),
    primary key (announcement_id, user_id)
);

alter table public.communication_preferences enable row level security;
alter table public.communication_push_devices enable row level security;
alter table public.platform_announcements enable row level security;
alter table public.platform_announcement_recipients enable row level security;

drop policy if exists communication_preferences_own on public.communication_preferences;
create policy communication_preferences_own on public.communication_preferences
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists communication_push_devices_own on public.communication_push_devices;
create policy communication_push_devices_own on public.communication_push_devices
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists platform_announcements_recipient_read on public.platform_announcements;
create policy platform_announcements_recipient_read on public.platform_announcements
for select to authenticated using (
    public.homeos_is_platform_admin()
    or exists (
        select 1 from public.platform_announcement_recipients recipient
        where recipient.announcement_id = platform_announcements.id
          and recipient.user_id = auth.uid()
    )
);

drop policy if exists platform_announcement_recipients_own_read on public.platform_announcement_recipients;
create policy platform_announcement_recipients_own_read on public.platform_announcement_recipients
for select to authenticated using (user_id = auth.uid() or public.homeos_is_platform_admin());

create or replace function public.get_platform_communication_directory()
returns table (
    user_id uuid,
    display_name text,
    masked_email text,
    masked_phone text,
    city text,
    state text,
    account_status text,
    relationship_status text,
    connected_companies jsonb,
    preferences jsonb,
    last_announcement_at timestamptz,
    last_delivery_status text,
    unread_count bigint
)
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    with homes as (
        select
            membership.user_id,
            max(property.city) as city,
            max(property.state) as state,
            bool_or(lower(coalesce(membership.status, 'active')) = 'active') as has_active_home,
            jsonb_agg(distinct jsonb_build_object(
                'id', company.id,
                'name', coalesce(company.public_name, company.dba_name, company.name),
                'status', company_client.status
            )) filter (where company.id is not null) as companies
        from public.property_memberships membership
        join public.properties property on property.id = membership.property_id
        left join public.company_property_clients company_client
          on company_client.property_id = property.id
         and lower(coalesce(company_client.status, '')) = 'active'
        left join public.companies company on company.id = company_client.company_id
        group by membership.user_id
    ),
    deliveries as (
        select
            recipient.user_id,
            max(announcement.sent_at) as last_at,
            (array_agg(recipient.in_app_status order by announcement.sent_at desc nulls last))[1] as last_status,
            count(*) filter (where recipient.read_at is null and recipient.in_app_status = 'delivered') as unread
        from public.platform_announcement_recipients recipient
        join public.platform_announcements announcement on announcement.id = recipient.announcement_id
        group by recipient.user_id
    )
    select
        profile.id,
        coalesce(nullif(btrim(profile.full_name), ''), 'HomeOS customer'),
        case
            when position('@' in coalesce(auth_user.email, '')) > 1
                then left(auth_user.email, 1) || '•••@' || split_part(auth_user.email, '@', 2)
            else null
        end,
        case
            when length(regexp_replace(coalesce(auth_user.phone, ''), '\D', '', 'g')) >= 4
                then '(***) ***-' || right(regexp_replace(auth_user.phone, '\D', '', 'g'), 4)
            else null
        end,
        homes.city,
        homes.state,
        case
            when auth_user.deleted_at is not null then 'deletion_requested'
            when auth_user.email_confirmed_at is null then 'invited'
            when coalesce(homes.has_active_home, false) then 'active'
            else 'disconnected'
        end,
        case when coalesce(homes.has_active_home, false) then 'connected' else 'not_connected' end,
        coalesce(homes.companies, '[]'::jsonb),
        jsonb_build_object(
            'push_enabled', coalesce(preference.push_enabled, false),
            'company_announcements', coalesce(preference.company_announcements, true),
            'product_news', coalesce(preference.homeos_product_news, false),
            'promotions', coalesce(preference.promotions, false),
            'email_opt_in', coalesce(preference.email_opt_in, false),
            'sms_opt_in', coalesce(preference.sms_opt_in, false)
        ),
        deliveries.last_at,
        deliveries.last_status,
        coalesce(deliveries.unread, 0)
    from public.profiles profile
    join auth.users auth_user on auth_user.id = profile.id
    left join homes on homes.user_id = profile.id
    left join public.communication_preferences preference on preference.user_id = profile.id
    left join deliveries on deliveries.user_id = profile.id
    where public.homeos_is_platform_admin()
      and homes.user_id is not null
    order by lower(coalesce(profile.full_name, auth_user.email, profile.id::text));
$$;

create or replace function public.create_platform_announcement(
    p_title text,
    p_body text,
    p_category text,
    p_audience_type text,
    p_user_ids uuid[] default null,
    p_company_id uuid default null,
    p_destination_route text default '/notifications',
    p_request_push boolean default true
)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_id uuid;
begin
    if not public.homeos_is_platform_admin() then raise exception 'Platform administrator access required.'; end if;
    if p_category not in ('account_security','job_update','company_announcement','product_news','promotion') then raise exception 'Unsupported category.'; end if;
    if p_audience_type not in ('individual','selected','company','platform') then raise exception 'Unsupported audience.'; end if;

    insert into public.platform_announcements (
        title, body, category, destination_route, audience_type, company_id, created_by, sent_at
    ) values (
        btrim(p_title), btrim(p_body), p_category, nullif(btrim(p_destination_route), ''),
        p_audience_type, p_company_id, auth.uid(), now()
    ) returning id into v_id;

    insert into public.platform_announcement_recipients (
        announcement_id, user_id, in_app_status, push_status, delivered_at
    )
    select distinct
        v_id,
        membership.user_id,
        case
            when p_category = 'account_security' then 'delivered'
            when p_category = 'job_update' and coalesce(preference.job_updates, true) then 'delivered'
            when p_category = 'company_announcement' and coalesce(preference.company_announcements, true) then 'delivered'
            when p_category = 'product_news' and coalesce(preference.homeos_product_news, false) then 'delivered'
            when p_category = 'promotion' and coalesce(preference.promotions, false) then 'delivered'
            else 'opted_out'
        end,
        case
            when not p_request_push or not coalesce(preference.push_enabled, false) then 'not_requested'
            when p_category = 'product_news' and not coalesce(preference.homeos_product_news, false) then 'opted_out'
            when p_category = 'promotion' and not coalesce(preference.promotions, false) then 'opted_out'
            when exists (select 1 from public.communication_push_devices device where device.user_id = membership.user_id and device.active) then 'queued'
            else 'unavailable'
        end,
        now()
    from public.property_memberships membership
    left join public.communication_preferences preference on preference.user_id = membership.user_id
    where lower(coalesce(membership.status, 'active')) = 'active'
      and (
        p_audience_type = 'platform'
        or (p_audience_type in ('individual', 'selected') and membership.user_id = any(coalesce(p_user_ids, array[]::uuid[])))
        or (
            p_audience_type = 'company'
            and exists (
                select 1 from public.company_property_clients company_client
                where company_client.property_id = membership.property_id
                  and company_client.company_id = p_company_id
                  and lower(coalesce(company_client.status, '')) = 'active'
            )
        )
      );

    if not exists (select 1 from public.platform_announcement_recipients where announcement_id = v_id) then
        delete from public.platform_announcements where id = v_id;
        raise exception 'No eligible recipients matched this audience.';
    end if;
    return v_id;
end;
$$;

create or replace function public.get_my_platform_announcements()
returns table (
    id uuid, title text, body text, category text, destination_route text,
    sender_name text, sent_at timestamptz, read_at timestamptz
)
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select announcement.id, announcement.title, announcement.body, announcement.category,
           announcement.destination_route,
           case when announcement.sender_scope = 'company'
                then coalesce(company.public_name, company.dba_name, company.name, 'Connected company')
                else 'HomeOS' end,
           announcement.sent_at, recipient.read_at
    from public.platform_announcement_recipients recipient
    join public.platform_announcements announcement on announcement.id = recipient.announcement_id
    left join public.companies company on company.id = announcement.company_id
    where recipient.user_id = auth.uid() and recipient.in_app_status <> 'opted_out'
    order by announcement.sent_at desc;
$$;

create or replace function public.mark_platform_announcement_read(p_announcement_id uuid)
returns void language sql security definer
set search_path = pg_catalog, public, pg_temp
as $$
    update public.platform_announcement_recipients
    set read_at = coalesce(read_at, now()), in_app_status = 'read'
    where announcement_id = p_announcement_id and user_id = auth.uid();
$$;

create or replace function public.get_my_communication_preferences()
returns public.communication_preferences
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_result public.communication_preferences;
begin
    insert into public.communication_preferences(user_id) values (auth.uid())
    on conflict (user_id) do nothing;
    select * into v_result from public.communication_preferences where user_id = auth.uid();
    return v_result;
end;
$$;

create or replace function public.update_my_communication_preferences(
    p_job_updates boolean, p_company_announcements boolean, p_product_news boolean,
    p_promotions boolean, p_push_enabled boolean, p_email_opt_in boolean, p_sms_opt_in boolean
)
returns void language sql security definer
set search_path = pg_catalog, public, pg_temp
as $$
    insert into public.communication_preferences (
        user_id, job_updates, company_announcements, homeos_product_news, promotions,
        push_enabled, email_opt_in, sms_opt_in, updated_at
    ) values (
        auth.uid(), p_job_updates, p_company_announcements, p_product_news, p_promotions,
        p_push_enabled, p_email_opt_in, p_sms_opt_in, now()
    )
    on conflict (user_id) do update set
        job_updates = excluded.job_updates,
        company_announcements = excluded.company_announcements,
        homeos_product_news = excluded.homeos_product_news,
        promotions = excluded.promotions,
        push_enabled = excluded.push_enabled,
        email_opt_in = excluded.email_opt_in,
        sms_opt_in = excluded.sms_opt_in,
        updated_at = now();
$$;

create or replace function public.register_communication_push_device(
    p_expo_push_token text, p_platform text, p_device_label text default null
)
returns uuid language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare v_id uuid;
begin
    if p_platform not in ('ios','android') then raise exception 'Unsupported platform.'; end if;
    insert into public.communication_push_devices(user_id, expo_push_token, platform, device_label)
    values (auth.uid(), btrim(p_expo_push_token), p_platform, nullif(btrim(p_device_label), ''))
    on conflict (expo_push_token) do update set
        user_id = auth.uid(), platform = excluded.platform, device_label = excluded.device_label,
        active = true, last_seen_at = now(), revoked_at = null
    returning id into v_id;
    return v_id;
end;
$$;

create or replace function public.get_platform_announcement_history()
returns table (
    id uuid, title text, category text, audience_type text, sent_at timestamptz,
    created_by_name text, recipient_count bigint, delivered_count bigint,
    read_count bigint, push_queued_count bigint, failed_count bigint, opted_out_count bigint
)
language sql stable security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select announcement.id, announcement.title, announcement.category, announcement.audience_type,
           announcement.sent_at, coalesce(profile.full_name, 'Platform administrator'),
           count(recipient.user_id),
           count(*) filter (where recipient.in_app_status in ('delivered','read')),
           count(*) filter (where recipient.read_at is not null),
           count(*) filter (where recipient.push_status = 'queued'),
           count(*) filter (where recipient.push_status = 'failed'),
           count(*) filter (where recipient.in_app_status = 'opted_out' or recipient.push_status = 'opted_out')
    from public.platform_announcements announcement
    left join public.platform_announcement_recipients recipient on recipient.announcement_id = announcement.id
    left join public.profiles profile on profile.id = announcement.created_by
    where public.homeos_is_platform_admin()
    group by announcement.id, profile.full_name
    order by announcement.sent_at desc nulls last;
$$;

revoke all on function public.get_platform_communication_directory() from public, anon;
revoke all on function public.create_platform_announcement(text,text,text,text,uuid[],uuid,text,boolean) from public, anon;
revoke all on function public.get_my_platform_announcements() from public, anon;
revoke all on function public.mark_platform_announcement_read(uuid) from public, anon;
revoke all on function public.get_my_communication_preferences() from public, anon;
revoke all on function public.update_my_communication_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean) from public, anon;
revoke all on function public.register_communication_push_device(text,text,text) from public, anon;
revoke all on function public.get_platform_announcement_history() from public, anon;

grant execute on function public.get_platform_communication_directory() to authenticated;
grant execute on function public.create_platform_announcement(text,text,text,text,uuid[],uuid,text,boolean) to authenticated;
grant execute on function public.get_my_platform_announcements() to authenticated;
grant execute on function public.mark_platform_announcement_read(uuid) to authenticated;
grant execute on function public.get_my_communication_preferences() to authenticated;
grant execute on function public.update_my_communication_preferences(boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.register_communication_push_device(text,text,text) to authenticated;
grant execute on function public.get_platform_announcement_history() to authenticated;

commit;
