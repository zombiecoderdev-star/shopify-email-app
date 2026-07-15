// Shared execution wrapper for every cron job — the tick dispatcher
// (/api/cron/tick), the admin "Run Now" button, and any direct/manual route
// (e.g. process-scheduled) all funnel through runCronJob() instead of each
// reimplementing stale-run healing, concurrency limits, and cron_runs
// bookkeeping.
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type CronTriggerType = "manual" | "automatic";
export type CronRunStatus = "running" | "success" | "failed" | "timeout" | "skipped";

export type CronJobResult = {
  status: CronRunStatus;
  response: unknown;
  error: string | null;
  durationMs: number;
  runId: string | null;
};

type CronJobRow = {
  id: string;
  job_key: string;
  is_active: boolean;
  max_concurrent_runs: number;
  timeout_seconds: number;
};

export async function runCronJob<P = unknown>(
  jobKey: string,
  triggerType: CronTriggerType,
  triggeredBy: string | null,
  handlerFn: (payload?: P) => Promise<unknown>,
  payload?: P
): Promise<CronJobResult> {
  const { data: job, error: jobError } = await supabaseAdmin
    .from("cron_jobs")
    .select("id, job_key, is_active, max_concurrent_runs, timeout_seconds")
    .eq("job_key", jobKey)
    .maybeSingle<CronJobRow>();

  if (jobError) throw new Error(jobError.message);
  if (!job) {
    throw new Error(
      `Cron job "${jobKey}" is not registered — add it to db/cron_migration.sql (or a follow-up migration) before calling runCronJob for it.`
    );
  }

  if (!job.is_active) {
    const { data: skippedRun } = await supabaseAdmin
      .from("cron_runs")
      .insert({
        job_id: job.id,
        job_key: jobKey,
        trigger_type: triggerType,
        triggered_by: triggeredBy,
        status: "skipped",
        request_payload: payload ?? null,
        response: { note: "job is inactive" },
        finished_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    return { status: "skipped", response: { note: "job is inactive" }, error: null, durationMs: 0, runId: skippedRun?.id ?? null };
  }

  // Auto-heal stale runs first — a genuinely stuck run that never finished
  // (crash, deploy, unhandled hang) must not block concurrency forever.
  const staleCutoff = new Date(Date.now() - job.timeout_seconds * 1000).toISOString();
  await supabaseAdmin
    .from("cron_runs")
    .update({ status: "timeout", finished_at: new Date().toISOString() })
    .eq("job_key", jobKey)
    .eq("status", "running")
    .lt("started_at", staleCutoff);

  const { count: runningCount, error: countError } = await supabaseAdmin
    .from("cron_runs")
    .select("id", { count: "exact", head: true })
    .eq("job_key", jobKey)
    .eq("status", "running");

  if (countError) throw new Error(countError.message);

  if ((runningCount ?? 0) >= job.max_concurrent_runs) {
    const { data: skippedRun } = await supabaseAdmin
      .from("cron_runs")
      .insert({
        job_id: job.id,
        job_key: jobKey,
        trigger_type: triggerType,
        triggered_by: triggeredBy,
        status: "skipped",
        request_payload: payload ?? null,
        response: { note: "max concurrent runs reached" },
        finished_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    return {
      status: "skipped",
      response: { note: "max concurrent runs reached" },
      error: null,
      durationMs: 0,
      runId: skippedRun?.id ?? null,
    };
  }

  const startedAt = new Date();
  const { data: run, error: insertError } = await supabaseAdmin
    .from("cron_runs")
    .insert({
      job_id: job.id,
      job_key: jobKey,
      trigger_type: triggerType,
      triggered_by: triggeredBy,
      status: "running",
      started_at: startedAt.toISOString(),
      request_payload: payload ?? null,
    })
    .select("id")
    .single();

  if (insertError || !run) throw new Error(insertError?.message || "Failed to create cron_runs row");

  let result: CronJobResult;
  try {
    const response = await handlerFn(payload);
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    await supabaseAdmin
      .from("cron_runs")
      .update({ status: "success", finished_at: finishedAt.toISOString(), duration_ms: durationMs, response })
      .eq("id", run.id);
    result = { status: "success", response, error: null, durationMs, runId: run.id };
  } catch (err) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const message = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("cron_runs")
      .update({ status: "failed", finished_at: finishedAt.toISOString(), duration_ms: durationMs, error: message })
      .eq("id", run.id);
    result = { status: "failed", response: null, error: message, durationMs, runId: run.id };
  }

  await supabaseAdmin.from("cron_jobs").update({ last_run_at: new Date().toISOString() }).eq("id", job.id);

  return result;
}
