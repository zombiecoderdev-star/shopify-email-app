import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";

// GET /api/admin/contacts/export?shop_id=&filter=all|subscribed|unsubscribed
// Streams a CSV of a shop's contacts (same columns as ImportExportModal's
// client-side export). Unlike the list route this has no row limit, so it
// stays a complete export even if the shop has more than the 100-row cap
// the table view uses.

export async function GET(req: NextRequest) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shopId = req.nextUrl.searchParams.get("shop_id");
  const filter = req.nextUrl.searchParams.get("filter") || "all";
  if (!shopId) {
    return NextResponse.json({ error: "Missing shop_id" }, { status: 400 });
  }

  let query = supabaseAdmin
    .from("contacts")
    .select("email, first_name, last_name, shopify_customer_id, orders_count, total_spent, subscribed, tags")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  if (filter === "subscribed") query = query.eq("subscribed", true);
  if (filter === "unsubscribed") query = query.eq("subscribed", false);

  const { data: contacts, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = [
    "email", "first_name", "last_name", "shopify_id",
    "orders_count", "total_spent", "subscribed", "tags",
  ];

  const rows = (contacts || []).map((c) => [
    c.email,
    c.first_name || "",
    c.last_name || "",
    c.shopify_customer_id,
    c.orders_count,
    parseFloat(String(c.total_spent)).toFixed(2),
    c.subscribed ? "true" : "false",
    (c.tags || []).join("|"),
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv;charset=utf-8;",
      "Content-Disposition": `attachment; filename="contacts_export_${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
