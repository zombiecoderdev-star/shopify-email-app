import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";

// GET /api/admin/cron/runs/[id]
// Single run, full untruncated request_payload/response/error — for the
// slide-in detail panel.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: run, error } = await supabaseAdmin
    .from("cron_runs")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({ run });
}
