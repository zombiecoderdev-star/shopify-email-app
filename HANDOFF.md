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

4. **App Bridge v4 CDN script** — `next/script`'s `<Script>` component with
   `strategy="beforeInteractive"` in ROOT `src/app/layout.tsx`, `data-api-key`
   passed straight through (Script forwards arbitrary `data-*` attributes).
   NO async/defer/type=module — `beforeInteractive` doesn't add them; it
   injects the tag directly into the server-rendered `<head>` and executes it
   in place before hydration, which is exactly what App Bridge needs.
   (Earlier revision used a raw `<script>` JSX tag on the assumption that
   Next's Script component always adds `async` — that's wrong for
   `beforeInteractive`, and the raw tag also triggers a React dev warning,
   "Encountered a script tag while rendering React component", since React
   only auto-hoists `<script>` elements it manages itself.)

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

10. **Admin API auth check is shared** — `src/lib/adminAuth.ts` exports
    `verifyAdminSession(req)`. Every `/api/admin/*` route calls this instead
    of re-implementing cookie/session verification.

11. **Optional/new DB columns are queried defensively** — e.g. `shops.last_synced_at`
    is fetched in its own query separate from the core shop fields in
    `/api/admin/shops`, so an admin who hasn't yet run a migration adding a
    new nullable column gets `null` for that field instead of a 500 that
    blanks the whole shop list. Follow this pattern for future optional columns.

