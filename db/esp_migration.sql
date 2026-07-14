-- ─── ESP (AWS SES) Migration ───────────────────────────────────────────────
-- Run this in Supabase SQL editor ONCE to support the ESP integration.
-- Safe to run — uses ADD COLUMN IF NOT EXISTS.
--
-- campaign_recipients.status is plain `text` with no enum/check constraint,
-- so the new "failed" and "complained" status values (see HANDOFF.md ESP
-- section) already work without any column change — this migration only
-- adds the missing complained_at timestamp, for symmetry with the existing
-- sent_at/opened_at/clicked_at/bounced_at columns.

ALTER TABLE campaign_recipients
  ADD COLUMN IF NOT EXISTS complained_at timestamptz;
