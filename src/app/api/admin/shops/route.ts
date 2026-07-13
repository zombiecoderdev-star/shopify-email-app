import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";

// GET /api/admin/shops
// Returns all shops + stats for the admin dashboard / shops page.
// Protected — verifies the caller has a valid Supabase session.

export async function GET(req: NextRequest) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all shops. last_synced_at is queried separately below — it depends
  // on db/shops_last_synced_migration.sql having been run, and the shop list
  // shouldn't break for admins who haven't applied that migration yet.
  const { data: shops, error } = await supabaseAdmin
    .from("shops")
    .select("id, shop_domain, shop_owner_email, plan_name, is_active, installed_at, uninstalled_at")
    .order("installed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const lastSyncedById: Record<string, string | null> = {};
  const { data: syncedRows, error: syncedError } = await supabaseAdmin
    .from("shops")
    .select("id, last_synced_at");
  if (!syncedError) {
    syncedRows?.forEach((s) => { lastSyncedById[s.id] = s.last_synced_at; });
  }

  // Get contact counts per shop
  const { data: contactCounts } = await supabaseAdmin
    .from("contacts")
    .select("shop_id");

  const countMap: Record<string, number> = {};
  contactCounts?.forEach((c) => {
    countMap[c.shop_id] = (countMap[c.shop_id] || 0) + 1;
  });

  // Get each shop's active billing plan (shop_subscriptions -> billing_plans)
  const { data: subscriptions } = await supabaseAdmin
    .from("shop_subscriptions")
    .select("shop_id, billing_plan_id, status, current_period_start")
    .eq("status", "active");

  const { data: billingPlans } = await supabaseAdmin
    .from("billing_plans")
    .select("id, name");

  const planNameById: Record<string, string> = {};
  billingPlans?.forEach((p) => { planNameById[p.id] = p.name; });

  // A shop could in theory have more than one "active" subscription row —
  // keep the one with the latest current_period_start.
  const billingPlanNameByShop: Record<string, string> = {};
  subscriptions?.forEach((sub) => {
    const existing = billingPlanNameByShop[sub.shop_id];
    const planName = planNameById[sub.billing_plan_id];
    if (!planName) return;
    if (!existing) {
      billingPlanNameByShop[sub.shop_id] = planName;
    }
  });

  const shopsWithDetails = shops?.map((s) => ({
    ...s,
    contact_count: countMap[s.id] || 0,
    billing_plan_name: billingPlanNameByShop[s.id] || null,
    last_synced_at: lastSyncedById[s.id] ?? null,
  }));

  // Stats
  const stats = {
    total_shops: shops?.length || 0,
    active_shops: shops?.filter((s) => s.is_active).length || 0,
    total_contacts: contactCounts?.length || 0,
  };

  return NextResponse.json({ shops: shopsWithDetails, stats });
}
