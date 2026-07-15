-- ─── Universal Cron Framework Migration ────────────────────────────────────
-- Run this in Supabase SQL editor ONCE to support the universal cron job
-- registry + execution log + admin monitoring UI + single /api/cron/tick
-- dispatcher, replacing the ad-hoc single-purpose scheduling from the
-- campaign process-scheduled route (which had no scheduler wired up).
--
-- `cron_jobs` is the registry — one row per distinct job. `cron_runs` is the
-- universal execution log, denormalizing `job_key` so history survives job
-- deletion and admin queries don't need a join.

CREATE TABLE cron_jobs (
  id uuid primary key default gen_random_uuid(),
  job_key text unique not null,
  name text not null,
  description text,
  schedule_type text not null default 'automatic',
  interval_type text,
  interval_minutes int,
  max_concurrent_runs int not null default 1,
  timeout_seconds int not null default 300,
  is_active boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE TABLE cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references cron_jobs(id),
  job_key text not null,
  trigger_type text not null,
  triggered_by text,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms int,
  request_payload jsonb,
  response jsonb,
  error text,
  rerun_of uuid references cron_runs(id),
  created_at timestamptz default now()
);

CREATE INDEX cron_runs_job_key_status_idx ON cron_runs (job_key, status);
CREATE INDEX cron_runs_started_at_idx ON cron_runs (started_at desc);
CREATE INDEX cron_jobs_active_schedule_next_run_idx ON cron_jobs (is_active, schedule_type, next_run_at);

-- Seed the existing campaign scheduler into the registry — see
-- src/lib/cronJobs/registry.ts for the handler map and
-- src/app/api/cron/tick/route.ts for the dispatcher that picks this up.
INSERT INTO cron_jobs (
  job_key, name, description, schedule_type, interval_type, interval_minutes,
  max_concurrent_runs, timeout_seconds, is_active, next_run_at
) VALUES (
  'process_scheduled_campaigns',
  'Process Scheduled Campaigns',
  'Finds campaigns with status=scheduled whose scheduled_at has passed and sends them.',
  'automatic', 'custom_minutes', 5,
  1, 300, true, now()
);
