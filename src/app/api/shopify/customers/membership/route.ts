import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMembership, MEMBERSHIP_SOURCES, type MembershipSource } from "@/config/memberships";

// PUT /api/shopify/customers/membership
// Body: {
//   shop: string,
//   contact_ids: string[],          -- our internal UUIDs (supports single or bulk)
//   new_membership_id: number,
//   source: "admin" | "customer_purchase",
//   changed_by?: string,            -- admin email or system id
//   notes?: string
// }
//
// Updates membership_id + subscription_date on each contact,
// then inserts a row into membership_logs for each change.

export async function PUT(req: NextRequest) {
  const {
    shop,
    contact_ids,
    new_membership_id,
    source,
    changed_by,
    notes,
  } = await req.json();

  if (!shop || !Array.isArray(contact_ids) || contact_ids.length === 0) {
    return NextResponse.json(
      { error: "shop and contact_ids[] required" },
      { status: 400 }
    );
  }

  if (typeof new_membership_id !== "number") {
    return NextResponse.json({ error: "new_membership_id must be a number" }, { status: 400 });
  }

  // Validate membership ID exists in config
  const newMembership = getMembership(new_membership_id);
  if (newMembership.id !== new_membership_id) {
    return NextResponse.json({ error: "Invalid membership_id" }, { status: 400 });
  }

  // Get shop row
  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  // Fetch current memberships so we can log the "previous" value per contact
  const { data: currentContacts, error: fetchError } = await supabaseAdmin
    .from("contacts")
    .select("id, membership_id")
    .in("id", contact_ids)
    .eq("shop_id", shopRow.id);

  if (fetchError || !currentContacts) {
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }

  const now = new Date().toISOString();

  // Update contacts
  const { error: updateError } = await supabaseAdmin
    .from("contacts")
    .update({
      membership_id: new_membership_id,
      subscription_date: now,
      updated_at: now,
    })
    .in("id", contact_ids)
    .eq("shop_id", shopRow.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Insert one log row per contact
  const logRows = currentContacts.map((c) => ({
    shop_id: shopRow.id,
    contact_id: c.id,
    previous_membership_id: c.membership_id ?? 0,
    new_membership_id,
    source: (source as MembershipSource) || MEMBERSHIP_SOURCES.ADMIN,
    changed_by: changed_by || null,
    notes: notes || null,
    created_at: now,
  }));

  const { error: logError } = await supabaseAdmin
    .from("membership_logs")
    .insert(logRows);

  if (logError) {
    // Log insert failed but membership was updated — don't fail the request,
    // just warn. The membership change itself succeeded.
    console.error("Membership log insert failed:", logError);
  }

  return NextResponse.json({
    success: true,
    updated: currentContacts.length,
    membership: newMembership.name,
  });
}