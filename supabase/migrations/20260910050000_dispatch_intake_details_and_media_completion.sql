-- Keep explicit photo removals across polling, reloads, and the final collection.
alter table public.service_request_media_handoff_items add column discarded_at timestamptz;
create function public.discard_my_service_request_phone_media(p_item_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare h uuid;
begin
 select m.handoff_id into h from public.service_request_media_handoff_items m
 join public.service_request_media_handoffs s on s.id=m.handoff_id where m.id=p_item_id and s.created_by_user_id=auth.uid();
 if h is null then raise exception 'This phone photo is not available to your account'; end if;
 perform 1 from public.service_request_media_handoffs where id=h for update;
 update public.service_request_media_handoff_items set discarded_at=coalesce(discarded_at,now()) where id=p_item_id;
end $$;
revoke all on function public.discard_my_service_request_phone_media(uuid) from public,anon;
grant execute on function public.discard_my_service_request_phone_media(uuid) to authenticated;

-- Office detail access persists when an intake becomes a numbered request.
create function public.get_company_customer_intake(p_company_id uuid, p_intake_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.uid() is null or not (public.can_dispatch_company(p_company_id) or public.can_create_company_customer_invites(p_company_id)) then
  raise exception 'Not authorized to view this company lead';
 end if;
 return (select jsonb_build_object(
  'id',i.id,'company_id',i.company_id,'customer_kind',i.customer_kind,'service_reason',i.service_reason,'urgency',i.urgency,
  'customer_summary',i.customer_summary,'address_hint',i.address_hint,'previous_work_reference',i.previous_work_reference,
  'property_id',i.property_id,'service_request_id',i.service_request_id,'display_code',r.display_code,'request_status',r.status,
  'invited_name',v.invited_name,'invited_email',v.invited_email,'invited_phone',v.invited_phone,'confirmed_contact',i.confirmed_contact,
  'customer_issue',coalesce(nullif(r.issue_summary,''),i.customer_draft->>'issue'),'customer_location',i.customer_draft->>'location',
  'office_note',v.note,'invitation_status',case when v.status='pending' and v.expires_at<=now() then 'expired' else v.status end,
  'property_name',p.name,'service_address',coalesce(nullif(p.address,''),nullif(concat_ws(', ',p.address_line_1,p.city,p.state,p.postal_code),'')),
  'started_at',i.started_at,'contact_confirmed_at',i.contact_confirmed_at,'submitted_at',i.submitted_at,
  'media_completed_at',i.media_completed_at,'cancelled_at',i.cancelled_at,
  'can_close',public.can_dispatch_company(p_company_id) and i.cancelled_at is null and i.service_request_id is null
 ) from public.company_customer_intakes i
 join public.company_customer_invitations v on v.id=i.invitation_id
 left join public.properties p on p.id=i.property_id
 left join public.service_requests r on r.id=i.service_request_id
 where i.company_id=p_company_id and i.id=p_intake_id);
end $$;
revoke all on function public.get_company_customer_intake(uuid,uuid) from public,anon;
grant execute on function public.get_company_customer_intake(uuid,uuid) to authenticated;

-- Seal every saved phone link before collecting its uploads, including after a reload.
-- Taking the same row locks as phone uploads makes the final collection consistent.
create function public.seal_my_service_request_media_handoffs(p_handoff_ids uuid[])
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Sign in to finish phone photos'; end if;
 if exists(select 1 from unnest(p_handoff_ids) as requested(handoff_id) where not exists (
  select 1 from public.service_request_media_handoffs h where h.id=requested.handoff_id and h.created_by_user_id=auth.uid()
 )) then raise exception 'This phone link is not available to your account'; end if;
 perform 1 from public.service_request_media_handoffs where id=any(p_handoff_ids) order by id for update;
 update public.service_request_media_handoffs set closed_at=coalesce(closed_at,now()) where id=any(p_handoff_ids) and created_by_user_id=auth.uid();
end $$;
revoke all on function public.seal_my_service_request_media_handoffs(uuid[]) from public,anon;
grant execute on function public.seal_my_service_request_media_handoffs(uuid[]) to authenticated;

create or replace function public.finish_my_customer_intake(p_intake_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare v jsonb; ids uuid[];
begin
 v:=public.get_my_customer_intake(null,p_intake_id);
 if v is null or v->>'service_request_id' is null then raise exception 'Submit your request first'; end if;
 select phone_handoff_ids into ids from public.company_customer_intakes where id=p_intake_id for update;
 perform public.seal_my_service_request_media_handoffs(ids);
 if exists(select 1 from public.service_request_media_handoff_items m where m.handoff_id=any(ids) and m.discarded_at is null and not exists(
  select 1 from public.service_request_attachments a where a.id=m.id and a.service_request_id=(v->>'service_request_id')::uuid and a.deleted_at is null
 )) then raise exception 'Your request is saved, but phone photos still need to attach. Retry to finish uploading them'; end if;
 update public.company_customer_intakes set media_completed_at=coalesce(media_completed_at,now()) where id=p_intake_id;
end $$;

-- Explain excluded accounts without adding inactive staff to the assignment roster.
create function public.get_company_unavailable_dispatch_members(p_company_id uuid)
returns table(id uuid,full_name text,role text,status text)
language plpgsql stable security definer set search_path=pg_catalog,public,pg_temp as $$
begin
 if auth.uid() is null or not public.can_dispatch_company_operations(p_company_id) then raise exception 'Not authorized to view this company roster'; end if;
 return query select u.id,u.full_name,u.role,u.status from public.company_users u where u.company_id=p_company_id
 and lower(trim(coalesce(u.status,'')))<>'active'
 and lower(trim(u.role)) in ('technician','tech','field_tech','field-tech','field technician','sales') order by u.full_name;
end $$;
revoke all on function public.get_company_unavailable_dispatch_members(uuid) from public,anon;
grant execute on function public.get_company_unavailable_dispatch_members(uuid) to authenticated;

-- Serialize phone uploads with request completion.
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
    select * into v_handoff from public.service_request_media_handoffs h where h.id=p_handoff_id for update;
    if v_handoff.token_hash is distinct from encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') or v_handoff.closed_at is not null or v_handoff.expires_at<=now() then raise exception 'This phone link has closed. Return to the request to add more photos'; end if;
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


notify pgrst,'reload schema';
