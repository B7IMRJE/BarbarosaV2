-- Secure, short-lived homeowner presentation and signature sessions.
-- The public surface receives only server-curated estimate fields and explicitly
-- selected homeowner-visible product photos. It never exposes staff sessions,
-- private notes, costs, margins, property navigation, or client-wide data.

begin;

create extension if not exists pgcrypto with schema extensions;

do $$
begin
    if to_regclass('public.company_estimate_option_sessions') is null
       or to_regclass('public.company_estimate_options') is null
       or to_regclass('public.company_approved_products') is null
       or to_regclass('public.company_product_media') is null then
        raise exception 'Estimate sessions, saved options, approved products, and product media are required.';
    end if;
    if to_regprocedure('public.company_estimate_session_context_can_use(uuid,uuid,uuid,uuid,uuid,uuid)') is null
       or to_regprocedure('public.company_estimate_options_can_use(uuid)') is null then
        raise exception 'Estimate authorization functions are required.';
    end if;
end;
$$;

create table public.company_estimate_presentation_sessions (
    id uuid primary key default gen_random_uuid(),
    estimate_session_id uuid not null references public.company_estimate_option_sessions(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    created_by_company_user_id uuid references public.company_users(id) on delete set null,
    status text not null default 'active'
        check (status in ('active', 'signed', 'ended', 'revoked', 'expired')),
    join_code_digest text not null unique,
    share_token_digest text not null unique,
    public_payload jsonb not null default '{}'::jsonb
        check (jsonb_typeof(public_payload) = 'object'),
    payload_version integer not null default 1 check (payload_version > 0),
    signature_requested boolean not null default false,
    signer_name text,
    signature_data jsonb,
    expires_at timestamptz not null,
    joined_at timestamptz,
    signed_at timestamptz,
    ended_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_estimate_presentation_expiry_check check (expires_at > created_at),
    constraint company_estimate_presentation_signature_object_check check (
        signature_data is null or jsonb_typeof(signature_data) = 'object'
    )
);

create unique index company_estimate_presentation_one_active_idx
    on public.company_estimate_presentation_sessions(estimate_session_id)
    where status = 'active';
create index company_estimate_presentation_staff_idx
    on public.company_estimate_presentation_sessions(company_id, estimate_session_id, created_at desc);
create index company_estimate_presentation_expiry_idx
    on public.company_estimate_presentation_sessions(status, expires_at)
    where status = 'active';

create table public.company_estimate_presentation_viewers (
    id uuid primary key default gen_random_uuid(),
    presentation_session_id uuid not null references public.company_estimate_presentation_sessions(id) on delete cascade,
    viewer_token_digest text not null unique,
    joined_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    signed_at timestamptz,
    revoked_at timestamptz
);

create index company_estimate_presentation_viewers_session_idx
    on public.company_estimate_presentation_viewers(presentation_session_id, joined_at desc);

create table public.company_estimate_presentation_events (
    id uuid primary key default gen_random_uuid(),
    presentation_session_id uuid not null references public.company_estimate_presentation_sessions(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    actor_type text not null check (actor_type in ('staff', 'viewer', 'system')),
    event_type text not null check (event_type in (
        'created', 'updated', 'joined', 'viewed', 'signed', 'ended', 'revoked', 'expired'
    )),
    metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
    happened_at timestamptz not null default now()
);

create index company_estimate_presentation_events_audit_idx
    on public.company_estimate_presentation_events(presentation_session_id, happened_at, id);

alter table public.company_estimate_presentation_sessions enable row level security;
alter table public.company_estimate_presentation_viewers enable row level security;
alter table public.company_estimate_presentation_events enable row level security;

revoke all on table public.company_estimate_presentation_sessions from public, anon, authenticated;
revoke all on table public.company_estimate_presentation_viewers from public, anon, authenticated;
revoke all on table public.company_estimate_presentation_events from public, anon, authenticated;

create or replace function public.estimate_presentation_secret_digest(p_secret text)
returns text
language sql
immutable
set search_path = pg_catalog, extensions, pg_temp
as $$
    select encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex');
$$;

create or replace function public.estimate_presentation_public_text_array(
    p_value jsonb,
    p_max_items integer default 24,
    p_max_length integer default 300
)
returns jsonb
language sql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
    select coalesce(jsonb_agg(to_jsonb(left(btrim(entry.value), greatest(1, least(p_max_length, 2000)))) order by entry.ordinality), '[]'::jsonb)
    from jsonb_array_elements_text(
        case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end
    ) with ordinality as entry(value, ordinality)
    where entry.ordinality <= greatest(1, least(p_max_items, 50))
      and nullif(btrim(entry.value), '') is not null;
$$;

create or replace function public.company_estimate_presentation_can_manage(p_estimate_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and exists (
           select 1
           from public.company_estimate_option_sessions session
           where session.id = p_estimate_session_id
             and public.company_estimate_options_can_use(session.company_id)
             and public.company_estimate_session_context_can_use(
                 session.company_id,
                 session.property_id,
                 session.service_request_id,
                 session.schedule_slot_id,
                 session.job_id,
                 session.home_item_id
             )
       );
$$;

create or replace function public.build_estimate_presentation_public_payload(
    p_estimate_session_id uuid,
    p_selected_choice_ids text[],
    p_media_ids uuid[],
    p_include_estimate_summary boolean,
    p_signature_requested boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session public.company_estimate_option_sessions%rowtype;
    v_selected_ids text[];
    v_requested_media_ids uuid[];
    v_options jsonb;
    v_media jsonb;
    v_expected_count integer;
    v_actual_count integer;
    v_expected_media_count integer;
    v_actual_media_count integer;
    v_company_name text;
begin
    select session.* into v_session
    from public.company_estimate_option_sessions session
    where session.id = p_estimate_session_id;

    if not found or not public.company_estimate_presentation_can_manage(v_session.id) then
        raise exception 'Estimate session is unavailable or not authorized.';
    end if;
    if v_session.technician_approved_at is null then
        raise exception 'Technician approval is required before presentation.';
    end if;

    select array_agg(choice_id order by choice_id)
    into v_selected_ids
    from (
        select distinct btrim(choice_id) as choice_id
        from unnest(coalesce(p_selected_choice_ids, array[]::text[])) choice_id
        where nullif(btrim(choice_id), '') is not null
    ) selected;

    v_expected_count := coalesce(cardinality(v_selected_ids), 0);
    if v_expected_count < 1 or v_expected_count > 6 then
        raise exception 'Select between one and six approved estimate options.';
    end if;

    select count(*), coalesce(jsonb_agg(
        jsonb_build_object(
            'id', option_row.source_choice_id,
            'title', left(option_row.title, 180),
            'short_summary', left(coalesce(option_row.short_summary, ''), 500),
            'homeowner_explanation', left(coalesce(option_row.homeowner_explanation, ''), 2400),
            'key_benefits', public.estimate_presentation_public_text_array(option_row.key_benefits, 12, 240),
            'customer_selections', public.estimate_presentation_public_text_array(option_row.choice_snapshot->'customerSelections', 30, 360),
            'total_amount', case when coalesce(p_include_estimate_summary, true) then option_row.deterministic_total else null end,
            'recommended', option_row.recommended,
            'display_order', option_row.display_order
        ) order by option_row.display_order, option_row.created_at, option_row.id
    ), '[]'::jsonb)
    into v_actual_count, v_options
    from public.company_estimate_options option_row
    where option_row.session_id = v_session.id
      and option_row.source_choice_id = any(v_selected_ids)
      and option_row.technician_approved;

    if v_actual_count <> v_expected_count then
        raise exception 'Every selected option must belong to the technician-approved estimate set.';
    end if;

    select array_agg(media_id order by media_id)
    into v_requested_media_ids
    from (
        select distinct media_id
        from unnest(coalesce(p_media_ids, array[]::uuid[])) media_id
        where media_id is not null
    ) requested;
    v_expected_media_count := coalesce(cardinality(v_requested_media_ids), 0);
    if v_expected_media_count > 12 then
        raise exception 'Select no more than twelve approved presentation photos.';
    end if;

    select count(*), coalesce(jsonb_agg(
        jsonb_build_object(
            'id', media.id,
            'title', left(coalesce(nullif(btrim(media.alt_text), ''), nullif(btrim(media.file_name), ''), product.product_name, product.brand || ' ' || product.model, 'Approved product photo'), 180),
            'product_name', left(coalesce(nullif(btrim(product.product_name), ''), product.brand || ' ' || product.model), 180)
        ) order by media.created_at, media.id
    ), '[]'::jsonb)
    into v_actual_media_count, v_media
    from public.company_product_media media
    join public.company_approved_products product
      on product.id = media.product_id
     and product.company_id = v_session.company_id
    where media.id = any(coalesce(v_requested_media_ids, array[]::uuid[]))
      and media.company_id = v_session.company_id
      and media.active
      and media.homeowner_visible
      and media.media_kind = 'photo'
      and product.active
      and product.approved
      and product.catalog_status = 'approved'
      and exists (
          select 1
          from public.company_estimate_options selected_option
          cross join lateral jsonb_array_elements_text(
              case when jsonb_typeof(selected_option.choice_snapshot->'productIds') = 'array'
                  then selected_option.choice_snapshot->'productIds'
                  else '[]'::jsonb
              end
          ) product_id(value)
          where selected_option.session_id = v_session.id
            and selected_option.source_choice_id = any(v_selected_ids)
            and product_id.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and product_id.value::uuid = product.id
      );

    if v_actual_media_count <> v_expected_media_count then
        raise exception 'Every photo must be homeowner-visible and belong to a selected approved product.';
    end if;

    select left(coalesce(nullif(btrim(company.name), ''), 'Your service company'), 160)
    into v_company_name
    from public.companies company
    where company.id = v_session.company_id;

    return jsonb_build_object(
        'version', 1,
        'company_name', v_company_name,
        'estimate', case when coalesce(p_include_estimate_summary, true) then jsonb_build_object(
            'quote_number', v_session.quote_number,
            'category', left(coalesce(v_session.category, ''), 120),
            'option_count', v_actual_count
        ) else null end,
        'include_estimate_summary', coalesce(p_include_estimate_summary, true),
        'signature_requested', coalesce(p_signature_requested, false),
        'options', v_options,
        'media', v_media
    );
end;
$$;

create or replace function public.create_estimate_presentation_session(
    p_estimate_session_id uuid,
    p_selected_choice_ids text[],
    p_media_ids uuid[] default array[]::uuid[],
    p_include_estimate_summary boolean default true,
    p_signature_requested boolean default true,
    p_expires_minutes integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
    v_session public.company_estimate_option_sessions%rowtype;
    v_company_user_id uuid;
    v_plain_code text;
    v_plain_share_token text;
    v_payload jsonb;
    v_presentation public.company_estimate_presentation_sessions%rowtype;
    v_expires_minutes integer := greatest(5, least(coalesce(p_expires_minutes, 30), 60));
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;

    select session.* into v_session
    from public.company_estimate_option_sessions session
    where session.id = p_estimate_session_id
    for update;
    if not found or not public.company_estimate_presentation_can_manage(v_session.id) then
        raise exception 'Estimate session is unavailable or not authorized.';
    end if;

    v_payload := public.build_estimate_presentation_public_payload(
        v_session.id,
        p_selected_choice_ids,
        p_media_ids,
        p_include_estimate_summary,
        p_signature_requested
    );

    select company_user.id into v_company_user_id
    from public.company_users company_user
    where company_user.company_id = v_session.company_id
      and company_user.auth_user_id = auth.uid()
      and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    order by company_user.created_at, company_user.id
    limit 1;

    update public.company_estimate_presentation_sessions presentation
    set status = 'revoked', revoked_at = now(), updated_at = now()
    where presentation.estimate_session_id = v_session.id
      and presentation.status = 'active';

    loop
        v_plain_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
        exit when not exists (
            select 1 from public.company_estimate_presentation_sessions existing
            where existing.join_code_digest = public.estimate_presentation_secret_digest(v_plain_code)
        );
    end loop;
    v_plain_share_token := encode(extensions.gen_random_bytes(24), 'hex');

    insert into public.company_estimate_presentation_sessions(
        estimate_session_id, company_id, created_by_company_user_id,
        join_code_digest, share_token_digest, public_payload,
        signature_requested, expires_at
    ) values (
        v_session.id, v_session.company_id, v_company_user_id,
        public.estimate_presentation_secret_digest(v_plain_code),
        public.estimate_presentation_secret_digest(v_plain_share_token),
        v_payload, coalesce(p_signature_requested, false), now() + make_interval(mins => v_expires_minutes)
    ) returning * into v_presentation;

    insert into public.company_estimate_presentation_events(
        presentation_session_id, company_id, actor_type, event_type, metadata
    ) values (
        v_presentation.id, v_presentation.company_id, 'staff', 'created',
        jsonb_build_object(
            'payload_version', v_presentation.payload_version,
            'expires_at', v_presentation.expires_at,
            'signature_requested', v_presentation.signature_requested
        )
    );

    return jsonb_build_object(
        'id', v_presentation.id,
        'join_code', substr(v_plain_code, 1, 4) || '-' || substr(v_plain_code, 5, 4),
        'share_token', v_plain_share_token,
        'expires_at', v_presentation.expires_at,
        'payload_version', v_presentation.payload_version,
        'status', v_presentation.status
    );
end;
$$;

create or replace function public.get_estimate_presentation_media_candidates(
    p_estimate_session_id uuid,
    p_selected_choice_ids text[]
)
returns table(id uuid, title text, product_name text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session public.company_estimate_option_sessions%rowtype;
    v_selected_ids text[];
begin
    select session.* into v_session
    from public.company_estimate_option_sessions session
    where session.id = p_estimate_session_id;
    if not found or not public.company_estimate_presentation_can_manage(v_session.id) then
        raise exception 'Estimate session is unavailable or not authorized.';
    end if;

    select array_agg(choice_id order by choice_id) into v_selected_ids
    from (
        select distinct btrim(choice_id) as choice_id
        from unnest(coalesce(p_selected_choice_ids, array[]::text[])) choice_id
        where nullif(btrim(choice_id), '') is not null
    ) selected;
    if coalesce(cardinality(v_selected_ids), 0) = 0 then return; end if;

    return query
    select media.id,
        left(coalesce(nullif(btrim(media.alt_text), ''), nullif(btrim(media.file_name), ''), product.product_name, product.brand || ' ' || product.model, 'Approved product photo'), 180),
        left(coalesce(nullif(btrim(product.product_name), ''), product.brand || ' ' || product.model), 180)
    from public.company_product_media media
    join public.company_approved_products product
      on product.id = media.product_id
     and product.company_id = v_session.company_id
    where media.company_id = v_session.company_id
      and media.active
      and media.homeowner_visible
      and media.media_kind = 'photo'
      and product.active
      and product.approved
      and product.catalog_status = 'approved'
      and exists (
          select 1
          from public.company_estimate_options selected_option
          cross join lateral jsonb_array_elements_text(
              case when jsonb_typeof(selected_option.choice_snapshot->'productIds') = 'array'
                  then selected_option.choice_snapshot->'productIds'
                  else '[]'::jsonb
              end
          ) product_id(value)
          where selected_option.session_id = v_session.id
            and selected_option.source_choice_id = any(v_selected_ids)
            and product_id.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and product_id.value::uuid = product.id
      )
    order by product.product_name, media.created_at, media.id;
end;
$$;

create or replace function public.update_estimate_presentation_session(
    p_presentation_session_id uuid,
    p_selected_choice_ids text[],
    p_media_ids uuid[] default array[]::uuid[],
    p_include_estimate_summary boolean default true,
    p_signature_requested boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_presentation public.company_estimate_presentation_sessions%rowtype;
    v_payload jsonb;
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    select presentation.* into v_presentation
    from public.company_estimate_presentation_sessions presentation
    where presentation.id = p_presentation_session_id
    for update;
    if not found or not public.company_estimate_presentation_can_manage(v_presentation.estimate_session_id) then
        raise exception 'Presentation session is unavailable or not authorized.';
    end if;
    if v_presentation.status <> 'active' or v_presentation.expires_at <= now() then
        raise exception 'Only an active presentation session can be updated.';
    end if;

    v_payload := public.build_estimate_presentation_public_payload(
        v_presentation.estimate_session_id,
        p_selected_choice_ids,
        p_media_ids,
        p_include_estimate_summary,
        p_signature_requested
    );

    update public.company_estimate_presentation_sessions presentation
    set public_payload = v_payload,
        payload_version = presentation.payload_version + 1,
        signature_requested = coalesce(p_signature_requested, false),
        updated_at = now()
    where presentation.id = v_presentation.id
    returning * into v_presentation;

    insert into public.company_estimate_presentation_events(
        presentation_session_id, company_id, actor_type, event_type, metadata
    ) values (
        v_presentation.id, v_presentation.company_id, 'staff', 'updated',
        jsonb_build_object('payload_version', v_presentation.payload_version)
    );

    return jsonb_build_object(
        'id', v_presentation.id,
        'status', v_presentation.status,
        'expires_at', v_presentation.expires_at,
        'payload_version', v_presentation.payload_version
    );
end;
$$;

create or replace function public.end_estimate_presentation_session(
    p_presentation_session_id uuid,
    p_action text default 'ended'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_presentation public.company_estimate_presentation_sessions%rowtype;
    v_action text := lower(btrim(coalesce(p_action, 'ended')));
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    if v_action not in ('ended', 'revoked') then raise exception 'Action must be ended or revoked.'; end if;
    select presentation.* into v_presentation
    from public.company_estimate_presentation_sessions presentation
    where presentation.id = p_presentation_session_id
    for update;
    if not found or not public.company_estimate_presentation_can_manage(v_presentation.estimate_session_id) then
        raise exception 'Presentation session is unavailable or not authorized.';
    end if;

    update public.company_estimate_presentation_sessions presentation
    set status = v_action,
        ended_at = case when v_action = 'ended' then now() else presentation.ended_at end,
        revoked_at = case when v_action = 'revoked' then now() else presentation.revoked_at end,
        updated_at = now()
    where presentation.id = v_presentation.id
      and presentation.status in ('active', 'signed')
    returning * into v_presentation;

    update public.company_estimate_presentation_viewers viewer
    set revoked_at = coalesce(viewer.revoked_at, now())
    where viewer.presentation_session_id = p_presentation_session_id;

    insert into public.company_estimate_presentation_events(
        presentation_session_id, company_id, actor_type, event_type, metadata
    ) values (v_presentation.id, v_presentation.company_id, 'staff', v_action, '{}'::jsonb);

    return jsonb_build_object('id', v_presentation.id, 'status', v_presentation.status);
end;
$$;

create or replace function public.get_estimate_presentation_session_status(p_estimate_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_presentation public.company_estimate_presentation_sessions%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated.'; end if;
    if not public.company_estimate_presentation_can_manage(p_estimate_session_id) then
        raise exception 'Estimate session is unavailable or not authorized.';
    end if;

    select presentation.* into v_presentation
    from public.company_estimate_presentation_sessions presentation
    where presentation.estimate_session_id = p_estimate_session_id
    order by presentation.created_at desc, presentation.id desc
    limit 1;
    if not found then return null; end if;

    if v_presentation.status = 'active' and v_presentation.expires_at <= now() then
        update public.company_estimate_presentation_sessions presentation
        set status = 'expired', updated_at = now()
        where presentation.id = v_presentation.id
        returning * into v_presentation;
    end if;

    return jsonb_build_object(
        'id', v_presentation.id,
        'status', v_presentation.status,
        'expires_at', v_presentation.expires_at,
        'joined_at', v_presentation.joined_at,
        'signed_at', v_presentation.signed_at,
        'signer_name', v_presentation.signer_name,
        'payload_version', v_presentation.payload_version,
        'signature_requested', v_presentation.signature_requested,
        'public_payload', v_presentation.public_payload
    );
end;
$$;

create or replace function public.join_estimate_presentation_session(
    p_secret text,
    p_viewer_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $$
declare
    v_raw_secret text := btrim(coalesce(p_secret, ''));
    v_code_secret text := upper(regexp_replace(btrim(coalesce(p_secret, '')), '[^A-Za-z0-9]', '', 'g'));
    v_presentation public.company_estimate_presentation_sessions%rowtype;
    v_viewer_token text;
    v_viewer public.company_estimate_presentation_viewers%rowtype;
begin
    if length(v_raw_secret) < 8 or length(v_raw_secret) > 96 then
        raise exception 'Presentation code or link is invalid.';
    end if;

    select presentation.* into v_presentation
    from public.company_estimate_presentation_sessions presentation
    where presentation.status = 'active'
      and presentation.expires_at > now()
      and (
          presentation.share_token_digest = public.estimate_presentation_secret_digest(v_raw_secret)
          or presentation.join_code_digest = public.estimate_presentation_secret_digest(v_code_secret)
      )
    order by presentation.created_at desc
    limit 1
    for update;

    if not found then
        raise exception 'Presentation code is invalid, expired, or revoked.';
    end if;

    v_viewer_token := encode(extensions.gen_random_bytes(24), 'hex');
    insert into public.company_estimate_presentation_viewers(
        presentation_session_id, viewer_token_digest
    ) values (
        v_presentation.id, public.estimate_presentation_secret_digest(v_viewer_token)
    ) returning * into v_viewer;

    update public.company_estimate_presentation_sessions presentation
    set joined_at = coalesce(presentation.joined_at, now()), updated_at = now()
    where presentation.id = v_presentation.id;

    insert into public.company_estimate_presentation_events(
        presentation_session_id, company_id, actor_type, event_type, metadata
    ) values (
        v_presentation.id, v_presentation.company_id, 'viewer', 'joined',
        jsonb_build_object('viewer_id', v_viewer.id, 'viewer_agent', left(coalesce(p_viewer_agent, ''), 240))
    );

    return jsonb_build_object(
        'viewer_token', v_viewer_token,
        'session_id', v_presentation.id,
        'status', v_presentation.status,
        'expires_at', v_presentation.expires_at,
        'payload_version', v_presentation.payload_version,
        'payload', v_presentation.public_payload
    );
end;
$$;

create or replace function public.get_joined_estimate_presentation(p_viewer_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_presentation public.company_estimate_presentation_sessions%rowtype;
    v_viewer public.company_estimate_presentation_viewers%rowtype;
begin
    select viewer.* into v_viewer
    from public.company_estimate_presentation_viewers viewer
    where viewer.viewer_token_digest = public.estimate_presentation_secret_digest(btrim(coalesce(p_viewer_token, '')))
      and viewer.revoked_at is null
    limit 1;

    if not found then
        raise exception 'Presentation session is unavailable, expired, or revoked.';
    end if;

    select presentation.* into v_presentation
    from public.company_estimate_presentation_sessions presentation
    where presentation.id = v_viewer.presentation_session_id;

    if not found or v_presentation.status not in ('active', 'signed') or v_presentation.expires_at <= now() then
        raise exception 'Presentation session is unavailable, expired, or revoked.';
    end if;

    update public.company_estimate_presentation_viewers viewer
    set last_seen_at = now()
    where viewer.id = v_viewer.id;

    return jsonb_build_object(
        'session_id', v_presentation.id,
        'status', v_presentation.status,
        'expires_at', v_presentation.expires_at,
        'payload_version', v_presentation.payload_version,
        'signed_at', v_presentation.signed_at,
        'payload', v_presentation.public_payload
    );
end;
$$;

create or replace function public.sign_joined_estimate_presentation(
    p_viewer_token text,
    p_signer_name text,
    p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_presentation public.company_estimate_presentation_sessions%rowtype;
    v_viewer public.company_estimate_presentation_viewers%rowtype;
    v_signature jsonb;
    v_invalid_points integer;
begin
    select viewer.* into v_viewer
    from public.company_estimate_presentation_viewers viewer
    where viewer.viewer_token_digest = public.estimate_presentation_secret_digest(btrim(coalesce(p_viewer_token, '')))
      and viewer.revoked_at is null
    limit 1
    for update;

    if not found then
        raise exception 'Presentation session is unavailable, expired, or revoked.';
    end if;

    select presentation.* into v_presentation
    from public.company_estimate_presentation_sessions presentation
    where presentation.id = v_viewer.presentation_session_id
    for update;

    if not found or v_presentation.status <> 'active' or v_presentation.expires_at <= now() then
        raise exception 'Presentation session is unavailable, expired, or revoked.';
    end if;
    if not v_presentation.signature_requested then raise exception 'This presentation does not request a signature.'; end if;
    if nullif(btrim(coalesce(p_signer_name, '')), '') is null or length(btrim(p_signer_name)) > 120 then
        raise exception 'Enter the homeowner name before signing.';
    end if;
    if length(coalesce(p_signature, '')) > 200000 then raise exception 'Signature data is too large.'; end if;

    begin
        v_signature := p_signature::jsonb;
    exception when others then
        raise exception 'Draw a valid signature before submitting.';
    end;
    if jsonb_typeof(v_signature) <> 'object'
       or v_signature->>'version' <> '1'
       or jsonb_typeof(v_signature->'points') <> 'array'
       or jsonb_array_length(v_signature->'points') < 5
       or jsonb_array_length(v_signature->'points') > 1200 then
        raise exception 'Draw a valid signature before submitting.';
    end if;

    select count(*) into v_invalid_points
    from jsonb_array_elements(v_signature->'points') point
    where jsonb_typeof(point) <> 'object'
       or jsonb_typeof(point->'x') <> 'number'
       or jsonb_typeof(point->'y') <> 'number'
       or (point->>'x')::numeric < 0 or (point->>'x')::numeric > 1
       or (point->>'y')::numeric < 0 or (point->>'y')::numeric > 1;
    if v_invalid_points > 0 then raise exception 'Signature contains invalid points.'; end if;

    update public.company_estimate_presentation_sessions presentation
    set status = 'signed',
        signer_name = left(btrim(p_signer_name), 120),
        signature_data = v_signature,
        signed_at = now(),
        updated_at = now()
    where presentation.id = v_presentation.id
    returning * into v_presentation;

    update public.company_estimate_presentation_viewers viewer
    set signed_at = now(), last_seen_at = now()
    where viewer.id = v_viewer.id;

    update public.company_estimate_option_sessions session
    set presented_at = coalesce(session.presented_at, now()), updated_at = now()
    where session.id = v_presentation.estimate_session_id;

    insert into public.company_estimate_presentation_events(
        presentation_session_id, company_id, actor_type, event_type, metadata
    ) values (
        v_presentation.id, v_presentation.company_id, 'viewer', 'signed',
        jsonb_build_object('viewer_id', v_viewer.id, 'signed_at', v_presentation.signed_at)
    );

    return jsonb_build_object(
        'session_id', v_presentation.id,
        'status', v_presentation.status,
        'signed_at', v_presentation.signed_at
    );
end;
$$;

create or replace function public.validate_estimate_presentation_media_access(
    p_viewer_token text,
    p_media_id uuid
)
returns table(bucket text, storage_path text, title text)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_presentation public.company_estimate_presentation_sessions%rowtype;
begin
    select presentation.* into v_presentation
    from public.company_estimate_presentation_viewers viewer
    join public.company_estimate_presentation_sessions presentation
      on presentation.id = viewer.presentation_session_id
    where viewer.viewer_token_digest = public.estimate_presentation_secret_digest(btrim(coalesce(p_viewer_token, '')))
      and viewer.revoked_at is null
      and presentation.status in ('active', 'signed')
      and presentation.expires_at > now()
    limit 1;
    if not found then return; end if;

    return query
    select media.bucket, media.storage_path,
        left(coalesce(nullif(btrim(media.alt_text), ''), nullif(btrim(media.file_name), ''), 'Approved product photo'), 180)
    from public.company_product_media media
    where media.id = p_media_id
      and media.company_id = v_presentation.company_id
      and media.active
      and media.homeowner_visible
      and media.media_kind = 'photo'
      and exists (
          select 1
          from jsonb_array_elements(
              case when jsonb_typeof(v_presentation.public_payload->'media') = 'array'
                  then v_presentation.public_payload->'media'
                  else '[]'::jsonb
              end
          ) selected_media
          where selected_media->>'id' = p_media_id::text
      );
end;
$$;

revoke all on function public.estimate_presentation_secret_digest(text) from public, anon, authenticated;
revoke all on function public.estimate_presentation_public_text_array(jsonb,integer,integer) from public, anon, authenticated;
revoke all on function public.company_estimate_presentation_can_manage(uuid) from public, anon, authenticated;
revoke all on function public.build_estimate_presentation_public_payload(uuid,text[],uuid[],boolean,boolean) from public, anon, authenticated;
revoke all on function public.get_estimate_presentation_media_candidates(uuid,text[]) from public, anon;
revoke all on function public.create_estimate_presentation_session(uuid,text[],uuid[],boolean,boolean,integer) from public, anon;
revoke all on function public.update_estimate_presentation_session(uuid,text[],uuid[],boolean,boolean) from public, anon;
revoke all on function public.end_estimate_presentation_session(uuid,text) from public, anon;
revoke all on function public.get_estimate_presentation_session_status(uuid) from public, anon;
revoke all on function public.join_estimate_presentation_session(text,text) from public;
revoke all on function public.get_joined_estimate_presentation(text) from public;
revoke all on function public.sign_joined_estimate_presentation(text,text,text) from public;
revoke all on function public.validate_estimate_presentation_media_access(text,uuid) from public, anon, authenticated;

grant execute on function public.create_estimate_presentation_session(uuid,text[],uuid[],boolean,boolean,integer) to authenticated;
grant execute on function public.get_estimate_presentation_media_candidates(uuid,text[]) to authenticated;
grant execute on function public.update_estimate_presentation_session(uuid,text[],uuid[],boolean,boolean) to authenticated;
grant execute on function public.end_estimate_presentation_session(uuid,text) to authenticated;
grant execute on function public.get_estimate_presentation_session_status(uuid) to authenticated;
grant execute on function public.join_estimate_presentation_session(text,text) to anon, authenticated;
grant execute on function public.get_joined_estimate_presentation(text) to anon, authenticated;
grant execute on function public.sign_joined_estimate_presentation(text,text,text) to anon, authenticated;
grant execute on function public.validate_estimate_presentation_media_access(text,uuid) to service_role;

commit;