12. **Shared customer components take an optional `shopId` prop to work in
    both contexts** — `AddCustomerModal`, `UpdateCustomerModal`, and
    `ImportExportModal` already took `shop` (domain string) as a prop rather
    than reading it from context, so they were already reusable as-is. The
    only real coupling was each one's API endpoint being hardcoded to
    `/api/shopify/customers/*`. Fix: each now takes an optional `shopId`
    prop — omitted (Shopify app), it calls `/api/shopify/customers/*` with
    `{ shop, ... }` exactly as before; when present (admin), it calls the
    matching `/api/admin/contacts/*` route with `{ shop_id, ... }` instead.
    `ViewCustomerPanel` and `DeleteConfirmModal` needed zero changes — they
    have no API calls of their own, the parent page owns that. Extend this
    same `shopId`-prop pattern for any future shared customer component
    instead of forking a second copy.

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
AI_PROVIDER=gemini                # "gemini" | "anthropic" — switch which AI SDK ai-generate/route.ts calls
GEMINI_API_KEY=                   # From Google AI Studio (aistudio.google.com) — free tier, for dev/testing
ANTHROPIC_API_KEY=                # For AI template generation — server-side only, never NEXT_PUBLIC_
```
**Reminder: before going live, set `AI_PROVIDER=anthropic` in the production env.**
Gemini is for free-tier dev/testing only — don't ship on it.

---

## Full folder structure
```
shopify-email-app/
├── db/
│   ├── schema.sql                          # Full Postgres schema
│   ├── shops_last_synced_migration.sql     # Run separately — adds shops.last_synced_at
│   └── remove_membership_migration.sql     # Run separately — drops membership columns/table
├── src/
│   ├── middleware.ts                  # CSP for /shopify/*, auth guard for /admin/*
│   ├── lib/
│   │   ├── shopify.ts                # OAuth helpers + fetchShopifyCustomers + registerWebhook
│   │   ├── supabaseAdmin.ts          # service_role client (server only)
│   │   ├── supabaseBrowser.ts        # anon client (browser, used for admin auth)
│   │   ├── adminAuth.ts              # verifyAdminSession() — shared by all /api/admin/* routes
│   │   ├── tiptapContent.ts          # docFromText/textFromDoc/htmlFromDoc — TipTap JSON <-> text/HTML
│   │   └── aiProvider.ts             # generateWithAI() — Gemini/Anthropic switch via AI_PROVIDER
│   ├── config/
│   │   └── starterTemplates.ts       # Static starter template gallery data (app-level, not DB)
│   ├── components/
│   │   ├── Sidebar.tsx               # Shopify app left nav
│   │   ├── AdminSidebar.tsx          # Admin panel left nav (shows installed shops)
│   │   ├── Pagination.tsx            # Reusable pagination + usePagination hook
│   │   ├── AddCustomerModal.tsx      # Create single customer
│   │   ├── UpdateCustomerModal.tsx   # Edit customer fields
│   │   ├── ViewCustomerPanel.tsx     # Slide-in panel with full customer details
│   │   ├── DeleteConfirmModal.tsx    # Reusable delete warning dialog
│   │   ├── ImportExportModal.tsx     # CSV import (3-step) + export with filter
│   │   ├── TemplateEditor.tsx        # Block-based email editor (add/reorder/edit/preview) — text block uses TipTap
│   │   ├── TemplateGallery.tsx       # "Start from template" gallery + "Generate with AI" (full) modal
│   │   └── TestSendModal.tsx         # Test-send stub modal — logs, never claims to deliver
│   └── app/
│       ├── layout.tsx                # Root — App Bridge script + meta tag
│       ├── page.tsx                  # Root page (unused)
│       ├── admin/
│       │   ├── layout.tsx            # Root admin layout (no-op passthrough)
│       │   ├── login/page.tsx        # Email/password login (Supabase Auth)
│       │   └── (protected)/          # Route group — everything below requires admin session
│       │       ├── layout.tsx        # AdminSidebar wrapper
│       │       ├── dashboard/page.tsx # Stats + all shops table (summary view)
│       │       ├── shops/page.tsx    # Full shop management page (search, filter, sort, CSV export)
│       │       └── contacts/
│       │           ├── page.tsx          # Suspense wrapper (AdminContacts reads ?shop_id=)
│       │           └── AdminContacts.tsx # Cross-shop contacts page — shop selector + full CRUD
│       ├── shopify/
│       │   ├── layout.tsx            # Shopify layout — Sidebar wrapper
│       │   ├── dashboard/
│       │   │   ├── page.tsx          # SSR-disabled wrapper
│       │   │   └── Dashboard.tsx     # Main dashboard UI
│       │   ├── customers/
│       │   │   ├── page.tsx          # SSR-disabled wrapper
│       │   │   └── Customers.tsx     # Full contacts page
│       │   └── templates/
│       │       ├── page.tsx          # SSR-disabled wrapper — list
│       │       ├── Templates.tsx     # List page (table + Pagination)
│       │       ├── new/
│       │       │   ├── page.tsx          # SSR-disabled wrapper — create
│       │       │   └── NewTemplate.tsx   # Create page — TemplateGallery step, then name/subject + TemplateEditor
│       │       └── [id]/
│       │           ├── page.tsx          # SSR-disabled wrapper — edit
│       │           └── EditTemplate.tsx  # Edit page (+ Delete, Send Test)
│       └── api/
│           ├── auth/
│           │   ├── route.ts          # GET /api/auth?shop= — starts OAuth
│           │   └── callback/route.ts # GET /api/auth/callback — finishes OAuth
│           ├── admin/
│           │   ├── shops/
│           │   │   ├── route.ts      # GET — all shops + stats + billing plan + last synced (admin only)
│           │   │   └── [id]/status/route.ts # PATCH — toggle a shop's is_active
│           │   └── contacts/         # Admin mirror of /api/shopify/customers/*, keyed by shop_id
│           │       ├── route.ts        # GET ?shop_id= — list
│           │       ├── create/route.ts
│           │       ├── update/route.ts
│           │       ├── delete/route.ts
│           │       ├── bulk-delete/route.ts
│           │       ├── import/route.ts
│           │       └── export/route.ts # GET — streams CSV, no row cap (unlike the list route)
│           ├── webhooks/
│           │   └── customers/route.ts # POST — customers/create + update
│           └── shopify/
│               ├── sync-customers/route.ts
│               ├── contacts/route.ts
│               ├── customers/
│               │   ├── create/route.ts
│               │   ├── update/route.ts
│               │   ├── delete/route.ts
│               │   ├── bulk-delete/route.ts
│               │   └── import/route.ts
│               └── templates/
│                   ├── route.ts          # GET ?shop= — list, POST — create
│                   ├── [id]/route.ts     # PUT — update, DELETE
│                   ├── ai-generate/route.ts # POST — mode "full"|"block" via aiProvider.ts, strict JSON parsing; GET — dev-banner provider hint
│                   └── test-send/route.ts # POST — stub, logs to webhook_logs
```

---

## Database schema

| Table | Purpose |
|---|---|
| `shops` | One row per installed store. `shop_domain`, `access_token`, `is_active`, `uninstalled_at`, `last_synced_at`* |
| `contacts` | Shopify customers. Has `subscribed` |
| `segments` | Dynamic filter rules over contacts (JSONB) |
| `templates` | Email templates. `content` JSONB = `{ blocks: [{ id, type, data }] }` — see Email Templates section |
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

**Run `db/shops_last_synced_migration.sql` separately** — adds nullable
`last_synced_at` to `shops` (*not backfilled, existing shops show "Never"
until their next sync). `/api/admin/shops` queries this column separately
from the rest of the shop fields and defaults to `null` if the migration
hasn't been run yet, so forgetting this migration doesn't break the shop
list — it just leaves "Last Synced" empty.

**Run `db/remove_membership_migration.sql` separately** — drops
`membership_id` + `subscription_date` from `contacts` and drops the
`membership_logs` table. Reverses the now-removed per-contact membership
feature (see feature #10 note below for where billing tracking lives instead).

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
- Left: segment filters (All, Subscribers, Frequent 3+, Unsubscribed)
  + GDPR/CASL notice
- Right: search + sortable table (Name↕, Status↕, Tags, Orders/Spent↕) + pagination
- Header buttons: Import/Export · Add Customer · Sync Customers
- Per-row actions: 👁 View panel · ✏️ Edit · 🗑 Delete
- Multi-select: checkboxes + select-all (current page) + bulk action bar
  (Delete selected)

### Modals/panels
- `AddCustomerModal` — name, email, phone, consent toggle → creates in Shopify + Supabase
- `ViewCustomerPanel` — slide-in from right, shows all details + "Update Customer" button
- `UpdateCustomerModal` — edit name/phone/consent (email read-only, Shopify limitation)
- `DeleteConfirmModal` — reusable warning dialog (single + bulk)
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

## Email Templates (DONE ✅)

Block-based email template builder. `templates` table already matched the
planned schema exactly (`id, shop_id, name, subject, content jsonb,
created_at, updated_at`, plus an unused `thumbnail_url`) — no migration needed.

### `templates.content` JSONB structure
```json
{
  "blocks": [
    { "id": "uuid", "type": "header", "data": { "text": "...", "fontSize": 24 } },
    { "id": "uuid", "type": "text",   "data": { "content": { "type": "doc", "content": [...] } } },
    { "id": "uuid", "type": "image",  "data": { "url": "...", "alt": "..." } },
    { "id": "uuid", "type": "button", "data": { "label": "...", "url": "...", "color": "#16a34a" } },
    { "id": "uuid", "type": "divider", "data": {} },
    { "id": "uuid", "type": "footer", "data": { "text": "..." } }
  ]
}
```
Block order in the array is display order — reordering just splices the array.
The `text` block's `data.content` is TipTap's `editor.getJSON()` output (see
TipTap sub-section below) — every other block type is still plain strings/numbers.
Older rows saved before TipTap shipped may have `data.text` (plain string)
instead; render/preview code falls back to that automatically, and any edit
in the TipTap editor rewrites the block to the new `data.content` shape on save.

### Pages — `/shopify/templates`
- **List** (`Templates.tsx`): sortable table (Name↕, Subject↕, Created↕),
  "New Template" button, ✏️ Edit / 🗑 Delete row actions, `Pagination`.
- **New** (`new/NewTemplate.tsx`): opens on a `TemplateGallery` step
  ("Start from template" gallery — see below), then name + subject inputs +
  `TemplateEditor`, Save → `POST`, redirects to the list. A "Choose a
  different template" link returns to the gallery step; picking a new card
  (or "Start blank" again) replaces the current blocks and subject.
- **Edit** (`[id]/EditTemplate.tsx`): same editor pre-filled, Save (`PUT`),
  Delete (`DeleteConfirmModal`), Send Test (`TestSendModal`). Fetches the
  full list via the existing `GET ?shop=` route and finds the matching id
  client-side rather than adding a single-item GET route — consistent with
  how `Customers.tsx` already works, and the task's API spec didn't call
  for one. No gallery step here — editing an existing template starts
  straight in the editor.

### `TemplateEditor` (`src/components/TemplateEditor.tsx`)
Reusable between the new and edit pages. Toolbar to add a block (header,
text, image, button, divider, footer); each block card has up/down arrows
(picked over a drag library — simpler to ship correctly), duplicate, and
delete. Text-capable fields (header text, text body, footer text) show
personalization chips — `{{first_name}}`, `{{last_name}}`, `{{shop_name}}`
— that insert at the cursor position via a per-field ref map (header/footer)
or `editor.commands.insertContent` (text block, see below), they're never
auto-resolved while editing. A Preview toggle renders the blocks as an
email would (600px centered container) with tags resolved against sample
data (`John` / `Doe` / the shop domain with `.myshopify.com` stripped —
there's no separate "display name" column on `shops`, so this is the same
convention `AdminSidebar`/`shopName()` already use everywhere).

#### TipTap rich text (text block only)
The "text" block type uses a TipTap editor (`@tiptap/react` +
`@tiptap/starter-kit` + `@tiptap/extension-text-align`) instead of a plain
textarea — every other block type is unchanged. Small fixed toolbar (Bold,
Italic, Link, Align left/center/right) above the field. `editor.getJSON()`
is stored directly as `data.content` (see JSONB structure above) rather than
converting to HTML, so it stays consistent with the JSONB approach; HTML is
only generated at render time via `src/lib/tiptapContent.ts` — `htmlFromDoc()`
for preview, `textFromDoc()` to get plain text back out (used as AI rewrite
context), `docFromText()` to go the other way (legacy `data.text` blocks,
and AI-generated text, both get wrapped into TipTap JSON on load). Because
each `BlockCard` is keyed by `block.id`, adding/duplicating/AI-replacing a
block naturally remounts a fresh `useEditor` instance rather than needing
to sync TipTap's content prop on every keystroke.

#### Starter template gallery (`src/config/starterTemplates.ts` + `TemplateGallery.tsx`)
`/shopify/templates/new` opens on a gallery grid (6 templates: Welcome
Email, Order Follow-up, Abandoned Cart, Sale Announcement, Product Launch,
Newsletter) before the blank editor loads. Each card's "Use this template"
loads its `blocks` (+ subject) into `TemplateEditor`, fully editable, not
saved until the merchant hits Save — same for "Start blank". Templates live
in `starterTemplates.ts` as static config (not a DB table) — same
"single source of truth in config" pattern the removed per-contact
membership feature used, since these are app-level defaults every shop
gets, not per-shop rows. No migration needed.

#### AI template generation (`/api/shopify/templates/ai-generate`)
Two entry points, both server-side only (never exposes an AI API key to the
client):
- **"Generate with AI"** on the gallery step (`TemplateGallery.tsx`) — modal
  with a prompt textarea → `mode: "full"` → returns `{ subject, blocks }`,
  loaded into the editor the same way a gallery card would be.
- **"✨ AI rewrite"** next to the text block's toolbar — inline popover with
  a short prompt → `mode: "block"`, passing the block's current plain text
  (via `textFromDoc`) as `existingContent` → replaces just that block.
The route builds the request (parsing the body, system prompt, JSON fence
stripping, error handling) and hands the actual model call off to
`generateWithAI(systemPrompt, userPrompt)` in `src/lib/aiProvider.ts` — the
route has no idea which provider ran, it just gets a raw text string back
either way. `aiProvider.ts` reads `AI_PROVIDER` and branches:
- **`gemini`** — `@google/generative-ai`, `model: "gemini-2.5-flash"`,
  `systemInstruction` set directly on `getGenerativeModel()` (the installed
  SDK version supports it natively, no manual prepending needed).
- **`anthropic`** — same call as before (`model: claude-sonnet-5`,
  `max_tokens: 2000`, thinking disabled — this is short-form copywriting,
  not a task that needs deep reasoning).
Both branches return an identical `Promise<string>`, and an unset/invalid
`AI_PROVIDER` throws a clear error immediately rather than silently picking
one. The route's system prompt documents the block schema and
personalization tags, and instructs the model to return ONLY JSON (no
markdown fences, no preamble); it strips any stray ` ```json ` fences
defensively before `JSON.parse`, and returns 400 with a clear error on
anything that fails to parse or doesn't match the expected shape — it never
crashes the request. Single request/response, no streaming or queue (fine
for v1 given the ~2000 token cap). Buttons show a loading state and disable
during the call.

