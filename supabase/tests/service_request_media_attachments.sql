-- Rollback-only verification for service request media attachment artifacts.
-- Run against a local/reset database after migrations are applied.

begin;

do $$
begin
    if to_regclass('public.service_request_attachments') is null then
        raise exception 'service_request_attachments table is missing.';
    end if;

    if to_regprocedure('public.service_request_media_can_access(uuid)') is null then
        raise exception 'service_request_media_can_access(uuid) is missing.';
    end if;

    if to_regprocedure('public.service_request_media_storage_can_access(text)') is null then
        raise exception 'service_request_media_storage_can_access(text) is missing.';
    end if;

    if to_regprocedure('public.get_service_request_attachments(uuid)') is null then
        raise exception 'get_service_request_attachments(uuid) is missing.';
    end if;

    if to_regprocedure('public.save_service_request_attachment(uuid,uuid,text,text,text,bigint,integer,text,integer)') is null then
        raise exception 'save_service_request_attachment(...) is missing.';
    end if;

    if to_regprocedure('public.delete_service_request_attachment(uuid)') is null then
        raise exception 'delete_service_request_attachment(uuid) is missing.';
    end if;

    if not exists (
        select 1
        from storage.buckets
        where id = 'service-request-media'
          and public = false
    ) then
        raise exception 'service-request-media bucket is missing or public.';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.service_request_attachments'::regclass
          and conname = 'service_request_attachments_mime_type_check'
    ) then
        raise exception 'MIME type constraint is missing.';
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'service_request_attachments'
          and policyname = 'service_request_attachments_select'
    ) then
        raise exception 'service request attachment select policy is missing.';
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'service_request_media_insert'
    ) then
        raise exception 'service request media storage insert policy is missing.';
    end if;
end;
$$;

rollback;
