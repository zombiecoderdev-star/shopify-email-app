import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";

// DELETE /api/shopify/customers/bulk-delete
// Body: { shop, shopify_customer_ids: string[] }

export async function DELETE(req: NextRequest) {
  const { shop, shopify_customer_ids } = await req.json();

  if (!shop || !Array.isArray(shopify_customer_ids) || shopify_customer_ids.length === 0) {
    return NextResponse.json({ error: "shop and shopify_customer_ids required" }, { status: 400 });
  }

  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id, access_token")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const results = { succeeded: 0, failed: 0 };

  for (const id of shopify_customer_ids) {
    const res = await fetch(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/customers/${id}.json`,
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

  // Bulk delete from our contacts table
  await supabaseAdmin
    .from("contacts")
    .delete()
    .eq("shop_id", shopRow.id)
    .in("shopify_customer_id", shopify_customer_ids);

  return NextResponse.json({ success: true, ...results });
}
