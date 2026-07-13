import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";

// DELETE /api/admin/contacts/delete
// Body: { shop_id, shopify_customer_id }
// Admin-scoped equivalent of /api/shopify/customers/delete.

export async function DELETE(req: NextRequest) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { shop_id, shopify_customer_id } = await req.json();

  if (!shop_id || !shopify_customer_id) {
    return NextResponse.json({ error: "shop_id and shopify_customer_id required" }, { status: 400 });
  }

  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("shop_domain, access_token")
    .eq("id", shop_id)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const shopifyRes = await fetch(
    `https://${shopRow.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/customers/${shopify_customer_id}.json`,
    {
      method: "DELETE",
      headers: { "X-Shopify-Access-Token": shopRow.access_token },
    }
  );

  if (!shopifyRes.ok && shopifyRes.status !== 404) {
    return NextResponse.json({ error: "Shopify delete failed" }, { status: 400 });
  }

  await supabaseAdmin
    .from("contacts")
    .delete()
    .eq("shop_id", shop_id)
    .eq("shopify_customer_id", shopify_customer_id);

  return NextResponse.json({ success: true });
}
