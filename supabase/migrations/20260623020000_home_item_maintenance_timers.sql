begin;

create table if not exists public.home_item_maintenance_tasks (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    property_id uuid not null references public.properties(id) on delete cascade,
    home_item_id uuid not null references public.home_items(id) on delete cascade,
    item_slug text null,
    system text null,
    task_key text null,
    title text not null,
    description text null,
    recurrence_interval integer not null default 1,
    recurrence_unit text not null default 'years',
    start_date date null,
    last_completed_date date null,
    next_due_date date not null,
    reminder_status text not null default 'active',
    notes text null,
    created_by uuid null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint home_item_maintenance_tasks_recurrence_interval_check
        check (recurrence_interval > 0),
    constraint home_item_maintenance_tasks_recurrence_unit_check
        check (recurrence_unit in ('days', 'weeks', 'months', 'years')),
    constraint home_item_maintenance_tasks_reminder_status_check
        check (reminder_status in ('active', 'paused', 'archived'))
);

create table if not exists public.home_item_maintenance_completions (
    id uuid primary key default gen_random_uuid(),
    maintenance_task_id uuid not null references public.home_item_maintenance_tasks(id) on delete cascade,
    user_id uuid not null,
    property_id uuid not null references public.properties(id) on delete cascade,
    home_item_id uuid not null references public.home_items(id) on delete cascade,
    completed_on date not null default current_date,
    notes text null,
    photo_urls text[] not null default '{}',
    document_urls text[] not null default '{}',
    created_by uuid null,
    created_at timestamptz not null default now()
);

create index if not exists home_item_maintenance_tasks_property_id_idx
    on public.home_item_maintenance_tasks (property_id);

create index if not exists home_item_maintenance_tasks_home_item_id_idx
    on public.home_item_maintenance_tasks (home_item_id);

create index if not exists home_item_maintenance_tasks_next_due_date_idx
    on public.home_item_maintenance_tasks (next_due_date);

create index if not exists home_item_maintenance_tasks_property_due_idx
    on public.home_item_maintenance_tasks (property_id, next_due_date);

create index if not exists home_item_maintenance_tasks_property_status_idx
    on public.home_item_maintenance_tasks (property_id, reminder_status);

create index if not exists home_item_maintenance_tasks_home_item_task_key_idx
    on public.home_item_maintenance_tasks (home_item_id, task_key)
    where task_key is not null;

create index if not exists home_item_maintenance_completions_task_id_idx
    on public.home_item_maintenance_completions (maintenance_task_id);

create index if not exists home_item_maintenance_completions_property_id_idx
    on public.home_item_maintenance_completions (property_id);

create index if not exists home_item_maintenance_completions_home_item_id_idx
    on public.home_item_maintenance_completions (home_item_id);

create index if not exists home_item_maintenance_completions_completed_on_idx
    on public.home_item_maintenance_completions (completed_on);

create index if not exists home_item_maintenance_completions_property_completed_idx
    on public.home_item_maintenance_completions (property_id, completed_on);

create or replace function public.set_home_item_maintenance_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_home_item_maintenance_tasks_updated_at
    on public.home_item_maintenance_tasks;

create trigger set_home_item_maintenance_tasks_updated_at
    before update on public.home_item_maintenance_tasks
    for each row
    execute function public.set_home_item_maintenance_updated_at();

alter table public.home_item_maintenance_tasks enable row level security;
alter table public.home_item_maintenance_completions enable row level security;

