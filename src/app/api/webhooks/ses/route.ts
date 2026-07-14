import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifySnsSignature, type SnsMessage } from "@/lib/snsVerify";

// POST /api/webhooks/ses
//
// AWS SES publishes bounce/complaint/delivery events to an SNS topic (via
// an SES configuration set — manual AWS console setup, see HANDOFF.md,
// this can't be done from code). SNS delivers those events here as plain
// HTTP POSTs with its own envelope — not a simple webhook, hence the
// subscription-confirmation handshake and signature verification below.
// campaignId/contactId are matched via the message tags set in
// src/lib/espProvider.ts's sendEmail(), which SES echoes back in
// mail.tags on every notification.

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  let snsMessage: SnsMessage;
  try {
    snsMessage = JSON.parse(rawBody);
  } catch {
    // Can't parse — nothing to act on, but still ack so SNS doesn't retry-storm.
    return NextResponse.json({ ok: true });
  }

  const verified = await verifySnsSignature(snsMessage);
  if (!verified) {
    console.error("[ses webhook] SNS signature verification failed — dropping message", snsMessage.MessageId);
    return NextResponse.json({ ok: true });
  }

  // First message on a new subscription is a confirmation handshake —
  // auto-confirm by fetching the SubscribeURL SNS gives us.
  if (snsMessage.Type === "SubscriptionConfirmation" || snsMessage.Type === "UnsubscribeConfirmation") {
    if (snsMessage.SubscribeURL) {
      try {
        await fetch(snsMessage.SubscribeURL);
      } catch (err) {
        console.error("[ses webhook] failed to confirm SNS subscription", err);
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (snsMessage.Type !== "Notification") {
    return NextResponse.json({ ok: true });
  }

  let sesEvent: any;
  try {
    sesEvent = JSON.parse(snsMessage.Message);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Configuration-set event publishing uses "eventType"; classic (non
  // configuration-set) notifications use "notificationType" — accept either.
  const eventType: string | undefined = sesEvent.eventType || sesEvent.notificationType;
  const tags = sesEvent.mail?.tags || {};
  const campaignId: string | undefined = tags.campaignId?.[0];
  const contactId: string | undefined = tags.contactId?.[0];

  let shopId: string | null = null;
  if (campaignId) {
    const { data: campaign } = await supabaseAdmin
      .from("campaigns")
      .select("shop_id")
      .eq("id", campaignId)
      .single();
    shopId = campaign?.shop_id || null;
  }

  await supabaseAdmin.from("webhook_logs").insert({
    shop_id: shopId,
    source: "esp",
    topic: `ses_${(eventType || "unknown").toLowerCase()}`,
    payload: sesEvent,
  });

  if (campaignId && contactId) {
    const nowIso = new Date().toISOString();
    if (eventType === "Bounce") {
      await supabaseAdmin
        .from("campaign_recipients")
        .update({ status: "bounced", bounced_at: nowIso })
        .eq("campaign_id", campaignId)
        .eq("contact_id", contactId);
    } else if (eventType === "Complaint") {
      await supabaseAdmin
        .from("campaign_recipients")
        .update({ status: "complained", complained_at: nowIso })
        .eq("campaign_id", campaignId)
        .eq("contact_id", contactId);
    } else if (eventType === "Delivery") {
      await supabaseAdmin
        .from("campaign_recipients")
        .update({ status: "delivered" })
        .eq("campaign_id", campaignId)
        .eq("contact_id", contactId);
    }
  }

  // Always 200 quickly — SNS retries (and can eventually disable the
  // subscription) on non-2xx, same reasoning as the Shopify webhook handler.
  return NextResponse.json({ ok: true });
}
