import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";

// POST /api/shopify/customers/create
// Body: { shop, email, first_name, last_name, phone, subscribed }
//
// 1. Creates the customer in Shopify via Admin API
// 2. Saves them to our contacts table in Supabase
// This keeps both Shopify and our DB in sync from the start.

export async function POST(req: NextRequest) {
  const { shop, email, first_name, last_name, phone, subscribed } =
    await req.json();

  if (!shop || !email) {
    return NextResponse.json(
      { error: "shop and email are required" },
      { status: 400 }
    );
  }

  // 1. Get access token
  const { data: shopRow, error: shopError } = await supabaseAdmin
    .from("shops")
    .select("id, access_token")
    .eq("shop_domain", shop)
    .single();

  if (shopError || !shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  // 2. Create customer in Shopify
  const shopifyRes = await fetch(
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/customers.json`,
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
    // Shopify returns errors like { errors: { email: ["has already been taken"] } }
    const messages = shopifyData.errors
      ? Object.entries(shopifyData.errors)
          .map(([field, errs]) => `${field}: ${(errs as string[]).join(", ")}`)
          .join(". ")
      : "Failed to create customer in Shopify";
    return NextResponse.json({ error: messages }, { status: 400 });
  }

  const customer = shopifyData.customer;

  // 3. Save to our contacts table
  const { error: dbError } = await supabaseAdmin.from("contacts").insert({
    shop_id: shopRow.id,
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
    // Customer was created in Shopify but DB insert failed — log it
    console.error("DB insert failed after Shopify create:", dbError);
  }

  return NextResponse.json({ success: true, customer });
}
