import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyCronSecret } from "@/lib/cronAuth";
import { runCronJob } from "@/lib/cronRunner";
import { CRON_JOB_REGISTRY } from "@/lib/cronJobs/registry";

// GET/POST /api/cron/tick
//
// The ONE endpoint an external cron service (cron-job.org, Vercel Cron,
// etc.) hits on a short interval (e.g. every 1 minute). It finds every
// active/automatic cron_jobs row whose next_run_at is due, atomically
// claims it (advances next_run_at so a concurrent tick can't double-run the
// same cycle), and runs its handler from CRON_JOB_REGISTRY via the shared
// runCronJob() wrapper — which itself handles stale-run healing, the
// concurrency cap, and cron_runs logging. Jobs run sequentially, not in
// parallel, so multiple jobs touching SES sends in the same tick don't
// compound rate-limit throttling.
async function tick() {
  const nowIso = new Date().toISOString();

  const { data: dueJobs, error } = await supabaseAdmin
    .from("cron_jobs")
    .select("id, job_key, interval_minutes")
    .eq("is_active", true)
    .eq("schedule_type", "automatic")
    .lte("next_run_at", nowIso);

  if (error) throw new Error(error.message);

  const jobsRun: { job_key: string; status: string; durationMs: number }[] = [];
  const jobsSkipped: { job_key: string; reason: string }[] = [];

  for (const job of dueJobs || []) {
    const nextRunAt = new Date(Date.now() + (job.interval_minutes || 0) * 60_000).toISOString();

    // Atomic claim: UPDATE ... WHERE next_run_at <= now() is a single SQL
    // statement, so a concurrent tick racing on the same row finds zero
    // matching rows here and skips instead of double-running this cycle.
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("cron_jobs")
      .update({ next_run_at: nextRunAt })
      .eq("id", job.id)
      .lte("next_run_at", nowIso)
      .select("id");

    if (claimError) {
      jobsSkipped.push({ job_key: job.job_key, reason: claimError.message });
      continue;
    }
    if (!claimed || claimed.length === 0) {
      jobsSkipped.push({ job_key: job.job_key, reason: "already claimed by a concurrent tick" });
      continue;
    }

    const handler = CRON_JOB_REGISTRY[job.job_key];
    if (!handler) {
      jobsSkipped.push({ job_key: job.job_key, reason: "no handler registered in CRON_JOB_REGISTRY" });
      continue;
    }

    const result = await runCronJob(job.job_key, "automatic", null, handler);
    jobsRun.push({ job_key: job.job_key, status: result.status, durationMs: result.durationMs });
  }

  return { ticked_at: nowIso, jobs_run: jobsRun, jobs_skipped: jobsSkipped };
}

async function handle(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await tick());
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
