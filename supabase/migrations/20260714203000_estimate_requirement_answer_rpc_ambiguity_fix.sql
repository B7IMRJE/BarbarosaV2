begin;

do $$
begin
    if to_regclass('public.company_estimate_option_answers') is null then
        raise exception 'public.company_estimate_option_answers is required before estimate requirement answer RPCs can be repaired.';
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'company_estimate_option_answers_session_id_question_id_key'
          and conrelid = 'public.company_estimate_option_answers'::regclass
    ) then
        raise exception 'company_estimate_option_answers_session_id_question_id_key is required before estimate requirement answer RPCs can be repaired.';
    end if;
end;
$$;

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
    v_answer_value jsonb := coalesce(p_answer, 'null'::jsonb);
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    if v_question_id = '' then
        raise exception 'Requirement question id is required.';
    end if;

    select session_row.*
    into v_session
    from public.company_estimate_option_sessions as session_row
    where session_row.id = p_session_id;

    if not found or not public.estimate_option_session_can_capture(p_session_id) then
        raise exception 'Not authorized to save estimate requirement answers.';
    end if;

    return query
    insert into public.company_estimate_option_answers as saved_answer (
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
        v_answer_value,
        now()
    )
    on conflict on constraint company_estimate_option_answers_session_id_question_id_key do update
        set answer = excluded.answer,
            updated_at = now()
    returning
        saved_answer.id,
        saved_answer.question_id,
        saved_answer.answer,
        saved_answer.updated_at;
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

commit;
