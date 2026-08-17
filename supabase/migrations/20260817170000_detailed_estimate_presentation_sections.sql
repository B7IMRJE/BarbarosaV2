-- Add a reusable, server-sanitized checklist architecture to homeowner
-- presentation snapshots. The source remains the technician-approved estimate
-- choice snapshot; internal pricing, costs, margins, notes, and raw answers are
-- never copied into the public payload.

begin;

do $$
begin
    if to_regclass('public.company_estimate_presentation_sessions') is null
       or to_regclass('public.company_estimate_options') is null then
        raise exception 'Secure presentation sessions and estimate options are required.';
    end if;
end;
$$;

create or replace function public.estimate_presentation_public_sections(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_sections jsonb := '[]'::jsonb;
    v_items jsonb;
    v_section record;
    v_item record;
    v_section_id text;
    v_section_title text;
    v_section_description text;
    v_item_id text;
    v_item_title text;
    v_item_detail text;
    v_status text;
    v_sensitive_text text;
begin
    for v_section in
        select entry.value, entry.ordinality
        from jsonb_array_elements(
            case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end
        ) with ordinality as entry(value, ordinality)
        where entry.ordinality <= 7
        order by entry.ordinality
    loop
        v_section_id := lower(btrim(coalesce(v_section.value->>'id', '')));

        if v_section_id not in (
            'product',
            'protection',
            'process',
            'included_components',
            'conditions_exclusions',
            'verification',
            'documentation'
        ) then
            continue;
        end if;

        v_section_title := case v_section_id
            when 'product' then 'Selected Product'
            when 'protection' then 'Home Protection'
            when 'process' then 'Installation Process'
            when 'included_components' then 'Included Components'
            when 'conditions_exclusions' then 'Conditions & Exclusions'
            when 'verification' then 'Verification'
            when 'documentation' then 'Documentation'
        end;
        v_section_description := case v_section_id
            when 'product' then 'Only product facts selected or verified for this estimate are shown.'
            when 'protection' then 'How the work path and installation area will be prepared and protected.'
            when 'process' then 'The planned sequence for the selected base installation.'
            when 'included_components' then 'Selected company Price Book lines and explicitly confirmed installation components.'
            when 'conditions_exclusions' then 'Unknown or additional work remains separate until it is selected, priced, and authorized.'
            when 'verification' then 'Checks performed before the installation is presented as complete.'
            when 'documentation' then 'Job evidence retained with the estimate and completion record.'
        end;

        v_items := '[]'::jsonb;
        for v_item in
            select item_entry.value, item_entry.ordinality
            from jsonb_array_elements(
                case when jsonb_typeof(v_section.value->'items') = 'array'
                    then v_section.value->'items'
                    else '[]'::jsonb
                end
            ) with ordinality as item_entry(value, ordinality)
            where item_entry.ordinality <= 24
            order by item_entry.ordinality
        loop
            v_item_id := left(btrim(coalesce(v_item.value->>'id', '')), 120);
            v_item_title := left(btrim(coalesce(v_item.value->>'title', '')), 300);
            v_item_detail := left(nullif(btrim(coalesce(v_item.value->>'detail', '')), ''), 700);
            v_status := lower(btrim(coalesce(v_item.value->>'status', 'documented')));
            v_sensitive_text := lower(concat_ws(' ', v_item_title, v_item_detail));

            if nullif(v_item_id, '') is null or nullif(v_item_title, '') is null then
                continue;
            end if;
            if v_sensitive_text ~ '(^|[^a-z])(internal cost|material cost|labor cost|gross margin|minimum allowed|maximum allowed|markup)([^a-z]|$)' then
                continue;
            end if;
            if v_status not in ('verified', 'included', 'conditional', 'not_included', 'documented') then
                v_status := 'documented';
            end if;

            v_items := v_items || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                'id', v_item_id,
                'title', v_item_title,
                'detail', v_item_detail,
                'status', v_status
            )));
        end loop;

        if jsonb_array_length(v_items) > 0 then
            v_sections := v_sections || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
                'id', v_section_id,
                'title', v_section_title,
                'description', v_section_description,
                'items', v_items
            )));
        end if;
    end loop;

    return v_sections;
end;
$$;

revoke all on function public.estimate_presentation_public_sections(jsonb)
from public, anon, authenticated;

create or replace function public.attach_detailed_estimate_presentation_sections()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_options jsonb;
begin
    select coalesce(jsonb_agg(
        option_entry.value || jsonb_build_object(
            'presentation_sections', public.estimate_presentation_public_sections(coalesce((
                select estimate_option.choice_snapshot->'presentationSections'
                from public.company_estimate_options estimate_option
                where estimate_option.session_id = new.estimate_session_id
                  and estimate_option.source_choice_id = option_entry.value->>'id'
                  and estimate_option.technician_approved
                order by estimate_option.created_at, estimate_option.id
                limit 1
            ), '[]'::jsonb))
        )
        order by option_entry.ordinality
    ), '[]'::jsonb)
    into v_options
    from jsonb_array_elements(
        case when jsonb_typeof(new.public_payload->'options') = 'array'
            then new.public_payload->'options'
            else '[]'::jsonb
        end
    ) with ordinality as option_entry(value, ordinality);

    new.public_payload := jsonb_set(new.public_payload, '{options}', v_options, true);
    return new;
end;
$$;

revoke all on function public.attach_detailed_estimate_presentation_sections()
from public, anon, authenticated;

drop trigger if exists attach_detailed_estimate_presentation_sections_trigger
    on public.company_estimate_presentation_sessions;

create trigger attach_detailed_estimate_presentation_sections_trigger
before insert or update of estimate_session_id, public_payload
on public.company_estimate_presentation_sessions
for each row
execute function public.attach_detailed_estimate_presentation_sections();

update public.company_estimate_presentation_sessions
set public_payload = public_payload;

commit;
