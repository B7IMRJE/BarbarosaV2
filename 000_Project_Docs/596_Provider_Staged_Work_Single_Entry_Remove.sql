-- 596_Provider_Staged_Work_Single_Entry_Remove.sql
-- Review-only proposal. Do not run automatically.
--
-- Goal:
-- - Let provider-mode UI remove one staged provider work entry at a time.
-- - Removal means status = rejected; it does not delete homeowner HomeOS data.
-- - Storage object cleanup is handled by the app only for provider-staged paths.

do $$
begin
    if to_regclass('public.company_provider_staged_work') is null then
        raise exception 'public.company_provider_staged_work is required before installing single-entry staged work removal.';
    end if;

    if to_regprocedure('public.can_access_provider_staged_work(uuid, uuid)') is null then
        raise exception 'public.can_access_provider_staged_work(uuid, uuid) is required before installing single-entry staged work removal.';
    end if;
end $$;

create or replace function public.reject_provider_staged_work_entry(
    p_staged_work_id uuid,
    p_company_id uuid,
    p_property_id uuid
)
returns table (
    id uuid,
    status text
)
language plpgsql
security definer
set search_path = public
as $function$
#variable_conflict use_column
begin
    if auth.uid() is null then
        raise exception 'Sign in to remove provider staged work.';
    end if;

    if not public.can_access_provider_staged_work(p_company_id, p_property_id) then
        raise exception 'You do not have provider staging access for this client home.';
    end if;

    return query
    update public.company_provider_staged_work staged_work
    set
        status = 'rejected',
        updated_at = now()
    where staged_work.id = p_staged_work_id
      and staged_work.company_id = p_company_id
      and staged_work.property_id = p_property_id
      and staged_work.status in ('draft', 'staged')
    returning
        staged_work.id,
        staged_work.status;

    if not found then
        raise exception 'Provider staged work entry could not be found or is not removable.';
    end if;
end;
$function$;

revoke all on function public.reject_provider_staged_work_entry(uuid, uuid, uuid) from public;
revoke all on function public.reject_provider_staged_work_entry(uuid, uuid, uuid) from anon;
grant execute on function public.reject_provider_staged_work_entry(uuid, uuid, uuid) to authenticated;

-- App behavior:
-- - Provider-mode photo tile Remove calls reject_provider_staged_work_entry when installed.
-- - Until this RPC is installed, the app falls back to the existing RLS-guarded
--   update on public.company_provider_staged_work.status.
-- - Homeowner permanent HomeOS files and home_item_files are not modified.
