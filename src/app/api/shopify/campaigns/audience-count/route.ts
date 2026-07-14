import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { countAllAudienceSegments, countAudience } from "@/lib/resolveAudience";

// GET /api/shopify/campaigns/audience-count?shop=xxx
// Returns exact recipient counts for all four audience segments in one
// round trip, e.g. { subscribed: 120, frequent: 18, all: 140, unsubscribed: 20 }.
// Used by the campaign wizard's Audience step to show a live count next to
// each segment. A dedicated COUNT query (not a client-side filter over
// /api/shopify/contacts, which caps at 100 rows) so it stays accurate at
// any list size.

async function shopIdFromDomain(shop: string): Promise<string | null> {
  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id")
    .eq("shop_domain", shop)
    .single();
  return shopRow?.id ?? null;
}

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");

  if (!shop) {
    return NextResponse.json({ error: "Missing shop" }, { status: 400 });
  }

  const shopId = await shopIdFromDomain(shop);
  if (!shopId) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  try {
    const counts = await countAllAudienceSegments(shopId);
    return NextResponse.json({ counts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to count audience" },
      { status: 500 }
    );
  }
}

// POST /api/shopify/campaigns/audience-count
// Body: { shop, audience_filter }
// Returns { count } for ANY audience filter shape (segment / tag / specific
// contacts) via the same resolveAudience logic the actual send uses — this
// is what the wizard's "By tag" live recipient count calls as tags are
// toggled.

export async function POST(req: NextRequest) {
  const { shop, audience_filter } = await req.json();

  if (!shop) {
    return NextResponse.json({ error: "Missing shop" }, { status: 400 });
  }

  const shopId = await shopIdFromDomain(shop);
  if (!shopId) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  try {
    const count = await countAudience(shopId, audience_filter);
    return NextResponse.json({ count });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to count audience" },
      { status: 500 }
    );
  }
}
