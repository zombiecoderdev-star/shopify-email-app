// Server-only audience queries — imports supabaseAdmin (service_role), so
// this must never be imported from a "use client" component. See
// src/lib/audience.ts for the client-safe types/metadata this builds on.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { applyAudienceFilter, AUDIENCE_SEGMENTS, type AudienceFilter } from "@/lib/audience";

export async function countAudience(shopId: string, filter: AudienceFilter | null | undefined): Promise<number> {
  const query = applyAudienceFilter(
    supabaseAdmin.from("contacts").select("id", { count: "exact", head: true }).eq("shop_id", shopId),
    filter
  );
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
}

export async function countAllAudienceSegments(shopId: string): Promise<Record<string, number>> {
  const entries = await Promise.all(
    AUDIENCE_SEGMENTS.map(async (seg) => [seg.id, await countAudience(shopId, { segment: seg.id })] as const)
  );
  return Object.fromEntries(entries);
}

export async function resolveAudienceContactIds(shopId: string, filter: AudienceFilter | null | undefined): Promise<string[]> {
  const query = applyAudienceFilter(
    supabaseAdmin.from("contacts").select("id").eq("shop_id", shopId),
    filter
  );
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map((c: { id: string }) => c.id);
}
