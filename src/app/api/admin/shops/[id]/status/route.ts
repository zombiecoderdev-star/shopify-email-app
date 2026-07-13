import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyAdminSession } from "@/lib/adminAuth";

// PATCH /api/admin/shops/[id]/status
// Body: { is_active: boolean }
// Toggles a shop's active status from the admin panel.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await verifyAdminSession(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { is_active } = await req.json();

  if (typeof is_active !== "boolean") {
    return NextResponse.json({ error: "is_active must be a boolean" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("shops")
    .update({ is_active })
    .eq("id", id)
    .select("id, is_active")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shop: data });
}
