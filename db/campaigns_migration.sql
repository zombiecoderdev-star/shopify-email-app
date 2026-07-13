-- ─── Campaigns Migration ───────────────────────────────────────────────────
-- Run this in Supabase SQL editor ONCE to support the Campaigns feature (#6).
-- Safe to run — uses ADD COLUMN IF NOT EXISTS.
--
-- `campaigns.segment_id` (FK to the `segments` table) already existed but is
-- unused by this feature — audience selection reuses the same four fixed
-- segments as /shopify/customers (Customers.tsx SEGMENTS) instead of the
-- dynamic segments table, stored as JSONB so it's self-contained on the
-- campaign row. segment_id is left in place, untouched, for a future feature
-- that wants dynamic segments; campaign code never reads or writes it.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS audience_filter jsonb,
  ADD COLUMN IF NOT EXISTS recipient_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE campaign_recipients
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
