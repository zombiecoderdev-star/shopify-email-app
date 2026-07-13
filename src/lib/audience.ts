// Client-safe audience filter definitions — no supabaseAdmin import here, so
// this can be imported from "use client" components (CampaignWizard.tsx)
// as well as server routes. Server-side query helpers that actually hit the
// DB live in src/lib/audienceQueries.ts instead.

export type AudienceSegmentId = "all" | "subscribed" | "frequent" | "unsubscribed";

export type AudienceFilter = { segment: AudienceSegmentId };

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

export function audienceSegmentLabel(filter: AudienceFilter | null | undefined) {
  return AUDIENCE_SEGMENTS.find((s) => s.id === filter?.segment)?.label || "All Contacts";
}

// Applies the segment predicate to a Supabase `contacts` query builder.
// Shared by the count and fetch queries in audienceQueries.ts so the two can
// never drift apart. Untyped query param — Supabase's PostgrestFilterBuilder
// generics aren't worth fighting for an internal helper like this.
export function applyAudienceFilter(query: any, filter: AudienceFilter | null | undefined) {
  switch (filter?.segment) {
    case "subscribed":
      return query.eq("subscribed", true);
    case "frequent":
      return query.gte("orders_count", 3);
    case "unsubscribed":
      return query.eq("subscribed", false);
    default:
      return query; // "all" or unset — no extra filter
  }
}
