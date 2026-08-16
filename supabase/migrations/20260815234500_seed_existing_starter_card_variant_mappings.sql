-- Seed only high-confidence mappings for real Catalog Factory variants that
-- existed before the HomeOS starter-card deck was introduced.

begin;

do $$
begin
    if to_regclass('public.homeos_starter_card_catalog_variants') is null
       or to_regclass('public.catalog_product_variants') is null
       or to_regclass('public.catalog_product_families') is null
       or to_regclass('public.catalog_category_templates') is null then
        raise exception 'Starter-card variant mappings require the complete starter deck and Catalog Factory.';
    end if;
end;
$$;

insert into public.homeos_starter_card_catalog_variants(
    template_key,
    product_variant_id,
    created_by_user_id
)
select
    'bathroom:shower_tub',
    variant.id,
    null
from public.catalog_product_variants variant
join public.catalog_product_families family on family.id = variant.product_family_id
join public.catalog_category_templates template on template.id = family.category_template_id
where variant.status <> 'archived'
  and lower(template.category_name) like '%faucet%'
  and (
      lower(coalesce(variant.description, family.description, '')) like '%tub/shower%'
      or lower(coalesce(variant.description, family.description, '')) like '%tub shower%'
  )
  and lower(coalesce(variant.description, family.description, '')) like '%trim%'
on conflict (template_key, product_variant_id) do nothing;

commit;
