alter table public.companies
    add column if not exists glass_depth integer not null default 70
    check (glass_depth between 1 and 100);

create or replace function public.update_company_glass_depth(
    p_company_id uuid,
    p_glass_depth integer
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare
    updated_company public.companies;
begin
    if not public.homeos_is_platform_admin() then
        raise exception 'Platform administrator access required.';
    end if;

    if p_glass_depth is null or p_glass_depth < 1 or p_glass_depth > 100 then
        raise exception 'Glass depth must be between 1 and 100.';
    end if;

    update public.companies
    set glass_depth = p_glass_depth
    where id = p_company_id
    returning * into updated_company;

    if updated_company.id is null then
        raise exception 'Company not found.';
    end if;

    return updated_company;
end;
$$;

revoke all on function public.update_company_glass_depth(uuid, integer) from public;
revoke all on function public.update_company_glass_depth(uuid, integer) from anon;
grant execute on function public.update_company_glass_depth(uuid, integer) to authenticated;
