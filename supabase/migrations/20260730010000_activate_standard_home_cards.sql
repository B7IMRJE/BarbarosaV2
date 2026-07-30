-- Starter equipment represents the normal contents of a home. Keep the cards
-- ready for details while preserving Missing Information as the documentation state.
update public.home_items
set
    status = 'Missing Information',
    install_state = 'Installed'
where coalesce(archived, false) = false
  and lower(btrim(coalesce(status, ''))) = 'missing information'
  and lower(btrim(coalesce(install_state, ''))) = 'unknown';
