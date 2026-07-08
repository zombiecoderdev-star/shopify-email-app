import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchShopifyCustomers, registerWebhook, SHOPIFY_APP_URL } from "@/lib/shopify";

// POST /api/shopify/sync-customers
// Body: { shop: "dev-lag.myshopify.com" }
//
// 1. Looks up the shop's access token from Supabase
// 2. Pulls ALL customers from Shopify (handles pagination automatically)
// 3. Upserts them into our contacts table
// 4. Registers webhooks so future creates/updates arrive automatically
//
// Called once manually from the dashboard "Sync Customers" button.
// After that, webhooks keep the data fresh automatically.

export async function POST(req: NextRequest) {
  const { shop } = await req.json();

  if (!shop) {
    return NextResponse.json({ error: "Missing shop" }, { status: 400 });
  }

  // 1. Get access token for this shop
  const { data: shopData, error: shopError } = await supabaseAdmin
    .from("shops")
    .select("access_token")
    .eq("shop_domain", shop)
    .single();

  if (shopError || !shopData) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const { access_token } = shopData;

  // 2. Paginate through ALL customers (Shopify max 250 per page)
  let totalSynced = 0;
  let pageInfo: string | undefined = undefined;

  do {
    const { customers, nextPageInfo } = await fetchShopifyCustomers(
      shop,
      access_token,
      pageInfo
    );

    if (customers.length === 0) break;

    // 3. Map Shopify customer fields to our contacts table columns
    const rows = customers.map((c: any) => ({
      shop_id: null, // filled below after we get shop id
      shopify_customer_id: c.id,
      email: c.email,
      first_name: c.first_name || null,
      last_name: c.last_name || null,
      phone: c.phone || null,
      tags: c.tags ? c.tags.split(", ").filter(Boolean) : [],
      total_spent: parseFloat(c.total_spent || "0"),
      orders_count: c.orders_count || 0,
      subscribed:
        c.email_marketing_consent?.state === "subscribed" ? true : false,
      updated_at: new Date().toISOString(),
    }));

    // Get shop UUID (needed as foreign key in contacts)
    const { data: shopRow } = await supabaseAdmin
      .from("shops")
      .select("id")
      .eq("shop_domain", shop)
      .single();

    const rowsWithShopId = rows.map((r: any) => ({
      ...r,
      shop_id: shopRow?.id,
    }));

    // Upsert — if contact already exists (same shop + shopify_customer_id)
    // update their details rather than create a duplicate
    const { error: upsertError } = await supabaseAdmin
      .from("contacts")
      .upsert(rowsWithShopId, {
        onConflict: "shop_id,shopify_customer_id",
      });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      return NextResponse.json({ error: "DB upsert failed" }, { status: 500 });
    }

    totalSynced += customers.length;
    pageInfo = nextPageInfo ?? undefined;

  } while (pageInfo);

  // 4. Register webhooks so new/updated customers arrive automatically
  const webhookBase = `${SHOPIFY_APP_URL}/api/webhooks/customers`;
  await registerWebhook(shop, access_token, "customers/create", webhookBase);
  await registerWebhook(shop, access_token, "customers/update", webhookBase);

  return NextResponse.json({ success: true, synced: totalSynced });
}
