import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SHOPIFY_API_VERSION } from "@/lib/shopify";

// POST /api/shopify/customers/import
// Body: { shop, customers: [{email, first_name, last_name, phone, subscribed}] }
//
// Creates each customer in Shopify one by one (Shopify has no bulk create API),
// then upserts them all into our contacts table.
// Returns per-row results so the UI can show which rows succeeded/failed.

export async function POST(req: NextRequest) {
  const { shop, customers } = await req.json();

  if (!shop || !Array.isArray(customers) || customers.length === 0) {
    return NextResponse.json({ error: "Missing shop or customers" }, { status: 400 });
  }

  // Get shop row
  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id, access_token")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const results: { email: string; success: boolean; error?: string }[] = [];

  for (const c of customers) {
    if (!c.email) {
      results.push({ email: c.email || "unknown", success: false, error: "Missing email" });
      continue;
    }

    try {
      // Create in Shopify
      const res = await fetch(
        `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/customers.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": shopRow.access_token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customer: {
              email: c.email,
              first_name: c.first_name || "",
              last_name: c.last_name || "",
              phone: c.phone || null,
              email_marketing_consent: {
                state: c.subscribed === "false" || c.subscribed === false
                  ? "unsubscribed"
                  : "subscribed",
                opt_in_level: "single_opt_in",
              },
            },
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        const msg = data.errors
          ? Object.entries(data.errors)
              .map(([f, e]) => `${f}: ${(e as string[]).join(", ")}`)
              .join(". ")
          : "Shopify error";
        results.push({ email: c.email, success: false, error: msg });
        continue;
      }

      const customer = data.customer;

      // Save to Supabase
      await supabaseAdmin.from("contacts").upsert(
        {
          shop_id: shopRow.id,
          shopify_customer_id: customer.id,
          email: customer.email,
          first_name: customer.first_name || null,
          last_name: customer.last_name || null,
          phone: customer.phone || null,
          tags: [],
          total_spent: 0,
          orders_count: 0,
          subscribed: customer.email_marketing_consent?.state === "subscribed",
        },
        { onConflict: "shop_id,shopify_customer_id" }
      );

      results.push({ email: c.email, success: true });

    } catch (e: any) {
      results.push({ email: c.email, success: false, error: e.message });
    }
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  return NextResponse.json({ results, succeeded, failed });
}