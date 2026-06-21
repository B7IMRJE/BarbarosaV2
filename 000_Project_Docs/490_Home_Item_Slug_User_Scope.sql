BEGIN;

DO $$
DECLARE
    duplicate_pair_count integer;
BEGIN
    IF to_regclass('public.home_items') IS NULL THEN
        RAISE EXCEPTION 'public.home_items does not exist; cannot update item slug uniqueness.';
    END IF;

    SELECT count(*)
    INTO duplicate_pair_count
    FROM (
        SELECT user_id, item_slug
        FROM public.home_items
        WHERE user_id IS NOT NULL
          AND item_slug IS NOT NULL
        GROUP BY user_id, item_slug
        HAVING count(*) > 1
    ) duplicate_pairs;

    IF duplicate_pair_count > 0 THEN
        RAISE EXCEPTION 'Cannot add home_items user-scoped item_slug uniqueness: duplicate non-null (user_id, item_slug) pairs exist.';
    END IF;
END $$;

ALTER TABLE public.home_items
    DROP CONSTRAINT IF EXISTS home_items_item_slug_key;

-- User-level slug scope replaces the obsolete global item_slug rule.
-- This is temporary until home_items receives a canonical property_id/home_id relationship.
CREATE UNIQUE INDEX IF NOT EXISTS home_items_user_id_item_slug_key
    ON public.home_items (user_id, item_slug);

COMMIT;
