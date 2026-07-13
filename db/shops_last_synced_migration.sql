-- ─── Shops Last Synced Migration ──────────────────────────────────────────────
-- Run this in Supabase SQL editor ONCE to support the "Last synced" column on
-- the /admin/shops page. Safe to run — uses ADD COLUMN IF NOT EXISTS.
--
-- Not backfilled from webhook_logs / historical sync-customers calls — those
-- events aren't currently tied back to a "last synced" concept, so existing
-- shops will show "Never" until their next sync.

ALTER TABLE shops
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
