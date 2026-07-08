# Project Handoff — DevStrong Email Marketing (Shopify App)

## What this project is
A Shopify embedded email marketing app — similar to Sequenzy or Klaviyo.
Built feature by feature, one step at a time.
The merchant installs it from Shopify, and the app appears inside their
Shopify admin (embedded via an iframe using App Bridge).

---

## Stack
- **Next.js** (App Router, TypeScript, Tailwind CSS)
- **Supabase** (Postgres database)
- **@shopify/app-bridge-react v4** — embedded app shell
- **@supabase/supabase-js** — server-side admin client
- **lucide-react** — icons

## Key decisions made
1. **OAuth is hand-rolled** — we deliberately did NOT use `shopify-api`'s
   `auth.begin()` helper because it is built for Express `req/res` and
   conflicts with Next.js App Router's `NextRequest/NextResponse`.
   Instead, `src/lib/shopify.ts` has three small manual helpers:
   `buildAuthorizeUrl`, `verifyHmac`, `exchangeCodeForToken`.

2. **Offline (permanent) access token** — we request an offline token so
   the app can send emails in the background without the merchant being
   logged in. Stored in the `shops` table.

3. **service_role key for all DB writes** — `src/lib/supabaseAdmin.ts`
   uses the Supabase service_role key. Only runs server-side in API route
   handlers. Never import it in a client component.

4. **App Bridge v4 CDN script** — loaded as a plain synchronous `<script>`
   tag in the ROOT `src/app/layout.tsx` with `data-api-key` attribute.
   Must be first script tag with NO async/defer/type=module.
   Next.js Script component always adds async so we use plain JSX instead.

5. **Dynamic CSP headers via middleware** — `src/middleware.ts` sets
   `Content-Security-Policy: frame-ancestors` dynamically per shop using
   the `?shop=` param. A static header in next.config.ts causes iframe
   disconnect after a few seconds.

6. **ngrok warning bypass** — run ngrok with:
   `ngrok http 3000 --request-header-add "ngrok-skip-browser-warning: true"`
   This is a REQUEST header ngrok injects, not a response header.

7. **SSR disabled for embedded pages** — all pages under `/shopify/*` that
   use `useAppBridge()` are wrapped with `dynamic(() => import(...), { ssr: false })`
   in a client component page.tsx. This prevents hydration mismatch errors
   since App Bridge reads browser APIs not available on the server.

8. **Pagination is a shared component** — `src/components/Pagination.tsx`
   exports both a `<Pagination />` component and a `usePagination()` hook.
   Use these everywhere tables appear — Campaigns, Templates, Flows etc.

---

