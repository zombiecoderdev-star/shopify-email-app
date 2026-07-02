import { createClient } from "@supabase/supabase-js";

// IMPORTANT: this client uses the SERVICE ROLE key, which bypasses Row
// Level Security. It must only ever be imported in server-side code
// (API routes / route handlers) — never in a "use client" component,
// or you'd leak this key to the browser.

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
