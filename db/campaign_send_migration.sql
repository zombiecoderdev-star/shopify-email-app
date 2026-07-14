-- ─── Campaign Send Migration ───────────────────────────────────────────────
-- Run this in Supabase SQL editor ONCE to support the upgraded campaign send
-- flow (POST /api/shopify/campaigns/[id]/send).
--
-- Adds an `error` column to campaign_recipients so a failed send stores the
-- ESP's error message per recipient (visible in the sent-campaign recipient
-- list / debuggable without digging through logs). The send code writes this
-- column defensively — if this migration hasn't run yet it retries the row
-- update without `error` instead of failing the send — but run it anyway so
-- failure reasons are actually captured.
--
-- campaigns.status gains a "failed" value (set when every recipient fails);
-- status is plain text with no check constraint, so no schema change needed.

ALTER TABLE campaign_recipients
  ADD COLUMN IF NOT EXISTS error text;