## Environment variables (in `.env.local`, never committed)
```
SHOPIFY_API_KEY=                  # Client ID from Shopify Partners dashboard
SHOPIFY_API_SECRET=               # Client Secret from Shopify Partners dashboard
SHOPIFY_SCOPES=read_customers,write_customers,read_products,read_orders
SHOPIFY_APP_URL=                  # Full ngrok HTTPS URL locally, prod URL in production
NEXT_PUBLIC_SHOPIFY_API_KEY=      # Same as SHOPIFY_API_KEY, needed by App Bridge client-side
NEXT_PUBLIC_SUPABASE_URL=         # From Supabase project settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Project folder structure
```
shopify-email-app/
├── db/
│   └── schema.sql
├── src/
│   ├── middleware.ts                              # Dynamic CSP frame-ancestors per shop
│   ├── lib/
│   │   ├── shopify.ts                             # OAuth helpers + fetchShopifyCustomers + registerWebhook
│   │   └── supabaseAdmin.ts                       # Supabase service_role client (server only)
│   ├── components/
│   │   ├── Sidebar.tsx                            # Left nav (all pages)
│   │   ├── Pagination.tsx                         # Reusable pagination component + usePagination hook
│   │   ├── AddCustomerModal.tsx                   # Modal to create a single customer
│   │   └── ImportExportModal.tsx                  # CSV import (3-step) + export with filter
│   └── app/
│       ├── layout.tsx                             # Root layout — App Bridge script + meta tag
│       ├── page.tsx                               # Root page (unused)
│       ├── shopify/
│       │   ├── layout.tsx                         # Shopify section — sidebar wrapper
│       │   ├── dashboard/
│       │   │   ├── page.tsx                       # SSR-disabled wrapper
│       │   │   └── Dashboard.tsx                  # Main dashboard UI (client)
│       │   └── customers/
│       │       ├── page.tsx                       # SSR-disabled wrapper
│       │       └── Customers.tsx                  # Contacts list UI (client)
│       └── api/
│           ├── auth/
│           │   ├── route.ts                       # GET /api/auth?shop= — starts OAuth
│           │   └── callback/route.ts              # GET /api/auth/callback — finishes OAuth
│           ├── shopify/
│           │   ├── sync-customers/route.ts        # POST — bulk pull from Shopify + register webhooks
│           │   ├── contacts/route.ts              # GET — fetch contacts from Supabase
│           │   └── customers/
│           │       ├── create/route.ts            # POST — create single customer in Shopify + Supabase
│           │       └── import/route.ts            # POST — bulk CSV import to Shopify + Supabase
│           └── webhooks/
│               └── customers/route.ts             # POST — handles customers/create + customers/update
```

---

## Database schema summary (db/schema.sql)
All tables cascade from `shops`. Full schema in `db/schema.sql`.

| Table | Purpose |
|---|---|
| `shops` | One row per installed store. Holds `shop_domain`, `access_token`, `scope`, `is_active` |
| `contacts` | Shopify customers synced into our DB. Has `subscribed` for consent |
| `segments` | Dynamic filter rules over contacts (JSONB) |
| `templates` | Email templates with block-based content (JSONB) |
| `campaigns` | One-off broadcast emails. Status: draft→scheduled→sending→sent |
| `campaign_recipients` | Per-contact tracking for a campaign (opens, clicks, bounces) |
| `flows` | Automation journeys. Has `trigger_type` and `status` |
| `flow_steps` | Individual steps in a flow (email, wait, condition) |
| `flow_runs` | One row per contact who entered a flow. Has `next_action_at` for background jobs |
| `flow_run_events` | Audit trail of what happened in each flow run |
| `billing_plans` | Our app's subscription tiers |
| `shop_subscriptions` | Which plan a shop is on |
| `email_credits_ledger` | Append-only ledger of credit changes |
| `webhook_logs` | Debug log for Shopify + ESP webhooks |

---

## OAuth flow (COMPLETED ✅)

### GET /api/auth?shop=xxx
1. Validates shop domain format
2. Generates random `state`, stores in `httpOnly` cookie
3. Builds Shopify consent URL via `buildAuthorizeUrl()`
4. Redirects merchant to Shopify

### GET /api/auth/callback
1. Checks `state` cookie matches param (CSRF protection)
2. Verifies HMAC signature (confirms from Shopify)
3. Exchanges `code` for permanent token via `exchangeCodeForToken()`
4. Upserts shop row in Supabase `shops` table
5. Redirects to `https://{shop}/admin/apps/{SHOPIFY_API_KEY}`

**Important**: Always start OAuth from the ngrok URL, not localhost.
Cookie is set on whichever domain starts the flow — mismatch = CSRF error.

---

## Embedded app shell (COMPLETED ✅)
- App Bridge v4 CDN script in root `src/app/layout.tsx` as plain `<script data-api-key="...">`
- `src/middleware.ts` sets dynamic `frame-ancestors` CSP header per shop
- Sidebar with full nav: Dashboard, Shopify Connection, Customers & Segments,
  Email Templates, Campaigns, Automation Flows, Sending & ESP, Billing & Credits,
  GDPR & Compliance
- Dashboard page: stats row, sandbox simulation board, ROI panel,
  usage credits, delivery pipeline — modelled after Sequenzy's layout

---

## Contact Sync (COMPLETED ✅)

### Initial sync — POST /api/shopify/sync-customers
- Paginates through ALL Shopify customers (250 per page)
- Upserts into `contacts` table using `shop_id + shopify_customer_id` conflict key
- Registers `customers/create` and `customers/update` webhooks automatically

### Webhooks — POST /api/webhooks/customers
- Verifies Shopify HMAC via `x-shopify-hmac-sha256` header (base64, not hex)
- Upserts contact on every create/update event
- Logs to `webhook_logs` table for debugging
- Always returns 200 quickly (Shopify retries on non-200)

### Create single customer — POST /api/shopify/customers/create
- Creates in Shopify first, then saves to Supabase
- Returns exact Shopify error messages (e.g. "email has already been taken")

