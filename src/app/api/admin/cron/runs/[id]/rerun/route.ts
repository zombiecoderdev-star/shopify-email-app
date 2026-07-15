import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";
import { runCronJob } from "@/lib/cronRunner";
import { CRON_JOB_REGISTRY } from "@/lib/cronJobs/registry";

// POST /api/admin/cron/runs/[id]/rerun
// Re-triggers the same job a failed/timed-out run belongs to, via the same
// path as "Run Now" (respects max_concurrent_runs). Does NOT reuse the old
// cron_runs row — creates a fresh one and links back via rerun_of.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: run, error } = await supabaseAdmin
    .from("cron_runs")
    .select("job_key")
    .eq("id", id)
    .single();

  if (error || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const handler = CRON_JOB_REGISTRY[run.job_key];
  if (!handler) {
    return NextResponse.json({ error: `No handler registered for "${run.job_key}"` }, { status: 400 });
  }

  const result = await runCronJob(run.job_key, "manual", user.email ?? null, handler);

  if (result.runId) {
    await supabaseAdmin.from("cron_runs").update({ rerun_of: id }).eq("id", result.runId);
  }

  return NextResponse.json(result);
}
