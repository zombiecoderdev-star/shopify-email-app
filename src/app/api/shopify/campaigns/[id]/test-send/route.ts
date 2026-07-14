import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/espProvider";
import { renderTemplateHtml, resolveTags, personalizationSample } from "@/lib/renderTemplateHtml";
import type { Block } from "@/components/TemplateEditor";

// POST /api/shopify/campaigns/[id]/test-send
// Body: { shop, email }
//
// Sends ONE rendered copy of the campaign's email (its subject + its
// template, personalization tags resolved against sample values) to the
// given address via the configured ESP. Deliberately touches nothing else:
// no campaign status change, no campaign_recipients rows, no credits — and
// no SES message tags, so a bounce of a test email can't be mistaken for a
// real recipient event by the SNS webhook.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { shop, email } = await req.json();

  if (!shop || !email) {
    return NextResponse.json({ error: "shop and email are required" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("id, subject, template_id")
    .eq("id", id)
    .eq("shop_id", shopRow.id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (!campaign.template_id) {
    return NextResponse.json({ error: "Campaign has no template to render" }, { status: 400 });
  }

  const { data: template } = await supabaseAdmin
    .from("templates")
    .select("content")
    .eq("id", campaign.template_id)
    .single();

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const shopName = shop.replace(".myshopify.com", "");
  const sample = personalizationSample(null, shopName);
  const blocks: Block[] = template.content?.blocks || [];

  const subject = resolveTags(campaign.subject || "Test Email", sample);
  const html = renderTemplateHtml(blocks, sample);

  const result = await sendEmail({ to: email, subject, html });

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Test send failed" }, { status: 502 });
  }

  await supabaseAdmin.from("webhook_logs").insert({
    shop_id: shopRow.id,
    source: "esp",
    topic: "campaign_test_send",
    payload: { campaign_id: id, test_email: email, message_id: result.messageId || null },
  });

  return NextResponse.json({
    success: true,
    message: `Test email sent to ${email} ✅`,
  });
}
