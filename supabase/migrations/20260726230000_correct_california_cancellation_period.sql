-- Correct the previously configured 30-day company policy. California's
-- standard home-improvement cancellation notice is generally three business
-- days (with other periods/exceptions requiring separate classification).

begin;

update public.company_contract_rules
set jurisdiction_label = 'California standard home-improvement notice',
    cancellation_days = 3,
    cancellation_notice_title = 'Three-Day Right to Cancel',
    cancellation_notice_text = 'You, the buyer, have the right to cancel this contract within three business days. You may cancel by emailing, mailing, faxing, or delivering written notice to the contractor at the contractor address or email shown on the signed agreement before midnight of the third business day after you receive the completed, signed agreement and this notice. Include your name, address, and the date you received the signed agreement. Signing this acknowledgment confirms receipt; it does not waive your cancellation right.',
    requires_homeowner_acknowledgment = true,
    updated_at = now();

alter table public.company_contract_rules
    alter column cancellation_days set default 3,
    alter column jurisdiction_label set default 'California standard home-improvement notice',
    alter column cancellation_notice_title set default 'Three-Day Right to Cancel',
    alter column cancellation_notice_text set default 'You, the buyer, have the right to cancel this contract within three business days. You may cancel by emailing, mailing, faxing, or delivering written notice to the contractor at the contractor address or email shown on the signed agreement before midnight of the third business day after you receive the completed, signed agreement and this notice. Include your name, address, and the date you received the signed agreement. Signing this acknowledgment confirms receipt; it does not waive your cancellation right.';

create or replace function public.company_add_business_days(p_start_date date, p_days integer)
returns date
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_date date := p_start_date;
    v_added integer := 0;
begin
    while v_added < greatest(p_days, 0) loop
        v_date := v_date + 1;
        if extract(isodow from v_date) between 1 and 5 then
            v_added := v_added + 1;
        end if;
    end loop;
    return v_date;
end;
$$;

create or replace function public.enforce_company_job_workflow_cancellation_wait()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_days integer;
    v_first_work_date date;
begin
    if old.status = 'sold' and new.status = 'prework' then
        raise exception 'Immediate start requires a separately validated Service and Repair or emergency-repair exception.';
    end if;

    if old.status = 'sold' and new.status = 'scheduled_later' then
        v_days := coalesce((old.cancellation_rule_snapshot->>'cancellation_days')::integer, 3);
        v_first_work_date := public.company_add_business_days(
            coalesce(old.homeowner_accepted_at, old.sold_at, now())::date,
            v_days
        ) + 1;
        if new.scheduled_for is null or new.scheduled_for::date < v_first_work_date then
            raise exception 'Schedule work after the cancellation period, on or after %.', v_first_work_date;
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists company_job_workflows_enforce_cancellation_wait on public.company_job_workflows;
create trigger company_job_workflows_enforce_cancellation_wait
before update on public.company_job_workflows
for each row execute function public.enforce_company_job_workflow_cancellation_wait();

commit;
