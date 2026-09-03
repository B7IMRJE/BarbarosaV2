begin;

do $$
declare
    v_save_definition text;
    v_get_definition text;
begin
    if to_regclass('public.home_service_reviews') is null
       or to_regprocedure('public.save_verified_home_service_review(uuid,text,integer,jsonb,text[],text,uuid)') is null
       or to_regprocedure('public.get_verified_home_service_reviews_for_request(uuid)') is null then
        raise exception 'Verified home-service review storage or RPCs are missing.';
    end if;

    select pg_get_functiondef('public.save_verified_home_service_review(uuid,text,integer,jsonb,text[],text,uuid)'::regprocedure)
    into v_save_definition;

    if v_save_definition not ilike '%homeos_can_read_property_record%'
       or v_save_definition not ilike '%Reviews are available after the service visit is completed%'
       or v_save_definition not ilike '%p_star_rating not between 1 and 5%'
       or v_save_definition not ilike '%v_target not in (''technician'', ''company'')%'
       or v_save_definition not ilike '%job_schedule_slots%' then
        raise exception 'Review saves must verify the homeowner, completed work, rating range, target, and assigned technician.';
    end if;

    select pg_get_functiondef('public.get_verified_home_service_reviews_for_request(uuid)'::regprocedure)
    into v_get_definition;

    if v_get_definition not ilike '%homeos_can_read_property_record%'
       or v_get_definition not ilike '%review.created_by_user_id = auth.uid()%' then
        raise exception 'Review reads must stay scoped to the homeowner and the selected service request.';
    end if;

    if not has_function_privilege('authenticated', 'public.save_verified_home_service_review(uuid,text,integer,jsonb,text[],text,uuid)', 'execute')
       or not has_function_privilege('authenticated', 'public.get_verified_home_service_reviews_for_request(uuid)', 'execute') then
        raise exception 'Authenticated homeowners must be able to use the verified review RPCs.';
    end if;
end;
$$;

rollback;
