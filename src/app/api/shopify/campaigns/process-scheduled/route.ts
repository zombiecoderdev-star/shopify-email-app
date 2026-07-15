import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cronAuth";
import { runCronJob } from "@/lib/cronRunner";
import { processScheduledCampaigns } from "@/lib/cronJobs/processScheduledCampaigns";

// GET/POST /api/shopify/campaigns/process-scheduled
//
// Thin wrapper — the actual campaign-processing logic lives in
// src/lib/cronJobs/processScheduledCampaigns.ts so it can also run as a
// handlerFn from the universal tick dispatcher (/api/cron/tick) and the
// admin "Run Now" button (see src/lib/cronJobs/registry.ts). This route
// stays usable for direct/manual calls, protected by the same CRON_SECRET
// header check as the tick dispatcher.
async function handle(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runCronJob("process_scheduled_campaigns", "manual", null, processScheduledCampaigns);
  return NextResponse.json(result);
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
