-- 595_Provider_Staged_Work_Persistence_Foundation.sql
-- Review-only proposal. Do not run until reviewed and applied in Supabase.
--
-- Goal:
-- - Persist provider-mode staged work in Supabase before the full publish workflow exists.
-- - Keep all provider work company-side/staged by default.
-- - Do not mutate homeowner-owned HomeOS records.
-- - Do not expose private HomeOS photos, documents, or history.
--
-- This complements 594_Client_HomeOS_Shell_Staged_Update_Foundation.sql.
-- 594 describes the future publish/batch workflow. This file adds the
-- app-facing draft/staged work RPCs used by provider-mode item pages today.

do $$
begin
    if to_regclass('public.companies') is null then
        raise exception 'public.companies is required before provider staged work can be installed.';
    end if;

    if to_regclass('public.properties') is null then
        raise exception 'public.properties is required before provider staged work can be installed.';
    end if;

    if to_regclass('public.home_items') is null then
        raise exception 'public.home_items is required before provider staged work can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before provider staged work can be installed.';
    end if;

    if to_regclass('public.company_property_clients') is null then
        raise exception 'public.company_property_clients is required before provider staged work can be installed.';
    end if;

    if to_regprocedure('public.homeos_is_platform_admin()') is null then
        raise exception 'public.homeos_is_platform_admin() is required before provider staged work can be installed.';
    end if;
end $$;

