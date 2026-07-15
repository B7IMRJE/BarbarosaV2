begin;

do $$
begin
    if to_regclass('public.company_estimate_option_sessions') is null then
        raise exception 'public.company_estimate_option_sessions is required before estimate requirement capture can be installed.';
    end if;

    if to_regclass('public.company_estimate_option_answers') is null then
        raise exception 'public.company_estimate_option_answers is required before estimate requirement capture can be installed.';
    end if;
end;
$$;

create or replace function public.estimate_option_session_can_capture(
    p_session_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session public.company_estimate_option_sessions%rowtype;
begin
    if auth.uid() is null or p_session_id is null then
        return false;
    end if;

    select session.*
    into v_session
    from public.company_estimate_option_sessions as session
    where session.id = p_session_id;

    if not found then
        return false;
    end if;

    if lower(btrim(coalesce(v_session.status, ''))) not in ('draft', 'technician_review') then
        return false;
    end if;

    return public.company_estimate_session_context_can_use(
        v_session.company_id,
        v_session.property_id,
        v_session.service_request_id,
        v_session.schedule_slot_id,
        v_session.job_id,
        v_session.home_item_id
    );
end;
$$;

revoke all on function public.estimate_option_session_can_capture(uuid) from public;
revoke all on function public.estimate_option_session_can_capture(uuid) from anon;
grant execute on function public.estimate_option_session_can_capture(uuid) to authenticated;

create or replace function public.get_estimate_option_answers_for_draft(
    p_session_id uuid
)
returns table (
    question_id text,
    answer jsonb,
    updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if not public.estimate_option_session_can_capture(p_session_id) then
        raise exception 'Not authorized to read estimate requirement answers.';
    end if;

    return query
    select
        answer_row.question_id,
        answer_row.answer,
        answer_row.updated_at
    from public.company_estimate_option_answers as answer_row
    where answer_row.session_id = p_session_id
    order by answer_row.updated_at asc, answer_row.question_id asc;
end;
$$;

revoke all on function public.get_estimate_option_answers_for_draft(uuid) from public;
revoke all on function public.get_estimate_option_answers_for_draft(uuid) from anon;
grant execute on function public.get_estimate_option_answers_for_draft(uuid) to authenticated;

create or replace function public.upsert_estimate_option_answer_for_draft(
    p_session_id uuid,
    p_question_id text,
    p_answer jsonb
)
returns table (
    id uuid,
    question_id text,
    answer jsonb,
    updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session public.company_estimate_option_sessions%rowtype;
    v_question_id text := btrim(coalesce(p_question_id, ''));
    v_answer jsonb := coalesce(p_answer, 'null'::jsonb);
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    if v_question_id = '' then
        raise exception 'Requirement question id is required.';
    end if;

    select session.*
    into v_session
    from public.company_estimate_option_sessions as session
    where session.id = p_session_id;

    if not found or not public.estimate_option_session_can_capture(p_session_id) then
        raise exception 'Not authorized to save estimate requirement answers.';
    end if;

    return query
    insert into public.company_estimate_option_answers (
        session_id,
        company_id,
        question_id,
        answer,
        updated_at
    )
    values (
        v_session.id,
        v_session.company_id,
        v_question_id,
        v_answer,
        now()
    )
    on conflict (session_id, question_id) do update
        set answer = excluded.answer,
            updated_at = now()
    returning
        company_estimate_option_answers.id,
        company_estimate_option_answers.question_id,
        company_estimate_option_answers.answer,
        company_estimate_option_answers.updated_at;
end;
$$;

revoke all on function public.upsert_estimate_option_answer_for_draft(uuid, text, jsonb) from public;
revoke all on function public.upsert_estimate_option_answer_for_draft(uuid, text, jsonb) from anon;
grant execute on function public.upsert_estimate_option_answer_for_draft(uuid, text, jsonb) to authenticated;

create or replace function public.delete_estimate_option_answer_for_draft(
    p_session_id uuid,
    p_question_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_question_id text := btrim(coalesce(p_question_id, ''));
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    if v_question_id = '' then
        raise exception 'Requirement question id is required.';
    end if;

    if not public.estimate_option_session_can_capture(p_session_id) then
        raise exception 'Not authorized to remove estimate requirement answers.';
    end if;

    delete from public.company_estimate_option_answers as answer_row
    where answer_row.session_id = p_session_id
      and answer_row.question_id = v_question_id;

    return true;
end;
$$;

revoke all on function public.delete_estimate_option_answer_for_draft(uuid, text) from public;
revoke all on function public.delete_estimate_option_answer_for_draft(uuid, text) from anon;
grant execute on function public.delete_estimate_option_answer_for_draft(uuid, text) to authenticated;

insert into storage.buckets (id, name, public)
values ('estimate-requirement-files', 'estimate-requirement-files', false)
on conflict (id) do update
set public = false;

create or replace function public.estimate_requirement_storage_can_access(
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
    v_session_id uuid;
    v_session public.company_estimate_option_sessions%rowtype;
begin
    v_parts := storage.foldername(p_object_name);

    if coalesce(array_length(v_parts, 1), 0) < 4 then
        return false;
    end if;

    begin
        v_company_id := v_parts[1]::uuid;
        v_session_id := v_parts[2]::uuid;
    exception
        when invalid_text_representation then
            return false;
    end;

    select session.*
    into v_session
    from public.company_estimate_option_sessions as session
    where session.id = v_session_id
      and session.company_id = v_company_id;

    if not found then
        return false;
    end if;

    return public.estimate_option_session_can_capture(v_session.id);
end;
$$;

revoke all on function public.estimate_requirement_storage_can_access(text) from public;
revoke all on function public.estimate_requirement_storage_can_access(text) from anon;
grant execute on function public.estimate_requirement_storage_can_access(text) to authenticated;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'estimate_requirement_files_select'
    ) then
        create policy estimate_requirement_files_select
            on storage.objects
            for select
            to authenticated
            using (
                bucket_id = 'estimate-requirement-files'
                and public.estimate_requirement_storage_can_access(name)
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'estimate_requirement_files_insert'
    ) then
        create policy estimate_requirement_files_insert
            on storage.objects
            for insert
            to authenticated
            with check (
                bucket_id = 'estimate-requirement-files'
                and public.estimate_requirement_storage_can_access(name)
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'estimate_requirement_files_update'
    ) then
        create policy estimate_requirement_files_update
            on storage.objects
            for update
            to authenticated
            using (
                bucket_id = 'estimate-requirement-files'
                and public.estimate_requirement_storage_can_access(name)
            )
            with check (
                bucket_id = 'estimate-requirement-files'
                and public.estimate_requirement_storage_can_access(name)
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and policyname = 'estimate_requirement_files_delete'
    ) then
        create policy estimate_requirement_files_delete
            on storage.objects
            for delete
            to authenticated
            using (
                bucket_id = 'estimate-requirement-files'
                and public.estimate_requirement_storage_can_access(name)
            );
    end if;
end;
$$;

commit;
