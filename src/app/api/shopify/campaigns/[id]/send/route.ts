import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendCampaign, CampaignSendConflictError } from "@/lib/campaignSend";

// POST /api/shopify/campaigns/[id]/send?shop=xxx
//
// Real campaign send via the configured ESP — see src/lib/campaignSend.ts
// for the full flow (atomic status claim, pending recipient rows, batched
// sends, credits ledger). This route validates ownership + status and maps
// outcomes to HTTP codes:
//   404 — shop or campaign not found (or campaign belongs to another shop)
//   409 — already sending/sent (double-click / concurrent request guard)
//   400 — not sendable (no template/subject, or a terminal "failed" status)
//
// Surfaces partial-failure counts rather than a flat success/fail, since
// some recipients failing (e.g. unverified addresses while AWS SES is in
// sandbox mode) doesn't mean the whole send failed.

const SENDABLE_STATUSES = ["draft", "scheduled"];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const { data: campaign } = await supabaseAdmin
    .from("campaigns")
    .select("id, status, subject, template_id")
    .eq("id", id)
    .eq("shop_id", shopRow.id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status === "sending" || campaign.status === "sent") {
    return NextResponse.json({ error: `Campaign is already ${campaign.status}` }, { status: 409 });
  }
  if (!SENDABLE_STATUSES.includes(campaign.status)) {
    return NextResponse.json({ error: "Only draft or scheduled campaigns can be sent" }, { status: 400 });
  }
  if (!campaign.template_id) {
    return NextResponse.json({ error: "Campaign has no template" }, { status: 400 });
  }
  if (!campaign.subject?.trim()) {
    return NextResponse.json({ error: "Campaign has no subject" }, { status: 400 });
  }

  try {
    const { recipient_count, sent_count, failed_count, status } = await sendCampaign(id);

    const message =
      recipient_count === 0
        ? "Campaign sent — no subscribed recipients matched the selected audience"
        : status === "failed"
        ? `Campaign send failed for all ${failed_count} recipients — check AWS SES configuration (sandbox mode only allows verified addresses)`
        : failed_count === 0
        ? `Campaign sent to ${sent_count} recipient${sent_count === 1 ? "" : "s"}`
        : `Campaign sent to ${sent_count} of ${recipient_count} recipients — ${failed_count} failed (see recipient list)`;

    return NextResponse.json({
      success: true,
      status,
      recipient_count,
      sent_count,
      failed_count,
      message,
    });
  } catch (err) {
    if (err instanceof CampaignSendConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 400 }
    );
  }
}
