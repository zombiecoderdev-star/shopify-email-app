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
   logged in. This is stored in the `shops` table.

3. **service_role key for all DB writes** — `src/lib/supabaseAdmin.ts`
   uses the Supabase service_role key. This only runs server-side
   (API route handlers). Never import it in a client component.

4. **App Bridge v4 CDN script** — loaded as a plain synchronous `<script>`
   tag in the root `src/app/layout.tsx`. Must be first script tag with NO
   async/defer. Next.js Script component always adds async so we use plain
   JSX `<script>` tag instead. Meta tag `shopify-api-key` goes in same `<head>`.

5. **Dynamic CSP headers via middleware** — `src/middleware.ts` sets
   `Content-Security-Policy: frame-ancestors` dynamically per shop using
   the `?shop=` param. A static header in next.config.ts causes iframe
   disconnect after a few seconds.

6. **ngrok warning bypass** — run ngrok with:
   `ngrok http 3000 --request-header-add "ngrok-skip-browser-warning: true"`
   This is a REQUEST header ngrok injects, not a response header.

---

## Environment variables (in `.env.local`, never committed)
```
SHOPIFY_API_KEY=                  # Client ID from Shopify Partners dashboard
SHOPIFY_API_SECRET=               # Client Secret from Shopify Partners dashboard
SHOPIFY_SCOPES=read_products,read_orders,read_customers
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
│   ├── middleware.ts                        # Dynamic CSP headers per shop
│   ├── lib/
│   │   ├── shopify.ts                       # OAuth helpers
│   │   └── supabaseAdmin.ts                 # Supabase service_role client (server only)
│   ├── components/
│   │   └── Sidebar.tsx                      # Left nav sidebar
│   └── app/
│       ├── layout.tsx                       # Root layout — App Bridge script + meta tag here
│       ├── page.tsx                         # Root page (unused)
│       ├── shopify/
│       │   ├── layout.tsx                   # Shopify section layout — sidebar wrapper
│       │   └── dashboard/
│       │       └── page.tsx                 # Main dashboard page
│       └── api/
│           └── auth/
│               ├── route.ts                 # GET /api/auth?shop= — starts OAuth
│               └── callback/
│                   └── route.ts             # GET /api/auth/callback — finishes OAuth
```

---

## Database schema summary (db/schema.sql)
All tables cascade from `shops`. Full schema is in `db/schema.sql`.

| Table | Purpose |
|---|---|
| `shops` | One row per installed store. Holds `shop_domain`, `access_token`, `scope`, `is_active` |
| `contacts` | Shopify customers synced into our DB. Has `subscribed` field for consent |
| `segments` | Dynamic filter rules over contacts (stored as JSONB) |
| `templates` | Email templates with block-based content (JSONB) |
| `campaigns` | One-off broadcast emails. Status: draft→scheduled→sending→sent |
| `campaign_recipients` | Per-contact tracking for a campaign (opens, clicks, bounces) |
| `flows` | Automation journeys. Has `trigger_type` and `status` |
| `flow_steps` | Individual steps in a flow (email, wait, condition) |
| `flow_runs` | One row per contact who entered a flow. Has `next_action_at` for background jobs |
| `flow_run_events` | Audit trail of what happened in each flow run |
| `billing_plans` | Our app's subscription tiers |
| `shop_subscriptions` | Which plan a shop is on |
| `email_credits_ledger` | Append-only ledger of credit changes (never just decrement a counter) |
| `webhook_logs` | Debug log for Shopify + ESP webhooks |

---

## OAuth flow (COMPLETED ✅)

### GET /api/auth?shop=xxx
1. Validates shop domain format
2. Generates random `state`, stores in `httpOnly` cookie
3. Builds Shopify consent URL via `buildAuthorizeUrl()`
4. Redirects merchant to Shopify

### GET /api/auth/callback?shop=xxx&code=xxx&state=xxx&hmac=xxx
1. Checks `state` cookie matches param (CSRF protection)
2. Verifies HMAC signature (confirms from Shopify)
3. Exchanges `code` for permanent token via `exchangeCodeForToken()`
4. Upserts shop row in Supabase `shops` table
5. Redirects to `https://{shop}/admin/apps/{SHOPIFY_API_KEY}`

**Important**: Always start OAuth from the ngrok URL, not localhost.
Cookie is set on whichever domain starts the flow.

---

## Embedded app shell (COMPLETED ✅)

- App Bridge v4 CDN script in root layout `<head>` as plain `<script>` (no async/defer)
- `src/middleware.ts` sets dynamic `frame-ancestors` CSP header per shop
- Sidebar with full nav: Dashboard, Shopify Connection, Customers & Segments,
  Email Templates, Campaigns, Automation Flows, Sending & ESP, Billing & Credits,
  GDPR & Compliance
- Dashboard page with stats row, sandbox simulation board, ROI panel,
  usage credits, delivery pipeline — modelled after Sequenzy's layout

---

## Shopify Partners dashboard setup
- App name: **DevStrong Email Marketing**
- App URL: `https://clobber-imitate-hatred.ngrok-free.dev/shopify/dashboard`
- Redirect URL: `https://clobber-imitate-hatred.ngrok-free.dev/api/auth/callback`
- Scopes: `read_products,read_orders,read_customers`
- URL settings are under **Versions** in the new dev dashboard

---

## Local dev setup
```bash
# Terminal 1
npm run dev

# Terminal 2
ngrok http 3000 --request-header-add "ngrok-skip-browser-warning: true"
```

---

## Feature build order & status

| # | Feature | Status |
|---|---|---|
| 1 | OAuth install flow | ✅ DONE |
| 2 | Embedded app shell + dashboard layout | ✅ DONE |
| 3 | Contact sync from Shopify | ⬜ Next |
| 4 | Segments | ⬜ |
| 5 | Email templates | ⬜ |
| 6 | Campaigns + sending | ⬜ |
| 7 | Scheduling | ⬜ |
| 8 | Automation flows | ⬜ |
| 9 | Billing + email credits | ⬜ |
| 10 | GDPR webhooks + compliance | ⬜ |

---

## Next feature to build: Contact Sync (#3)
Goal: pull all Shopify customers into our `contacts` table, then keep
them in sync via webhooks so new customers appear automatically.

Steps:
1. API route `GET /api/shopify/sync-customers` — bulk pulls all customers
   from Shopify Admin API and upserts into `contacts` table
2. Webhook handler `POST /api/webhooks/customers` — handles
   `customers/create` and `customers/update` events
3. Register webhooks in Shopify (via Admin API on install)
4. Contacts page UI at `/shopify/customers` showing the synced list

---

## Git commits so far
- `Initial commit: Next.js scaffold + Shopify/Supabase deps + db schema`
- `feat: Shopify OAuth install flow working`
- `feat: embedded app shell with Sequenzy-style dashboard layout`

---

## Accounts
- Shopify Partners: zombie.coder.dev@gmail.com
- Dev store: dev-lag.myshopify.com
- Supabase project: (add URL here)
- GitHub repo: (add URL here)
