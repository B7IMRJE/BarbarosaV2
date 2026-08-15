-- Keep company Price Book viewing aligned with the application permission model.
-- Dispatch and other active users with can_view_techos may read the Price Book,
-- while saves remain protected by can_manage_price_book.

begin;

create or replace function public.get_company_price_book_v2(p_company_id uuid)
returns table (
    id uuid,
    company_id uuid,
    price_key text,
    name text,
    system text,
    category text,
    unit text,
    base_price numeric,
    labor_hours numeric,
    material_cost numeric,
    customer_description text,
    internal_notes text,
    active boolean,
    created_by_user_id uuid,
    created_at timestamptz,
    updated_at timestamptz,
    service_category text,
    internal_description text,
    homeowner_description text,
    base_labor_install_price numeric,
    estimated_labor_hours numeric,
    internal_labor_cost numeric,
    internal_material_cost numeric,
    recommended_selling_price numeric,
    minimum_permitted_selling_price numeric,
    maximum_permitted_selling_price numeric,
    required_minimum_gross_margin numeric,
    tax_behavior text,
    effective_at date,
    version_label text,
    included_warranty text,
    eligible_extended_warranties jsonb,
    required_add_on_price_keys text[],
    incompatible_price_keys text[],
    applicable_systems text[],
    applicable_areas text[],
    applicable_categories text[],
    management_notes text
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;

    if not (
        coalesce(public.homeos_is_platform_admin(), false)
        or public.company_user_has_permission(p_company_id, 'can_view_techos')
        or public.company_user_has_permission(p_company_id, 'can_manage_price_book')
    ) then
        raise exception 'Not authorized';
    end if;

    return query
    select
        item.id,
        item.company_id,
        item.price_key,
        item.name,
        item.system,
        item.category,
        item.unit,
        item.base_price,
        item.labor_hours,
        item.material_cost,
        item.customer_description,
        item.internal_notes,
        item.active,
        item.created_by_user_id,
        item.created_at,
        item.updated_at,
        item.service_category,
        item.internal_description,
        item.homeowner_description,
        item.base_labor_install_price,
        item.estimated_labor_hours,
        item.internal_labor_cost,
        item.internal_material_cost,
        item.recommended_selling_price,
        item.minimum_permitted_selling_price,
        item.maximum_permitted_selling_price,
        item.required_minimum_gross_margin,
        item.tax_behavior,
        item.effective_at,
        item.version_label,
        item.included_warranty,
        item.eligible_extended_warranties,
        item.required_add_on_price_keys,
        item.incompatible_price_keys,
        item.applicable_systems,
        item.applicable_areas,
        item.applicable_categories,
        item.management_notes
    from public.company_price_book_items as item
    where item.company_id = p_company_id
    order by item.system, item.category, item.name;
end;
$$;

revoke all on function public.get_company_price_book_v2(uuid) from public;
revoke all on function public.get_company_price_book_v2(uuid) from anon;
grant execute on function public.get_company_price_book_v2(uuid) to authenticated;

commit;
