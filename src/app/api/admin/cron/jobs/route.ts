import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";

// GET /api/admin/cron/jobs
// Lists every cron_jobs row plus a live currently_running_count (excluding
// runs stale past the job's own timeout_seconds — those read as "running"
// in the DB until the next runCronJob call heals them, so we exclude them
// here rather than show a misleading stuck count) and the most recent
// cron_runs row as last_result.
export async function GET(req: NextRequest) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: jobs, error } = await supabaseAdmin
    .from("cron_jobs")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const jobsWithStatus = await Promise.all(
    (jobs || []).map(async (job) => {
      const cutoff = new Date(Date.now() - job.timeout_seconds * 1000).toISOString();

      const { count } = await supabaseAdmin
        .from("cron_runs")
        .select("id", { count: "exact", head: true })
        .eq("job_key", job.job_key)
        .eq("status", "running")
        .gte("started_at", cutoff);

      const { data: lastRun } = await supabaseAdmin
        .from("cron_runs")
        .select("id, status, started_at, finished_at, duration_ms")
        .eq("job_key", job.job_key)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...job,
        currently_running_count: count || 0,
        last_result: lastRun || null,
      };
    })
  );

  return NextResponse.json({ jobs: jobsWithStatus });
}
