begin;

alter table public.company_users
    add column if not exists is_primary boolean not null default false;

with ranked as (
    select
        id,
        row_number() over (
            partition by coalesce(auth_user_id::text, lower(btrim(email)), id::text)
            order by
                case when lower(coalesce(status, '')) = 'active' then 0 else 1 end,
                id
        ) as relationship_rank
    from public.company_users
)
update public.company_users as company_user
set is_primary = ranked.relationship_rank = 1
from ranked
where ranked.id = company_user.id
  and not exists (
      select 1
      from public.company_users as existing_primary
      where existing_primary.is_primary
  );

create unique index if not exists company_users_one_primary_per_auth_user
    on public.company_users (auth_user_id)
    where is_primary and auth_user_id is not null;

create unique index if not exists company_users_one_primary_per_unlinked_email
    on public.company_users (lower(btrim(email)))
    where is_primary and auth_user_id is null and email is not null;

create or replace function public.get_platform_people_company_access_v2()
returns table (
    id uuid,
    company_id uuid,
    auth_user_id uuid,
    full_name text,
    email text,
    role text,
    status text,
    is_primary boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select
        company_user.id,
        company_user.company_id,
        company_user.auth_user_id,
        company_user.full_name,
        company_user.email,
        company_user.role,
        company_user.status,
        company_user.is_primary
    from public.company_users as company_user
    where public.homeos_is_platform_admin()
    order by
        company_user.is_primary desc,
        lower(coalesce(company_user.full_name, company_user.email, '')),
        company_user.id;
$$;

create or replace function public.set_platform_person_primary_company(
    p_company_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
    target public.company_users%rowtype;
begin
    if not public.homeos_is_platform_admin() then
        raise exception 'Platform administrator access is required.';
    end if;

    select *
    into target
    from public.company_users
    where id = p_company_user_id;

    if not found then
        raise exception 'Company relationship not found.';
    end if;

    update public.company_users
    set is_primary = false
    where (
        target.auth_user_id is not null
        and auth_user_id = target.auth_user_id
    ) or (
        target.auth_user_id is null
        and auth_user_id is null
        and lower(btrim(email)) = lower(btrim(target.email))
    );

    update public.company_users
    set is_primary = true
    where id = target.id;
end;
$$;

revoke all on function public.get_platform_people_company_access_v2() from public;
revoke all on function public.get_platform_people_company_access_v2() from anon;
grant execute on function public.get_platform_people_company_access_v2() to authenticated;

revoke all on function public.set_platform_person_primary_company(uuid) from public;
revoke all on function public.set_platform_person_primary_company(uuid) from anon;
grant execute on function public.set_platform_person_primary_company(uuid) to authenticated;

commit;
