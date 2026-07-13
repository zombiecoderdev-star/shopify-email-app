import { NextRequest, NextResponse } from "next/server";
import { sendCampaignStub } from "@/lib/campaignSend";

// POST /api/shopify/campaigns/send
// Body: { campaign_id }
// Stub send — no ESP integration yet (#9). See src/lib/campaignSend.ts for
// what actually happens (resolves audience, writes campaign_recipients,
// flips status to "sent"). Never claims to have actually delivered mail.

export async function POST(req: NextRequest) {
  const { campaign_id } = await req.json();

  if (!campaign_id) {
    return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });
  }

  try {
    const { recipient_count } = await sendCampaignStub(campaign_id);
    return NextResponse.json({
      success: true,
      recipient_count,
      message: "Campaign marked sent — ESP integration required for actual delivery",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Send failed" }, { status: 400 });
  }
}
