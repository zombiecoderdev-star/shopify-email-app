import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";

// GET /api/admin/shops
// Returns all shops + stats for the admin dashboard.
// Protected — verifies the caller has a valid Supabase session.

async function verifyAdminSession(req: NextRequest) {
  const allCookies = req.cookies.getAll();
  const authCookie = allCookies.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );
  if (!authCookie) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(authCookie.value));
    const accessToken = parsed.access_token;
    if (!accessToken) return null;

    // Verify token with Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    return user;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch all shops
  const { data: shops, error } = await supabaseAdmin
    .from("shops")
    .select("id, shop_domain, shop_owner_email, plan_name, is_active, installed_at")
    .order("installed_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get contact counts per shop
  const { data: contactCounts } = await supabaseAdmin
    .from("contacts")
    .select("shop_id");

  const countMap: Record<string, number> = {};
  contactCounts?.forEach((c) => {
    countMap[c.shop_id] = (countMap[c.shop_id] || 0) + 1;
  });

  const shopsWithCounts = shops?.map((s) => ({
    ...s,
    contact_count: countMap[s.id] || 0,
  }));

  // Stats
  const stats = {
    total_shops: shops?.length || 0,
    active_shops: shops?.filter((s) => s.is_active).length || 0,
    total_contacts: contactCounts?.length || 0,
  };

  return NextResponse.json({ shops: shopsWithCounts, stats });
}