-- ─── Membership Migration ─────────────────────────────────────────────────────
-- Run this in Supabase SQL editor ONCE to add membership support.
-- Safe to run — uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS patterns.

-- 1. Add membership_id column to contacts
--    Default 0 = "Free" tier (matches memberships.ts config)
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS membership_id integer NOT NULL DEFAULT 0;

-- 2. Add subscription_date — when the customer's membership last changed
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS subscription_date timestamptz;

-- 3. Create membership_logs table
--    Append-only audit trail. Never update rows — only insert.
CREATE TABLE IF NOT EXISTS membership_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  previous_membership_id integer NOT NULL DEFAULT 0,
  new_membership_id integer NOT NULL,
  source text NOT NULL,      -- 'admin' | 'customer_purchase'
  changed_by text,           -- admin email or system identifier
  notes text,                -- optional reason for change
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS membership_logs_contact_id ON membership_logs(contact_id);
CREATE INDEX IF NOT EXISTS membership_logs_shop_id ON membership_logs(shop_id);
CREATE INDEX IF NOT EXISTS membership_logs_created_at ON membership_logs(created_at DESC);