import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchShopifyCustomers, registerWebhook, SHOPIFY_APP_URL } from "@/lib/shopify";
import { mergeTags, tagsFromShopifyString } from "@/lib/tags";

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

// The fields we actually read off Shopify's customer payload —
// fetchShopifyCustomers returns Shopify's raw JSON untyped.
type ShopifyCustomer = {
  id: number;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  tags?: string | null;
  total_spent?: string;
  orders_count?: number;
  email_marketing_consent?: { state?: string } | null;
};

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

    // Get shop UUID (needed as foreign key in contacts)
    const { data: shopRow } = await supabaseAdmin
      .from("shops")
      .select("id")
      .eq("shop_domain", shop)
      .single();

    // Existing tags for this page of customers, so the upsert MERGES
    // Shopify's tags with tags added inside the app instead of wiping them
    // (app-added tags exist only in our DB — see ManageTagsModal).
    const { data: existingRows } = await supabaseAdmin
      .from("contacts")
      .select("shopify_customer_id, tags")
      .eq("shop_id", shopRow?.id)
      .in("shopify_customer_id", customers.map((c: ShopifyCustomer) => c.id));

    const existingTagsById = new Map<string, string[]>(
      (existingRows || []).map((r: { shopify_customer_id: number; tags: string[] | null }) => [
        String(r.shopify_customer_id),
        r.tags || [],
      ])
    );

    // 3. Map Shopify customer fields to our contacts table columns
    const rowsWithShopId = customers.map((c: ShopifyCustomer) => ({
      shop_id: shopRow?.id,
      shopify_customer_id: c.id,
      email: c.email,
      first_name: c.first_name || null,
      last_name: c.last_name || null,
      phone: c.phone || null,
      tags: mergeTags(existingTagsById.get(String(c.id)), tagsFromShopifyString(c.tags)),
      total_spent: parseFloat(c.total_spent || "0"),
      orders_count: c.orders_count || 0,
      subscribed:
        c.email_marketing_consent?.state === "subscribed" ? true : false,
      updated_at: new Date().toISOString(),
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
