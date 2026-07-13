import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// POST /api/shopify/templates/test-send
// Body: { shop, template_id, test_email }
//
// Stub only — no ESP integration yet (#9). Validates the email, logs the
// attempt (webhook_logs, source "esp" / topic "test_send_stub"), and returns
// a message that says exactly that. Never claims to have actually sent mail.

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
    .select("id")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  console.log(`[test-send stub] shop=${shop} template=${template_id || "none"} to=${test_email}`);

  await supabaseAdmin.from("webhook_logs").insert({
    shop_id: shopRow.id,
    source: "esp",
    topic: "test_send_stub",
    payload: { template_id: template_id || null, test_email },
  });

  return NextResponse.json({
    success: true,
    message: "Test send logged — ESP integration required to actually deliver",
  });
}
