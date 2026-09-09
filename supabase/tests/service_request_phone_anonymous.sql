-- Wrap in BEGIN / ROLLBACK. No fixture or upload is retained.
do $$
declare
    fixture uuid;
    token text := encode(extensions.gen_random_bytes(24), 'hex');
    payload jsonb;
    write_allowed boolean;
begin
    insert into public.service_request_media_handoffs(property_id, created_by_user_id, token_hash, context_label)
    select p.id, p.owner_id, encode(extensions.digest(token, 'sha256'), 'hex'), 'Anonymous phone capture test'
    from public.properties p where p.owner_id is not null limit 1 returning id into fixture;
    if fixture is null then raise exception 'A property fixture is required.'; end if;

    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';
    payload := public.get_service_request_media_handoff(fixture, token);
    write_allowed := public.service_request_media_handoff_storage_can_write('handoffs/' || fixture::text || '/' || token || '/photo/photo.jpg');
    if payload->>'context_label' is distinct from 'Anonymous phone capture test' or not write_allowed then
        raise exception 'Valid phone link must support anonymous capture.';
    end if;
    if public.get_service_request_media_handoff(fixture, 'wrong-token') is not null then
        raise exception 'Wrong token exposed a phone handoff.';
    end if;
    if public.service_request_media_handoff_storage_can_write('handoffs/' || fixture::text || '/wrong-token/photo/photo.jpg') then
        raise exception 'Wrong token permits uploading.';
    end if;
    execute 'reset role';
    update public.service_request_media_handoffs set expires_at = now() - interval '1 minute' where id = fixture;
    execute 'set local role anon';
    if public.get_service_request_media_handoff(fixture, token) is not null then
        raise exception 'Expired token exposed a phone handoff.';
    end if;
    if public.service_request_media_handoff_storage_can_write('handoffs/' || fixture::text || '/' || token || '/photo/photo.jpg') then
        raise exception 'Expired token permits uploading.';
    end if;
    execute 'reset role';
end $$;
select 'PASS: valid anonymous phone capture, wrong-token denial, expired-token denial' as result;
