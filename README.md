# Shopify Email Marketing App

Built feature-by-feature. See `db/schema.sql` for the full data model.

## Stack
- Next.js (App Router, TypeScript, Tailwind)
- Supabase (Postgres)
- @shopify/shopify-api — OAuth + Admin API
- @shopify/app-bridge-react — embedding the app inside Shopify admin

## Local setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in real values
3. `npm run dev` — runs on http://localhost:3000
4. Run `db/schema.sql` against your Supabase project (SQL editor, or `psql`)
5. Start a tunnel (e.g. `ngrok http 3000`) and use that HTTPS URL as your
   app's URL + redirect URL in the Shopify Partners dashboard — Shopify
   cannot redirect to plain localhost during OAuth.

## Feature checklist
- [ ] OAuth install flow
- [ ] Embedded app shell (App Bridge)
- [ ] Contact sync (customers + webhooks)
- [ ] Segments
- [ ] Templates
- [ ] Campaigns + sending
- [ ] Scheduling
- [ ] Flows / automation engine
- [ ] Billing + email credits
- [ ] GDPR / compliance webhooks
