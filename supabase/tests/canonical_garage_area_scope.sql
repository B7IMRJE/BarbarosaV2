-- Read-only regression checks for canonical Garage scope compatibility.

do $$
begin
    if exists (
        select 1
        from public.home_items
        where lower(btrim(coalesce(category, ''))) = 'area'
          and area_scope is null
          and lower(regexp_replace(btrim(coalesce(name, '')), '[[:space:]]+', ' ', 'g')) = 'garage'
    ) then
        raise exception 'Bare Garage Area rows must use the canonical interior scope.';
    end if;

    if exists (
        select 1
        from public.home_items
        where lower(btrim(coalesce(category, ''))) = 'area'
          and lower(regexp_replace(btrim(coalesce(name, '')), '[[:space:]]+', ' ', 'g')) = 'detached garage'
          and area_scope is distinct from 'exterior'
    ) then
        raise exception 'Detached Garage Area rows must remain exterior.';
    end if;
end;
$$;

select 'canonical_garage_area_scope_ok' as result;
