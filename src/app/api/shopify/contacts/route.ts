import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/shopify/contacts?shop=xxx
// Returns contacts for the given shop from our Supabase DB.

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");

  if (!shop) {
    return NextResponse.json({ error: "Missing shop" }, { status: 400 });
  }

  // Get shop UUID first
  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const { data: contacts, error, count } = await supabaseAdmin
    .from("contacts")
    .select("*", { count: "exact" })
    .eq("shop_id", shopRow.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contacts, total: count });
}