**Dev-only Gemini banner** — when `AI_PROVIDER=gemini`, the "Generate with
AI" modal shows a small "Testing mode: Gemini" banner so it's obvious you're
not spending Anthropic credits while iterating. `AI_PROVIDER` has no
`NEXT_PUBLIC_` prefix (deliberately — it's a server-side switch, not
something to bake into the client bundle), so the modal asks the route via
`GET /api/shopify/templates/ai-generate` on mount, which returns just
`{ provider }` — no keys. Display is still gated client-side on
`NODE_ENV === "development"`, so it never shows in production regardless of
what the GET returns.

### Test Send — stub only (pending ESP integration, #9)
`Send Test` on the edit page opens `TestSendModal` → `POST
/api/shopify/templates/test-send`. The route validates the email format,
inserts a row into `webhook_logs` (`source: "esp"`, `topic:
"test_send_stub"`), and returns `"Test send logged — ESP integration
required to actually deliver"` — shown via the App Bridge toast. It never
claims to have sent anything. Wire this up for real once an ESP
(SendGrid/Resend/Postmark) is chosen.

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
- Lighter summary view — `/admin/shops` is the detailed management page

### All Shops — `/admin/shops` (DONE ✅)
- Search (shop domain or owner email) + status filter chips: All / Active /
  Inactive / Uninstalled. "Inactive" = admin manually toggled `is_active`
  off; "Uninstalled" = `uninstalled_at` is set (shop actually removed the app)
