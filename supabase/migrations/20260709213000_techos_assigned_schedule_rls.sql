-- Allow TechOS technicians to read only schedule slots assigned to their own
-- company_users row, without granting full Dispatch access.

begin;

do $$
begin
    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before TechOS assigned schedule RLS can be installed.';
    end if;

    if to_regclass('public.service_requests') is null then
        raise exception 'public.service_requests is required before TechOS assigned request RLS can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before TechOS assigned schedule RLS can be installed.';
    end if;
end;
$$;

alter table public.job_schedule_slots enable row level security;
alter table public.service_requests enable row level security;

grant select on table public.job_schedule_slots to authenticated;
grant select on table public.service_requests to authenticated;

drop policy if exists job_schedule_slots_assigned_technician_select on public.job_schedule_slots;
create policy job_schedule_slots_assigned_technician_select
on public.job_schedule_slots
for select
to authenticated
using (
    exists (
        select 1
        from public.company_users as company_user
        where company_user.id = job_schedule_slots.technician_company_user_id
          and company_user.company_id = job_schedule_slots.company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    )
);

drop policy if exists service_requests_assigned_technician_select on public.service_requests;
create policy service_requests_assigned_technician_select
on public.service_requests
for select
to authenticated
using (
    exists (
        select 1
        from public.job_schedule_slots as slot
        join public.company_users as company_user
          on company_user.id = slot.technician_company_user_id
         and company_user.company_id = slot.company_id
        where slot.service_request_id = service_requests.id
          and slot.company_id = service_requests.company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    )
);

commit;
