begin;

create or replace function public.get_company_operations_events(
    p_company_id uuid,
    p_room_id uuid,
    p_start_at timestamptz,
    p_end_at timestamptz
)
returns table(
    id uuid, company_id uuid, subject_company_user_id uuid, actor_company_user_id uuid,
    actor_name text, event_type text, title text, detail text, service_request_id uuid,
    schedule_slot_id uuid, workflow_id uuid, display_code text, source_kind text,
    source_id uuid, media_bucket text, media_storage_path text, media_mime_type text,
    media_file_name text, metadata jsonb, occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_room public.company_operations_rooms%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    if not (public.can_dispatch_company(p_company_id) or public.homeos_is_platform_admin()) then
        raise exception 'Company operations access is required.';
    end if;
    if p_end_at <= p_start_at or p_end_at - p_start_at > interval '93 days' then
        raise exception 'Choose a valid date range of 93 days or fewer.';
    end if;
    select * into v_room from public.company_operations_rooms
     where company_operations_rooms.id = p_room_id
       and company_operations_rooms.company_id = p_company_id
       and is_active;
    if not found then raise exception 'Operations Room not found.'; end if;

    return query
    select event.id, event.company_id, event.subject_company_user_id, event.actor_company_user_id,
           event.actor_name, event.event_type, event.title, event.detail, event.service_request_id,
           event.schedule_slot_id, event.workflow_id, request.display_code, event.source_kind,
           event.source_id, event.media_bucket, event.media_storage_path, event.media_mime_type,
           event.media_file_name, event.metadata, event.occurred_at
    from public.company_operations_events as event
    left join public.service_requests as request on request.id = event.service_request_id
    where event.company_id = p_company_id
      and event.occurred_at >= p_start_at
      and event.occurred_at < p_end_at
      and (
          event.target_room_id = p_room_id
          or (
              event.target_room_id is null
              and (
                  v_room.is_default
                  or exists (
                      select 1
                      from public.company_operations_room_members as member
                      where member.room_id = p_room_id
                        and member.company_user_id = event.subject_company_user_id
                  )
              )
          )
      )
    order by event.occurred_at desc, event.id desc
    limit 1000;
end;
$$;

revoke all on function public.get_company_operations_events(uuid,uuid,timestamptz,timestamptz) from public, anon;
grant execute on function public.get_company_operations_events(uuid,uuid,timestamptz,timestamptz) to authenticated;

commit;
