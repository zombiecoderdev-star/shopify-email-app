import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeTags } from "@/lib/tags";

// POST /api/shopify/contacts/tags
// Body: { shop, contactIds: string[], addTags: string[], removeTags: string[] }
// Adds/removes tags on one or many contacts. Tags are normalized (trim,
// lowercase, dedupe) before writing. App-only — tags are NOT synced back to
// Shopify (the customer sync/webhook merges Shopify tags in, never the other
// direction).

export async function POST(req: NextRequest) {
  const { shop, contactIds, addTags, removeTags } = await req.json();

  if (!shop || !Array.isArray(contactIds) || contactIds.length === 0) {
    return NextResponse.json({ error: "shop and a non-empty contactIds array are required" }, { status: 400 });
  }
  if (!Array.isArray(addTags ?? []) || !Array.isArray(removeTags ?? [])) {
    return NextResponse.json({ error: "addTags and removeTags must be arrays" }, { status: 400 });
  }

  const add = normalizeTags((addTags as string[] | undefined) || []);
  const remove = normalizeTags((removeTags as string[] | undefined) || []);

  if (add.length === 0 && remove.length === 0) {
    return NextResponse.json({ error: "Nothing to do — addTags and removeTags are both empty" }, { status: 400 });
  }

  const { data: shopRow } = await supabaseAdmin
    .from("shops")
    .select("id")
    .eq("shop_domain", shop)
    .single();

  if (!shopRow) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  // Scoped to the shop so a contact id from another store can't be touched.
  const { data: rows, error: fetchError } = await supabaseAdmin
    .from("contacts")
    .select("id, tags")
    .eq("shop_id", shopRow.id)
    .in("id", contactIds);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "No matching contacts found" }, { status: 404 });
  }

  const updatedAt = new Date().toISOString();
  const results = await Promise.all(
    rows.map((row: { id: string; tags: string[] | null }) => {
      // Normalize existing values too (pre-migration rows may be mixed case),
      // drop removals, then append additions.
      const next = normalizeTags([
        ...normalizeTags(row.tags || []).filter((t) => !remove.includes(t)),
        ...add,
      ]);
      return supabaseAdmin
        .from("contacts")
        .update({ tags: next, updated_at: updatedAt })
        .eq("id", row.id)
        .eq("shop_id", shopRow.id);
    })
  );

  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    return NextResponse.json(
      { error: `Failed to update ${failed.length} of ${rows.length} contacts: ${failed[0].error?.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, updated: rows.length });
}
