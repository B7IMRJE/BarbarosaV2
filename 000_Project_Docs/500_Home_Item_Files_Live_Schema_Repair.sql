BEGIN;

DO $$
BEGIN
    IF to_regclass('public.home_item_files') IS NULL THEN
        RAISE EXCEPTION 'public.home_item_files does not exist; cannot repair item file schema.';
    END IF;

    IF to_regclass('public.home_items') IS NULL THEN
        RAISE EXCEPTION 'public.home_items does not exist; cannot repair item file schema.';
    END IF;
END $$;

ALTER TABLE public.home_item_files
    ADD COLUMN IF NOT EXISTS home_item_id uuid;

ALTER TABLE public.home_item_files
    ADD COLUMN IF NOT EXISTS storage_bucket text;

ALTER TABLE public.home_item_files
    ADD COLUMN IF NOT EXISTS storage_path text;

-- Legacy rows may continue loading through item_slug when a unique home_items match
-- cannot be proven. Do not guess home_item_id, storage_bucket, or storage_path.
WITH exact_matches AS (
    SELECT
        file_row.id AS file_id,
        (array_agg(item_row.id ORDER BY item_row.id))[1] AS matched_home_item_id,
        count(*) AS match_count
    FROM public.home_item_files AS file_row
    JOIN public.home_items AS item_row
        ON item_row.user_id = file_row.user_id
       AND item_row.item_slug = file_row.item_slug
    WHERE file_row.home_item_id IS NULL
      AND file_row.user_id IS NOT NULL
      AND file_row.item_slug IS NOT NULL
    GROUP BY file_row.id
)
UPDATE public.home_item_files AS file_row
SET home_item_id = exact_matches.matched_home_item_id
FROM exact_matches
WHERE file_row.id = exact_matches.file_id
  AND exact_matches.match_count = 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'home_item_files_home_item_id_fkey'
          AND conrelid = 'public.home_item_files'::regclass
    ) THEN
        ALTER TABLE public.home_item_files
            ADD CONSTRAINT home_item_files_home_item_id_fkey
            FOREIGN KEY (home_item_id)
            REFERENCES public.home_items(id)
            ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS home_item_files_user_id_idx
    ON public.home_item_files (user_id);

CREATE INDEX IF NOT EXISTS home_item_files_home_item_id_idx
    ON public.home_item_files (home_item_id);

CREATE INDEX IF NOT EXISTS home_item_files_item_slug_idx
    ON public.home_item_files (item_slug);

COMMIT;
