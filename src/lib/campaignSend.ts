// Stub send logic shared by POST /api/shopify/campaigns/send (manual "Send
// Now") and GET/POST /api/shopify/campaigns/process-scheduled (cron-target
// stub). No real ESP integration yet (#9) — this resolves the audience,
// writes campaign_recipients rows, flips the campaign to "sent", and logs
// the attempt. It never actually delivers mail.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveAudienceContactIds } from "@/lib/audienceQueries";

export async function sendCampaignStub(campaignId: string): Promise<{ recipient_count: number }> {
  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("campaigns")
    .select("id, shop_id, status, audience_filter")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new Error("Campaign not found");
  }
  if (campaign.status === "sent") {
    throw new Error("Campaign already sent");
  }

  const contactIds = await resolveAudienceContactIds(campaign.shop_id, campaign.audience_filter);

  if (contactIds.length > 0) {
    const rows = contactIds.map((contact_id) => ({
      campaign_id: campaignId,
      contact_id,
      status: "sent",
    }));
    const { error: insertError } = await supabaseAdmin.from("campaign_recipients").insert(rows);
    if (insertError) throw new Error(insertError.message);
  }

  const sentAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("campaigns")
    .update({
      status: "sent",
      sent_at: sentAt,
      recipient_count: contactIds.length,
      updated_at: sentAt,
    })
    .eq("id", campaignId);
  if (updateError) throw new Error(updateError.message);

  await supabaseAdmin.from("webhook_logs").insert({
    shop_id: campaign.shop_id,
    source: "esp",
    topic: "campaign_send_stub",
    payload: { campaign_id: campaignId, recipient_count: contactIds.length },
  });

  return { recipient_count: contactIds.length };
}
