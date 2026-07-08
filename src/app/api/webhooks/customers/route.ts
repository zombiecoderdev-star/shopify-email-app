import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SHOPIFY_API_SECRET } from "@/lib/shopify";
import crypto from "crypto";

// POST /api/webhooks/customers
//
// Shopify calls this URL when a customer is created or updated.
// We verify the HMAC signature (same concept as OAuth but different header),
// then upsert the customer into our contacts table.
//
// This keeps our contacts table in sync automatically after the initial sync.

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1. Verify this request actually came from Shopify
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256") || "";
  const generatedHmac = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(rawBody, "utf8")
    .digest("base64");

  if (generatedHmac !== hmacHeader) {
    return NextResponse.json({ error: "Invalid HMAC" }, { status: 401 });
  }

  const shop = req.headers.get("x-shopify-shop-domain") || "";
  const topic = req.headers.get("x-shopify-topic") || "";
  const customer = JSON.parse(rawBody);

  // 2. Look up shop in our DB
  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    // Shop not installed — ignore silently (Shopify expects 200 back quickly)
    return NextResponse.json({ ok: true });
  }

  // 3. Upsert contact
  await supabaseAdmin.from("contacts").upsert(
    {
      shop_id: shopRow.id,
      shopify_customer_id: customer.id,
      email: customer.email,
      first_name: customer.first_name || null,
      last_name: customer.last_name || null,
      phone: customer.phone || null,
      tags: customer.tags ? customer.tags.split(", ").filter(Boolean) : [],
      total_spent: parseFloat(customer.total_spent || "0"),
      orders_count: customer.orders_count || 0,
      subscribed:
        customer.email_marketing_consent?.state === "subscribed",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shop_id,shopify_customer_id" }
  );

  // 4. Log the webhook for debugging
  await supabaseAdmin.from("webhook_logs").insert({
    shop_id: shopRow.id,
    source: "shopify",
    topic,
    payload: customer,
  });

  // Always return 200 quickly — Shopify retries if it doesn't get 200
  return NextResponse.json({ ok: true });
}
