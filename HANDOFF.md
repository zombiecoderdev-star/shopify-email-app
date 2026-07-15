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
ESP_PROVIDER=aws_ses              # Swappable: "aws_ses" today, "resend"/"sendgrid"/"postmark" could be added later
AWS_SES_REGION=                   # e.g. us-east-1 — must match the region your SES identity is verified in
AWS_SES_ACCESS_KEY_ID=            # IAM user/role with ses:SendEmail + ses:GetSendQuota
AWS_SES_SECRET_ACCESS_KEY=
AWS_SES_FROM_EMAIL=               # Must be a verified identity (email or domain) in that SES region
AWS_SES_CONFIGURATION_SET=        # Optional — name of the config set from the ESP section's step 4; sends work without it, but bounce/complaint/delivery events won't reach /api/webhooks/ses unless it's set
```
**Reminder: before going live, set `AI_PROVIDER=anthropic` in the production env.**
Gemini is for free-tier dev/testing only — don't ship on it.

**AWS SES sandbox mode — read this before testing sends.** Every new AWS SES
account starts in sandbox mode: it can only send to email addresses/domains
you've manually verified in the SES console (or the built-in Mailbox
Simulator addresses). Real campaign sends to any other recipient will fail
outright until AWS grants production access — a manual request through the
SES console (**Account dashboard → Request production access**), typically
approved within 24 hours. Verify your own test inbox as an identity first so
test-send / the Sending & ESP page's connection check has something to
succeed against. See the ESP section below for full setup steps.

---

## Full folder structure
```
shopify-email-app/
├── db/
│   ├── schema.sql                          # Full Postgres schema
│   ├── shops_last_synced_migration.sql     # Run separately — adds shops.last_synced_at
│   ├── remove_membership_migration.sql     # Run separately — drops membership columns/table
│   ├── campaigns_migration.sql             # Run separately — adds campaigns.audience_filter/recipient_count/updated_at, campaign_recipients.created_at
│   ├── esp_migration.sql                   # Run separately — adds campaign_recipients.complained_at
│   ├── tags_migration.sql                  # Run separately — contacts.tags NOT NULL text[] + normalize existing values + GIN index
│   └── campaign_send_migration.sql         # Run separately — adds campaign_recipients.error (per-recipient failure message)
├── src/
│   ├── middleware.ts                  # CSP for /shopify/*, auth guard for /admin/*
│   ├── lib/
│   │   ├── shopify.ts                # OAuth helpers + fetchShopifyCustomers + registerWebhook
│   │   ├── supabaseAdmin.ts          # service_role client (server only)
│   │   ├── supabaseBrowser.ts        # anon client (browser, used for admin auth)
│   │   ├── adminAuth.ts              # verifyAdminSession() — shared by all /api/admin/* routes
│   │   ├── tiptapContent.ts          # docFromText/textFromDoc/htmlFromDoc — TipTap JSON <-> text/HTML
│   │   ├── aiProvider.ts             # generateWithAI() — Gemini/Anthropic switch via AI_PROVIDER
│   │   ├── audience.ts               # AudienceFilter union (segment/tag/contacts) + normalizeAudienceFilter + AUDIENCE_SEGMENTS (client-safe)
│   │   ├── resolveAudience.ts        # countAudience/countAllAudienceSegments/resolveAudienceContacts — ALL audience types resolve here (server only; replaced audienceQueries.ts)
│   │   ├── tags.ts                   # normalizeTag(s)/tagsFromShopifyString/mergeTags — client-safe tag normalization
│   │   ├── campaignSend.ts           # sendCampaign() — real per-contact send, shared by send/route.ts and process-scheduled/route.ts
│   │   ├── espProvider.ts            # sendEmail() — AWS SES switch via ESP_PROVIDER
│   │   ├── renderTemplateHtml.ts     # Server-safe (no React) block-to-HTML renderer for real sends
│   │   └── snsVerify.ts              # verifySnsSignature() — manual SNS signature verification
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
│   │   ├── ManageTagsModal.tsx       # Add/remove contact tags — single + bulk, autocomplete from GET /api/shopify/tags
│   │   ├── ImportExportModal.tsx     # CSV import (3-step) + export with filter
│   │   ├── TemplateEditor.tsx        # Block-based email editor (add/reorder/edit/preview) — text block uses TipTap
│   │   ├── TemplateGallery.tsx       # "Start from template" gallery + "Generate with AI" (full) modal
│   │   ├── TestSendModal.tsx         # Test-send modal — real ESP send; takes templateId OR campaignId (campaign test-send)
│   │   ├── CampaignWizard.tsx        # 4-step campaign builder (Basics/Template/Audience/Review) — shared by new + edit
│   │   └── CampaignStatusBadge.tsx   # draft/scheduled/sending/sent badge — shared by list + detail pages
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
│       │   ├── templates/
│       │   │   ├── page.tsx          # SSR-disabled wrapper — list
│       │   │   ├── Templates.tsx     # List page (table + Pagination)
│       │   │   ├── new/
│       │   │   │   ├── page.tsx          # SSR-disabled wrapper — create
│       │   │   │   └── NewTemplate.tsx   # Create page — TemplateGallery step, then name/subject + TemplateEditor
│       │   │   └── [id]/
│       │   │       ├── page.tsx          # SSR-disabled wrapper — edit
│       │   │       └── EditTemplate.tsx  # Edit page (+ Delete, Send Test)
│       │   ├── campaigns/
│       │   │   ├── page.tsx          # SSR-disabled wrapper — list
│       │   │   ├── Campaigns.tsx     # List page (table + Pagination) — Recipients/Scheduled-Sent only populate once sent
│       │   │   ├── new/
│       │   │   │   ├── page.tsx          # SSR-disabled wrapper — create
│       │   │   │   └── NewCampaign.tsx   # Create page — header + CampaignWizard (create mode)
│       │   │   └── [id]/
│       │   │       ├── page.tsx          # SSR-disabled wrapper — detail
│       │   │       └── CampaignDetail.tsx # draft/scheduled -> CampaignWizard (edit mode) + Send Test + Delete; sent/failed -> read-only summary + recipients (with per-recipient error) + real bounce/complaint/failed analytics
│       │   └── sending/
│       │       ├── page.tsx          # SSR-disabled wrapper
│       │       └── Sending.tsx       # ESP_PROVIDER/from-email display, sandbox status heuristic, test-send button
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
│           │   ├── customers/route.ts # POST — customers/create + update
│           │   └── ses/route.ts       # POST — SNS bounce/complaint/delivery notifications, see ESP section
│           └── shopify/
│               ├── sync-customers/route.ts   # Bulk sync — MERGES Shopify tags with app-added tags on upsert
│               ├── contacts/
│               │   ├── route.ts          # GET ?shop= — list; optional search/page/per_page (server-side, for the campaign contact picker) and ids= lookup
│               │   └── tags/route.ts     # POST — add/remove tags on one or many contacts (normalized: trim/lowercase/dedupe)
│               ├── tags/route.ts         # GET ?shop= — distinct tags across the shop's contacts, sorted (autocomplete + wizard multi-select)
│               ├── customers/
│               │   ├── create/route.ts
│               │   ├── update/route.ts
│               │   ├── delete/route.ts
│               │   ├── bulk-delete/route.ts
│               │   └── import/route.ts
│               ├── templates/
│               │   ├── route.ts          # GET ?shop= — list, POST — create
│               │   ├── [id]/route.ts     # PUT — update, DELETE
│               │   ├── ai-generate/route.ts # POST — mode "full"|"block" via aiProvider.ts, strict JSON parsing; GET — dev-banner provider hint
│               │   └── test-send/route.ts # POST — real send via espProvider.ts; template_id optional (connection-check mode)
│               ├── campaigns/
│               │   ├── route.ts                  # GET ?shop= — list (template name embedded), POST — create
│               │   ├── [id]/route.ts              # PUT — update, DELETE (draft/scheduled only)
│               │   ├── [id]/recipients/route.ts   # GET ?shop= — recipient list for the sent-campaign view
│               │   ├── audience-count/route.ts    # GET ?shop= — counts for the 4 fixed segments; POST { shop, audience_filter } — count for ANY filter (tag live count)
│               │   ├── [id]/send/route.ts          # POST ?shop= — real send (campaignSend.ts); 409 on double-send, surfaces sent/failed counts
│               │   ├── [id]/test-send/route.ts     # POST { shop, email } — one rendered test email, no status/recipients/credits side effects
│               │   └── process-scheduled/route.ts  # GET/POST — cron-target, not wired to a scheduler yet
│               └── sending/
│                   └── status/route.ts   # GET — ESP_PROVIDER + masked from-email + sandbox heuristic (GetSendQuotaCommand), no secrets
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