- Sortable table (same header/sort pattern as `Customers.tsx`): shop, owner,
  billing plan (`shop_subscriptions` → `billing_plans`, active status only),
  contact count, status, install date, last synced
- Row actions: 👁 View (→ `/admin/shops/[id]`), toggle active/inactive
  (`PATCH /api/admin/shops/[id]/status`, confirm dialog via `ConfirmActionModal`),
  link to that shop's contacts (`/admin/contacts?shop_id=`)
- Export CSV of the current filtered/sorted set
- Uses `Pagination` / `usePagination` like every other table

### Shop detail — `/admin/shops/[id]` (DONE ✅)
- Owner email, contacts count, billing plan, last synced, Shopify plan,
  credits balance, install/uninstall timeline
- Toggle active/inactive (same confirm dialog as the list page)
- Link to that shop's contacts (`/admin/contacts?shop_id=`)

### Contacts — `/admin/contacts` (DONE ✅)
Cross-shop version of `/shopify/customers` — same feature set (segments,
search, sortable table, bulk delete, import/export, pagination), scoped to
whichever shop is selected instead of one merchant's own session.
- **Shop selector** at the top: dropdown of all shops (via `GET /api/admin/shops`,
  domain with `.myshopify.com` stripped). Defaults to `?shop_id=` in the URL
  if present and valid, else the first active shop, else the first shop.
  Changing the dropdown updates `?shop_id=` (via `router.replace`, no full
  navigation) and reloads the table. `/admin/shops` and `/admin/shops/[id]`
  both link here with `?shop_id=` pre-filled from their row/page.
