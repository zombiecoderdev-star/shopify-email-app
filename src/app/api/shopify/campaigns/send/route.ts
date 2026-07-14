import { NextRequest, NextResponse } from "next/server";
import { sendCampaign } from "@/lib/campaignSend";

// POST /api/shopify/campaigns/send
// Body: { campaign_id }
// Real send via the configured ESP — see src/lib/campaignSend.ts. Surfaces
// partial failure counts rather than a flat success/fail, since some
// recipients failing (e.g. unverified addresses while AWS SES is still in
// sandbox mode) doesn't mean the whole send failed.

export async function POST(req: NextRequest) {
  const { campaign_id } = await req.json();

  if (!campaign_id) {
    return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
  }

  try {
    const { recipient_count, sent_count, failed_count } = await sendCampaign(campaign_id);

    const message =
      recipient_count === 0
        ? "Campaign sent — no recipients matched the selected audience"
        : failed_count === 0
        ? `Campaign sent to ${sent_count} recipient${sent_count === 1 ? "" : "s"}`
        : sent_count === 0
        ? `Campaign send failed for all ${failed_count} recipients — check AWS SES configuration (sandbox mode only allows verified addresses)`
        : `Campaign sent to ${sent_count} of ${recipient_count} recipients — ${failed_count} failed (see recipient list)`;

    return NextResponse.json({
      success: true,
      recipient_count,
      sent_count,
      failed_count,
      message,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Send failed" }, { status: 400 });
  }
}
