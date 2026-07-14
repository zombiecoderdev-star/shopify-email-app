import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeTags } from "@/lib/tags";

// GET /api/shopify/tags?shop=xxx
// Returns the distinct tags across all of the shop's contacts, sorted
// alphabetically — used for autocomplete in ManageTagsModal and for the
// campaign wizard's "By tag" audience multi-select.

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

  // Only rows with at least one tag — no need to pull every contact.
  const { data, error } = await supabaseAdmin
    .from("contacts")
    .select("tags")
    .eq("shop_id", shopRow.id)
    .not("tags", "eq", "{}");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tags = normalizeTags((data || []).flatMap((row: { tags: string[] | null }) => row.tags || [])).sort();

  return NextResponse.json({ tags });
}
