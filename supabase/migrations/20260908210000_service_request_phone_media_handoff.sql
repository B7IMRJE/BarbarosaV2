create extension if not exists pgcrypto with schema extensions;

create table if not exists public.service_request_media_handoffs (
    id uuid primary key default gen_random_uuid(),
    property_id uuid not null references public.properties(id) on delete cascade,
    created_by_user_id uuid not null references auth.users(id) on delete cascade,
    token_hash text not null unique,
    context_label text not null default 'Service request',
    expires_at timestamptz not null default (now() + interval '15 minutes'),
    closed_at timestamptz null,
    created_at timestamptz not null default now()
);

create table if not exists public.service_request_media_handoff_items (
    id uuid primary key,
    handoff_id uuid not null references public.service_request_media_handoffs(id) on delete cascade,
    media_type text not null check (media_type in ('photo', 'video')),
    bucket text not null default 'service-request-media' check (bucket = 'service-request-media'),
    storage_path text not null unique,
    file_name text not null,
    mime_type text not null,
    size_bytes bigint null,
    duration_seconds integer null,
    created_at timestamptz not null default now()
);

alter table public.service_request_media_handoffs enable row level security;
alter table public.service_request_media_handoff_items enable row level security;

grant select on public.service_request_media_handoffs to authenticated;
grant select on public.service_request_media_handoff_items to authenticated;

drop policy if exists service_request_media_handoffs_owner_select on public.service_request_media_handoffs;
create policy service_request_media_handoffs_owner_select
on public.service_request_media_handoffs for select to authenticated
using (created_by_user_id = auth.uid());

drop policy if exists service_request_media_handoff_items_owner_select on public.service_request_media_handoff_items;
create policy service_request_media_handoff_items_owner_select
on public.service_request_media_handoff_items for select to authenticated
using (exists (
    select 1 from public.service_request_media_handoffs handoff
    where handoff.id = handoff_id and handoff.created_by_user_id = auth.uid()
));

