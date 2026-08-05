-- Prevent mutually exclusive equipment and warranty packages from being sold
-- together, even when approval is submitted by a different client.

begin;

create or replace function public.enforce_company_job_workflow_selection_groups()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_conflicting_group text;
begin
    if new.status <> 'sold' then
        return new;
    end if;

    select grouped.selection_group
    into v_conflicting_group
    from (
        select nullif(btrim(option_snapshot->>'selectionGroup'), '') as selection_group
        from jsonb_array_elements(coalesce(new.selected_options_snapshot, '[]'::jsonb)) option_snapshot
    ) grouped
    where grouped.selection_group is not null
    group by grouped.selection_group
    having count(*) > 1
    limit 1;

    if v_conflicting_group is not null then
        raise exception 'Choose only one option from selection group %.', v_conflicting_group;
    end if;

    return new;
end;
$$;

drop trigger if exists company_job_workflows_enforce_selection_groups
    on public.company_job_workflows;

create trigger company_job_workflows_enforce_selection_groups
before insert or update of status, selected_options_snapshot
on public.company_job_workflows
for each row
execute function public.enforce_company_job_workflow_selection_groups();

commit;
