-- ─── Contact Tags Migration ────────────────────────────────────────────────
-- Run this in Supabase SQL editor ONCE to support contact tagging and
-- tag-based campaign audiences.
--
-- schema.sql already defines contacts.tags as text[] DEFAULT '{}', but this
-- migration is defensive: if an environment ever ended up with a plain
-- text/varchar column (Shopify sends tags as a comma-separated string), it
-- converts it to text[] by splitting on commas and trimming whitespace.
-- Either way it then normalizes existing values (trim, lowercase, dedupe,
-- drop empties) so the Postgres && overlap operator used by tag audiences
-- behaves case-consistently, enforces NOT NULL DEFAULT '{}', and adds a GIN
-- index for fast tag filtering.

-- 1. Convert a legacy text/varchar column to text[] if needed.
DO $$
DECLARE
  coltype text;
BEGIN
  SELECT data_type INTO coltype
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'tags';

  IF coltype IN ('text', 'character varying') THEN
    ALTER TABLE contacts ALTER COLUMN tags DROP DEFAULT;
    ALTER TABLE contacts ALTER COLUMN tags TYPE text[] USING (
      CASE
        WHEN tags IS NULL OR btrim(tags) = '' THEN '{}'::text[]
        ELSE string_to_array(regexp_replace(btrim(tags), '\s*,\s*', ',', 'g'), ',')
      END
    );
  END IF;
END $$;

-- 2. Normalize existing values: trim, lowercase, dedupe, drop empty strings.
UPDATE contacts
SET tags = COALESCE(
  (SELECT array_agg(DISTINCT lower(btrim(t)) ORDER BY lower(btrim(t)))
   FROM unnest(tags) AS t
   WHERE btrim(t) <> ''),
  '{}'
)
WHERE tags IS NOT NULL AND tags <> '{}';

UPDATE contacts SET tags = '{}' WHERE tags IS NULL;

-- 3. Enforce NOT NULL DEFAULT '{}'.
ALTER TABLE contacts ALTER COLUMN tags SET DEFAULT '{}';
ALTER TABLE contacts ALTER COLUMN tags SET NOT NULL;

-- 4. GIN index so tags && '{...}' (tag audience) and tag listing stay fast.
CREATE INDEX IF NOT EXISTS contacts_tags_gin ON contacts USING gin (tags);
