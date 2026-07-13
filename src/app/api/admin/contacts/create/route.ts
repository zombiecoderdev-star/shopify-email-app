import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";

// POST /api/admin/contacts/create
// Body: { shop_id, email, first_name, last_name, phone, subscribed }
//
// Admin-scoped equivalent of /api/shopify/customers/create. Looks up the
// shop's access_token server-side from shop_id (never exposed to the client).

export async function POST(req: NextRequest) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { shop_id, email, first_name, last_name, phone, subscribed } =
    await req.json();

  if (!shop_id || !email) {
    return NextResponse.json(
      { error: "shop_id and email are required" },
      { status: 400 }
    );
  }

  const { data: shopRow, error: shopError } = await supabaseAdmin
    .from("shops")
    .select("shop_domain, access_token")
    .eq("id", shop_id)
    .single();

  if (shopError || !shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const shopifyRes = await fetch(
    `https://${shopRow.shop_domain}/admin/api/${SHOPIFY_API_VERSION}/customers.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": shopRow.access_token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customer: {
          email,
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
    const messages = shopifyData.errors
      ? Object.entries(shopifyData.errors)
          .map(([field, errs]) => `${field}: ${(errs as string[]).join(", ")}`)
          .join(". ")
      : "Failed to create customer in Shopify";
    return NextResponse.json({ error: messages }, { status: 400 });
  }

  const customer = shopifyData.customer;

  const { error: dbError } = await supabaseAdmin.from("contacts").insert({
    shop_id,
    shopify_customer_id: customer.id,
    email: customer.email,
    first_name: customer.first_name || null,
    last_name: customer.last_name || null,
    phone: customer.phone || null,
    tags: [],
    total_spent: 0,
    orders_count: 0,
    subscribed: subscribed ?? true,
  });

  if (dbError) {
    console.error("DB insert failed after Shopify create:", dbError);
  }

  return NextResponse.json({ success: true, customer });
}
