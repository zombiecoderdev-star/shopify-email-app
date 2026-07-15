import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";
import { runCronJob } from "@/lib/cronRunner";
import { CRON_JOB_REGISTRY } from "@/lib/cronJobs/registry";

// POST /api/admin/cron/jobs/[id]/run
// Manually triggers a cron job right now. Uses the same registry map as the
// tick dispatcher, and the same runCronJob() wrapper — so max_concurrent_runs
// is respected exactly as it is for automatic runs.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: job, error } = await supabaseAdmin
    .from("cron_jobs")
    .select("job_key")
    .eq("id", id)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Cron job not found" }, { status: 404 });
  }

  const handler = CRON_JOB_REGISTRY[job.job_key];
  if (!handler) {
    return NextResponse.json({ error: `No handler registered for "${job.job_key}"` }, { status: 400 });
  }

  const result = await runCronJob(job.job_key, "manual", user.email ?? null, handler);
  return NextResponse.json(result);
}