- Split into `page.tsx` (Suspense wrapper) + `AdminContacts.tsx` (client
  component) because `useSearchParams()` requires a Suspense boundary to
  keep the route statically prerenderable.
- No App Bridge here, so there's no `shopify.toast.show()` — this page has
  its own minimal local toast (state + `setTimeout`, fixed-position banner).
- "Sync Customers" calls the existing `POST /api/shopify/sync-customers`
  unmodified — that route never had merchant-specific auth of its own (it
  trusts whatever `shop` domain is in the body either way), so there was no
  reason to fork it.
- Everything else (create/update/delete/bulk-delete/import/export) goes
  through new `/api/admin/contacts/*` routes — see below.

### Admin Sidebar (`src/components/AdminSidebar.tsx`)
- Logo + "Admin Panel" label
- Collapsible (collapse/expand toggle, persisted in localStorage)
- Nav: Dashboard, All Shops, Contacts, Billing, Settings
- Collapsible "Installed Shops" list — each shop shows:
  - 🟢/🔴 active status dot
  - Shop name (`.myshopify.com` stripped)
  - Contact count badge
  - Links to `/admin/shops/[id]`
- Bottom: admin email + Sign Out (clears cookie + redirects to login)

### Not built yet
- `/admin/billing`, `/admin/settings`

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
| 3 | Contact sync, webhooks, CRUD, import/export, pagination | ✅ DONE |
| 4 | Admin panel (login, dashboard, sidebar, shop list, /admin/shops management) | ✅ DONE |
| 5 | Email templates (builder + save/reuse) | ✅ DONE |
| 6 | Campaigns (create, send, analytics) | ⬜ Next |
| 7 | Scheduling | ⬜ |
| 8 | Automation flows (journey builder + tick engine) | ⬜ |
| 9 | ESP integration (SendGrid / Resend / Postmark) | ⬜ |
| 10 | Billing + email credits (Shopify Billing API). Shop-level free/paid tracking lives in `/admin` using the existing `billing_plans` + `shop_subscriptions` tables — not a per-contact concept. (Per-contact membership tiers were built and then removed; see git history.) | ⬜ |
| 11 | GDPR webhooks + compliance | ⬜ |

**Note for #10:** AI template generation (`src/app/api/shopify/templates/ai-generate/route.ts`)
currently has no usage cap. Once billing plans are built, add a per-day cap
tied to `shop_subscriptions` → `billing_plans` (e.g. free tier = N generations/
day, paid tiers = higher or unlimited). Track usage via a new table or a
daily counter column, reset at day boundary. Check plan tier server-side in
`ai-generate/route.ts` before calling the Anthropic API, return 429 with a
clear message if cap is hit.

---

## Next feature to build: Campaigns (#6)

Not yet scoped in detail. `campaigns` + `campaign_recipients` tables already
exist per the schema above (status: draft→scheduled→sending→sent, per-recipient
open/click/bounce tracking). Will need a `template_id` + `segment_id` picker,
send scheduling, and eventually the ESP integration (#9) to actually deliver —
`campaign_recipients.esp_message_id` is already there to match inbound ESP
webhooks back to a send.

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