**Run `db/campaigns_migration.sql` separately** — adds `audience_filter`
(jsonb), `recipient_count` (int, default 0), and `updated_at` to `campaigns`;
adds `created_at` to `campaign_recipients`. `campaigns.segment_id` (FK to the
`segments` table) already existed but is untouched/unused by this feature —
audience selection reuses the four fixed segments from `/shopify/customers`
instead of the dynamic segments table; see Campaigns section below.

**Run `db/esp_migration.sql` separately** — adds `complained_at` to
`campaign_recipients`, for symmetry with the existing `sent_at`/`opened_at`/
`clicked_at`/`bounced_at` columns. `campaign_recipients.status` is plain
`text` with no enum/check constraint, so the new `"failed"` and
`"complained"` status values (see ESP section below) needed no schema
change of their own.

**Run `db/campaign_send_migration.sql` separately** — adds nullable `error`
to `campaign_recipients` so a failed send stores the ESP's error message per
recipient (shown under the status badge in the sent-campaign recipient
list). Written and read defensively (retry-without-column) until the
migration runs, per the optional-column convention above.

**Run `db/tags_migration.sql` separately** — enforces `contacts.tags` as
`text[] NOT NULL DEFAULT '{}'` (defensively converting a legacy text column
by splitting on commas if one ever existed), normalizes all existing tag
values (trim, lowercase, dedupe — required for the case-sensitive Postgres
`&&` overlap operator used by tag audiences), and adds a GIN index on
`contacts.tags`. Until it runs, pre-existing mixed-case tags (e.g. a synced
`"VIP"`) won't match tag audiences; everything written after the tagging
feature shipped is already normalized on write.

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

