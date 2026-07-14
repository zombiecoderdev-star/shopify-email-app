// Server-only audience resolution — the ONE place all six audience types
// (four fixed segments, "by tag", "specific contacts") resolve to a contact
// list. Used by both the wizard's live count preview (audience-count route)
// and the actual campaign send (campaignSend.ts), so the number a merchant
// sees before sending and the recipients that actually get mail can never
// drift apart. Imports supabaseAdmin (service_role), so this must never be
// imported from a "use client" component — the client-safe types/metadata
// live in src/lib/audience.ts. Replaces the old src/lib/audienceQueries.ts.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { applyAudienceFilter, normalizeAudienceFilter, AUDIENCE_SEGMENTS } from "@/lib/audience";

export async function countAudience(shopId: string, rawFilter: unknown): Promise<number> {
  const query = applyAudienceFilter(
    supabaseAdmin.from("contacts").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
    normalizeAudienceFilter(rawFilter)
  );
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function countAllAudienceSegments(shopId: string): Promise<Record<string, number>> {
  const entries = await Promise.all(
    AUDIENCE_SEGMENTS.map(
      async (seg) => [seg.id, await countAudience(shopId, { type: "segment", segment: seg.id })] as const
    )
  );
  return Object.fromEntries(entries);
}

export type AudienceContact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

// Resolves an audience_filter (any shape — legacy rows included) to the
// contact fields needed to actually send mail (email + name for
// personalization). Used by campaign sending.
export async function resolveAudienceContacts(shopId: string, rawFilter: unknown): Promise<AudienceContact[]> {
  const query = applyAudienceFilter(
    supabaseAdmin.from("contacts").select("id, email, first_name, last_name").eq("shop_id", shopId),
    normalizeAudienceFilter(rawFilter)
  );
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}
