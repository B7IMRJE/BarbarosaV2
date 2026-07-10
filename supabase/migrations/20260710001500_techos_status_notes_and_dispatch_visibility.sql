-- Add technician-visible field status notes for TechOS/Dispatch visibility.
-- This keeps technician write access narrow: assigned techs can update only
-- their own schedule-slot status and field status note.

begin;

do $$
begin
    if to_regclass('public.job_schedule_slots') is null then
        raise exception 'public.job_schedule_slots is required before TechOS status notes can be installed.';
    end if;

    if to_regclass('public.company_users') is null then
        raise exception 'public.company_users is required before TechOS status notes can be installed.';
    end if;
end;
$$;

alter table public.job_schedule_slots
    add column if not exists tech_status_note text;

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
            'running_late',
            'available',
            'custom',
            'cancelled',
            'canceled',
            'archived'
        )
    ) not valid;

alter table public.job_schedule_slots
    drop constraint if exists job_schedule_slots_tech_status_note_length;

alter table public.job_schedule_slots
    add constraint job_schedule_slots_tech_status_note_length
    check (char_length(coalesce(tech_status_note, '')) <= 500)
    not valid;

grant select on table public.job_schedule_slots to authenticated;
grant update (status, tech_status_note) on table public.job_schedule_slots to authenticated;

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
        'completed',
        'running_late',
        'available',
        'custom'
    )
    and char_length(coalesce(tech_status_note, '')) <= 500
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
