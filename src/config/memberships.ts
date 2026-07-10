// ─── Membership Config ────────────────────────────────────────────────────────
// Single source of truth for all membership tiers.
// To add a new tier: add an entry here — no other file needs changing.
// IDs are integers so renaming a tier never breaks existing DB rows.
// To rename: just change `name` — the ID stays the same in the DB.

export const MEMBERSHIPS = [
  {
    id: 0,
    name: "Free",
    description: "Default tier for all new customers",
    color: "gray",
    badgeClass: "bg-gray-100 text-gray-600",
  },
  {
    id: 1,
    name: "Paid",
    description: "Customers on a paid subscription plan",
    color: "blue",
    badgeClass: "bg-blue-100 text-blue-700",
  },
  {
    id: 2,
    name: "Premium",
    description: "High-value customers on the premium plan",
    color: "purple",
    badgeClass: "bg-purple-100 text-purple-700",
  },
  {
    id: 3,
    name: "VIP",
    description: "Manually assigned VIP customers",
    color: "yellow",
    badgeClass: "bg-yellow-100 text-yellow-700",
  },
] as const;

// Membership source — how was this membership assigned?
export const MEMBERSHIP_SOURCES = {
  ADMIN: "admin",                // Changed manually by admin through the app
  CUSTOMER_PURCHASE: "customer_purchase", // Customer purchased a plan themselves
} as const;

export type MembershipSource = typeof MEMBERSHIP_SOURCES[keyof typeof MEMBERSHIP_SOURCES];

// Helper: get membership by ID
export function getMembership(id: number) {
  return MEMBERSHIPS.find((m) => m.id === id) ?? MEMBERSHIPS[0];
}

// Default membership for new customers
export const DEFAULT_MEMBERSHIP_ID = 0;