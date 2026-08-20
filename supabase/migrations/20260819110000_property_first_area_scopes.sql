-- Additive property-first navigation metadata. Existing HomeOS rows and histories are never moved or deleted.
begin;

alter table public.home_items add column if not exists area_scope text;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.home_items'::regclass
          and conname = 'home_items_area_scope_check'
    ) then
        alter table public.home_items
            add constraint home_items_area_scope_check
            check (area_scope is null or area_scope in ('interior', 'exterior'));
    end if;
end;
$$;

-- Backfill only unequivocal labels. Bare Garage and unknown labels remain null/unclassified.
update public.home_items
set area_scope = case lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
    when 'kitchen' then 'interior' when 'living room' then 'interior'
    when 'dining room' then 'interior' when 'hallway' then 'interior'
    when 'attached garage' then 'interior' when 'laundry room' then 'interior'
    when 'laundry' then 'interior' when 'primary bedroom' then 'interior'
    when 'master bedroom' then 'interior' when 'bedroom' then 'interior'
    when 'primary bathroom' then 'interior' when 'master bathroom' then 'interior'
    when 'bathroom' then 'interior' when 'office' then 'interior' when 'attic' then 'interior'
    when 'basement' then 'interior' when 'utility or mechanical room' then 'interior'
    when 'utility / mechanical room' then 'interior' when 'utility room' then 'interior'
    when 'mechanical room' then 'interior' when 'gym' then 'interior' when 'bar' then 'interior'
    when 'theater' then 'interior' when 'man cave' then 'interior' when 'wine room' then 'interior'
    when 'storage room' then 'interior' when 'interior walkway' then 'interior'
    when 'front yard' then 'exterior' when 'backyard' then 'exterior' when 'back yard' then 'exterior'
    when 'left side yard' then 'exterior' when 'right side yard' then 'exterior'
    when 'patio' then 'exterior' when 'porch' then 'exterior' when 'balcony' then 'exterior'
    when 'driveway' then 'exterior' when 'pool area' then 'exterior' when 'spa area' then 'exterior'
    when 'bbq or outdoor kitchen' then 'exterior' when 'bbq / grill area' then 'exterior'
    when 'outdoor kitchen' then 'exterior' when 'detached garage' then 'exterior'
    when 'shed' then 'exterior' when 'workshop' then 'exterior' when 'guest house or adu' then 'exterior'
    when 'guest house' then 'exterior' when 'adu' then 'exterior' when 'pool house' then 'exterior'
    when 'landscaping' then 'exterior' when 'irrigation' then 'exterior' when 'roof' then 'exterior'
    when 'exterior mechanical area' then 'exterior' when 'exterior shutoff area' then 'exterior'
    else null
end
where lower(btrim(coalesce(category, ''))) = 'area' and area_scope is null;

create index if not exists home_items_property_active_area_scope_idx
    on public.home_items(property_id, area_scope, name)
    where lower(btrim(coalesce(category, ''))) = 'area' and coalesce(archived, false) = false;

commit;
