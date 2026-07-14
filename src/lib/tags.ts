// Client-safe tag normalization — no supabaseAdmin import, so this can be
// used from "use client" components (ManageTagsModal) as well as API routes
// and the Shopify sync/webhook upserts. Tags are stored trimmed + lowercased
// so the Postgres && overlap operator (tag campaign audiences) never misses
// on casing; db/tags_migration.sql normalizes pre-existing rows the same way.

export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

// Trim, lowercase, drop empties, dedupe — preserves first-seen order.
export function normalizeTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const t = normalizeTag(raw);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

// Shopify sends tags as one comma-separated string ("VIP, wholesale").
export function tagsFromShopifyString(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return normalizeTags(raw.split(","));
}

// Union of existing (app-managed) tags and incoming Shopify tags — used by
// the customer sync + webhook upserts so a Shopify update never wipes tags
// added inside the app.
export function mergeTags(existing: string[] | null | undefined, incoming: string[]): string[] {
  return normalizeTags([...(existing || []), ...incoming]);
}
