import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendCampaignStub } from "@/lib/campaignSend";

// GET/POST /api/shopify/campaigns/process-scheduled
//
// Finds every campaign with status "scheduled" whose scheduled_at has
// passed, and runs the same stub-send flow (src/lib/campaignSend.ts) for
// each. Mirrors the flow_runs.next_action_at pattern already noted in
// HANDOFF.md for future background jobs (#8 automation flows), so this
// stays architecturally consistent when a real job runner gets built.
//
// NOT wired up to run automatically yet — this route needs an external
// trigger (a cron job, Vercel Cron, a scheduled Supabase function, etc.) to
// actually fire on a schedule. For now it's only manually triggerable
// (GET or POST this URL) so the processing logic itself can be tested.
// Deliberately no auth check, since a cron trigger may not be able to send
// one — add one (e.g. a shared secret header) before wiring up a real
// scheduler if this route needs to be reachable from the public internet.

async function processScheduled() {
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabaseAdmin
    .from("campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso);

  if (error) throw new Error(error.message);

  const results: { campaign_id: string; success: boolean; recipient_count?: number; error?: string }[] = [];

  for (const c of due || []) {
    try {
      const { recipient_count } = await sendCampaignStub(c.id);
      results.push({ campaign_id: c.id, success: true, recipient_count });
    } catch (err: any) {
      results.push({ campaign_id: c.id, success: false, error: err?.message || "Send failed" });
    }
  }

  return results;
}

export async function GET() {
  const results = await processScheduled();
  return NextResponse.json({ processed: results.length, results });
}

export async function POST() {
  const results = await processScheduled();
  return NextResponse.json({ processed: results.length, results });
}
