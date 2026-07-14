// Real send logic shared by POST /api/shopify/campaigns/[id]/send (manual
// "Send Now") and GET/POST /api/shopify/campaigns/process-scheduled.
//
// Flow: validate → atomically claim the campaign (draft/scheduled →
// "sending", so a double-click / concurrent cron tick can't send twice) →
// resolve the audience and keep only subscribed contacts with a valid email
// → insert a "pending" campaign_recipients row per contact up front → send
// in small batches with a delay between batches (SES enforces a per-account
// max send rate — 1/sec in sandbox — so firing everything in parallel would
// just trade real sends for throttling errors) → flip each row to
// "sent"/"failed" (+ error message) → finish the campaign as "sent", or
// "failed" if every single recipient failed → record the send in
// email_credits_ledger (append-only, negative change) and decrement
// shops.credits_balance.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveAudienceContacts, type AudienceContact } from "@/lib/resolveAudience";
import { sendEmail } from "@/lib/espProvider";
import { renderTemplateHtml, resolveTags, personalizationSample } from "@/lib/renderTemplateHtml";
import type { Block } from "@/components/TemplateEditor";

// Thrown when the campaign is already sending/sent (or was claimed by a
// concurrent request between our status check and update) — the send route
// maps this to HTTP 409.
export class CampaignSendConflictError extends Error {}

