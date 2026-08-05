-- Allow draft option sets to be saved before a presentation choice is selected.

begin;

do $$
begin
    if to_regprocedure('public.save_company_estimate_option_set(uuid,jsonb,text,boolean)') is null then
        raise exception 'save_company_estimate_option_set is required before its null-selection handling can be repaired.';
    end if;
end;
$$;

create or replace function public.save_company_estimate_option_set(
    p_session_id uuid,
    p_options jsonb,
    p_selected_source_choice_id text default null,
    p_technician_approved boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_session public.company_estimate_option_sessions%rowtype;
    v_option jsonb;
    v_source_choice_id text;
    v_selected_source_choice_id text := nullif(btrim(p_selected_source_choice_id), '');
    v_selected_count integer := 0;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated.';
    end if;

    if p_session_id is null or jsonb_typeof(p_options) <> 'array' then
        raise exception 'Estimate session and option array are required.';
    end if;

    select session.*
    into v_session
    from public.company_estimate_option_sessions as session
    where session.id = p_session_id
    for update;

    if not found or not public.company_estimate_session_context_can_use(
        v_session.company_id,
        v_session.property_id,
        v_session.service_request_id,
        v_session.schedule_slot_id,
        v_session.job_id,
        v_session.home_item_id
    ) then
        raise exception 'Estimate session is unavailable or not authorized.';
    end if;

    if not public.company_estimate_options_can_use(v_session.company_id) then
        raise exception 'Not authorized to save this estimate.';
    end if;

    if jsonb_array_length(p_options) = 0 then
        raise exception 'At least one visible option is required.';
    end if;

    delete from public.company_estimate_options
    where session_id = v_session.id;

    for v_option in select value from jsonb_array_elements(p_options)
    loop
        v_source_choice_id := nullif(btrim(v_option->>'id'), '');

        if v_source_choice_id is null
           or nullif(btrim(v_option->>'title'), '') is null
           or coalesce((v_option#>>'{pricingResult,totalAmount}')::numeric, 0) < 0 then
            raise exception 'Every saved option requires an id, title, and valid total.';
        end if;

        insert into public.company_estimate_options (
            session_id,
            company_id,
            source_choice_id,
            kind,
            title,
            short_summary,
            homeowner_explanation,
            key_benefits,
            why_it_differs,
            recommended_reason,
            deterministic_total,
            price_book_snapshot,
            inclusion_ids,
            exclusion_ids,
            display_order,
            recommended,
            technician_approved,
            choice_snapshot,
            price_adjustment_percentage,
            selected_for_presentation,
            updated_at
        )
        values (
            v_session.id,
            v_session.company_id,
            v_source_choice_id,
            case when v_option->>'kind' = 'package' then 'package' else 'individual' end,
            btrim(v_option->>'title'),
            nullif(btrim(v_option->>'shortSummary'), ''),
            nullif(btrim(v_option->>'homeownerExplanation'), ''),
            coalesce(v_option->'keyBenefits', '[]'::jsonb),
            nullif(btrim(v_option->>'whyItDiffers'), ''),
            nullif(btrim(v_option->>'recommendedReason'), ''),
            (v_option#>>'{pricingResult,totalAmount}')::numeric,
            coalesce(v_option#>'{pricingResult,priceBookSnapshot}', '[]'::jsonb),
            array(select jsonb_array_elements_text(coalesce(v_option->'inclusionIds', '[]'::jsonb))),
            array(select jsonb_array_elements_text(coalesce(v_option->'exclusionIds', '[]'::jsonb))),
            coalesce((v_option->>'displayOrder')::integer, 1),
            coalesce((v_option->>'recommended')::boolean, false),
            p_technician_approved,
            v_option,
            coalesce((v_option->>'priceAdjustmentPercentage')::numeric, 0),
            coalesce(v_source_choice_id = v_selected_source_choice_id, false),
            now()
        );
    end loop;

    select count(*)
    into v_selected_count
    from public.company_estimate_options
    where session_id = v_session.id
      and selected_for_presentation;

    if v_selected_source_choice_id is not null and v_selected_count <> 1 then
        raise exception 'Selected option must belong to the visible saved option set.';
    end if;

    update public.company_estimate_option_sessions
    set status = 'technician_review',
        technician_approved_at = case when p_technician_approved then now() else null end,
        updated_at = now()
    where id = v_session.id;

    return jsonb_build_object(
        'session_id', v_session.id,
        'option_count', jsonb_array_length(p_options),
        'selected_source_choice_id', v_selected_source_choice_id,
        'technician_approved', p_technician_approved
    );
end;
$$;

revoke all on function public.save_company_estimate_option_set(uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.save_company_estimate_option_set(uuid, jsonb, text, boolean) to authenticated;

commit;
