import { processScheduledCampaigns } from "@/lib/cronJobs/processScheduledCampaigns";

// Shared job-key -> handler map. Both the tick dispatcher
// (src/app/api/cron/tick/route.ts) and the admin "Run Now"/rerun routes
// (src/app/api/admin/cron/jobs/[id]/run, src/app/api/admin/cron/runs/[id]/rerun)
// import this same map so there's exactly one place to register a handler.
//
// To add a new job (e.g. the flow tick engine from feature #8):
//   1. Add a row to db/cron_migration.sql (or a follow-up migration) with
//      its job_key + schedule.
//   2. Write a plain async function with no required args, same shape as
//      processScheduledCampaigns.
//   3. Register it below, keyed by the same job_key.
export const CRON_JOB_REGISTRY: Record<string, () => Promise<unknown>> = {
  process_scheduled_campaigns: processScheduledCampaigns,
  // run_flow_ticks: runFlowTicks,  <-- register future jobs here
};
