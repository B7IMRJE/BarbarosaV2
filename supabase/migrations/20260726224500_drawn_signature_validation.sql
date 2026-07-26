-- Require newly captured workflow signatures to contain actual drawn stroke
-- points rather than an arbitrary non-empty string.

begin;

create or replace function public.is_company_drawn_signature(p_signature text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_signature jsonb;
begin
    if nullif(btrim(coalesce(p_signature, '')), '') is null then return false; end if;
    begin
        v_signature := p_signature::jsonb;
    exception when others then
        return false;
    end;
    return jsonb_typeof(v_signature->'points') = 'array'
       and jsonb_array_length(v_signature->'points') >= 5;
end;
$$;

create or replace function public.validate_company_job_workflow_drawn_signatures()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if new.cancellation_homeowner_signature is distinct from old.cancellation_homeowner_signature
       and new.cancellation_homeowner_signature is not null
       and not public.is_company_drawn_signature(new.cancellation_homeowner_signature) then
        raise exception 'Draw the cancellation-notice signature in the signature pad.';
    end if;
    if new.homeowner_signature is distinct from old.homeowner_signature
       and new.homeowner_signature is not null
       and not public.is_company_drawn_signature(new.homeowner_signature) then
        raise exception 'Draw the work-approval signature in the signature pad.';
    end if;
    if new.completion_homeowner_signature is distinct from old.completion_homeowner_signature
       and new.completion_homeowner_signature is not null
       and not public.is_company_drawn_signature(new.completion_homeowner_signature) then
        raise exception 'Draw the satisfactory-completion signature in the signature pad.';
    end if;
    return new;
end;
$$;

drop trigger if exists company_job_workflows_validate_drawn_signatures on public.company_job_workflows;
create trigger company_job_workflows_validate_drawn_signatures
before update on public.company_job_workflows
for each row execute function public.validate_company_job_workflow_drawn_signatures();

commit;
