begin;

do $$
begin
    if to_regprocedure('public.complete_company_job_workflow_from_techos(uuid,uuid)') is null then
        raise exception 'TechOS completion-signature handoff function is missing';
    end if;
end
$$;

rollback;