create table if not exists public.company_provider_staged_work (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    home_item_id uuid null references public.home_items(id) on delete set null,
    item_slug text null,
    item_name text not null,
    system text null,
    location text null,
    category text null,
    work_type text not null
        check (lower(btrim(work_type)) in (
            'note',
            'finding',
            'photo',
            'document',
            'edit',
            'related_item',
            'archive_request',
            'client_update_mark'
        )),
    status text not null default 'draft'
        check (lower(btrim(status)) in ('draft', 'staged', 'published', 'rejected')),
    payload jsonb not null default '{}'::jsonb,
    created_by_user_id uuid not null references auth.users(id) on delete restrict,
    created_by_company_user_id uuid null references public.company_users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists company_provider_staged_work_company_property_idx
    on public.company_provider_staged_work (company_id, property_id, status, created_at desc);

create index if not exists company_provider_staged_work_item_idx
    on public.company_provider_staged_work (company_id, property_id, home_item_id, item_slug);

create index if not exists company_provider_staged_work_created_by_idx
    on public.company_provider_staged_work (created_by_user_id, created_at desc);

create or replace function public.can_access_provider_staged_work(
    p_company_id uuid,
    p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
    select
        exists (
            select 1
            from public.company_property_clients client
            where client.company_id = p_company_id
              and client.property_id = p_property_id
              and lower(btrim(coalesce(client.status, 'active'))) not in (
                  'archived',
                  'cancelled',
                  'canceled',
                  'declined',
                  'inactive',
                  'revoked'
              )
        )
        and (
            public.homeos_is_platform_admin()
            or exists (
                select 1
                from public.company_users company_user
                where company_user.company_id = p_company_id
                  and company_user.auth_user_id = auth.uid()
                  and lower(btrim(coalesce(company_user.status, ''))) = 'active'
            )
        );
$function$;

alter table public.company_provider_staged_work enable row level security;

drop policy if exists company_provider_staged_work_select on public.company_provider_staged_work;
drop policy if exists company_provider_staged_work_insert on public.company_provider_staged_work;
drop policy if exists company_provider_staged_work_update on public.company_provider_staged_work;

create policy company_provider_staged_work_select
    on public.company_provider_staged_work
    for select
    using (public.can_access_provider_staged_work(company_id, property_id));

create policy company_provider_staged_work_insert
    on public.company_provider_staged_work
    for insert
    with check (
        auth.uid() = created_by_user_id
        and public.can_access_provider_staged_work(company_id, property_id)
    );

create policy company_provider_staged_work_update
    on public.company_provider_staged_work
    for update
    using (public.can_access_provider_staged_work(company_id, property_id))
    with check (public.can_access_provider_staged_work(company_id, property_id));

create or replace function public.get_provider_staged_work(
    p_company_id uuid,
    p_property_id uuid,
    p_item_id uuid default null,
    p_item_slug text default null
)
returns table (
    id uuid,
    type text,
    company_id uuid,
    property_id uuid,
    item_id uuid,
    item_slug text,
    item_name text,
    system text,
    location text,
    category text,
    created_at timestamptz,
    created_by uuid,
    status text,
    payload jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
begin
    if auth.uid() is null then
        raise exception 'Sign in to view provider staged work.';
    end if;

    if not public.can_access_provider_staged_work(p_company_id, p_property_id) then
        raise exception 'You do not have provider staging access for this client home.';
    end if;

    return query
    select
        staged_work.id,
        staged_work.work_type as type,
        staged_work.company_id,
        staged_work.property_id,
        staged_work.home_item_id as item_id,
        staged_work.item_slug,
        staged_work.item_name,
        staged_work.system,
        staged_work.location,
        staged_work.category,
        staged_work.created_at,
        staged_work.created_by_user_id as created_by,
        staged_work.status,
        staged_work.payload
    from public.company_provider_staged_work staged_work
    where staged_work.company_id = p_company_id
      and staged_work.property_id = p_property_id
      and staged_work.status <> 'rejected'
      and (p_item_id is null or staged_work.home_item_id = p_item_id)
      and (p_item_slug is null or staged_work.item_slug = p_item_slug)
    order by staged_work.created_at desc;
end;
$function$;

create or replace function public.create_provider_staged_work(
    p_company_id uuid,
    p_property_id uuid,
    p_item_id uuid default null,
    p_item_slug text default null,
    p_item_name text default 'Client HomeOS item',
    p_system text default null,
    p_location text default null,
    p_category text default null,
    p_type text default 'note',
    p_payload jsonb default '{}'::jsonb,
    p_status text default 'draft'
)
returns table (
    id uuid,
    type text,
    company_id uuid,
    property_id uuid,
    item_id uuid,
    item_slug text,
    item_name text,
    system text,
    location text,
    category text,
    created_at timestamptz,
    created_by uuid,
    status text,
    payload jsonb
)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
    v_type text := lower(btrim(coalesce(p_type, 'note')));
    v_status text := lower(btrim(coalesce(p_status, 'draft')));
    v_company_user_id uuid;
    v_work public.company_provider_staged_work%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Sign in to stage provider work.';
    end if;

    if not public.can_access_provider_staged_work(p_company_id, p_property_id) then
        raise exception 'You do not have provider staging access for this client home.';
    end if;

    if v_type not in (
        'note',
        'finding',
        'photo',
        'document',
        'edit',
        'related_item',
        'archive_request',
        'client_update_mark'
    ) then
        raise exception 'Unsupported provider staged work type: %', p_type;
    end if;

    if v_status not in ('draft', 'staged', 'published', 'rejected') then
        raise exception 'Unsupported provider staged work status: %', p_status;
    end if;

    if p_item_id is not null and not exists (
        select 1
        from public.home_items item
        where item.id = p_item_id
          and item.property_id = p_property_id
    ) then
        raise exception 'The staged item does not belong to this client home.';
    end if;

    select company_user.id
    into v_company_user_id
    from public.company_users company_user
    where company_user.company_id = p_company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at asc, company_user.id asc
    limit 1;

    insert into public.company_provider_staged_work (
        company_id,
        property_id,
        home_item_id,
        item_slug,
        item_name,
        system,
        location,
        category,
        work_type,
        status,
        payload,
        created_by_user_id,
        created_by_company_user_id
    )
    values (
        p_company_id,
        p_property_id,
        p_item_id,
        nullif(btrim(coalesce(p_item_slug, '')), ''),
        coalesce(nullif(btrim(coalesce(p_item_name, '')), ''), 'Client HomeOS item'),
        nullif(btrim(coalesce(p_system, '')), ''),
        nullif(btrim(coalesce(p_location, '')), ''),
        nullif(btrim(coalesce(p_category, '')), ''),
        v_type,
        v_status,
        coalesce(p_payload, '{}'::jsonb),
        auth.uid(),
        v_company_user_id
    )
    returning *
    into v_work;

    return query
    select
        v_work.id as id,
        v_work.work_type as type,
        v_work.company_id as company_id,
        v_work.property_id as property_id,
        v_work.home_item_id as item_id,
        v_work.item_slug as item_slug,
        v_work.item_name as item_name,
        v_work.system as system,
        v_work.location as location,
        v_work.category as category,
        v_work.created_at as created_at,
        v_work.created_by_user_id as created_by,
        v_work.status as status,
        v_work.payload as payload;
end;
$function$;

create or replace function public.clear_provider_staged_work_for_item(
    p_company_id uuid,
    p_property_id uuid,
    p_item_id uuid default null,
    p_item_slug text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
declare
    v_updated_count integer := 0;
begin
    if auth.uid() is null then
        raise exception 'Sign in to clear provider staged work.';
    end if;

    if not public.can_access_provider_staged_work(p_company_id, p_property_id) then
        raise exception 'You do not have provider staging access for this client home.';
    end if;

    update public.company_provider_staged_work staged_work
    set
        status = 'rejected',
        updated_at = now()
    where staged_work.company_id = p_company_id
      and staged_work.property_id = p_property_id
      and staged_work.status in ('draft', 'staged')
      and (p_item_id is null or staged_work.home_item_id = p_item_id)
      and (p_item_slug is null or staged_work.item_slug = p_item_slug);

    get diagnostics v_updated_count = row_count;

    return v_updated_count;
end;
$function$;

revoke all on table public.company_provider_staged_work from public;
revoke all on table public.company_provider_staged_work from anon;
grant select, insert, update on table public.company_provider_staged_work to authenticated;

revoke all on function public.can_access_provider_staged_work(uuid, uuid) from public;
revoke all on function public.can_access_provider_staged_work(uuid, uuid) from anon;
grant execute on function public.can_access_provider_staged_work(uuid, uuid) to authenticated;

revoke all on function public.get_provider_staged_work(uuid, uuid, uuid, text) from public;
revoke all on function public.get_provider_staged_work(uuid, uuid, uuid, text) from anon;
grant execute on function public.get_provider_staged_work(uuid, uuid, uuid, text) to authenticated;

revoke all on function public.create_provider_staged_work(uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text) from public;
revoke all on function public.create_provider_staged_work(uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text) from anon;
grant execute on function public.create_provider_staged_work(uuid, uuid, uuid, text, text, text, text, text, text, jsonb, text) to authenticated;

revoke all on function public.clear_provider_staged_work_for_item(uuid, uuid, uuid, text) from public;
revoke all on function public.clear_provider_staged_work_for_item(uuid, uuid, uuid, text) from anon;
grant execute on function public.clear_provider_staged_work_for_item(uuid, uuid, uuid, text) to authenticated;

-- Frontend fallback behavior:
-- - If these RPCs are missing, the app falls back to local staged entries.
-- - Once installed, provider-mode item pages load and create staged work through:
--     get_provider_staged_work(...)
--     create_provider_staged_work(...)
--     clear_provider_staged_work_for_item(...)
-- - Publishing to permanent homeowner HomeOS remains intentionally unimplemented.
