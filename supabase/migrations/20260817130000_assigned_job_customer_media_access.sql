-- Allow assigned Sales Tech and field users to view customer request media
-- without widening customer-media write permissions. Record each gallery load
-- in the existing company audit trail.

begin;

do $$
begin
    if to_regclass('public.service_request_attachments') is null
       or to_regclass('public.company_audit_logs') is null then
        raise exception 'Customer media attachments and company audit logs are required.';
    end if;

    if to_regprocedure('public.service_request_media_can_access(uuid)') is null
       or to_regprocedure('public.company_sales_context_matches_client_home(uuid,uuid,uuid,uuid,uuid)') is null then
        raise exception 'Customer media and assigned Sales Tech access helpers are required.';
    end if;
end;
$$;

create or replace function public.service_request_media_can_view(
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

    -- Preserve every established homeowner, dispatch, Tech, and assigned-job
    -- permission. This helper is read-only and is never used by write policies.
    if public.service_request_media_can_access(p_service_request_id) then
        return true;
    end if;

    select request_row.*
    into v_request
    from public.service_requests as request_row
    where request_row.id = p_service_request_id;

    if not found then
        return false;
    end if;

    -- Sales Tech is intentionally assignment-scoped. The request must match an
    -- active company client home and the authenticated user's assigned sales
    -- visit for this exact service request. The request is the media owner, so
    -- an unrelated or later converted-job link cannot widen or block access.
    return public.company_sales_context_matches_client_home(
        v_request.company_id,
        v_request.property_id,
        v_request.id,
        null,
        null
    );
end;
$$;

revoke all on function public.service_request_media_can_view(uuid) from public;
revoke all on function public.service_request_media_can_view(uuid) from anon;
grant execute on function public.service_request_media_can_view(uuid) to authenticated;

create or replace function public.service_request_media_storage_can_view(
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
    and public.service_request_media_can_view(v_service_request_id);
end;
$$;

revoke all on function public.service_request_media_storage_can_view(text) from public;
revoke all on function public.service_request_media_storage_can_view(text) from anon;
grant execute on function public.service_request_media_storage_can_view(text) to authenticated;

drop policy if exists service_request_attachments_select on public.service_request_attachments;
create policy service_request_attachments_select
    on public.service_request_attachments
    for select
    to authenticated
    using (
        deleted_at is null
        and public.service_request_media_can_view(service_request_id)
    );

drop policy if exists service_request_media_select on storage.objects;
create policy service_request_media_select
    on storage.objects
    for select
    to authenticated
    using (
        bucket_id = 'service-request-media'
        and public.service_request_media_storage_can_view(name)
    );

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
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_request public.service_requests%rowtype;
    v_actor public.company_users%rowtype;
    v_actor_email text;
    v_attachment_count integer := 0;
begin
    if not public.service_request_media_can_view(p_service_request_id) then
        raise exception 'Not authorized to view service request media.';
    end if;

    select request_row.*
    into v_request
    from public.service_requests as request_row
    where request_row.id = p_service_request_id;

    if not found then
        raise exception 'Service request not found.';
    end if;

    select company_user.*
    into v_actor
    from public.company_users as company_user
    where company_user.company_id = v_request.company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at asc nulls last, company_user.id asc
    limit 1;

    select auth_user.email
    into v_actor_email
    from auth.users as auth_user
    where auth_user.id = auth.uid();

    select count(*)::integer
    into v_attachment_count
    from public.service_request_attachments as attachment
    where attachment.service_request_id = p_service_request_id
      and attachment.deleted_at is null;

    insert into public.company_audit_logs (
        company_id,
        actor_user_id,
        actor_email,
        actor_company_user_id,
        actor_role,
        action,
        target_type,
        target_id,
        target_label,
        metadata
    )
    values (
        v_request.company_id,
        auth.uid(),
        v_actor_email,
        v_actor.id,
        coalesce(
            v_actor.role,
            case when public.is_platform_admin() then 'platform_admin' else 'homeowner' end
        ),
        'service_request_media_viewed',
        'service_request',
        v_request.id,
        null,
        jsonb_build_object(
            'property_id', v_request.property_id,
            'attachment_count', v_attachment_count,
            'access_scope', case
                when v_actor.id is null and public.is_platform_admin() then 'platform_admin'
                when v_actor.id is null then 'homeowner'
                else 'assigned_or_company_authorized'
            end
        )
    );

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

commit;
