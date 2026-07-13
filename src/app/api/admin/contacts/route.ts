import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";

// GET /api/admin/contacts?shop_id=
// Admin-scoped equivalent of /api/shopify/contacts — keyed by shop_id
// (a UUID from the shops table) instead of shop_domain, since the admin
// panel isn't scoped to one shop's session like the embedded app is.

export async function GET(req: NextRequest) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = req.nextUrl.searchParams.get("shop_id");
  if (!shopId) {
    return NextResponse.json({ error: "Missing shop_id" }, { status: 400 });
  }

  const { data: contacts, error, count } = await supabaseAdmin
    .from("contacts")
    .select("*", { count: "exact" })
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contacts, total: count });
}
