// Client-safe audience filter definitions — no supabaseAdmin import here, so
// this can be imported from "use client" components (CampaignWizard.tsx)
// as well as server routes. Server-side query helpers that actually hit the
// DB live in src/lib/resolveAudience.ts instead.

export type AudienceSegmentId = "all" | "subscribed" | "frequent" | "unsubscribed";

// Discriminated union stored on campaigns.audience_filter (JSONB):
//   { type: "segment",  segment: "subscribed" }         — the four fixed segments
//   { type: "tag",      tags: ["vip", ...] }             — contacts whose tags overlap
//   { type: "contacts", contact_ids: ["uuid", ...] }     — hand-picked contacts
// Older campaigns saved { segment: "..." } with no "type" — always run raw DB
// values through normalizeAudienceFilter() before switching on .type.
export type AudienceFilter =
  | { type: "segment"; segment: AudienceSegmentId }
  | { type: "tag"; tags: string[] }
  | { type: "contacts"; contact_ids: string[] };

const SEGMENT_IDS: AudienceSegmentId[] = ["all", "subscribed", "frequent", "unsubscribed"];

function isSegmentId(v: unknown): v is AudienceSegmentId {
  return typeof v === "string" && (SEGMENT_IDS as string[]).includes(v);
}

// Mirrors the four segment filters on /shopify/customers (Customers.tsx
// SEGMENTS) so campaign audience selection stays consistent with how
// merchants already think about their contact list. "all" and "unsubscribed"
// both include contacts who opted out, so they're flagged for the stronger
// inline compliance warning.
export const AUDIENCE_SEGMENTS: { id: AudienceSegmentId; label: string; warnUnsubscribed?: boolean }[] = [
  { id: "subscribed", label: "Email Subscribers" },
  { id: "frequent", label: "Frequent Buyers (3+)" },
  { id: "all", label: "All Contacts", warnUnsubscribed: true },
  { id: "unsubscribed", label: "Unsubscribed list", warnUnsubscribed: true },
];

// Coerces whatever is stored on a campaign row into the current
// AudienceFilter shape. Handles the legacy `{ segment: "..." }` shape from
// pre-tag campaigns, null/undefined, and malformed values — anything
// unrecognizable falls back to the safe default (subscribers only).
export function normalizeAudienceFilter(raw: unknown): AudienceFilter {
  const fallback: AudienceFilter = { type: "segment", segment: "subscribed" };
  if (!raw || typeof raw !== "object") return fallback;
  const f = raw as Record<string, unknown>;

  if (f.type === "tag" && Array.isArray(f.tags)) {
    return { type: "tag", tags: f.tags.filter((t): t is string => typeof t === "string") };
  }
  if (f.type === "contacts" && Array.isArray(f.contact_ids)) {
    return { type: "contacts", contact_ids: f.contact_ids.filter((id): id is string => typeof id === "string") };
  }
  // New shape { type: "segment", segment } and legacy shape { segment } both
  // land here — either way, a valid segment id is all that matters.
  if (isSegmentId(f.segment)) {
    return { type: "segment", segment: f.segment };
  }
  return fallback;
}

export function audienceFilterLabel(raw: unknown): string {
  const filter = normalizeAudienceFilter(raw);
  switch (filter.type) {
    case "segment":
      return AUDIENCE_SEGMENTS.find((s) => s.id === filter.segment)?.label || "All Contacts";
    case "tag":
      return filter.tags.length === 0 ? "By tag (none selected)" : `Tagged: ${filter.tags.join(", ")}`;
    case "contacts":
      return `${filter.contact_ids.length} specific contact${filter.contact_ids.length === 1 ? "" : "s"}`;
  }
}

// Minimal structural view of Supabase's PostgrestFilterBuilder — just the
// filter methods this helper uses. The builder's own generics are recursive
// enough to trip TS2589 ("type instantiation is excessively deep") if used
// as a constraint, so the generic below is unconstrained and the builder is
// viewed through this interface internally instead.
type AudienceQueryMethods = {
  eq(column: string, value: boolean): AudienceQueryMethods;
  gte(column: string, value: number): AudienceQueryMethods;
  overlaps(column: string, value: string[]): AudienceQueryMethods;
  in(column: string, values: string[]): AudienceQueryMethods;
};

// Applies the audience predicate to a Supabase `contacts` query builder and
// returns it (same concrete builder type in and out). Shared by the count
// and fetch queries in resolveAudience.ts so the two can never drift apart.
// Tag audiences deliberately exclude unsubscribed contacts (a tag is not
// consent); "contacts" applies no subscribed filter — the wizard warns
// instead when unsubscribed contacts are hand-picked.
export function applyAudienceFilter<Q>(query: Q, raw: unknown): Q {
  const q = query as unknown as AudienceQueryMethods;
  const filter = normalizeAudienceFilter(raw);
  const apply = (): AudienceQueryMethods => {
    switch (filter.type) {
      case "tag":
        return q.overlaps("tags", filter.tags).eq("subscribed", true);
      case "contacts":
        return q.in("id", filter.contact_ids);
      case "segment":
        switch (filter.segment) {
          case "subscribed":
            return q.eq("subscribed", true);
          case "frequent":
            return q.gte("orders_count", 3);
          case "unsubscribed":
            return q.eq("subscribed", false);
          default:
            return q; // "all" — no extra filter
        }
    }
  };
  return apply() as unknown as Q;
}