### Test Send — real send via ESP (#9 DONE ✅)
`Send Test` on the edit page opens `TestSendModal` → `POST
/api/shopify/templates/test-send`. The route validates the email format,
renders the template's blocks to HTML (`renderTemplateHtml`, see ESP
Integration section below), and calls `sendEmail()` — a real send through
whatever `ESP_PROVIDER` is configured, currently AWS SES. Logs the attempt
to `webhook_logs` (`source: "esp"`, `topic: "test_send"`, includes the SES
`MessageId`) and returns `"Test email sent to {address} ✅"` on success, or
a 502 with SES's error message on failure — no more "logged, not delivered"
disclaimer, because it now actually delivers (subject to AWS SES sandbox
mode restrictions — see ESP Integration section). `template_id` is optional:
omit it and the route sends a small hardcoded test message instead of
rendering a saved template, which is what the Sending & ESP page's
connection-check button does.

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
| 6 | Campaigns (create, send, analytics) | ✅ DONE |
| 6b | Contact tagging + tag / specific-contact campaign audiences | ✅ DONE — see Contact Tagging section; run `db/tags_migration.sql` |
| 7 | Scheduling | 🟡 Processing logic done, cron trigger not wired up — see Campaigns section |
| 8 | Automation flows (journey builder + tick engine) | ⬜ |
| 9 | ESP integration (AWS SES) | ✅ DONE — open/click tracking is a known gap, pending further SES event configuration (see ESP Integration section) |
| 10 | Billing + email credits (Shopify Billing API). Shop-level free/paid tracking lives in `/admin` using the existing `billing_plans` + `shop_subscriptions` tables — not a per-contact concept. (Per-contact membership tiers were built and then removed; see git history.) **Campaign sends now write `email_credits_ledger` debits and decrement `shops.credits_balance`** (see Campaigns → Real send) — plans, purchase flow, and balance enforcement are still unbuilt; nothing stops a send at 0 credits yet. | ⬜ |
| 11 | GDPR webhooks + compliance | ⬜ |

