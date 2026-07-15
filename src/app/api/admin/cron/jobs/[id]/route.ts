import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";

const PATCHABLE_FIELDS = [
  "schedule_type",
  "interval_type",
  "interval_minutes",
  "max_concurrent_runs",
  "timeout_seconds",
  "is_active",
] as const;

// PATCH /api/admin/cron/jobs/[id]
// Body: any subset of PATCHABLE_FIELDS. Recomputes next_run_at when
// switching manual -> automatic, or when the interval changes while already
// automatic. Switching to manual sets next_run_at to null.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("cron_jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Cron job not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of PATCHABLE_FIELDS) {
    if (key in body) update[key] = body[key];
  }

  const nextScheduleType = (update.schedule_type as string | undefined) ?? existing.schedule_type;
  const nextIntervalMinutes = (update.interval_minutes as number | undefined) ?? existing.interval_minutes;
  const scheduleTypeChanging = "schedule_type" in update && update.schedule_type !== existing.schedule_type;
  const intervalChanging = "interval_type" in update || "interval_minutes" in update;

  if (nextScheduleType === "manual") {
    update.next_run_at = null;
  } else if ((scheduleTypeChanging && nextScheduleType === "automatic") || intervalChanging) {
    update.next_run_at = new Date(Date.now() + (nextIntervalMinutes || 0) * 60_000).toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from("cron_jobs")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ job: data });
}