### CSV Import — POST /api/shopify/customers/import
- Accepts array of customers, creates each in Shopify sequentially
- Returns per-row results (succeeded/failed with error messages)

### Contacts page UI — /shopify/customers
- Left panel: audience segments with live counts (All, Subscribers, VIP, Frequent, Unsubscribed)
- Right panel: search bar + sortable table (Name, Status, Tags, Shopify ID, Orders/Spent)
- Sort: click column header to cycle asc → desc → off, green chevron icons
- **Add Customer** button → modal with form (name, email, phone, consent toggle)
- **Import / Export** button → modal with:
  - Import tab: drag & drop CSV → preview table → bulk create → result summary
  - Export tab: filter (all/subscribed/unsubscribed) → download dated CSV
- **Pagination**: 20/50/100/250 per page, page number pills with ellipsis
- GDPR/CASL consent notice in left panel

### Important Shopify permission note
Customer data (email, name, phone) requires **Protected Customer Data** access.
Request this in Partners dashboard → Versions → Access → Protected customer data.
After approval, re-run OAuth to get new scopes granted.

---

## Reusable components

### Pagination (`src/components/Pagination.tsx`)
```tsx
// In any table component:
const { page, perPage, setPage, setPerPage, paginate } = usePagination(
  items.length,
  [search, sortKey]  // deps that reset to page 1
);
const pageItems = paginate(items);

// At bottom of table:
<Pagination
  page={page}
  perPage={perPage}
  total={items.length}
  onPageChange={setPage}
  onPerPageChange={setPerPage}
/>
```

---

## Shopify Partners dashboard setup
- App name: **DevStrong Email Marketing**
- App URL: `https://clobber-imitate-hatred.ngrok-free.dev/shopify/dashboard`
- Redirect URL: `https://clobber-imitate-hatred.ngrok-free.dev/api/auth/callback`
- Scopes: `read_customers,write_customers,read_products,read_orders`
- URL settings under **Versions** in the new dev dashboard
- Protected customer data access must be requested and approved separately

---

## Local dev setup
```bash
# Terminal 1
npm run dev

# Terminal 2
ngrok http 3000 --request-header-add "ngrok-skip-browser-warning: true"
```
Always open the app from Shopify admin URL, not direct ngrok URL.
App Bridge only works inside Shopify's iframe.

---

## Feature build order & status

| # | Feature | Status |
|---|---|---|
| 1 | OAuth install flow | ✅ DONE |
| 2 | Embedded app shell + dashboard layout | ✅ DONE |
| 3 | Contact sync, webhooks, add/import/export, pagination | ✅ DONE |
| 4 | Email templates (builder + save/reuse) | ⬜ Next |
| 5 | Campaigns (create, send, analytics) | ⬜ |
| 6 | Scheduling | ⬜ |
| 7 | Automation flows (journey builder) | ⬜ |
| 8 | Billing + email credits | ⬜ |
| 9 | ESP integration (SendGrid/Resend) | ⬜ |
| 10 | GDPR webhooks + compliance | ⬜ |

---

## Next feature to build: Email Templates (#4)
Goal: let merchants create, save and reuse email templates with
personalization tags like {{first_name}}, {{shop_name}} etc.

Steps:
1. Templates list page `/shopify/templates` — shows saved templates
2. Template editor page `/shopify/templates/[id]` — block-based editor
   (subject line, header image, body text blocks, button, footer)
3. API routes:
   - GET `/api/shopify/templates?shop=` — list templates
   - POST `/api/shopify/templates` — create template
   - PUT `/api/shopify/templates/[id]` — update template
   - DELETE `/api/shopify/templates/[id]` — delete template
4. Preview mode — renders template with sample data
5. Test send — sends a real email to a specified address

---

## Git commits so far
- `Initial commit: Next.js scaffold + Shopify/Supabase deps + db schema`
- `feat: Shopify OAuth install flow working`
- `feat: embedded app shell with Sequenzy-style dashboard layout`
- `feat: contact sync from Shopify with webhook handler`
- `feat: customers page with segment filters and Sequenzy-style layout`
- `feat: add customer modal with Shopify + Supabase sync`
- `feat: CSV import/export for contacts`
- `feat: reusable Pagination component + usePagination hook`

---

## Accounts
- Shopify Partners: zombie.coder.dev@gmail.com
- Dev store: dev-lag.myshopify.com
- Supabase project: (add your project URL here)
- GitHub repo: (add your repo URL here)