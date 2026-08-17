-- Defense in depth: when staff excludes the estimate summary, customer selling
-- prices are removed from the persisted public payload, not merely hidden by UI.

begin;

create or replace function public.strip_unselected_estimate_presentation_prices()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_options jsonb;
begin
    if coalesce(new.public_payload->>'include_estimate_summary', 'false') <> 'true' then
        select coalesce(jsonb_agg(option_row.value - 'total_amount' order by option_row.ordinality), '[]'::jsonb)
        into v_options
        from jsonb_array_elements(
            case when jsonb_typeof(new.public_payload->'options') = 'array'
                then new.public_payload->'options'
                else '[]'::jsonb
            end
        ) with ordinality as option_row(value, ordinality);

        new.public_payload := jsonb_set(new.public_payload, '{options}', v_options, true);
    end if;

    return new;
end;
$$;

revoke all on function public.strip_unselected_estimate_presentation_prices() from public, anon, authenticated;

drop trigger if exists strip_unselected_estimate_presentation_prices_trigger
    on public.company_estimate_presentation_sessions;

create trigger strip_unselected_estimate_presentation_prices_trigger
before insert or update of public_payload
on public.company_estimate_presentation_sessions
for each row
execute function public.strip_unselected_estimate_presentation_prices();

update public.company_estimate_presentation_sessions
set public_payload = public_payload
where coalesce(public_payload->>'include_estimate_summary', 'false') <> 'true';

commit;
