import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";

// POST /api/admin/contacts/bulk-delete
// Body: { shop_id, shopify_customer_ids: string[] }
// Admin-scoped equivalent of /api/shopify/customers/bulk-delete.

export async function POST(req: NextRequest) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { shop_id, shopify_customer_ids } = await req.json();

  if (!shop_id || !Array.isArray(shopify_customer_ids) || shopify_customer_ids.length === 0) {
    return NextResponse.json({ error: "shop_id and shopify_customer_ids required" }, { status: 400 });
  }

  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("shop_domain, access_token")
    .eq("id", shop_id)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const results = { succeeded: 0, failed: 0 };

  for (const id of shopify_customer_ids) {
    const res = await fetch(
      `https://${shopRow.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/customers/${id}.json`,
      {
        method: "DELETE",
        headers: { "X-Shopify-Access-Token": shopRow.access_token },
      }
    );
    if (res.ok || res.status === 404) {
      results.succeeded++;
    } else {
      results.failed++;
    }
  }

  await supabaseAdmin
    .from("contacts")
    .delete()
    .eq("shop_id", shop_id)
    .in("shopify_customer_id", shopify_customer_ids);

  return NextResponse.json({ success: true, ...results });
}