export type SendCampaignResult = {
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: "sent" | "failed";
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 5 sends per ~1.1s ≈ up to 4.5/sec — fine once out of sandbox (default
// production rate is 14/sec). In sandbox (1/sec) a burst inside a batch can
// still throttle; throttled sends land as per-recipient "failed" rows with
// SES's error message rather than crashing the run.
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1100;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// campaign_recipients.error comes from db/campaign_send_migration.sql — if
// that migration hasn't run yet, retry the update without the column rather
// than failing the whole send (same defensive-optional-column convention as
// shops.last_synced_at, see HANDOFF.md).
async function updateRecipientRow(
  campaignId: string,
  contactId: string,
  fields: { status: string; esp_message_id?: string | null; sent_at?: string; error?: string | null }
) {
  const { error } = await supabaseAdmin
    .from("campaign_recipients")
    .update(fields)
    .eq("campaign_id", campaignId)
    .eq("contact_id", contactId);
  if (error && fields.error !== undefined && /'error' column/i.test(error.message)) {
    const withoutError = { ...fields };
    delete withoutError.error;
    await supabaseAdmin
      .from("campaign_recipients")
      .update(withoutError)
      .eq("campaign_id", campaignId)
      .eq("contact_id", contactId);
  }
}

export async function sendCampaign(campaignId: string): Promise<SendCampaignResult> {
  const { data: campaign, error: campaignError } = await supabaseAdmin
    .from("campaigns")
    .select("id, shop_id, status, audience_filter, template_id, subject, shops(shop_domain)")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new Error("Campaign not found");
  }
  if (campaign.status === "sending" || campaign.status === "sent") {
    throw new CampaignSendConflictError(`Campaign is already ${campaign.status}`);
  }
  if (!["draft", "scheduled"].includes(campaign.status)) {
    throw new Error("Only draft or scheduled campaigns can be sent");
  }
  if (!campaign.template_id) {
    throw new Error("Campaign has no template");
  }
  if (!campaign.subject?.trim()) {
    throw new Error("Campaign has no subject");
  }

  const { data: template, error: templateError } = await supabaseAdmin
    .from("templates")
    .select("content")
    .eq("id", campaign.template_id)
    .single();

  if (templateError || !template) {
    throw new Error("Template not found");
  }

  // Atomic claim: only one caller can move draft/scheduled → sending. A
  // concurrent request (double-click, overlapping cron tick) finds zero rows
  // matching the status filter and gets a conflict instead of a double send.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("campaigns")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .in("status", ["draft", "scheduled"])
    .select("id");

  if (claimError) throw new Error(claimError.message);
  if (!claimed || claimed.length === 0) {
    throw new CampaignSendConflictError("Campaign is already sending or sent");
  }

  const blocks: Block[] = template.content?.blocks || [];
  const shopDomain: string = (campaign.shops as unknown as { shop_domain?: string } | null)?.shop_domain || "";
  const shopName = shopDomain.replace(".myshopify.com", "");

  // Marketing consent is enforced at send time regardless of audience type:
  // only subscribed contacts with a plausible email address get mail. The
  // "All contacts"/"Unsubscribed list" segments and hand-picked unsubscribed
  // contacts still show in wizard counts, but are skipped here — so the
  // wizard's preview count can exceed the attempted recipient count.
  const contacts = (await resolveAudienceContacts(campaign.shop_id, campaign.audience_filter)).filter(
    (c) => c.subscribed && !!c.email && EMAIL_RE.test(c.email)
  );

  const finishCampaign = async (fields: Record<string, unknown>) => {
    const { error } = await supabaseAdmin.from("campaigns").update(fields).eq("id", campaignId);
    if (error) throw new Error(error.message);
  };

  if (contacts.length === 0) {
    await finishCampaign({
      status: "sent",
      sent_at: new Date().toISOString(),
      recipient_count: 0,
      updated_at: new Date().toISOString(),
    });
    return { recipient_count: 0, sent_count: 0, failed_count: 0, status: "sent" };
  }

  // One "pending" row per recipient BEFORE any send goes out, so a crash
  // mid-send leaves an auditable trail of what was attempted vs. still
  // pending instead of silently losing recipients.
  const { error: pendingError } = await supabaseAdmin.from("campaign_recipients").insert(
    contacts.map((c) => ({ campaign_id: campaignId, contact_id: c.id, status: "pending" }))
  );
  if (pendingError) {
    await finishCampaign({ status: campaign.status, updated_at: new Date().toISOString() });
    throw new Error(`Failed to create recipient rows: ${pendingError.message}`);
  }

  let sentCount = 0;
  let failedCount = 0;

  async function sendToContact(contact: AudienceContact) {
    const sample = personalizationSample(contact, shopName);
    const subject = resolveTags(campaign!.subject, sample);
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
      await updateRecipientRow(campaignId, contact.id, {
        status: "sent",
        esp_message_id: result.messageId || null,
        sent_at: new Date().toISOString(),
      });
    } else {
      failedCount++;
      await updateRecipientRow(campaignId, contact.id, {
        status: "failed",
        error: result.error || "Send failed",
      });
    }
  }

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(sendToContact));
    if (i + BATCH_SIZE < contacts.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const finishedAt = new Date().toISOString();
  const finalStatus: "sent" | "failed" = sentCount === 0 ? "failed" : "sent";
  await finishCampaign({
    status: finalStatus,
    sent_at: finalStatus === "sent" ? finishedAt : null,
    recipient_count: contacts.length,
    updated_at: finishedAt,
  });

  // Append-only credits ledger entry for what actually went out, plus the
  // running balance on shops (schema.sql: "kept in sync by application
  // logic"). Failed sends aren't billed.
  if (sentCount > 0) {
    await supabaseAdmin.from("email_credits_ledger").insert({
      shop_id: campaign.shop_id,
      change: -sentCount,
      reason: "campaign_send",
      reference_id: campaignId,
    });
    const { data: shopRow } = await supabaseAdmin
      .from("shops")
      .select("credits_balance")
      .eq("id", campaign.shop_id)
      .single();
    if (shopRow) {
      await supabaseAdmin
        .from("shops")
        .update({ credits_balance: (shopRow.credits_balance || 0) - sentCount })
        .eq("id", campaign.shop_id);
    }
  }

  await supabaseAdmin.from("webhook_logs").insert({
    shop_id: campaign.shop_id,
    source: "esp",
    topic: "campaign_send",
    payload: {
      campaign_id: campaignId,
      status: finalStatus,
      recipient_count: contacts.length,
      sent_count: sentCount,
      failed_count: failedCount,
    },
  });

  return { recipient_count: contacts.length, sent_count: sentCount, failed_count: failedCount, status: finalStatus };
}