**Note for #10:** AI template generation (`src/app/api/shopify/templates/ai-generate/route.ts`)
currently has no usage cap. Once billing plans are built, add a per-day cap
tied to `shop_subscriptions` → `billing_plans` (e.g. free tier = N generations/
day, paid tiers = higher or unlimited). Track usage via a new table or a
daily counter column, reset at day boundary. Check plan tier server-side in
`ai-generate/route.ts` before calling the Anthropic API, return 429 with a
clear message if cap is hit. Now that campaign sending is real (#9), the same
per-day-cap mechanism could reasonably key off actual send volume too
(`campaign_recipients` rows, or the `webhook_logs` `campaign_send`/`test_send`
entries) if usage-based billing tiers end up mattering more than generation
counts — worth revisiting once billing plans are actually designed.

---

## Campaigns (DONE ✅)

One-off broadcast campaigns: pick a template, pick an audience, save as
draft, schedule for later, or send now. Sending is **real** as of the ESP
integration (#9) — see that section below for provider details, AWS SES
sandbox mode caveats, and bounce/complaint handling.

### Status lifecycle
```
draft ──────┐                    ┌─► sent     (≥1 recipient succeeded, or 0 recipients matched)
            ├─► sending ─────────┤
scheduled ──┘   (atomic claim)   └─► failed   (every recipient failed)
   ▲
   └─ process-scheduled route runs the same claim + send once scheduled_at <= now()
```
- **draft** — not scheduled, not sent. Editable, deletable, sendable.
- **scheduled** — `scheduled_at` set. Editable, deletable, sendable. Picked
  up by `process-scheduled` once due.
- **sending** — transient, entered ONLY via campaignSend.ts's **atomic
  claim** (`UPDATE ... WHERE status IN ('draft','scheduled')`): a
  double-click or an overlapping cron tick finds zero claimable rows and
  gets a 409 instead of a duplicate send. The create/PUT routes refuse to
  set `sending`/`sent`/`failed` directly for the same reason. Not
  editable/deletable.
- **sent** — terminal. `sent_at` + `recipient_count` set once every send has
  been *attempted* (not necessarily succeeded — partial failures are normal,
  especially in AWS SES sandbox mode). `campaign_recipients` rows carry the
  per-contact outcome (`sent` or `failed` + `error`, later possibly
  `bounced`/`complained`/`delivered` via the SNS webhook). View-only.
- **failed** — terminal: every single recipient failed (the norm in sandbox
  mode when no recipient is a verified address). `sent_at` stays null,
  `recipient_count` records what was attempted. View-only, red badge; the
  detail page shows per-recipient error messages. Not re-sendable — recreate
  the campaign (or loosen `SENDABLE_STATUSES` in `[id]/send/route.ts` if
  retry-from-failed is ever wanted).

### `audience_filter` JSONB shape (current — discriminated union)
```json
{ "type": "segment",  "segment": "all" | "subscribed" | "frequent" | "unsubscribed" }
{ "type": "tag",      "tags": ["vip", "wholesale"] }
{ "type": "contacts", "contact_ids": ["uuid", "..."] }
```
Six audience options total: the four fixed segments from `/shopify/customers`
(`Customers.tsx` `SEGMENTS`), plus "By tag" and "Specific contacts" (see the
Contact Tagging section below). **Legacy rows** saved before the tagging
feature hold the old `{ "segment": "..." }` shape with no `type` —
`normalizeAudienceFilter()` in `src/lib/audience.ts` coerces any raw DB
value (legacy shape, null, garbage) into the current union with a safe
fallback of `{ type: "segment", segment: "subscribed" }`, and every consumer
(labels, counts, sends, the wizard) runs values through it rather than
trusting the row. Re-saving an old campaign migrates it to the new shape as
a side effect. Segments are defined once in `src/lib/audience.ts`
(`AUDIENCE_SEGMENTS`, client-safe) and ALL filter types resolve to contacts
server-side in `src/lib/resolveAudience.ts` (`subscribed` → `subscribed =
true`, `frequent` → `orders_count >= 3`, `unsubscribed` → `subscribed =
false`, `all` → no filter, `tag` → `tags && selected AND subscribed = true`,
`contacts` → `id IN (...)`). `"all"` and `"unsubscribed"` both include
contacts who opted out, so both are flagged `warnUnsubscribed` for the
stronger inline compliance warning in the Audience step; hand-picked
unsubscribed contacts trigger the same warning. `campaigns.segment_id`
(FK to the `segments` table) is left in the schema untouched — this feature
never reads or writes it.

### Status badge display (`CampaignStatusBadge.tsx`)
The DB status values (draft/scheduled/sending/sent/failed) are unchanged —
this is a display-only relabel, nothing that reads raw `status` for logic
(sort, filters, `EDITABLE_STATUSES`/`SENDABLE_STATUSES`, etc.) was touched:
- `draft` → "Draft", `sent` → "Sent", `failed` → "Failed" (unchanged style)
- `scheduled` → **"In Queue"** (existing blue style, just relabeled — it's
  sitting in queue until `scheduled_at` is due)
- `sending` → **"Sending"** with an animated `lucide-react` `Loader2` spinner
  next to the label
Both `Campaigns.tsx` (row action) and `CampaignWizard.tsx`'s Send Now (via
`onSendStart`/`onSendRevert` props consumed by `CampaignDetail.tsx`)
optimistically flip the displayed status to `sending` the instant the
`/send` POST fires, then poll `GET /api/shopify/campaigns?shop=` every ~2s
(60s timeout) so the badge flips to `Sent`/`Failed` without a manual
refresh even though the `/send` route itself blocks until the batched send
finishes. Reverts to the prior status on outright POST failure (network
error or non-2xx) since the campaign never actually left draft/scheduled
server-side in that case.

### Pages — `/shopify/campaigns`
- **List** (`Campaigns.tsx`): sortable table (Name↕, Status↕, Scheduled/Sent
  date↕), "New Campaign" button, `Pagination`. Template name and recipient
  count come along for free via `campaigns?shop=`'s embedded `templates(name)`
  select. Recipients/date columns only populate once a campaign is sent or
  scheduled — draft rows show "—".
- **New** (`new/NewCampaign.tsx`): header + `CampaignWizard` in create mode,
  redirects to the list on any successful save/schedule/send.
- **Detail** (`[id]/CampaignDetail.tsx`): fetches the full list via the
  existing `GET ?shop=` route and finds the matching id client-side, same
  convention as `EditTemplate.tsx`. Draft/scheduled → `CampaignWizard` in
  edit mode (pre-filled, PUT instead of POST) + a Delete button, reloads in
  place after saving instead of navigating away. Sent → read-only summary
  (template, audience, recipient count, sent date), an analytics block
  (real Bounces/Complaints/Failed counts from `campaign_recipients`; Opens/
  Clicks stay "—" — SES doesn't track those without extra event-tracking
  setup, see ESP section — never fabricated), and the recipient list
  (`[id]/recipients` route) with a per-status colored badge.

### `CampaignWizard` (`src/components/CampaignWizard.tsx`)
Shared 4-step builder used by both the new and detail pages (`campaignId`
prop present = edit/PUT, absent = create/POST):
1. **Basics** — name + subject. Subject auto-prefills from the chosen
   template once (step 2) without clobbering anything already typed.
2. **Template** — card grid from `GET /api/shopify/templates?shop=`; "Create
   new template" opens `/shopify/templates/new` in a new tab (`target="_blank"`)
   so wizard progress isn't lost.
3. **Audience** — radio list of the four segments with a live count per
   segment (`GET /api/shopify/campaigns/audience-count`), the same GDPR/CASL
   banner as `Customers.tsx`, plus a stronger red warning when the selected
   segment includes unsubscribed contacts.
4. **Review & Send** — summary card, then three actions: Save as Draft, Schedule
   for later (inline datetime-local popover, `min` clamped to now), or Send
   Now (creates/updates the campaign then immediately calls the send route).
   All three toast a result and call `onSaved()` — the parent decides whether
   that means "navigate to the list" (new) or "reload in place" (edit).

### Real send (`src/lib/campaignSend.ts` — `sendCampaign`)
Shared by `POST /api/shopify/campaigns/[id]/send?shop=` (manual send — the
route validates shop ownership + status first: 404 wrong shop/campaign,
409 already sending/sent, 400 missing template/subject or terminal
`failed`) and `process-scheduled`. Flow:
1. Validate (exists, has template + subject), then **atomically claim**
   draft/scheduled → `sending` (see Status lifecycle — this is the
   double-send guard; a lost race throws `CampaignSendConflictError`,
   which the route maps to 409).
2. Resolve the audience (`resolveAudienceContacts`) and keep only contacts
   with `subscribed = true` **and** a plausible email. **Consent is
   enforced at send time regardless of audience type** — the "All
   contacts"/"Unsubscribed list" segments and hand-picked unsubscribed
   contacts still appear in wizard counts (with red warnings), but are
   skipped by the actual send, so the preview count can exceed the
   attempted count.
3. Insert one `campaign_recipients` row per recipient with
   `status: "pending"` BEFORE any send, so a crash mid-send leaves an
   auditable pending/attempted trail.
4. Send in **batches of 5 with a ~1.1s pause between batches** (SES
   enforces a per-account max send rate — 1/sec in sandbox, 14/sec default
   production — so full parallelism would just trade sends for throttling
   errors; throttled sends surface as per-recipient failures, not crashes).
   Each recipient's template + subject render with their own
   `{{first_name}}`/`{{last_name}}`/`{{shop_name}}` values.
5. Flip each row to `sent` (+ `esp_message_id`, `sent_at`) or `failed`
   (+ `error` message — written defensively until
   `db/campaign_send_migration.sql` runs).
6. Finish the campaign: `sent` (or `failed` if every recipient failed),
   `recipient_count`, `sent_at`, and a `webhook_logs` summary
   (`topic: "campaign_send"`).
7. **Credits**: one append-only `email_credits_ledger` entry per campaign
   send (`change: -sent_count`, `reason: "campaign_send"`,
   `reference_id: campaign_id` — failed sends aren't billed, 0-sent runs
   write no entry) and `shops.credits_balance` is decremented to match
   (the schema's "kept in sync by application logic" contract — this is
   currently the only writer).

The response includes `sent_count`/`failed_count`/`status` and a message
that's honest about partial failure — e.g. *"Campaign sent to 3 of 10
recipients — 7 failed"*.

### Campaign test send (`POST /api/shopify/campaigns/[id]/test-send`)
Body `{ shop, email }` — sends ONE rendered copy of the campaign's email
(its subject + template, tags resolved against sample values) via the ESP.
Touches nothing else: no status change, no recipient rows, no credits, and
no SES message tags (so a bounced test can't be mistaken for a real
recipient event by the SNS webhook). Surfaced as the "Send Test" button on
the campaign detail page (draft/scheduled), reusing `TestSendModal` — the
modal now takes `templateId` OR `campaignId` and picks the endpoint.

### Send buttons in the UI
- **Campaign list** (`Campaigns.tsx`): per-row ✈ Send action on
  draft/scheduled campaigns → `ConfirmActionModal` (green "Send Campaign
  Now?" confirm) → `[id]/send` → toasts the sent/failed message and
  refreshes the list.
- **Wizard "Send Now"** (`CampaignWizard.tsx`): persists the campaign as a
  DRAFT first, then calls `[id]/send` — the route owns the → sending
  transition, so a request that dies mid-way leaves a recoverable draft
  instead of a campaign stuck in "sending" (previously the wizard itself
  wrote status "sending" before calling the old flat `POST .../send`
  route, which has been removed).

### Scheduling (#7 — processing logic done, trigger not wired up)
`GET`/`POST /api/shopify/campaigns/process-scheduled` finds every campaign
with `status = "scheduled"` and `scheduled_at <= now()` and runs the same
real send flow for each. Mirrors the `flow_runs.next_action_at` pattern
already planned for automation flows (#8), so the architecture stays
consistent once a real background worker exists. **This route is not
wired up to actually run on a schedule** — it needs an external trigger
(a cron job, Vercel Cron, a scheduled Supabase function, etc.) to call it
periodically. No auth check on it yet either, since a cron trigger may not
be able to send one; add a shared-secret header before exposing it publicly.
For now it's manually triggerable (hit the URL) so the processing logic
itself can be verified independent of a real scheduler.

---

## Contact Tagging & Tag/Specific-Contact Audiences (DONE ✅)

App-only contact tags plus two new campaign audience types. **Tags are never
synced back to Shopify** — the customer sync + webhook merge Shopify's tags
INTO ours, never the reverse.

### Storage & normalization
- `contacts.tags` is `text[] NOT NULL DEFAULT '{}'` with a GIN index (run
  `db/tags_migration.sql` — see Database schema section).
- Every tag is normalized (trim, lowercase, dedupe) at every write path via
  `src/lib/tags.ts` (`normalizeTag`/`normalizeTags`/`tagsFromShopifyString`/
  `mergeTags`, client-safe). Lowercasing matters because Postgres's `&&`
  array-overlap operator (tag audiences) is case-sensitive.
- **Shopify sync + webhook upserts MERGE tags** (`mergeTags(existing,
  incoming)`) instead of overwriting, so tags added in-app survive Shopify
  customer updates. Consequence: a tag deleted in Shopify never disappears
  here — remove it via ManageTagsModal instead.

### API
- `POST /api/shopify/contacts/tags` — `{ shop, contactIds[], addTags[],
  removeTags[] }`, single or bulk, shop-scoped, normalizes before writing.
- `GET /api/shopify/tags?shop=` — distinct tags across the shop's contacts,
  sorted, for autocomplete + the wizard's tag multi-select.
- `GET /api/shopify/contacts` grew optional params for the wizard's contact
  picker: `search=` (server-side ilike on email/first/last name), `page=` +
  `per_page=` (server-side range pagination, `{ contacts, total }`), and
  `ids=` (comma-separated lookup for chip labels when editing a saved
  "specific contacts" campaign). With none of these it behaves exactly as
  before (newest 100) for `Customers.tsx`.

### UI
- **Customers page**: 🏷 per-row action + "Manage Tags" in the bulk action
  bar, both opening `ManageTagsModal` (chips with remove buttons in single
  mode, add-only in bulk mode with "Applying to N contacts", autocomplete
  with a "Create «tag»" option). Tags column shows up to 3 chips + a "+N"
  overflow with the rest in its tooltip.
- **Campaign wizard Audience step**: two options after the four segments —
  **By tag** (chip multi-select of the shop's tags, live recipient count via
  `POST audience-count`, debounced; tag audiences ALWAYS exclude
  unsubscribed contacts — a tag is not consent) and **Specific contacts**
  (server-searched, paginated picker using the shared `Pagination`
  component, removable selection chips, UNSUBSCRIBED badge per row and a red
  warning when any selected contact is unsubscribed — this type deliberately
  doesn't force the subscribed filter, mirroring how "All contacts" works).
- The wizard keeps each audience type's half-built selection in separate
  state, so toggling between radio options doesn't lose a tag/contact
  selection; the stored filter is assembled from whichever type is active
  on save.

See the Campaigns section above for the `audience_filter` JSONB union shape,
the legacy-row fallback (`normalizeAudienceFilter`), and
`src/lib/resolveAudience.ts` — the single place all six audience types
resolve to contacts for both count previews and real sends.

---

## ESP Integration — AWS SES (DONE ✅)

Real email sending, architected behind a swappable provider interface —
same pattern as `src/lib/aiProvider.ts` for Gemini/Anthropic — so
SendGrid/Resend/Postmark can be added later without touching any calling
code (`TestSendModal`, `campaignSend.ts`, etc. only ever call `sendEmail()`).

**SDK:** `@aws-sdk/client-ses` (v3, `SESClient` + `SendEmailCommand` — the
classic v1 SES API, not sesv2). `@aws-sdk/client-sns` is also installed but
SNS signature verification is done manually with Node's built-in `crypto`
(see `snsVerify.ts` below). **Env vars actually used** (note the `AWS_SES_`
prefix, NOT the SDK-default `AWS_REGION`/`AWS_ACCESS_KEY_ID` names — creds
are passed explicitly to the client): `AWS_SES_REGION`,
`AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `AWS_SES_FROM_EMAIL`
(must be a verified SES identity), `AWS_SES_CONFIGURATION_SET` (optional —
only needed for bounce/complaint events), `ESP_PROVIDER=aws_ses`.

**Current account state (verified live via `GET /api/shopify/sending/status`,
2026-07-14):** the account **is in sandbox mode** — max send rate 1/sec,
200 sends/24h. The configured from-address is the Partners-account Gmail
(zombie.coder.dev@gmail.com) and is necessarily a verified identity (SES
rejects unverified senders outright). While in sandbox, sends only succeed
to verified identities or SES Mailbox Simulator addresses
(`success@simulator.amazonses.com` etc.) — check the SES console's Verified
identities page for the authoritative list.

### ⚠️ AWS SES sandbox mode — read this before testing
**Every new AWS SES account starts in sandbox mode.** It can only send to
email addresses/domains you've manually verified in the SES console (or
the built-in Mailbox Simulator addresses) — sends to anyone else fail
outright. This is not a bug in this integration; it's AWS's default for
every new account, to prevent spam. **Real campaign sends to your actual
contact list will fail until you request production access** (SES console
→ **Account dashboard → Request production access** — a short form, usually
approved within 24 hours). Until then:
- Verify your own inbox as an identity first, so test-send and the Sending
  & ESP page's connection-check button have something to succeed against.
- Expect campaign sends to real contacts to show partial or total failure
  in the `sent_count`/`failed_count` response — that's expected, not a bug.
- The "Sending & ESP" page (`/shopify/sending`) shows a best-effort sandbox
  status heuristic to help you tell whether you're still restricted.

### `src/lib/espProvider.ts` — provider abstraction
```ts
sendEmail({ to, subject, html, campaignId?, contactId? })
  → { success: boolean, messageId?: string, error?: string }
```
Reads `ESP_PROVIDER` and branches — currently only `"aws_ses"` is
implemented, throws a clear error for anything else (unset or unrecognized).
Return shape is identical no matter which branch runs, so callers never
know or care which ESP is active. `campaignId`/`contactId`, when provided,
are attached as SES message tags (`Tags: [{Name, Value}]` on
`SendEmailCommand`) — SES echoes these back verbatim in every bounce/
complaint/delivery SNS notification (`mail.tags`), which is how the SNS
webhook correlates an event back to a `campaign_recipients` row without
needing a separate id-mapping table.

**Adding a new provider later** (SendGrid/Resend/Postmark): add a new
`case`/branch in `sendEmail()` that calls the new provider's SDK and maps
its response into the same `{ success, messageId?, error? }` shape, add its
env vars, and flip `ESP_PROVIDER`. No other file needs to change — every
caller already goes through `sendEmail()`.

### `src/lib/renderTemplateHtml.ts` — server-safe HTML rendering
`TemplateEditor.tsx`'s preview renderer (`PreviewBlock`) is React/JSX and
lives in a "use client" file that's off-limits for this task (templates
editor — do not touch), so this is a **parallel, self-contained** renderer
— pure string building, no React, safe to call from an API route — that
mirrors the same block-type handling (header/text/image/button/divider/
footer). The two will need to be kept in sync by hand if a new block type
is ever added. Notable differences from the in-app preview: buttons render
as real clickable `<a href>` anchors (the preview is a visual-only span),
and personalization tag values are HTML-escaped before substitution
(`escapeSampleValues`) so a contact name containing `&`/`<` can't break the
outbound HTML — the preview never needed this since it only ever
substitutes safe static sample values ("John"/"Doe"). `resolveTags()` is
also exported and used un-escaped for the plain-text subject line.

### Wired up (replaced all three stubs)
- **Template test-send** (`/api/shopify/templates/test-send`) — renders the
  template via `renderTemplateHtml` and calls `sendEmail()` for real.
  `template_id` is optional; omitted, it sends a small hardcoded message
  instead, which is what the Sending & ESP page's connection-check uses.
- **Campaign send** (`src/lib/campaignSend.ts` → `sendCampaign()`, via
  `POST /api/shopify/campaigns/[id]/send?shop=`) — real per-contact send
  with personalization, batched with a delay between batches (not fully
  parallel — SES enforces an account-wide max send rate, as low as 1/sec in
  sandbox mode; see `GetSendQuotaCommand` in the Sending & ESP page). See
  the Campaigns section above for the full status-transition,
  double-send-guard, credits, and partial-failure details.
- **Scheduled processing** (`process-scheduled`) — no structural change
  needed; it already called the shared send function, which is now real.

### Bounce/complaint handling — SNS, not a simple webhook
AWS SES doesn't POST to your app directly. Bounce/complaint/delivery events
go through **SNS** (Simple Notification Service): SES → configuration set →
SNS topic → HTTP subscription → your route. This requires manual AWS
console setup that can't be done from code:

1. **Verify a sender identity** — SES console → **Verified identities** →
   verify either a single email address (quick, for testing) or a whole
   domain (recommended for production — adds DKIM). Must match
   `AWS_SES_FROM_EMAIL`'s domain.
2. **Create an SNS topic** — SNS console → **Topics** → create a Standard
   topic (e.g. `ses-email-events`). Note its ARN.
3. **Subscribe your app to the topic** — in the same topic, **Create
   subscription** → protocol `HTTPS` → endpoint
   `https://<your-app-url>/api/webhooks/ses`. SNS immediately POSTs a
   `SubscriptionConfirmation` message to that URL — the route
   auto-confirms it by fetching the included `SubscribeURL`, so the
   subscription should flip to "Confirmed" within a few seconds if your
   app is reachable. (Must be a publicly reachable HTTPS URL — use your
   ngrok URL for local dev, same as the Shopify OAuth callback.)
4. **Create an SES configuration set** — SES console → **Configuration
   sets** → create one (e.g. `campaign-sends`) → add an **Event
   destination** → destination type SNS → select the topic from step 2 →
   choose event types: **Bounces**, **Complaints**, and optionally
   **Deliveries**. Set its name as `AWS_SES_CONFIGURATION_SET` — every send
   already passes `ConfigurationSetName` on `SendEmailCommand`
   (`espProvider.ts`), so events start flowing to SNS as soon as this env
   var is set; nothing else to wire up in code. Leave it unset and sends
   still work fine, just without any events published (so the SNS webhook
   would never receive anything).
5. **Request production access** (see sandbox warning above) — without
   this, you can only meaningfully test bounce handling using SES's
   [Mailbox Simulator](https://docs.aws.amazon.com/ses/latest/dg/send-an-email-from-console.html)
   bounce/complaint addresses, since sandbox mode blocks sends to anyone else.

### `src/app/api/webhooks/ses/route.ts` + `src/lib/snsVerify.ts`
- Parses the SNS envelope; handles `SubscriptionConfirmation`/
  `UnsubscribeConfirmation` by fetching `SubscribeURL` automatically.
- **Verifies the SNS message signature before trusting anything**
  (`verifySnsSignature`) — manual implementation of
  [AWS's documented algorithm](https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html)
  using Node's built-in `crypto` (no extra package — `@aws-sdk/client-sns`
  is a delivery client, not a verifier). Also checks `SigningCertURL`'s
  hostname matches `sns.<region>.amazonaws.com` before fetching it, so an
  attacker can't point it at a self-signed cert. Fails closed: any error
  (bad host, fetch failure, signature mismatch) drops the message.
  **Not yet exercised against a real AWS-signed message** in this
  environment — there was no live SNS topic to generate one against. Treat
  the first real `SubscriptionConfirmation` after setup as the actual test,
  and check server logs / `webhook_logs` for a silent rejection if the
  subscription doesn't confirm.
- Parses `Bounce`/`Complaint`/`Delivery` from the notification body
  (handles both `eventType` — configuration-set event publishing — and
  `notificationType` — classic notifications — field names), matches back
  to a `campaign_recipients` row via `mail.tags.campaignId`/`contactId`,
  and updates its `status` to `"bounced"`/`"complained"`/`"delivered"`
  accordingly (plus `bounced_at`/`complained_at`).
- Logs the raw payload to `webhook_logs` (`source: "esp"`, `topic:
  "ses_bounce"`/`"ses_complaint"`/etc.) — same convention as the Shopify
  webhook handler.
- **Always returns 200 quickly**, even on a dropped/unverified message —
  SNS retries (and can eventually auto-disable the subscription) on
  non-2xx, same reasoning as `/api/webhooks/customers`.

### Analytics — what's real vs. what's honestly missing
On a sent campaign's view page: **Bounces**, **Complaints**, and **Failed**
counts are real, computed from `campaign_recipients.status`. **Opens** and
**Clicks** stay "—" with an explicit note — SES doesn't track those without
additional configuration (open-pixel injection + link rewriting, which SES
doesn't do out-of-the-box the way SendGrid/Postmark do) — this is a known
gap, not faked data.

### Sending & ESP settings page (`/shopify/sending`)
Read-only (env vars aren't editable from the UI in this task):
- Current `ESP_PROVIDER` and a masked `AWS_SES_FROM_EMAIL`
  (`GET /api/shopify/sending/status` — never returns the secret key).
- Sandbox-mode heuristic via `GetSendQuotaCommand` — SES v1's API has no
  actual "am I in sandbox" boolean (`GetAccountSendingEnabled` only reports
  whether sending is paused account-wide, not sandbox status), so this
  compares `Max24HourSend`/`MaxSendRate` against AWS's fixed sandbox
  defaults (200/day, 1/sec) as a heuristic, clearly labeled as such — not a
  guaranteed signal. Falls back to a static explanation of sandbox mode and
  how to request production access if the check fails (missing
  credentials, API error, or a non-SES provider).
- A "Send Test" button that calls `test-send` with no `template_id`, to
  verify the AWS connection independent of any saved template.
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
- `feat: collapsible sidebar toggle for shop app and admin panel`
- `feat: admin panel completion — shop management, cross-shop contacts, remove per-contact membership`
- `feat: email template builder with TipTap, starter gallery, and AI generation`
- `feat: campaigns with scheduling stub, template AI generation with Gemini/Anthropic toggle, admin contacts, sidebar shop-param fix`
- `feat: AWS SES email sending (ESP integration) + contact tagging with tag/specific-contact campaign audiences`
- `feat: campaign send upgrade — atomic 409 double-send guard, batched SES sends, pending recipient rows with error capture, credits ledger, failed status, campaign test-send`
- `feat: polished campaign status display — In Queue/Sending labels with spinner, optimistic sending flip + 2s status polling on send`