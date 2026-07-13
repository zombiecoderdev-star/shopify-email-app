import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/shopify/campaigns/[id]/recipients?shop=xxx
// Lists recipients for a sent (or sending) campaign, joined with contact
// details, for the campaign view page's recipient list.

export async function GET(
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
    .select("id")
    .eq("id", id)
    .eq("shop_id", shopRow.id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const { data: recipients, error } = await supabaseAdmin
    .from("campaign_recipients")
    .select("id, status, created_at, contacts(email, first_name, last_name)")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recipients });
}
