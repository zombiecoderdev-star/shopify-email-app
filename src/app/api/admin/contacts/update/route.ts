import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";

// PUT /api/admin/contacts/update
// Body: { shop_id, shopify_customer_id, first_name, last_name, phone, subscribed }
// Admin-scoped equivalent of /api/shopify/customers/update.

export async function PUT(req: NextRequest) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { shop_id, shopify_customer_id, first_name, last_name, phone, subscribed } =
    await req.json();

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
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": shopRow.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer: {
          id: shopify_customer_id,
          first_name: first_name || "",
          last_name: last_name || "",
          phone: phone || null,
          email_marketing_consent: {
            state: subscribed ? "subscribed" : "unsubscribed",
            opt_in_level: "single_opt_in",
          },
        },
      }),
    }
  );

  const shopifyData = await shopifyRes.json();

  if (!shopifyRes.ok) {
    const msg = shopifyData.errors
      ? Object.entries(shopifyData.errors)
          .map(([f, e]) => `${f}: ${(e as string[]).join(", ")}`)
          .join(". ")
      : "Shopify update failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  await supabaseAdmin
    .from("contacts")
    .update({
      first_name: first_name || null,
      last_name: last_name || null,
      phone: phone || null,
      subscribed: subscribed ?? true,
      updated_at: new Date().toISOString(),
    })
    .eq("shop_id", shop_id)
    .eq("shopify_customer_id", shopify_customer_id);

  return NextResponse.json({ success: true, customer: shopifyData.customer });
}
