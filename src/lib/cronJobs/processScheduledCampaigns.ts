// Plain function form of the campaign scheduler's processing logic —
// extracted from src/app/api/shopify/campaigns/process-scheduled/route.ts
// so it can be passed as the handlerFn to runCronJob() (see cronRunner.ts)
// from both the process-scheduled route itself and the universal tick
// dispatcher / admin "Run Now" button, via src/lib/cronJobs/registry.ts.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendCampaign } from "@/lib/campaignSend";

export async function processScheduledCampaigns(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  errors: { campaign_id: string; error: string }[];
}> {
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabaseAdmin
    .from("campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso);

  if (error) throw new Error(error.message);

  let sent = 0;
  let failed = 0;
  const errors: { campaign_id: string; error: string }[] = [];

  for (const c of due || []) {
    try {
      await sendCampaign(c.id);
      sent++;
    } catch (err) {
      failed++;
      errors.push({ campaign_id: c.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { processed: (due || []).length, sent, failed, errors };
}
