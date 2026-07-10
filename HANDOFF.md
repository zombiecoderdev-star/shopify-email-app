# Project Handoff — DevStrong Email Marketing (Shopify App)

## What this project is
A Shopify embedded email marketing app similar to Sequenzy or Klaviyo.
Built feature by feature. Merchants install it from Shopify and it appears
inside their Shopify admin via iframe (App Bridge). There is also a
separate super admin panel at /admin/* for the app owner only.

---

## Stack
- **Next.js 16** (App Router, TypeScript, Tailwind CSS)
- **Supabase** (Postgres + Auth)
- **@shopify/app-bridge-react v4** — embedded app shell
- **@supabase/supabase-js** — server-side admin client
- **lucide-react** — icons

---

## Key decisions made

1. **OAuth is hand-rolled** — `@shopify/shopify-api`'s `auth.begin()` conflicts
   with Next.js App Router. `src/lib/shopify.ts` has three manual helpers:
   `buildAuthorizeUrl`, `verifyHmac`, `exchangeCodeForToken`.

2. **Offline (permanent) access token** — stored in `shops` table, never expires
   unless merchant uninstalls.

3. **service_role key server-side only** — `src/lib/supabaseAdmin.ts` uses
   service_role. Never import in client components.

4. **App Bridge v4 CDN script** — plain `<script>` tag in ROOT `src/app/layout.tsx`
   with `data-api-key` attribute. NO async/defer/type=module. Next.js Script
   component always adds async so we use plain JSX instead.

5. **Dynamic CSP via middleware** — `src/middleware.ts` sets
   `Content-Security-Policy: frame-ancestors` per shop using `?shop=` param.
   Static header causes iframe disconnect.

6. **ngrok warning bypass** — run with:
   `ngrok http 3000 --request-header-add "ngrok-skip-browser-warning: true"`

7. **SSR disabled for embedded pages** — all `/shopify/*` pages using
   `useAppBridge()` use `dynamic(() => import(...), { ssr: false })` in a
   "use client" page.tsx wrapper. Prevents hydration mismatch errors.

8. **Pagination is a shared component** — `src/components/Pagination.tsx`
   exports `<Pagination />` and `usePagination()`. Use everywhere.

9. **Admin panel uses cookie-based auth** — Supabase Auth (email/password).
   After login, session is manually written to a cookie so Next.js middleware
   can read it server-side. Uses `window.location.href` (hard redirect) not
   `router.push()` so middleware re-evaluates with the new cookie.

10. **Memberships defined in config** — `src/config/memberships.ts` is the
    single source of truth. Integer IDs never change, only names can be updated.

---

## Environment variables (`src/.env.local`, never committed)
```
SHOPIFY_API_KEY=                  # Client ID from Partners dashboard
SHOPIFY_API_SECRET=               # Client Secret from Partners dashboard
SHOPIFY_SCOPES=read_customers,write_customers,read_products,read_orders
SHOPIFY_APP_URL=                  # Full ngrok HTTPS URL (dev) or prod URL
NEXT_PUBLIC_SHOPIFY_API_KEY=      # Same as SHOPIFY_API_KEY (needed client-side)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Full folder structure
```
shopify-email-app/
├── db/
│   ├── schema.sql                     # Full Postgres schema
│   └── membership_migration.sql       # Run separately to add membership columns
├── src/
│   ├── middleware.ts                  # CSP for /shopify/*, auth guard for /admin/*
│   ├── config/
│   │   └── memberships.ts            # Membership tier definitions (IDs + names)
│   ├── lib/
│   │   ├── shopify.ts                # OAuth helpers + fetchShopifyCustomers + registerWebhook
│   │   ├── supabaseAdmin.ts          # service_role client (server only)
│   │   └── supabaseBrowser.ts        # anon client (browser, used for admin auth)
│   ├── components/
│   │   ├── Sidebar.tsx               # Shopify app left nav
│   │   ├── AdminSidebar.tsx          # Admin panel left nav (shows installed shops)
│   │   ├── Pagination.tsx            # Reusable pagination + usePagination hook
│   │   ├── AddCustomerModal.tsx      # Create single customer
│   │   ├── UpdateCustomerModal.tsx   # Edit customer fields
│   │   ├── ViewCustomerPanel.tsx     # Slide-in panel with full customer details
│   │   ├── DeleteConfirmModal.tsx    # Reusable delete warning dialog
│   │   ├── ChangeMembershipModal.tsx # Single + bulk membership change
│   │   └── ImportExportModal.tsx     # CSV import (3-step) + export with filter
│   └── app/
│       ├── layout.tsx                # Root — App Bridge script + meta tag
│       ├── page.tsx                  # Root page (unused)
│       ├── admin/
│       │   ├── layout.tsx            # Admin layout — AdminSidebar wrapper
│       │   ├── login/page.tsx        # Email/password login (Supabase Auth)
│       │   └── dashboard/page.tsx    # Stats + all shops table
│       ├── shopify/
│       │   ├── layout.tsx            # Shopify layout — Sidebar wrapper
│       │   ├── dashboard/
│       │   │   ├── page.tsx          # SSR-disabled wrapper
│       │   │   └── Dashboard.tsx     # Main dashboard UI
│       │   └── customers/
│       │       ├── page.tsx          # SSR-disabled wrapper
│       │       └── Customers.tsx     # Full contacts page
│       └── api/
│           ├── auth/
│           │   ├── route.ts          # GET /api/auth?shop= — starts OAuth
│           │   └── callback/route.ts # GET /api/auth/callback — finishes OAuth
│           ├── admin/
│           │   └── shops/route.ts    # GET — all shops + stats (admin only)
│           ├── webhooks/
│           │   └── customers/route.ts # POST — customers/create + update
│           └── shopify/
│               ├── sync-customers/route.ts
│               ├── contacts/route.ts
│               └── customers/
│                   ├── create/route.ts
│                   ├── update/route.ts
│                   ├── delete/route.ts
│                   ├── bulk-delete/route.ts
│                   ├── import/route.ts
│                   └── membership/route.ts
```

---

## Database schema

| Table | Purpose |
|---|---|
| `shops` | One row per installed store. `shop_domain`, `access_token`, `is_active` |
| `contacts` | Shopify customers. Has `subscribed`, `membership_id` (int), `subscription_date` |
| `membership_logs` | Audit trail: `contact_id`, `previous_membership_id`, `new_membership_id`, `source`, `changed_by`, `notes`, `created_at` |
| `segments` | Dynamic filter rules over contacts (JSONB) |
| `templates` | Email templates with block content (JSONB) |
| `campaigns` | One-off broadcasts. Status: draft→scheduled→sending→sent |
| `campaign_recipients` | Per-contact tracking (opens, clicks, bounces) |
| `flows` | Automation journeys with `trigger_type` and `status` |
| `flow_steps` | Steps in a flow (email, wait, condition) |
| `flow_runs` | One row per contact in a flow. `next_action_at` drives background jobs |
| `flow_run_events` | Audit trail for flow execution |
| `billing_plans` | Subscription tiers |
| `shop_subscriptions` | Which plan a shop is on |
| `email_credits_ledger` | Append-only credits ledger |
| `webhook_logs` | Debug log for Shopify + ESP webhooks |

**Run `db/membership_migration.sql` separately** — adds `membership_id` +
`subscription_date` to contacts and creates `membership_logs`.

---

## Memberships config (`src/config/memberships.ts`)
```ts
{ id: 0, name: "Free" }     // default for all new customers
{ id: 1, name: "Paid" }
{ id: 2, name: "Premium" }
{ id: 3, name: "VIP" }
```
To rename a tier: change `name` only. IDs are permanent — stored in DB.
To add a tier: add entry to the array. No other file changes needed.

Sources: `"admin"` (changed by merchant) | `"customer_purchase"` (auto)

---

## OAuth flow (DONE ✅)
Start: `GET /api/auth?shop=xxx` → validates domain → generates state cookie →
redirects to Shopify consent screen.

Callback: `GET /api/auth/callback` → checks state (CSRF) → verifies HMAC →
exchanges code for token → upserts `shops` row → redirects to
`https://{shop}/admin/apps/{SHOPIFY_API_KEY}`.

**Always start OAuth from ngrok URL not localhost** — cookie domain mismatch
causes state mismatch error.

---

## Embedded app shell (DONE ✅)
- App Bridge v4 script in root layout as plain `<script data-api-key="...">`
- Middleware sets dynamic `frame-ancestors` CSP per shop
- Sidebar: Dashboard, Shopify Connection, Customers & Segments, Email Templates,
  Campaigns, Automation Flows, Sending & ESP, Billing & Credits, GDPR & Compliance
- Dashboard: stats row, sandbox simulation board, ROI panel, usage credits,
  delivery pipeline — modelled after Sequenzy

---

## Contact Sync (DONE ✅)

### Sync route — `POST /api/shopify/sync-customers`
Paginates all Shopify customers (250/page), upserts to `contacts`,
registers `customers/create` + `customers/update` webhooks.

### Webhook — `POST /api/webhooks/customers`
Verifies HMAC via `x-shopify-hmac-sha256` (base64). Upserts contact.
Always returns 200 (Shopify retries on non-200).

### Contacts page — `/shopify/customers`
- Left: segment filters (All, Subscribers, VIP $400+, Frequent 3+, Unsubscribed)
  + GDPR/CASL notice
- Right: search + sortable table (Name↕, Membership↕, Status↕, Tags,
  Orders/Spent↕) + pagination
- Header buttons: Import/Export · Add Customer · Sync Customers
- Per-row actions: 👁 View panel · ✏️ Edit · 👑 Membership · 🗑 Delete
- Multi-select: checkboxes + select-all (current page) + bulk action bar
  (Change Membership · Delete selected)
- Membership badge in table (Free/Paid/Premium/VIP with color)

### Modals/panels
- `AddCustomerModal` — name, email, phone, consent toggle → creates in Shopify + Supabase
- `ViewCustomerPanel` — slide-in from right, shows all details + membership +
  subscription date + "Update Customer" + "Change Membership" buttons
- `UpdateCustomerModal` — edit name/phone/consent (email read-only, Shopify limitation)
- `DeleteConfirmModal` — reusable warning dialog (single + bulk)
- `ChangeMembershipModal` — tier selector cards + optional notes, single or bulk
- `ImportExportModal`:
  - Import: drag & drop CSV → preview → bulk create in Shopify → result summary
  - Export: filter (all/subscribed/unsubscribed) → download dated CSV

### Pagination component (`src/components/Pagination.tsx`)
```tsx
const { page, perPage, setPage, setPerPage, paginate } = usePagination(
  items.length,
  [search, sortKey]  // resets page 1 when these change
);
const pageItems = paginate(items);
<Pagination page={page} perPage={perPage} total={items.length}
  onPageChange={setPage} onPerPageChange={setPerPage} />
```
Options: 20 / 50 / 100 / 250. Use this on every table going forward.

### Important: Protected Customer Data
Customer email/name/phone requires Shopify's Protected Customer Data approval.
Request in Partners → Versions → Access → Protected customer data.
After approval, re-run OAuth for new scopes.

---

## Admin Panel (DONE ✅)
Completely separate from the Shopify embedded app. No App Bridge. No iframe.

| | Shopify App | Admin Panel |
|---|---|---|
| URL | `/shopify/*` | `/admin/*` |
| Auth | Shopify OAuth | Supabase email/password |
| Users | Merchants | App owner only |

### Login — `/admin/login`
- Supabase `signInWithPassword`
- Manually writes session to cookie (`sb-<projectref>-auth-token`)
- Uses `window.location.href` (hard redirect) — not `router.push()`
  because middleware reads cookies server-side, not localStorage

### Middleware protection
All `/admin/*` routes except `/admin/login` check for valid Supabase
session cookie. Redirects to `/admin/login?redirect=<path>` if missing.

### Dashboard — `/admin/dashboard`
- Stats: Total Installs, Active Shops, Total Contacts
- Table: all shops with domain, owner email, contact count, plan, status, install date

### Admin Sidebar (`src/components/AdminSidebar.tsx`)
- Logo + "Admin Panel" label
- Nav: Dashboard, All Shops, Contacts, Billing, Settings
- Collapsible "Installed Shops" list — each shop shows:
  - 🟢/🔴 active status dot
  - Shop name (`.myshopify.com` stripped)
  - Contact count badge
  - Links to `/admin/shops/[id]` (individual shop page — not built yet)
- Bottom: admin email + Sign Out (clears cookie + redirects to login)

---

## Shopify Partners setup
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
- Shopify app: open from Shopify admin URL only (not direct ngrok)
- Admin panel: open directly at `http://localhost:3000/admin/login`

---

## Feature build order & status

| # | Feature | Status |
|---|---|---|
| 1 | OAuth install flow | ✅ DONE |
| 2 | Embedded app shell + dashboard layout | ✅ DONE |
| 3 | Contact sync, webhooks, CRUD, import/export, pagination, membership | ✅ DONE |
| 4 | Admin panel (login, dashboard, sidebar, shop list) | ✅ DONE |
| 5 | Email templates (builder + save/reuse) | ⬜ Next |
| 6 | Campaigns (create, send, analytics) | ⬜ |
| 7 | Scheduling | ⬜ |
| 8 | Automation flows (journey builder + tick engine) | ⬜ |
| 9 | ESP integration (SendGrid / Resend / Postmark) | ⬜ |
| 10 | Billing + email credits (Shopify Billing API) | ⬜ |
| 11 | GDPR webhooks + compliance | ⬜ |

---

## Next feature to build: Email Templates (#5)

Pages needed:
- `/shopify/templates` — list page (table: name, subject, created, actions)
- `/shopify/templates/new` — create template
- `/shopify/templates/[id]` — edit template

API routes needed:
- `GET /api/shopify/templates?shop=` — list
- `POST /api/shopify/templates` — create
- `PUT /api/shopify/templates/[id]` — update
- `DELETE /api/shopify/templates/[id]` — delete

Editor approach: block-based (subject line + body blocks: header, text,
image, button, divider, footer). Store as JSONB in `templates.content`.
Personalisation tags: `{{first_name}}`, `{{last_name}}`, `{{shop_name}}`.
Preview mode + test send button.
Use `Pagination` component. Use `DeleteConfirmModal` for delete.

---

## Accounts
- Shopify Partners: zombie.coder.dev@gmail.com
- Dev store: dev-lag.myshopify.com
- Supabase project: (add your URL here)
- GitHub repo: (add your URL here)

---

## Git commits
- `Initial commit: Next.js scaffold + Shopify/Supabase deps + db schema`
- `feat: Shopify OAuth install flow working`
- `feat: embedded app shell with Sequenzy-style dashboard layout`
- `feat: contact sync from Shopify with webhook handler`
- `feat: customers page with segment filters and layout`
- `feat: add customer modal`
- `feat: CSV import/export for contacts`
- `feat: reusable Pagination component + usePagination hook`
- `feat: view/edit/delete customers with multi-select bulk delete`
- `feat: membership system with config, bulk change, and audit logs`
- `feat: admin panel with login, dashboard, sidebar, shop overview`