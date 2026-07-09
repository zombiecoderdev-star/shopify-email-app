import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";

// DELETE /api/shopify/customers/delete
// Body: { shop, shopify_customer_id }

export async function DELETE(req: NextRequest) {
  const { shop, shopify_customer_id } = await req.json();

  if (!shop || !shopify_customer_id) {
    return NextResponse.json({ error: "shop and shopify_customer_id required" }, { status: 400 });
  }

  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id, access_token")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  // Delete from Shopify
  const shopifyRes = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/customers/${shopify_customer_id}.json`,
    {
      method: "DELETE",
      headers: { "X-Shopify-Access-Token": shopRow.access_token },
    }
  );

  // 404 from Shopify = already deleted, that's fine
  if (!shopifyRes.ok && shopifyRes.status !== 404) {
    return NextResponse.json({ error: "Shopify delete failed" }, { status: 400 });
  }

  // Remove from our contacts table
  await supabaseAdmin
    .from("contacts")
    .delete()
    .eq("shop_id", shopRow.id)
    .eq("shopify_customer_id", shopify_customer_id);

  return NextResponse.json({ success: true });
}
