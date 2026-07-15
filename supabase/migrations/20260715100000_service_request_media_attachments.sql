begin;

do $$
begin
    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before request media attachments can be installed.';
    end if;

    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before request media attachments can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before request media attachments can be installed.';
    end if;

    if to_regclass('public.property_memberships') is null then
        raise exception 'public.property_memberships is required before request media attachments can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_property_record(uuid)') is null then
        raise exception 'public.homeos_can_read_property_record(uuid) is required before request media attachments can be installed.';
    end if;

    if to_regprocedure('public.can_dispatch_company(uuid)') is null then
        raise exception 'public.can_dispatch_company(uuid) is required before request media attachments can be installed.';
    end if;

    if to_regprocedure('public.homeos_can_read_provider_assigned_items(uuid,uuid,uuid,uuid,uuid)') is null then
        raise exception 'public.homeos_can_read_provider_assigned_items(uuid,uuid,uuid,uuid,uuid) is required before request media attachments can be installed.';
    end if;
end;
$$;

insert into storage.buckets (id, name, public)
values ('service-request-media', 'service-request-media', false)
on conflict (id) do update
set public = false;

create table if not exists public.service_request_attachments (
    id uuid primary key default gen_random_uuid(),
    service_request_id uuid not null references public.service_requests(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    property_id uuid not null references public.properties(id) on delete cascade,
    uploaded_by_user_id uuid null references auth.users(id) on delete set null,
    media_type text not null,
    bucket text not null default 'service-request-media',
    storage_path text not null,
    thumbnail_path text null,
    file_name text not null,
    mime_type text not null,
    size_bytes bigint not null,
    duration_seconds integer null,
    caption text null,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz null,
    constraint service_request_attachments_media_type_check
        check (lower(btrim(media_type)) in ('photo', 'video')),
    constraint service_request_attachments_bucket_check
        check (bucket = 'service-request-media'),
    constraint service_request_attachments_size_check
        check (size_bytes > 0),
    constraint service_request_attachments_video_duration_check
        check (
            (
                lower(btrim(media_type)) = 'photo'
                and duration_seconds is null
            )
            or (
                lower(btrim(media_type)) = 'video'
                and duration_seconds is not null
                and duration_seconds >= 0
                and duration_seconds <= 60
            )
        ),
    constraint service_request_attachments_mime_type_check
        check (
            (
                lower(btrim(media_type)) = 'photo'
                and lower(btrim(mime_type)) in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')
            )
            or (
                lower(btrim(media_type)) = 'video'
                and lower(btrim(mime_type)) in ('video/mp4', 'video/quicktime', 'video/webm')
            )
        ),
    constraint service_request_attachments_storage_path_unique
        unique (bucket, storage_path)
);

create index if not exists service_request_attachments_request_idx
    on public.service_request_attachments (service_request_id, deleted_at, sort_order, created_at);

create index if not exists service_request_attachments_company_request_idx
    on public.service_request_attachments (company_id, service_request_id)
    where deleted_at is null;

create index if not exists service_request_attachments_property_idx
    on public.service_request_attachments (property_id)
    where deleted_at is null;

alter table public.service_request_attachments enable row level security;

grant select, insert, update, delete on table public.service_request_attachments to authenticated;

create or replace function public.service_request_media_can_access(
    p_service_request_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
begin
    if auth.uid() is null or p_service_request_id is null then
        return false;
    end if;

    select request_row.*
    into v_request
    from public.service_requests as request_row
    where request_row.id = p_service_request_id;

    if not found then
        return false;
    end if;

    if public.homeos_can_read_property_record(v_request.property_id) then
        return true;
    end if;

    if public.can_dispatch_company(v_request.company_id) then
        return true;
    end if;

    if exists (
        select 1
        from public.job_schedule_slots as slot
        join public.company_users as company_user
          on company_user.id = slot.technician_company_user_id
         and company_user.company_id = slot.company_id
        where slot.service_request_id = v_request.id
          and slot.company_id = v_request.company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
          and lower(btrim(coalesce(company_user.role, ''))) in (
              'technician',
              'tech',
              'field_tech',
              'field-tech',
              'field technician'
          )
    ) then
        return true;
    end if;

    return public.homeos_can_read_provider_assigned_items(
        v_request.company_id,
        v_request.property_id,
        v_request.id,
        null,
        v_request.converted_job_id
    );
end;
$$;

revoke all on function public.service_request_media_can_access(uuid) from public;
revoke all on function public.service_request_media_can_access(uuid) from anon;
grant execute on function public.service_request_media_can_access(uuid) to authenticated;

create or replace function public.service_request_media_storage_can_access(
    p_object_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
    v_parts text[];
    v_company_id uuid;
    v_property_id uuid;
    v_service_request_id uuid;
begin
    v_parts := storage.foldername(p_object_name);

    if coalesce(array_length(v_parts, 1), 0) < 7 then
        return false;
    end if;

    if v_parts[1] <> 'companies'
       or v_parts[3] <> 'properties'
       or v_parts[5] <> 'service-requests' then
        return false;
    end if;

    begin
        v_company_id := v_parts[2]::uuid;
        v_property_id := v_parts[4]::uuid;
        v_service_request_id := v_parts[6]::uuid;
    exception
        when invalid_text_representation then
            return false;
    end;

    return exists (
        select 1
        from public.service_requests as request_row
        where request_row.id = v_service_request_id
          and request_row.company_id = v_company_id
          and request_row.property_id = v_property_id
    )
    and public.service_request_media_can_access(v_service_request_id);
end;
$$;

revoke all on function public.service_request_media_storage_can_access(text) from public;
revoke all on function public.service_request_media_storage_can_access(text) from anon;
grant execute on function public.service_request_media_storage_can_access(text) to authenticated;

drop policy if exists service_request_attachments_select on public.service_request_attachments;
create policy service_request_attachments_select
    on public.service_request_attachments
    for select
    to authenticated
    using (
        deleted_at is null
        and public.service_request_media_can_access(service_request_id)
    );

drop policy if exists service_request_attachments_insert on public.service_request_attachments;
create policy service_request_attachments_insert
    on public.service_request_attachments
    for insert
    to authenticated
    with check (
        uploaded_by_user_id = auth.uid()
        and public.service_request_media_can_access(service_request_id)
        and exists (
            select 1
            from public.service_requests as request_row
            where request_row.id = service_request_attachments.service_request_id
              and request_row.company_id = service_request_attachments.company_id
              and request_row.property_id = service_request_attachments.property_id
        )
    );

drop policy if exists service_request_attachments_update on public.service_request_attachments;
create policy service_request_attachments_update
    on public.service_request_attachments
    for update
    to authenticated
    using (public.service_request_media_can_access(service_request_id))
    with check (
        public.service_request_media_can_access(service_request_id)
        and exists (
            select 1
            from public.service_requests as request_row
            where request_row.id = service_request_attachments.service_request_id
              and request_row.company_id = service_request_attachments.company_id
              and request_row.property_id = service_request_attachments.property_id
        )
    );

drop policy if exists service_request_attachments_delete on public.service_request_attachments;
create policy service_request_attachments_delete
    on public.service_request_attachments
    for delete
    to authenticated
    using (public.service_request_media_can_access(service_request_id));

create or replace function public.get_service_request_attachments(
    p_service_request_id uuid
)
returns table (
    id uuid,
    service_request_id uuid,
    company_id uuid,
    property_id uuid,
    uploaded_by_user_id uuid,
    media_type text,
    bucket text,
    storage_path text,
    thumbnail_path text,
    file_name text,
    mime_type text,
    size_bytes bigint,
    duration_seconds integer,
    caption text,
    sort_order integer,
    created_at timestamptz,
    uploader_role text,
    uploader_name text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.service_request_media_can_access(p_service_request_id) then
        raise exception 'Not authorized to view service request media.';
    end if;

    return query
    select
        attachment.id,
        attachment.service_request_id,
        attachment.company_id,
        attachment.property_id,
        attachment.uploaded_by_user_id,
        attachment.media_type,
        attachment.bucket,
        attachment.storage_path,
        attachment.thumbnail_path,
        attachment.file_name,
        attachment.mime_type,
        attachment.size_bytes,
        attachment.duration_seconds,
        attachment.caption,
        attachment.sort_order,
        attachment.created_at,
        coalesce(uploader.role, case when request_row.requested_by_user_id = attachment.uploaded_by_user_id then 'homeowner' else null end) as uploader_role,
        coalesce(uploader.full_name, uploader.email, case when request_row.requested_by_user_id = attachment.uploaded_by_user_id then 'Homeowner' else null end) as uploader_name
    from public.service_request_attachments as attachment
    join public.service_requests as request_row
      on request_row.id = attachment.service_request_id
    left join lateral (
        select company_user.role, company_user.full_name, company_user.email
        from public.company_users as company_user
        where company_user.company_id = attachment.company_id
          and company_user.auth_user_id = attachment.uploaded_by_user_id
        order by company_user.created_at asc nulls last, company_user.id asc
        limit 1
    ) as uploader on true
    where attachment.service_request_id = p_service_request_id
      and attachment.deleted_at is null
    order by attachment.sort_order asc, attachment.created_at asc, attachment.id asc;
end;
$$;

revoke all on function public.get_service_request_attachments(uuid) from public;
revoke all on function public.get_service_request_attachments(uuid) from anon;
grant execute on function public.get_service_request_attachments(uuid) to authenticated;

create or replace function public.save_service_request_attachment(
    p_attachment_id uuid,
    p_service_request_id uuid,
    p_media_type text,
    p_file_name text,
    p_mime_type text,
    p_size_bytes bigint,
    p_duration_seconds integer default null,
    p_caption text default null,
    p_sort_order integer default 0
)
returns table (
    id uuid,
    service_request_id uuid,
    company_id uuid,
    property_id uuid,
    uploaded_by_user_id uuid,
    media_type text,
    bucket text,
    storage_path text,
    thumbnail_path text,
    file_name text,
    mime_type text,
    size_bytes bigint,
    duration_seconds integer,
    caption text,
    sort_order integer,
    created_at timestamptz,
    uploader_role text,
    uploader_name text
)
language plpgsql
security definer
set search_path = pg_catalog, public, storage, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_attachment_id uuid := coalesce(p_attachment_id, gen_random_uuid());
    v_media_type text := lower(btrim(coalesce(p_media_type, '')));
    v_file_name text;
    v_mime_type text := lower(btrim(coalesce(p_mime_type, '')));
    v_size_bytes bigint := coalesce(p_size_bytes, 0);
    v_storage_path text;
    v_existing_count integer := 0;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    if not public.service_request_media_can_access(p_service_request_id) then
        raise exception 'Not authorized to save media for this service request.';
    end if;

    select request_row.*
    into v_request
    from public.service_requests as request_row
    where request_row.id = p_service_request_id;

    if not found then
        raise exception 'Service request not found.';
    end if;

    if v_media_type not in ('photo', 'video') then
        raise exception 'Media type must be photo or video.';
    end if;

    if v_size_bytes <= 0 then
        raise exception 'Media file size is required.';
    end if;

    if v_media_type = 'photo' and v_size_bytes > 10485760 then
        raise exception 'Photos must be 10 MB or smaller.';
    end if;

    if v_media_type = 'video' and v_size_bytes > 78643200 then
        raise exception 'Videos must be 75 MB or smaller.';
    end if;

    if v_media_type = 'video' and p_duration_seconds is null then
        raise exception 'Video duration is required.';
    end if;

    if v_media_type = 'video' and p_duration_seconds > 60 then
        raise exception 'Videos must be 60 seconds or shorter.';
    end if;

    if v_media_type = 'photo' and v_mime_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif') then
        raise exception 'Unsupported photo type.';
    end if;

    if v_media_type = 'video' and v_mime_type not in ('video/mp4', 'video/quicktime', 'video/webm') then
        raise exception 'Unsupported video type.';
    end if;

    v_file_name := left(
        regexp_replace(
            regexp_replace(
                regexp_replace(btrim(coalesce(p_file_name, '')), '[^A-Za-z0-9_.-]+', '-', 'g'),
                '(^-+|-+$)',
                '',
                'g'
            ),
            '/+',
            '-',
            'g'
        ),
        160
    );

    if v_file_name = '' then
        v_file_name := case when v_media_type = 'video' then 'service-request-video.mp4' else 'service-request-photo.jpg' end;
    end if;

    select count(*)::integer
    into v_existing_count
    from public.service_request_attachments as attachment
    where attachment.service_request_id = v_request.id
      and attachment.media_type = v_media_type
      and attachment.deleted_at is null;

    if v_media_type = 'photo' and v_existing_count >= 10 then
        raise exception 'A service request can have at most 10 photos.';
    end if;

    if v_media_type = 'video' and v_existing_count >= 2 then
        raise exception 'A service request can have at most 2 videos.';
    end if;

    v_storage_path := concat_ws(
        '/',
        'companies',
        v_request.company_id::text,
        'properties',
        v_request.property_id::text,
        'service-requests',
        v_request.id::text,
        v_attachment_id::text,
        v_file_name
    );

    if not exists (
        select 1
        from storage.objects as object_row
        where object_row.bucket_id = 'service-request-media'
          and object_row.name = v_storage_path
    ) then
        raise exception 'Uploaded media object was not found.';
    end if;

    insert into public.service_request_attachments (
        id,
        service_request_id,
        company_id,
        property_id,
        uploaded_by_user_id,
        media_type,
        bucket,
        storage_path,
        file_name,
        mime_type,
        size_bytes,
        duration_seconds,
        caption,
        sort_order,
        created_at,
        updated_at
    )
    values (
        v_attachment_id,
        v_request.id,
        v_request.company_id,
        v_request.property_id,
        auth.uid(),
        v_media_type,
        'service-request-media',
        v_storage_path,
        v_file_name,
        v_mime_type,
        v_size_bytes,
        p_duration_seconds,
        nullif(btrim(coalesce(p_caption, '')), ''),
        coalesce(p_sort_order, 0),
        now(),
        now()
    );

    return query
    select *
    from public.get_service_request_attachments(v_request.id) as saved
    where saved.id = v_attachment_id;
end;
$$;

revoke all on function public.save_service_request_attachment(uuid, uuid, text, text, text, bigint, integer, text, integer) from public;
revoke all on function public.save_service_request_attachment(uuid, uuid, text, text, text, bigint, integer, text, integer) from anon;
grant execute on function public.save_service_request_attachment(uuid, uuid, text, text, text, bigint, integer, text, integer) to authenticated;

create or replace function public.delete_service_request_attachment(
    p_attachment_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_attachment public.service_request_attachments%rowtype;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    select attachment.*
    into v_attachment
    from public.service_request_attachments as attachment
    where attachment.id = p_attachment_id
      and attachment.deleted_at is null;

    if not found then
        return true;
    end if;

    if not public.service_request_media_can_access(v_attachment.service_request_id) then
        raise exception 'Not authorized to remove this service request media.';
    end if;

    update public.service_request_attachments as attachment
    set deleted_at = now(),
        updated_at = now()
    where attachment.id = v_attachment.id;

    return true;
end;
$$;

revoke all on function public.delete_service_request_attachment(uuid) from public;
revoke all on function public.delete_service_request_attachment(uuid) from anon;
grant execute on function public.delete_service_request_attachment(uuid) to authenticated;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'service_request_media_select'
    ) then
        create policy service_request_media_select
            on storage.objects
            for select
            to authenticated
            using (
                bucket_id = 'service-request-media'
                and public.service_request_media_storage_can_access(name)
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'service_request_media_insert'
    ) then
        create policy service_request_media_insert
            on storage.objects
            for insert
            to authenticated
            with check (
                bucket_id = 'service-request-media'
                and public.service_request_media_storage_can_access(name)
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'service_request_media_update'
    ) then
        create policy service_request_media_update
            on storage.objects
            for update
            to authenticated
            using (
                bucket_id = 'service-request-media'
                and public.service_request_media_storage_can_access(name)
            )
            with check (
                bucket_id = 'service-request-media'
                and public.service_request_media_storage_can_access(name)
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'service_request_media_delete'
    ) then
        create policy service_request_media_delete
            on storage.objects
            for delete
            to authenticated
            using (
                bucket_id = 'service-request-media'
                and public.service_request_media_storage_can_access(name)
            );
    end if;
end;
$$;

commit;
