import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/espProvider";
import { renderTemplateHtml, resolveTags, personalizationSample } from "@/lib/renderTemplateHtml";
import type { Block } from "@/components/TemplateEditor";

// POST /api/shopify/templates/test-send
// Body: { shop, template_id, test_email }
//
// Sends a real test email via the configured ESP (src/lib/espProvider.ts).
// template_id is optional — omit it (as the "Sending & ESP" settings page's
// connection-check button does) to send a hardcoded test message instead of
// rendering a saved template, so the AWS connection can be verified
// independent of any template existing.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const { shop, template_id, test_email } = await req.json();

  if (!shop || !test_email) {
    return NextResponse.json({ error: "shop and test_email are required" }, { status: 400 });
  }
  if (!EMAIL_RE.test(test_email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id, shop_domain")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const shopName = shop.replace(".myshopify.com", "");
  const sample = personalizationSample(null, shopName);

  let subject: string;
  let html: string;

  if (template_id) {
    const { data: template } = await supabaseAdmin
      .from("templates")
      .select("subject, content")
      .eq("id", template_id)
      .eq("shop_id", shopRow.id)
      .single();

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const blocks: Block[] = template.content?.blocks || [];
    subject = resolveTags(template.subject || "Test Email", sample);
    html = renderTemplateHtml(blocks, sample);
  } else {
    subject = "Test Email";
    html = renderTemplateHtml(
      [
        { id: "test-header", type: "header", data: { text: `Test email from ${shopName}`, fontSize: 22 } },
        { id: "test-text", type: "text", data: { text: "This confirms your AWS SES connection is configured correctly." } },
      ],
      sample
    );
  }

  const result = await sendEmail({ to: test_email, subject, html });

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Test send failed" }, { status: 502 });
  }

  await supabaseAdmin.from("webhook_logs").insert({
    shop_id: shopRow.id,
    source: "esp",
    topic: "test_send",
    payload: { template_id: template_id || null, test_email, message_id: result.messageId || null },
  });

  return NextResponse.json({
    success: true,
    message: `Test email sent to ${test_email} ✅`,
  });
}
