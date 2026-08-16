-- Add a location-neutral Smart Water Shutoff archetype to the HomeOS master
-- deck. This is Catalog Factory metadata only: it deliberately does not create
-- or place an installed home item until a technician confirms its location.

begin;

do $$
begin
    if to_regclass('public.homeos_starter_card_templates') is null
       or to_regclass('public.homeos_starter_card_catalog_variants') is null
       or to_regclass('public.catalog_product_variants') is null
       or to_regclass('public.catalog_product_families') is null then
        raise exception 'Smart Water Shutoff requires the HomeOS starter deck and Catalog Factory.';
    end if;
end;
$$;

alter table public.homeos_starter_card_templates
    drop constraint if exists homeos_starter_card_templates_room_check;
alter table public.homeos_starter_card_templates
    add constraint homeos_starter_card_templates_room_check
    check (room_kind in ('bathroom', 'kitchen', 'garage', 'whole_home'));

insert into public.homeos_starter_card_templates(
    template_key,
    room_kind,
    name,
    system,
    category,
    parent_template_key,
    aliases,
    display_order,
    readiness_status,
    admin_notes,
    active,
    created_at,
    updated_at
) values (
    'whole_home:smart_water_shutoff',
    'whole_home',
    'Smart Water Shutoff',
    'Plumbing',
    'Equipment',
    null,
    '["Smart Water Monitor and Shutoff", "Automatic Smart Water Shutoff", "Whole Home Smart Water Shutoff"]'::jsonb,
    10,
    'building',
    'Location-neutral master archetype. Do not place this card in Garage, Front Yard, or another physical area until a technician confirms the installed location with notes or photo evidence.',
    true,
    now(),
    now()
)
on conflict (template_key) do update
set room_kind = excluded.room_kind,
    name = excluded.name,
    system = excluded.system,
    category = excluded.category,
    parent_template_key = excluded.parent_template_key,
    aliases = excluded.aliases,
    display_order = excluded.display_order,
    active = true,
    updated_at = now();

-- The saved Flo by Moen 3/4-inch master is exact and approved in production.
-- Map it only when that real record exists; never fabricate a variant.
insert into public.homeos_starter_card_catalog_variants(
    template_key,
    product_variant_id,
    created_by_user_id,
    created_at
)
select
    'whole_home:smart_water_shutoff',
    variant.id,
    null,
    now()
from public.catalog_product_variants variant
join public.catalog_product_families family on family.id = variant.product_family_id
join public.catalog_category_templates template on template.id = family.category_template_id
where variant.status = 'approved'
  and family.status = 'approved'
  and lower(btrim(family.brand)) = 'moen'
  and lower(btrim(variant.model_number)) = '900-001'
  and lower(btrim(template.template_key)) = 'smart_water_shutoff_and_leak_detection'
on conflict (template_key, product_variant_id) do nothing;

commit;
