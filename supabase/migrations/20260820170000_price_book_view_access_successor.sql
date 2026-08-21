-- Reconcile Price Book viewing with the current permission model without
-- replacing get_company_price_book_v2 or estimate authorization. The versioned
-- RPC continues to delegate to company_estimate_options_can_use, which in turn
-- uses this helper for internal Price Book viewers and its separate assigned
-- Sales path.
begin;

do $$
begin
    if to_regprocedure('public.company_user_has_permission(uuid,text)') is null
       or to_regprocedure('public.company_price_book_can_manage(uuid)') is null
       or to_regprocedure('public.get_company_price_book_v2(uuid)') is null then
        raise exception 'Current Price Book permission and RPC primitives are required.';
    end if;
end;
$$;

create or replace function public.company_price_book_can_view(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           public.company_price_book_can_manage(p_company_id)
           or public.company_user_has_permission(p_company_id, 'can_view_techos')
       );
$$;

revoke all on function public.company_price_book_can_view(uuid) from public, anon;
grant execute on function public.company_price_book_can_view(uuid) to authenticated;

commit;