do $$
begin
    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'home_item_maintenance_tasks'
          and policyname = 'home_item_maintenance_tasks_select_active_property'
    ) then
        create policy home_item_maintenance_tasks_select_active_property
            on public.home_item_maintenance_tasks
            for select
            to authenticated
            using (
                exists (
                    select 1
                    from public.property_memberships as membership
                    where membership.property_id = home_item_maintenance_tasks.property_id
                      and membership.user_id = auth.uid()
                      and membership.status = 'active'
                )
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'home_item_maintenance_tasks'
          and policyname = 'home_item_maintenance_tasks_insert_active_property'
    ) then
        create policy home_item_maintenance_tasks_insert_active_property
            on public.home_item_maintenance_tasks
            for insert
            to authenticated
            with check (
                user_id = auth.uid()
                and exists (
                    select 1
                    from public.property_memberships as membership
                    where membership.property_id = home_item_maintenance_tasks.property_id
                      and membership.user_id = auth.uid()
                      and membership.status = 'active'
                )
                and exists (
                    select 1
                    from public.home_items as item
                    where item.id = home_item_maintenance_tasks.home_item_id
                      and item.property_id = home_item_maintenance_tasks.property_id
                )
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'home_item_maintenance_tasks'
          and policyname = 'home_item_maintenance_tasks_update_active_property'
    ) then
        create policy home_item_maintenance_tasks_update_active_property
            on public.home_item_maintenance_tasks
            for update
            to authenticated
            using (
                exists (
                    select 1
                    from public.property_memberships as membership
                    where membership.property_id = home_item_maintenance_tasks.property_id
                      and membership.user_id = auth.uid()
                      and membership.status = 'active'
                )
            )
            with check (
                exists (
                    select 1
                    from public.property_memberships as membership
                    where membership.property_id = home_item_maintenance_tasks.property_id
                      and membership.user_id = auth.uid()
                      and membership.status = 'active'
                )
                and exists (
                    select 1
                    from public.home_items as item
                    where item.id = home_item_maintenance_tasks.home_item_id
                      and item.property_id = home_item_maintenance_tasks.property_id
                )
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'home_item_maintenance_tasks'
          and policyname = 'home_item_maintenance_tasks_delete_active_property'
    ) then
        create policy home_item_maintenance_tasks_delete_active_property
            on public.home_item_maintenance_tasks
            for delete
            to authenticated
            using (
                exists (
                    select 1
                    from public.property_memberships as membership
                    where membership.property_id = home_item_maintenance_tasks.property_id
                      and membership.user_id = auth.uid()
                      and membership.status = 'active'
                )
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'home_item_maintenance_completions'
          and policyname = 'home_item_maintenance_completions_select_active_property'
    ) then
        create policy home_item_maintenance_completions_select_active_property
            on public.home_item_maintenance_completions
            for select
            to authenticated
            using (
                exists (
                    select 1
                    from public.property_memberships as membership
                    where membership.property_id = home_item_maintenance_completions.property_id
                      and membership.user_id = auth.uid()
                      and membership.status = 'active'
                )
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'home_item_maintenance_completions'
          and policyname = 'home_item_maintenance_completions_insert_active_property'
    ) then
        create policy home_item_maintenance_completions_insert_active_property
            on public.home_item_maintenance_completions
            for insert
            to authenticated
            with check (
                user_id = auth.uid()
                and exists (
                    select 1
                    from public.property_memberships as membership
                    where membership.property_id = home_item_maintenance_completions.property_id
                      and membership.user_id = auth.uid()
                      and membership.status = 'active'
                )
                and exists (
                    select 1
                    from public.home_item_maintenance_tasks as task
                    where task.id = home_item_maintenance_completions.maintenance_task_id
                      and task.property_id = home_item_maintenance_completions.property_id
                      and task.home_item_id = home_item_maintenance_completions.home_item_id
                )
                and exists (
                    select 1
                    from public.home_items as item
                    where item.id = home_item_maintenance_completions.home_item_id
                      and item.property_id = home_item_maintenance_completions.property_id
                )
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'home_item_maintenance_completions'
          and policyname = 'home_item_maintenance_completions_update_active_property'
    ) then
        create policy home_item_maintenance_completions_update_active_property
            on public.home_item_maintenance_completions
            for update
            to authenticated
            using (
                exists (
                    select 1
                    from public.property_memberships as membership
                    where membership.property_id = home_item_maintenance_completions.property_id
                      and membership.user_id = auth.uid()
                      and membership.status = 'active'
                )
            )
            with check (
                exists (
                    select 1
                    from public.property_memberships as membership
                    where membership.property_id = home_item_maintenance_completions.property_id
                      and membership.user_id = auth.uid()
                      and membership.status = 'active'
                )
                and exists (
                    select 1
                    from public.home_item_maintenance_tasks as task
                    where task.id = home_item_maintenance_completions.maintenance_task_id
                      and task.property_id = home_item_maintenance_completions.property_id
                      and task.home_item_id = home_item_maintenance_completions.home_item_id
                )
                and exists (
                    select 1
                    from public.home_items as item
                    where item.id = home_item_maintenance_completions.home_item_id
                      and item.property_id = home_item_maintenance_completions.property_id
                )
            );
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'home_item_maintenance_completions'
          and policyname = 'home_item_maintenance_completions_delete_active_property'
    ) then
        create policy home_item_maintenance_completions_delete_active_property
            on public.home_item_maintenance_completions
            for delete
            to authenticated
            using (
                exists (
                    select 1
                    from public.property_memberships as membership
                    where membership.property_id = home_item_maintenance_completions.property_id
                      and membership.user_id = auth.uid()
                      and membership.status = 'active'
                )
            );
    end if;
end
$$;

commit;

select table_name, row_count
from (
    select
        'home_item_maintenance_tasks'::text as table_name,
        count(*)::bigint as row_count
    from public.home_item_maintenance_tasks

    union all

    select
        'home_item_maintenance_completions'::text as table_name,
        count(*)::bigint as row_count
    from public.home_item_maintenance_completions
) as maintenance_summary
order by table_name;
