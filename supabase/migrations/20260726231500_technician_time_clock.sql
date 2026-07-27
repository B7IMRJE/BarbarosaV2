begin;

create table if not exists public.company_technician_time_entries (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    technician_company_user_id uuid not null references public.company_users(id) on delete cascade,
    clocked_in_at timestamptz not null default now(),
    clocked_out_at timestamptz,
    created_by_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint company_technician_time_entries_order_check
        check (clocked_out_at is null or clocked_out_at >= clocked_in_at)
);

create unique index if not exists company_technician_time_entries_open_idx
    on public.company_technician_time_entries(technician_company_user_id)
    where clocked_out_at is null;

create index if not exists company_technician_time_entries_history_idx
    on public.company_technician_time_entries(technician_company_user_id, clocked_in_at desc);

alter table public.company_technician_time_entries enable row level security;

drop policy if exists company_technician_time_entries_own_select on public.company_technician_time_entries;
create policy company_technician_time_entries_own_select
on public.company_technician_time_entries for select to authenticated
using (
    exists (
        select 1 from public.company_users company_user
        where company_user.id = technician_company_user_id
          and company_user.auth_user_id = auth.uid()
          and lower(btrim(coalesce(company_user.status, ''))) = 'active'
    )
    or public.can_dispatch_company(company_id)
);

create or replace function public.set_company_technician_clock(
    p_technician_company_user_id uuid,
    p_action text
)
returns public.company_technician_time_entries
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    v_company_user public.company_users%rowtype;
    v_entry public.company_technician_time_entries%rowtype;
begin
    if auth.uid() is null then raise exception 'Not authenticated'; end if;

    select * into v_company_user
    from public.company_users
    where id = p_technician_company_user_id
      and auth_user_id = auth.uid()
      and lower(btrim(coalesce(status, ''))) = 'active';

    if not found then raise exception 'Time clock is available only for your active technician profile.'; end if;

    if lower(btrim(p_action)) = 'clock_in' then
        if exists (
            select 1 from public.company_technician_time_entries
            where technician_company_user_id = v_company_user.id and clocked_out_at is null
        ) then
            raise exception 'You are already clocked in.';
        end if;
        insert into public.company_technician_time_entries(company_id, technician_company_user_id)
        values(v_company_user.company_id, v_company_user.id)
        returning * into v_entry;
    elsif lower(btrim(p_action)) = 'clock_out' then
        update public.company_technician_time_entries
        set clocked_out_at = now(), updated_at = now()
        where id = (
            select id from public.company_technician_time_entries
            where technician_company_user_id = v_company_user.id and clocked_out_at is null
            order by clocked_in_at desc limit 1
        )
        returning * into v_entry;
        if not found then raise exception 'You are not currently clocked in.'; end if;
    else
        raise exception 'Unknown time clock action.';
    end if;

    return v_entry;
end;
$$;

revoke all on function public.set_company_technician_clock(uuid,text) from public, anon;
grant execute on function public.set_company_technician_clock(uuid,text) to authenticated;

commit;
