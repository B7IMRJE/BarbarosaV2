-- Preserve the estimate service type in the public presentation payload even
-- when staff hides the quote number and price summary. This lets the public
-- surface render service-specific homeowner education without exposing staff
-- context or adding any unselected scope.

begin;

do $$
begin
    if to_regclass('public.company_estimate_presentation_sessions') is null
       or to_regclass('public.company_estimate_option_sessions') is null then
        raise exception 'Secure presentation and estimate sessions are required.';
    end if;
end;
$$;

create or replace function public.attach_estimate_presentation_service_type()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_service_type text;
begin
    select nullif(btrim(coalesce(session.category, '')), '')
    into v_service_type
    from public.company_estimate_option_sessions session
    where session.id = new.estimate_session_id;

    if v_service_type is null then
        new.public_payload := new.public_payload - 'service_type';
    else
        new.public_payload := jsonb_set(
            new.public_payload,
            '{service_type}',
            to_jsonb(left(v_service_type, 120)),
            true
        );
    end if;

    return new;
end;
$$;

revoke all on function public.attach_estimate_presentation_service_type()
from public, anon, authenticated;

drop trigger if exists attach_estimate_presentation_service_type_trigger
    on public.company_estimate_presentation_sessions;

create trigger attach_estimate_presentation_service_type_trigger
before insert or update of estimate_session_id, public_payload
on public.company_estimate_presentation_sessions
for each row
execute function public.attach_estimate_presentation_service_type();

update public.company_estimate_presentation_sessions presentation
set public_payload = presentation.public_payload
where coalesce(presentation.public_payload->>'service_type', '') is distinct from coalesce((
    select session.category
    from public.company_estimate_option_sessions session
    where session.id = presentation.estimate_session_id
), '');

commit;
