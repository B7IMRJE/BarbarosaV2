-- Safe test-only reset for the signed-in user's single active HomeOS home.
--
-- This intentionally does not delete auth.users or profiles. It deletes rows
-- scoped to the one active property owned by the current authenticated user,
-- then deletes the active property so normal first-home onboarding can run.

create or replace function public.reset_active_home_for_testing(p_confirmation text)
returns table (
    property_id uuid,
    reset_status text,
    message text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
    v_user_id uuid := auth.uid();
    v_property_id uuid;
    v_active_home_count integer;
begin
    if v_user_id is null then
        raise exception 'You must be logged in to reset your active home.';
    end if;

    if btrim(coalesce(p_confirmation, '')) <> 'RESET' then
        raise exception 'Type RESET to confirm this test home reset.';
    end if;

    select count(*)
    into v_active_home_count
    from public.property_memberships as membership
    where membership.user_id = v_user_id
      and lower(btrim(coalesce(membership.status, ''))) = 'active';

    if v_active_home_count = 0 then
        raise exception 'No active HomeOS home was found for this account.';
    end if;

    if v_active_home_count > 1 then
        raise exception 'More than one active HomeOS home was found for this account. Reset stopped for safety.';
    end if;

    select membership.property_id
    into v_property_id
    from public.property_memberships as membership
    where membership.user_id = v_user_id
      and lower(btrim(coalesce(membership.status, ''))) = 'active'
    order by membership.created_at asc, membership.id asc
    limit 1;

    if v_property_id is null then
        raise exception 'Could not resolve the active HomeOS home to reset.';
    end if;

    -- Reset customer invites accepted into this test property so the link can be reused in testing.
    if to_regclass('public.company_customer_invitations') is not null
       and exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'company_customer_invitations'
             and column_name = 'accepted_property_id'
       ) then
        if exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
              and table_name = 'company_customer_invitations'
              and column_name = 'updated_at'
        ) then
            execute '
                update public.company_customer_invitations
                set status = ''pending'',
                    accepted_by_user_id = null,
                    accepted_property_id = null,
                    accepted_at = null,
                    updated_at = now()
                where accepted_property_id = $1'
            using v_property_id;
        else
            execute '
                update public.company_customer_invitations
                set status = ''pending'',
                    accepted_by_user_id = null,
                    accepted_property_id = null,
                    accepted_at = null
                where accepted_property_id = $1'
            using v_property_id;
        end if;
    end if;

    -- Service request and dispatch data.
    if to_regclass('public.service_request_events') is not null then
        execute 'delete from public.service_request_events where property_id = $1'
        using v_property_id;
    end if;

    if to_regclass('public.job_schedule_slots') is not null
       and to_regclass('public.service_requests') is not null then
        execute '
            delete from public.job_schedule_slots
            where service_request_id in (
                select service_request.id
                from public.service_requests as service_request
                where service_request.property_id = $1
            )'
        using v_property_id;
    end if;

    if to_regclass('public.job_schedule_slots') is not null
       and to_regclass('public.jobs') is not null then
        execute '
            delete from public.job_schedule_slots
            where job_id in (
                select job.id
                from public.jobs as job
                where job.property_id = $1
            )'
        using v_property_id;
    end if;

    if to_regclass('public.service_requests') is not null then
        execute 'delete from public.service_requests where property_id = $1'
        using v_property_id;
    end if;

    -- Jobs and job thread data.
    if to_regclass('public.job_assignments') is not null
       and to_regclass('public.jobs') is not null then
        execute '
            delete from public.job_assignments
            where job_id in (
                select job.id
                from public.jobs as job
                where job.property_id = $1
            )'
        using v_property_id;
    end if;

    if to_regclass('public.job_thread_events') is not null then
        execute 'delete from public.job_thread_events where property_id = $1'
        using v_property_id;
    end if;

    if to_regclass('public.jobs') is not null then
        execute 'delete from public.jobs where property_id = $1'
        using v_property_id;
    end if;

    -- HomeOS issue, file, maintenance, and starter item data.
    if to_regclass('public.home_item_maintenance_completions') is not null then
        execute 'delete from public.home_item_maintenance_completions where property_id = $1'
        using v_property_id;
    end if;

    if to_regclass('public.home_item_maintenance_tasks') is not null then
        execute 'delete from public.home_item_maintenance_tasks where property_id = $1'
        using v_property_id;
    end if;

    if to_regclass('public.home_item_files') is not null then
        execute 'delete from public.home_item_files where property_id = $1'
        using v_property_id;
    end if;

    if to_regclass('public.home_item_files') is not null
       and to_regclass('public.home_items') is not null then
        execute '
            delete from public.home_item_files
            where home_item_id in (
                select item.id
                from public.home_items as item
                where item.property_id = $1
            )'
        using v_property_id;
    end if;

    if to_regclass('public.home_emergencies') is not null then
        execute 'delete from public.home_emergencies where property_id = $1'
        using v_property_id;
    end if;

    if to_regclass('public.home_items') is not null then
        execute 'delete from public.home_items where property_id = $1'
        using v_property_id;
    end if;

    -- Company/provider connection data scoped to this property.
    if to_regclass('public.property_preferred_providers') is not null then
        execute 'delete from public.property_preferred_providers where property_id = $1'
        using v_property_id;
    end if;

    if to_regclass('public.company_property_clients') is not null then
        execute 'delete from public.company_property_clients where property_id = $1'
        using v_property_id;
    end if;

    if to_regclass('public.property_connections') is not null then
        execute 'delete from public.property_connections where property_id = $1'
        using v_property_id;
    end if;

    -- Remove memberships for this property, then the property itself.
    delete from public.property_memberships as membership
    where membership.property_id = v_property_id;

    delete from public.properties as property_record
    where property_record.id = v_property_id;

    return query
    select
        v_property_id as property_id,
        'deleted'::text as reset_status,
        'Home reset. Starting fresh...'::text as message;
end;
$function$;

revoke all on function public.reset_active_home_for_testing(text) from public;
revoke all on function public.reset_active_home_for_testing(text) from anon;
grant execute on function public.reset_active_home_for_testing(text) to authenticated;
