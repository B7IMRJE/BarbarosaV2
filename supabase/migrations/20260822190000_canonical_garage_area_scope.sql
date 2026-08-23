-- Align legacy bare Garage area rows with the published canonical Area definition.
-- Explicitly scoped rows remain authoritative, and Detached Garage stays exterior.
begin;

do $$
begin
    if to_regclass('public.home_items') is null
       or not exists (
           select 1
           from information_schema.columns
           where table_schema = 'public'
             and table_name = 'home_items'
             and column_name = 'area_scope'
       ) then
        raise exception 'Canonical Garage classification requires HomeOS property-area scopes.';
    end if;
end;
$$;

update public.home_items
set area_scope = case lower(regexp_replace(btrim(coalesce(name, '')), '[[:space:]]+', ' ', 'g'))
    when 'garage' then 'interior'
    when 'detached garage' then 'exterior'
end
where lower(btrim(coalesce(category, ''))) = 'area'
  and area_scope is null
  and lower(regexp_replace(btrim(coalesce(name, '')), '[[:space:]]+', ' ', 'g')) in ('garage', 'detached garage');

commit;
