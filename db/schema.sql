-- ============================================================
-- Shopify Email Marketing App — Database Schema
-- For Supabase (Postgres)
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. SHOPS  (one row per installed store)
-- ------------------------------------------------------------
create table shops (
  id uuid primary key default gen_random_uuid(),
  shop_domain text unique not null,        -- e.g. my-store.myshopify.com
  access_token text not null,
  scope text,
  shop_owner_email text,
  plan_name text,                          -- Shopify's own plan, not ours
  credits_balance integer not null default 0,
  is_active boolean not null default true, -- false after uninstall
  installed_at timestamptz default now(),
  uninstalled_at timestamptz
);

-- ------------------------------------------------------------
-- 2. CONTACTS  (synced from Shopify customers)
-- ------------------------------------------------------------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  shopify_customer_id bigint not null,
  email text not null,
  first_name text,
  last_name text,
  phone text,
  tags text[] default '{}',
  total_spent numeric default 0,
  orders_count integer default 0,
  last_order_at timestamptz,
  subscribed boolean not null default true,   -- marketing consent
  unsubscribed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (shop_id, shopify_customer_id)
);
create index on contacts (shop_id, email);
create index on contacts (shop_id, subscribed);

-- ------------------------------------------------------------
-- 3. SEGMENTS  (dynamic filters over contacts)
-- ------------------------------------------------------------
create table segments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  rules jsonb not null default '{}',   -- e.g. {"orders_count_gte": 1, "last_order_within_days": 30}
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 4. TEMPLATES
-- ------------------------------------------------------------
create table templates (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  subject text,
  content jsonb not null default '{}', -- block-based editor structure
  thumbnail_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 5. CAMPAIGNS  (one-off broadcasts)
-- ------------------------------------------------------------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  template_id uuid references templates(id),
  segment_id uuid references segments(id),
  name text not null,
  subject text not null,
  status text not null default 'draft',  -- draft | scheduled | sending | sent | failed
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- per-recipient tracking for a campaign send
create table campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  status text not null default 'pending', -- pending|sent|delivered|opened|clicked|bounced|failed|unsubscribed
  esp_message_id text,                    -- id returned by SendGrid/Postmark/etc, used to match webhooks
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz
);
create index on campaign_recipients (campaign_id);
create index on campaign_recipients (esp_message_id);

-- ------------------------------------------------------------
-- 6. FLOWS  (automations / journeys)
-- ------------------------------------------------------------
create table flows (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  trigger_type text not null,        -- customer_created | order_created | cart_abandoned | tag_added ...
  trigger_config jsonb default '{}',
  status text not null default 'draft', -- draft | active | paused
  created_at timestamptz default now()
);

create table flow_steps (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references flows(id) on delete cascade,
  step_order integer not null,
  step_type text not null,           -- email | wait | condition
  config jsonb default '{}',         -- {"template_id": "..."} or {"wait_hours": 24} or condition rules
  unique (flow_id, step_order)
);

-- one row per contact who entered a flow
create table flow_runs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references flows(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  current_step_order integer not null default 0,
  status text not null default 'active', -- active | completed | exited
  next_action_at timestamptz,             -- when the background worker should act next
  started_at timestamptz default now(),
  completed_at timestamptz
);
create index on flow_runs (status, next_action_at);

create table flow_run_events (
  id uuid primary key default gen_random_uuid(),
  flow_run_id uuid not null references flow_runs(id) on delete cascade,
  step_id uuid references flow_steps(id),
  event_type text not null,          -- entered | email_sent | wait_completed | exited
  metadata jsonb default '{}',
  occurred_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 7. BILLING & EMAIL CREDITS
-- ------------------------------------------------------------
create table billing_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  shopify_plan_handle text,
  monthly_price numeric not null,
  included_credits integer not null
);

create table shop_subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  billing_plan_id uuid references billing_plans(id),
  shopify_charge_id text,
  status text not null default 'active',   -- active | cancelled | frozen
  current_period_start timestamptz,
  current_period_end timestamptz
);

-- append-only ledger; shops.credits_balance is kept in sync by application logic
create table email_credits_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  change integer not null,            -- positive = top-up/renewal, negative = usage
  reason text not null,               -- campaign_send | flow_email_send | monthly_renewal | credit_purchase
  reference_id uuid,                  -- campaign_id or flow_run_id, depending on reason
  created_at timestamptz default now()
);
create index on email_credits_ledger (shop_id);

-- ------------------------------------------------------------
-- 8. WEBHOOK LOG  (debugging Shopify + ESP webhooks)
-- ------------------------------------------------------------
create table webhook_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references shops(id) on delete cascade,
  source text not null,        -- shopify | esp
  topic text not null,
  payload jsonb not null,
  received_at timestamptz default now()
);
