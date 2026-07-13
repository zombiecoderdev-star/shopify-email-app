import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/shopify/campaigns?shop=xxx
// Returns campaigns for the given shop, with the template name embedded
// (PostgREST auto-detects the campaigns.template_id -> templates(id) FK).

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");

  if (!shop) {
    return NextResponse.json({ error: "Missing shop" }, { status: 400 });
  }

  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const { data: campaigns, error } = await supabaseAdmin
    .from("campaigns")
    .select("*, templates(name, subject)")
    .eq("shop_id", shopRow.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ campaigns });
}

// POST /api/shopify/campaigns
// Body: { shop, name, subject, template_id, audience_filter, status?, scheduled_at? }
// Creates a campaign. status defaults to "draft"; pass "scheduled" with
// scheduled_at, or "sending" right before calling POST .../send.

const VALID_STATUSES = ["draft", "scheduled", "sending"];

export async function POST(req: NextRequest) {
  const { shop, name, subject, template_id, audience_filter, status, scheduled_at } = await req.json();

  if (!shop || !name || !subject || !template_id) {
    return NextResponse.json({ error: "shop, name, subject, and template_id are required" }, { status: 400 });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }
  if (status === "scheduled" && !scheduled_at) {
    return NextResponse.json({ error: "scheduled_at is required when status is scheduled" }, { status: 400 });
  }

  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const { data: campaign, error } = await supabaseAdmin
    .from("campaigns")
    .insert({
      shop_id: shopRow.id,
      template_id,
      name,
      subject,
      audience_filter: audience_filter || { segment: "subscribed" },
      status: status || "draft",
      scheduled_at: status === "scheduled" ? scheduled_at : null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, campaign });
}
