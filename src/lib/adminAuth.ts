import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Verifies the admin panel's Supabase session cookie server-side.
// Shared by every /api/admin/* route — do not duplicate this per-route.
export async function verifyAdminSession(req: NextRequest) {
  const allCookies = req.cookies.getAll();
  const authCookie = allCookies.find(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );
  if (!authCookie) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(authCookie.value));
    const accessToken = parsed.access_token;
    if (!accessToken) return null;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user } } = await supabase.auth.getUser(accessToken);
    return user;
  } catch {
    return null;
  }
}
