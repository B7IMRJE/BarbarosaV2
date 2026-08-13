-- Dispatch, office, and supervisor staff are explicitly authorized to maintain
-- product facts and attachments. Pricing remains protected by the existing
-- Price Book permission inside save_company_product_catalog_item.

begin;

create or replace function public.company_product_catalog_can_manage(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
    select auth.uid() is not null
       and p_company_id is not null
       and (
           coalesce(public.homeos_is_platform_admin(), false)
           or public.company_price_book_can_manage(p_company_id)
           or exists (
               select 1
               from public.company_users as company_user
               where company_user.company_id = p_company_id
                 and company_user.auth_user_id = auth.uid()
                 and lower(btrim(coalesce(company_user.status, ''))) = 'active'
                 and lower(btrim(coalesce(company_user.role, ''))) in ('office', 'dispatcher', 'supervisor')
           )
           or (
               public.company_user_has_permission(p_company_id, 'can_view_customers')
               and public.company_user_has_permission(p_company_id, 'can_view_jobs')
           )
       );
$$;

revoke all on function public.company_product_catalog_can_manage(uuid) from public, anon;
grant execute on function public.company_product_catalog_can_manage(uuid) to authenticated;

commit;
