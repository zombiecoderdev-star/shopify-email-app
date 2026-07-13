import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { countAllAudienceSegments } from "@/lib/audienceQueries";

// GET /api/shopify/campaigns/audience-count?shop=xxx
// Returns exact recipient counts for all four audience segments in one
// round trip, e.g. { subscribed: 120, frequent: 18, all: 140, unsubscribed: 20 }.
// Used by the campaign wizard's Audience step to show a live count next to
// each segment. A dedicated COUNT query (not a client-side filter over
// /api/shopify/contacts, which caps at 100 rows) so it stays accurate at
// any list size.

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

  try {
    const counts = await countAllAudienceSegments(shopRow.id);
    return NextResponse.json({ counts });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to count audience" }, { status: 500 });
  }
}