create or replace function public.create_service_request_media_handoff(
    p_property_id uuid,
    p_context_label text
)
returns table(handoff_id uuid, handoff_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
    v_token text := encode(extensions.gen_random_bytes(24), 'hex');
    v_handoff public.service_request_media_handoffs%rowtype;
begin
    if auth.uid() is null then raise exception 'Sign in before starting a phone handoff.'; end if;
    if not exists (
        select 1 from public.properties property
        where property.id = p_property_id
          and (property.owner_id = auth.uid() or public.homeos_has_active_property_membership(property.id))
    ) then raise exception 'This property is not available to the current homeowner.'; end if;

    update public.service_request_media_handoffs
    set closed_at = now()
    where created_by_user_id = auth.uid() and closed_at is null;

    insert into public.service_request_media_handoffs(property_id, created_by_user_id, token_hash, context_label)
    values (
        p_property_id,
        auth.uid(),
        encode(extensions.digest(v_token, 'sha256'), 'hex'),
        left(coalesce(nullif(trim(p_context_label), ''), 'Service request'), 240)
    )
    returning * into v_handoff;

    return query select v_handoff.id, v_token, v_handoff.expires_at;
end;
$$;

create or replace function public.service_request_media_handoff_from_token(p_handoff_id uuid, p_token text)
returns public.service_request_media_handoffs
language sql
stable
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
    select handoff.*
    from public.service_request_media_handoffs handoff
    where handoff.id = p_handoff_id
      and handoff.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
      and handoff.closed_at is null
      and handoff.expires_at > now()
$$;

create or replace function public.service_request_media_handoff_storage_can_write(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, storage, extensions, pg_temp
as $$
declare
    v_parts text[] := storage.foldername(p_object_name);
    v_handoff_id uuid;
begin
    if array_length(v_parts, 1) < 3 or v_parts[1] <> 'handoffs' then return false; end if;
    begin v_handoff_id := v_parts[2]::uuid; exception when others then return false; end;
    return exists (
        select 1 from public.service_request_media_handoffs handoff
        where handoff.id = v_handoff_id
          and handoff.token_hash = encode(extensions.digest(v_parts[3], 'sha256'), 'hex')
          and handoff.closed_at is null
          and handoff.expires_at > now()
    );
end;
$$;

create or replace function public.get_service_request_media_handoff(p_handoff_id uuid, p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
    v_handoff public.service_request_media_handoffs%rowtype;
begin
    select * into v_handoff from public.service_request_media_handoff_from_token(p_handoff_id, p_token);
    if v_handoff.id is null then return null; end if;
    return jsonb_build_object(
        'handoff_id', v_handoff.id,
        'property_id', v_handoff.property_id,
        'context_label', v_handoff.context_label,
        'expires_at', v_handoff.expires_at,
        'items', coalesce((
            select jsonb_agg(to_jsonb(item) order by item.created_at)
            from public.service_request_media_handoff_items item where item.handoff_id = v_handoff.id
        ), '[]'::jsonb)
    );
end;
$$;

create or replace function public.save_service_request_media_handoff_item(
    p_handoff_id uuid,
    p_token text,
    p_item_id uuid,
    p_media_type text,
    p_storage_path text,
    p_file_name text,
    p_mime_type text,
    p_size_bytes bigint,
    p_duration_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, storage, extensions, pg_temp
as $$
declare
    v_handoff public.service_request_media_handoffs%rowtype;
    v_item public.service_request_media_handoff_items%rowtype;
    v_object storage.objects%rowtype;
    v_actual_size bigint;
begin
    select * into v_handoff from public.service_request_media_handoff_from_token(p_handoff_id, p_token);
    if v_handoff.id is null then raise exception 'This phone link has expired.'; end if;
    if p_media_type not in ('photo', 'video') then raise exception 'Unsupported media type.'; end if;
    if p_storage_path not like 'handoffs/' || p_handoff_id::text || '/' || p_token || '/%' then raise exception 'Invalid upload path.'; end if;
    select * into v_object from storage.objects object
    where object.bucket_id = 'service-request-media' and object.name = p_storage_path;
    if v_object.id is null then raise exception 'Uploaded file was not found.'; end if;
    v_actual_size := coalesce((v_object.metadata ->> 'size')::bigint, p_size_bytes, 0);
    if p_media_type = 'photo' and v_actual_size > 10485760 then raise exception 'Photos must be 10 MB or smaller.'; end if;
    if p_media_type = 'video' and v_actual_size > 78643200 then raise exception 'Videos must be 75 MB or smaller.'; end if;
    if p_media_type = 'video' and coalesce(p_duration_seconds, 0) > 60 then raise exception 'Videos must be 60 seconds or shorter.'; end if;
    if p_media_type = 'photo' and (select count(*) from public.service_request_media_handoff_items where handoff_id = p_handoff_id and media_type = 'photo') >= 10 then
        raise exception 'This request already has 10 photos.';
    end if;
    if p_media_type = 'video' and (select count(*) from public.service_request_media_handoff_items where handoff_id = p_handoff_id and media_type = 'video') >= 2 then
        raise exception 'This request already has 2 videos.';
    end if;

    insert into public.service_request_media_handoff_items(id, handoff_id, media_type, storage_path, file_name, mime_type, size_bytes, duration_seconds)
    values (p_item_id, p_handoff_id, p_media_type, p_storage_path, left(p_file_name, 160), p_mime_type, p_size_bytes, p_duration_seconds)
    returning * into v_item;
    return to_jsonb(v_item);
end;
$$;

create or replace function public.close_service_request_media_handoff(p_handoff_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    update public.service_request_media_handoffs set closed_at = now()
    where id = p_handoff_id and created_by_user_id = auth.uid();
end;
$$;

revoke all on function public.create_service_request_media_handoff(uuid, text) from public, anon;
grant execute on function public.create_service_request_media_handoff(uuid, text) to authenticated;
revoke all on function public.service_request_media_handoff_from_token(uuid, text) from public, anon, authenticated;
revoke all on function public.get_service_request_media_handoff(uuid, text) from public;
grant execute on function public.get_service_request_media_handoff(uuid, text) to anon, authenticated;
revoke all on function public.save_service_request_media_handoff_item(uuid, text, uuid, text, text, text, text, bigint, integer) from public;
grant execute on function public.save_service_request_media_handoff_item(uuid, text, uuid, text, text, text, text, bigint, integer) to anon, authenticated;
revoke all on function public.close_service_request_media_handoff(uuid) from public, anon;
grant execute on function public.close_service_request_media_handoff(uuid) to authenticated;

drop policy if exists service_request_media_handoff_objects_insert on storage.objects;
create policy service_request_media_handoff_objects_insert on storage.objects
for insert to anon, authenticated
with check (bucket_id = 'service-request-media' and public.service_request_media_handoff_storage_can_write(name));

drop policy if exists service_request_media_handoff_objects_owner_select on storage.objects;
create policy service_request_media_handoff_objects_owner_select on storage.objects
for select to authenticated
using (
    bucket_id = 'service-request-media'
    and (storage.foldername(name))[1] = 'handoffs'
    and exists (
        select 1 from public.service_request_media_handoffs handoff
        where handoff.id::text = (storage.foldername(name))[2]
          and handoff.created_by_user_id = auth.uid()
    )
);

drop policy if exists service_request_media_handoff_objects_owner_delete on storage.objects;
create policy service_request_media_handoff_objects_owner_delete on storage.objects
for delete to authenticated
using (
    bucket_id = 'service-request-media'
    and (storage.foldername(name))[1] = 'handoffs'
    and exists (
        select 1 from public.service_request_media_handoffs handoff
        where handoff.id::text = (storage.foldername(name))[2]
          and handoff.created_by_user_id = auth.uid()
    )
);
