import { createClient } from "@supabase/supabase-js";
 
// Browser-side Supabase client — uses the anon key.
// Used in client components for Supabase Auth (login/logout).
// Does NOT have service_role access — only what RLS allows.
 
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
 
