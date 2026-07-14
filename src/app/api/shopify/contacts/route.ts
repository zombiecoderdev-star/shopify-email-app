import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/shopify/contacts?shop=xxx
// Returns contacts for the given shop from our Supabase DB.
//
// Optional params (added for the campaign wizard's "Specific contacts"
// picker — omitting them all keeps the original behavior Customers.tsx
// relies on: newest 100 contacts):
//   - ids=uuid,uuid   — return exactly those contacts (chip labels /
//                       unsubscribed check when editing a saved campaign)
//   - search=q        — server-side match on email / first / last name
//   - page=1&per_page=20 — server-side pagination (used with search)

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const shop = params.get("shop");

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

  const idsParam = params.get("ids");
  if (idsParam) {
    const ids = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const { data: contacts, error } = await supabaseAdmin
      .from("contacts")
      .select("*")
      .eq("shop_id", shopRow.id)
      .in("id", ids);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ contacts, total: contacts?.length ?? 0 });
  }

  let query = supabaseAdmin
    .from("contacts")
    .select("*", { count: "exact" })
    .eq("shop_id", shopRow.id)
    .order("created_at", { ascending: false });

  const search = params.get("search")?.trim();
  if (search) {
    // Strip characters that would break PostgREST's .or() filter syntax.
    const q = search.replace(/[,()%]/g, "");
    if (q) {
      query = query.or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
    }
  }

  const pageParam = params.get("page");
  const perPageParam = params.get("per_page");
  if (pageParam || perPageParam) {
    const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);
    const perPage = Math.min(250, Math.max(1, parseInt(perPageParam || "20", 10) || 20));
    const from = (page - 1) * perPage;
    query = query.range(from, from + perPage - 1);
  } else {
    query = query.limit(100);
  }

  const { data: contacts, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ contacts, total: count });
}
