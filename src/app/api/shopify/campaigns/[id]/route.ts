import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeAudienceFilter } from "@/lib/audience";

// "sending"/"sent"/"failed" can't be set via PUT — only the send flow's
// atomic claim (campaignSend.ts) transitions into them.
const VALID_STATUSES = ["draft", "scheduled"];
const EDITABLE_STATUSES = ["draft", "scheduled"];

// PUT /api/shopify/campaigns/[id]
// Body: { shop, name, subject, template_id, audience_filter, status?, scheduled_at? }
// Only draft/scheduled campaigns can be edited — sent (or mid-send) campaigns
// are view-only.

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const { data: existing } = await supabaseAdmin
    .from("campaigns")
    .select("id, status")
    .eq("id", id)
    .eq("shop_id", shopRow.id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    return NextResponse.json({ error: "Only draft or scheduled campaigns can be edited" }, { status: 400 });
  }

  const { data: campaign, error } = await supabaseAdmin
    .from("campaigns")
    .update({
      template_id,
      name,
      subject,
      // Re-saving an old campaign migrates its legacy { segment } filter to
      // the current discriminated shape as a side effect.
      audience_filter: normalizeAudienceFilter(audience_filter),
      status: status || existing.status,
      scheduled_at: status === "scheduled" ? scheduled_at : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("shop_id", shopRow.id)
    .select()
    .single();

  if (error || !campaign) {
    return NextResponse.json({ error: error?.message || "Campaign not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, campaign });
}

// DELETE /api/shopify/campaigns/[id]
// Body: { shop } — only draft/scheduled campaigns can be deleted.

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { shop } = await req.json();

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

  const { data: existing } = await supabaseAdmin
    .from("campaigns")
    .select("id, status")
    .eq("id", id)
    .eq("shop_id", shopRow.id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (!EDITABLE_STATUSES.includes(existing.status)) {
    return NextResponse.json({ error: "Only draft or scheduled campaigns can be deleted" }, { status: 400 });
  }

  await supabaseAdmin
    .from("campaigns")
    .delete()
    .eq("id", id)
    .eq("shop_id", shopRow.id);

  return NextResponse.json({ success: true });
}
