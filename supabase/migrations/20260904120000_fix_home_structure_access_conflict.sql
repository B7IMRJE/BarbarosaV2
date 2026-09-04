-- Forward-only repair: the RETURNS TABLE property_id variable must not be
-- resolved as the INSERT conflict target. Keep the existing owner-only API.
begin;

create or replace function public.update_my_home_structure_access(
    p_property_id uuid,
    p_story_count text,
    p_gate_code text
)
returns table (property_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_user_id uuid := auth.uid();
    v_story_count text := nullif(btrim(coalesce(p_story_count, '')), '');
    v_gate_code text := nullif(btrim(coalesce(p_gate_code, '')), '');
begin
    if v_user_id is null then
        raise exception 'Authentication required' using errcode = '28000';
    end if;

    if not exists (
        select 1
        from public.property_memberships as membership
        where membership.property_id = p_property_id
          and membership.user_id = v_user_id
          and upper(btrim(coalesce(membership.role, ''))) = 'OWNER'
          and lower(btrim(coalesce(membership.status, ''))) = 'active'
    ) then
        raise exception 'Not authorized to update this home access record' using errcode = '42501';
    end if;

    if v_story_count is null
       or v_story_count not in ('1', '2', '3', '4', '4_plus') then
        raise exception 'Story count is invalid' using errcode = '22023';
    end if;

    if char_length(coalesce(v_gate_code, '')) > 80 then
        raise exception 'Gate code is too long' using errcode = '22023';
    end if;

    update public.properties as property
    set homeowner_story_count = v_story_count,
        homeowner_profile_updated_at = now(),
        homeowner_profile_updated_by = v_user_id
    where property.id = p_property_id;

    insert into public.property_access_details as access_detail (
        property_id, gate_code, updated_at, updated_by
    )
    values (p_property_id, v_gate_code, now(), v_user_id)
    on conflict on constraint property_access_details_pkey
    do update set
        gate_code = excluded.gate_code,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

    return query select p_property_id;
end;
$$;

revoke all on function public.update_my_home_structure_access(uuid, text, text) from public, anon;
grant execute on function public.update_my_home_structure_access(uuid, text, text) to authenticated;
notify pgrst, 'reload schema';
commit;
