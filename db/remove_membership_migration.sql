-- ─── Remove Membership Migration ──────────────────────────────────────────────
-- Run this in Supabase SQL editor ONCE to remove the per-contact membership
-- feature. Reverses db/membership_migration.sql.
--
-- Shop-level billing (free vs paid) is tracked separately via the existing
-- billing_plans / shop_subscriptions tables — this only removes the
-- per-contact tier that used to live on `contacts`.

ALTER TABLE contacts
  DROP COLUMN IF EXISTS membership_id;

ALTER TABLE contacts
  DROP COLUMN IF EXISTS subscription_date;

DROP TABLE IF EXISTS membership_logs;
