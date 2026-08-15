-- Read-only verification for per-company catalog activation and card packages.
-- Run after 20260815150000_company_catalog_entitlements.sql.

do $$
declare
    v_get_settings_def text;
    v_save_settings_def text;
    v_master_catalog_def text;
    v_company_catalog_def text;
    v_approved_products_def text;
    v_storage_access_def text;
    v_homeos_reference_def text;
begin
    if to_regclass('public.company_catalog_entitlements') is null
       or to_regclass('public.company_catalog_entitlement_items') is null then
        raise exception 'Company catalog entitlement tables are missing.';
    end if;

    if public.company_catalog_package_limit('curated_10') is distinct from 10
       or public.company_catalog_package_limit('curated_20') is distinct from 20
       or public.company_catalog_package_limit('full') is not null then
        raise exception 'Catalog package limits are incorrect.';
    end if;

    if has_table_privilege('authenticated', 'public.company_catalog_entitlements', 'INSERT')
       or has_table_privilege('authenticated', 'public.company_catalog_entitlements', 'UPDATE')
       or has_table_privilege('authenticated', 'public.company_catalog_entitlement_items', 'INSERT')
       or has_table_privilege('authenticated', 'public.company_catalog_entitlement_items', 'DELETE') then
        raise exception 'Catalog entitlement mutations must go through the audited Platform Administration RPC.';
    end if;

    select pg_get_functiondef('public.get_company_catalog_entitlement(uuid)'::regprocedure)
    into v_get_settings_def;
    select pg_get_functiondef('public.save_company_catalog_entitlement(uuid,boolean,text,uuid[])'::regprocedure)
    into v_save_settings_def;
    select pg_get_functiondef('public.get_approved_master_catalog_for_company(uuid)'::regprocedure)
    into v_master_catalog_def;
    select pg_get_functiondef('public.get_company_product_catalog(uuid)'::regprocedure)
    into v_company_catalog_def;
    select pg_get_functiondef('public.get_company_approved_products(uuid)'::regprocedure)
    into v_approved_products_def;
    select pg_get_functiondef('public.company_product_catalog_storage_can_access(text)'::regprocedure)
    into v_storage_access_def;
    select pg_get_functiondef('public.get_home_item_product_reference(uuid)'::regprocedure)
    into v_homeos_reference_def;

    if v_get_settings_def !~* 'security definer'
       or v_get_settings_def !~* 'set[[:space:]]+search_path[[:space:]]+(to|=)[[:space:]]+pg_catalog,[[:space:]]+public,[[:space:]]+pg_temp' then
        raise exception 'Catalog entitlement reads must keep a hardened search path.';
    end if;

    if v_save_settings_def !~* 'homeos_is_platform_admin'
       or v_save_settings_def !~* 'company_catalog_package_limit'
       or v_save_settings_def !~* 'log_company_audit_event' then
        raise exception 'Catalog entitlement saves must remain platform-admin-only, package-limited, and audited.';
    end if;

    if v_master_catalog_def !~* 'company_catalog_variant_is_entitled'
       or v_company_catalog_def !~* 'company_catalog_variant_is_entitled'
       or v_approved_products_def !~* 'company_catalog_variant_is_entitled' then
        raise exception 'Master, ManagementOS, and estimate catalog reads must enforce card entitlements.';
    end if;

    if v_storage_access_def !~* 'company_catalog_product_is_entitled'
       or v_storage_access_def !~* 'homeos_can_read_property_record' then
        raise exception 'Catalog files must enforce live packages while preserving installed HomeOS file access.';
    end if;

    if v_homeos_reference_def ~* 'company_catalog_entitlement'
       or v_homeos_reference_def ~* 'company_catalog_variant_is_entitled' then
        raise exception 'Installed HomeOS product references must not depend on current company catalog activation.';
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'company_approved_products'
          and policyname = 'company_approved_products_entitled_select'
          and qual ilike '%company_catalog_variant_is_entitled%'
    ) then
        raise exception 'Direct company product reads are not entitlement-filtered.';
    end if;

    if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'catalog_product_variants'
          and policyname = 'catalog_product_variants_read'
          and qual ilike '%catalog_variant_is_visible_to_current_user%'
    ) then
        raise exception 'Direct master-card reads are not entitlement-filtered.';
    end if;
end;
$$;
