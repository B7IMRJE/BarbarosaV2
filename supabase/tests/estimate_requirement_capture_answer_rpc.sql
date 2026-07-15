-- Rollback-only verification for estimate requirement answer RPCs.
-- Run against a local/reset database after migrations are applied.
-- It temporarily replaces the broader session-context authorization helper so
-- this file can focus on answer save/read/replace/delete behavior.

begin;

create or replace function public.estimate_option_session_can_capture(
    p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select p_session_id is not null;
$$;

insert into public.companies (id, name, status)
values ('00000000-0000-0000-0000-00000000c111', 'Estimate Requirement RPC Test', 'ACTIVE')
on conflict (id) do nothing;

insert into public.company_estimate_option_sessions (
    id,
    company_id,
    category,
    status,
    source
)
values (
    '00000000-0000-0000-0000-00000000e111',
    '00000000-0000-0000-0000-00000000c111',
    'faucet_replacement',
    'draft',
    'provider_mode'
)
on conflict (id) do update
set status = excluded.status,
    category = excluded.category,
    source = excluded.source;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a111', true);
set local role authenticated;

do $$
declare
    v_session_id uuid := '00000000-0000-0000-0000-00000000e111';
    v_question_id text := 'photo:Existing faucet';
    v_initial_attachment_id text := '00000000-0000-0000-0000-00000000f111';
    v_replacement_attachment_id text := '00000000-0000-0000-0000-00000000f222';
begin
    perform *
    from public.upsert_estimate_option_answer_for_draft(
        v_session_id,
        v_question_id,
        jsonb_build_object(
            'kind', 'requirement_photo',
            'bucket', 'estimate-requirement-files',
            'storagePath', '00000000-0000-0000-0000-00000000c111/00000000-0000-0000-0000-00000000e111/existing-faucet/00000000-0000-0000-0000-00000000f111/photo.jpg',
            'attachmentId', v_initial_attachment_id,
            'requirementId', 'existing-faucet'
        )
    );

    if not exists (
        select 1
        from public.get_estimate_option_answers_for_draft(v_session_id) as loaded_answer
        where loaded_answer.question_id = v_question_id
          and loaded_answer.answer ->> 'attachmentId' = v_initial_attachment_id
    ) then
        raise exception 'Initial requirement photo answer was not saved and readable.';
    end if;

    perform *
    from public.upsert_estimate_option_answer_for_draft(
        v_session_id,
        v_question_id,
        jsonb_build_object(
            'kind', 'requirement_photo',
            'bucket', 'estimate-requirement-files',
            'storagePath', '00000000-0000-0000-0000-00000000c111/00000000-0000-0000-0000-00000000e111/existing-faucet/00000000-0000-0000-0000-00000000f222/photo.jpg',
            'attachmentId', v_replacement_attachment_id,
            'requirementId', 'existing-faucet'
        )
    );

    if not exists (
        select 1
        from public.get_estimate_option_answers_for_draft(v_session_id) as loaded_answer
        where loaded_answer.question_id = v_question_id
          and loaded_answer.answer ->> 'attachmentId' = v_replacement_attachment_id
    ) then
        raise exception 'Replacement requirement photo answer was not saved and readable.';
    end if;

    if exists (
        select 1
        from public.get_estimate_option_answers_for_draft(v_session_id) as loaded_answer
        where loaded_answer.question_id = v_question_id
          and loaded_answer.answer ->> 'attachmentId' = v_initial_attachment_id
    ) then
        raise exception 'Replacement requirement photo answer left the original attachment as current.';
    end if;

    perform public.delete_estimate_option_answer_for_draft(v_session_id, v_question_id);

    if exists (
        select 1
        from public.get_estimate_option_answers_for_draft(v_session_id) as loaded_answer
        where loaded_answer.question_id = v_question_id
    ) then
        raise exception 'Deleted requirement photo answer was still readable.';
    end if;
end;
$$;

rollback;
