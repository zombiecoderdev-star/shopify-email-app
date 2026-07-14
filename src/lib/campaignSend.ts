// Real send logic shared by POST /api/shopify/campaigns/send (manual "Send
// Now") and GET/POST /api/shopify/campaigns/process-scheduled. Renders the
// campaign's template per-contact (personalization tags resolved against
// each contact), sends via the configured ESP (src/lib/espProvider.ts), and
// records a campaign_recipients row per attempt — "sent" or "failed", never
// silently dropped. The campaign only flips to "sent" after every attempt
// has been made, and the result surfaces sent/failed counts so a caller can
// report partial failures (expected in AWS SES sandbox mode — see
// HANDOFF.md — where sends to unverified recipients will fail).
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveAudienceContacts } from "@/lib/resolveAudience";
import { sendEmail } from "@/lib/espProvider";
import { renderTemplateHtml, resolveTags, personalizationSample } from "@/lib/renderTemplateHtml";
import type { Block } from "@/components/TemplateEditor";

export type SendCampaignResult = {
  recipient_count: number;
  sent_count: number;
  failed_count: number;
};

export async function sendCampaign(campaignId: string): Promise<SendCampaignResult> {
  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("campaigns")
    .select("id, shop_id, status, audience_filter, template_id, subject, shops(shop_domain)")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new Error("Campaign not found");
  }
  if (campaign.status === "sent") {
    throw new Error("Campaign already sent");
  }
  if (!campaign.template_id) {
    throw new Error("Campaign has no template");
  }

  const { data: template, error: templateError } = await supabaseAdmin
    .from("templates")
    .select("content")
    .eq("id", campaign.template_id)
    .single();

  if (templateError || !template) {
    throw new Error("Template not found");
  }

  const blocks: Block[] = template.content?.blocks || [];
  const shopDomain: string = (campaign.shops as any)?.shop_domain || "";
  const shopName = shopDomain.replace(".myshopify.com", "");

  const contacts = await resolveAudienceContacts(campaign.shop_id, campaign.audience_filter);

  let sentCount = 0;
  let failedCount = 0;

  // Sent sequentially, not in parallel — SES enforces a per-account max
  // send rate (visible via GetSendQuotaCommand, as low as 1/sec in
  // sandbox), so blasting these concurrently would just trade real sends
  // for throttling errors.
  for (const contact of contacts) {
    const sample = personalizationSample(contact, shopName);
    const subject = resolveTags(campaign.subject, sample);
    const html = renderTemplateHtml(blocks, sample);

    const result = await sendEmail({
      to: contact.email,
      subject,
      html,
      campaignId,
      contactId: contact.id,
    });

    if (result.success) {
      sentCount++;
      await supabaseAdmin.from("campaign_recipients").insert({
        campaign_id: campaignId,
        contact_id: contact.id,
        status: "sent",
        esp_message_id: result.messageId || null,
        sent_at: new Date().toISOString(),
      });
    } else {
      failedCount++;
      await supabaseAdmin.from("campaign_recipients").insert({
        campaign_id: campaignId,
        contact_id: contact.id,
        status: "failed",
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("campaigns")
    .update({
      status: "sent",
      sent_at: finishedAt,
      recipient_count: contacts.length,
      updated_at: finishedAt,
    })
    .eq("id", campaignId);
  if (updateError) throw new Error(updateError.message);

  await supabaseAdmin.from("webhook_logs").insert({
    shop_id: campaign.shop_id,
    source: "esp",
    topic: "campaign_send",
    payload: { campaign_id: campaignId, recipient_count: contacts.length, sent_count: sentCount, failed_count: failedCount },
  });

  return { recipient_count: contacts.length, sent_count: sentCount, failed_count: failedCount };
}
