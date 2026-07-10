-- Let assigned TechOS technicians update only their own schedule-slot workflow
-- status. This does not grant Dispatch access or permission to edit schedule,
-- company, request, job, or technician assignment fields.

begin;

do $$
begin
    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before TechOS workflow status RLS can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before TechOS workflow status RLS can be installed.';
    end if;
end;
$$;

alter table public.job_schedule_slots enable row level security;

alter table public.job_schedule_slots
    drop constraint if exists job_schedule_slots_status_check;

alter table public.job_schedule_slots
    add constraint job_schedule_slots_status_check
    check (
        lower(btrim(status)) in (
            'tentative',
            'scheduled',
            'dispatched',
            'on_my_way',
            'arrived',
            'in_progress',
            'estimate_needed',
            'completed',
            'cancelled',
            'canceled',
            'archived'
        )
    ) not valid;

grant select on table public.job_schedule_slots to authenticated;
grant update (status) on table public.job_schedule_slots to authenticated;

drop policy if exists job_schedule_slots_assigned_technician_status_update on public.job_schedule_slots;
create policy job_schedule_slots_assigned_technician_status_update
on public.job_schedule_slots
for update
to authenticated
using (
    exists (
        select 1
        from public.company_users as company_user
        where company_user.id = job_schedule_slots.technician_company_user_id
          and company_user.company_id = job_schedule_slots.company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
          and lower(btrim(coalesce(company_user.role, ''))) in (
              'technician',
              'tech',
              'field_tech',
              'field-tech',
              'field technician'
          )
    )
)
with check (
    lower(btrim(status)) in (
        'on_my_way',
        'arrived',
        'in_progress',
        'estimate_needed',
        'completed'
    )
    and exists (
        select 1
        from public.company_users as company_user
        where company_user.id = job_schedule_slots.technician_company_user_id
          and company_user.company_id = job_schedule_slots.company_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
          and lower(btrim(coalesce(company_user.role, ''))) in (
              'technician',
              'tech',
              'field_tech',
              'field-tech',
              'field technician'
          )
    )
);

commit;
