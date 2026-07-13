import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";

// GET /api/admin/shops/[id]
// Returns full detail for a single shop — used by /admin/shops/[id].

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: shop, error } = await supabaseAdmin
    .from("shops")
    .select("id, shop_domain, shop_owner_email, plan_name, credits_balance, is_active, installed_at, uninstalled_at")
    .eq("id", id)
    .single();

  if (error || !shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  // last_synced_at depends on db/shops_last_synced_migration.sql having run —
  // query it separately so a missing column doesn't 404 the whole page.
  let last_synced_at: string | null = null;
  const { data: syncedRow, error: syncedError } = await supabaseAdmin
    .from("shops")
    .select("last_synced_at")
    .eq("id", id)
    .single();
  if (!syncedError) last_synced_at = syncedRow?.last_synced_at ?? null;

  const { count: contact_count } = await supabaseAdmin
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", id);

  const { data: subscription } = await supabaseAdmin
    .from("shop_subscriptions")
    .select("status, current_period_start, current_period_end, billing_plan_id")
    .eq("shop_id", id)
    .eq("status", "active")
    .order("current_period_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  let billing_plan: { name: string; monthly_price: number; included_credits: number } | null = null;
  if (subscription?.billing_plan_id) {
    const { data: plan } = await supabaseAdmin
      .from("billing_plans")
      .select("name, monthly_price, included_credits")
      .eq("id", subscription.billing_plan_id)
      .maybeSingle();
    billing_plan = plan || null;
  }

  return NextResponse.json({
    shop: {
      ...shop,
      last_synced_at,
      contact_count: contact_count || 0,
      billing_plan,
      subscription_status: subscription?.status || null,
      current_period_end: subscription?.current_period_end || null,
    },
  });
}
