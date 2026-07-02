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
- **@shopify/shopify-api** — installed but not used for auth (see note below)
- **@supabase/supabase-js** — server-side admin client

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

---

## Environment variables (in `.env.local`, never committed)
```
SHOPIFY_API_KEY=           # Client ID from Shopify Partners dashboard
SHOPIFY_API_SECRET=        # Client Secret from Shopify Partners dashboard
SHOPIFY_SCOPES=read_products,read_orders,read_customers
SHOPIFY_APP_URL=           # Full ngrok HTTPS URL locally, prod URL in production
NEXT_PUBLIC_SUPABASE_URL=  # From Supabase project settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

---

## Project folder structure
```
shopify-email-app/
├── db/
│   └── schema.sql              # Full Postgres schema — run this in Supabase SQL editor
├── src/
│   ├── lib/
│   │   ├── shopify.ts          # OAuth helpers (buildAuthorizeUrl, verifyHmac, exchangeCodeForToken)
│   │   └── supabaseAdmin.ts    # Supabase service_role client (server-side only)
│   └── app/
│       ├── layout.tsx          # Root layout (default Next.js)
│       ├── page.tsx            # Home page (default Next.js, not customised yet)
│       └── api/
│           └── auth/
│               ├── route.ts           # GET /api/auth?shop=xxx — starts OAuth
│               └── callback/
│                   └── route.ts       # GET /api/auth/callback — finishes OAuth
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
Follows standard Shopify OAuth. Two routes:

### GET /api/auth?shop=xxx
1. Validates shop domain format
2. Generates a random `state` value, stores it in an `httpOnly` cookie
3. Builds Shopify's consent URL via `buildAuthorizeUrl()`
4. Redirects merchant's browser to Shopify

### GET /api/auth/callback?shop=xxx&code=xxx&state=xxx&hmac=xxx
1. Checks `state` cookie matches the `state` param (CSRF protection)
2. Verifies HMAC signature via `verifyHmac()` (confirms request is from Shopify)
3. Exchanges `code` for permanent access token via `exchangeCodeForToken()`
4. Upserts shop row in Supabase `shops` table
5. Redirects merchant to `/admin/apps`

**Important**: Always start OAuth from the ngrok URL, not localhost.
Starting on localhost sets the cookie on `localhost`, but Shopify redirects
back to ngrok — the cookie won't exist there and state check fails.

---

## Shopify Partners dashboard setup
- App name: **DevStrong Email Marketing**
- App URL: `https://clobber-imitate-hatred.ngrok-free.dev` (ngrok, changes on restart)
- Redirect URL: `https://clobber-imitate-hatred.ngrok-free.dev/api/auth/callback`
- Scopes: `read_products,read_orders,read_customers`
- URL settings are under **Versions** (not Settings) in the new dev dashboard

**Note**: ngrok free tier gives a different URL on every restart.
When ngrok URL changes, update:
1. `SHOPIFY_APP_URL` in `.env.local`
2. App URL + Redirect URL in Partners dashboard → Versions → release new version

---

## Local dev setup
```bash
# Terminal 1
npm run dev           # Next.js on localhost:3000

# Terminal 2
ngrok http 3000       # Gives public HTTPS URL — use this for Shopify
```

---

## Feature build order & status

| # | Feature | Status |
|---|---|---|
| 1 | OAuth install flow | ✅ DONE |
| 2 | Embedded app shell (App Bridge) | ⬜ Next |
| 3 | Contact sync from Shopify | ⬜ |
| 4 | Segments | ⬜ |
| 5 | Email templates | ⬜ |
| 6 | Campaigns + sending | ⬜ |
| 7 | Scheduling | ⬜ |
| 8 | Automation flows | ⬜ |
| 9 | Billing + email credits | ⬜ |
| 10 | GDPR webhooks + compliance | ⬜ |

---

## Next feature to build: Embedded App Shell (#2)
The goal is to make the app appear *inside* Shopify admin (like Sequenzy)
rather than as a standalone site. This requires:

1. Install `@shopify/app-bridge-react` (already in package.json)
2. Create an `AppBridgeProvider` component that wraps the app
3. Verify the Shopify session token on each page load (JWT in URL)
4. Build a basic dashboard page (`/app/dashboard`) that renders inside the iframe
5. Update the OAuth callback redirect to point to the dashboard instead of `/admin/apps`

The key concept: Shopify embeds your app's URL in an `<iframe>` inside admin.
App Bridge is a JS library that lets your iframe communicate with the parent
Shopify admin frame (navigate, show toasts, open modals, etc.)

---

## Git commit history
- `Initial commit: Next.js scaffold + Shopify/Supabase deps + db schema`
- `feat: Shopify OAuth install flow working`

---

## People / accounts
- Shopify Partners account email: zombie.coder.dev@gmail.com
- Dev store: dev-lag.myshopify.com
- Supabase project: (add your project URL here)
- GitHub repo: (add your repo URL here)
