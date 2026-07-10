import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Shopify embedded app: dynamic CSP per shop ──────────────────────────────
  if (pathname.startsWith("/shopify")) {
    const response = NextResponse.next();
    const shop = req.nextUrl.searchParams.get("shop");
    const frameAncestors = shop
      ? `https://admin.shopify.com https://${shop} https://${shop}.myshopify.com`
      : `https://admin.shopify.com https://*.myshopify.com`;
    response.headers.set("Content-Security-Policy", `frame-ancestors ${frameAncestors};`);
    response.headers.set("ngrok-skip-browser-warning", "true");
    return response;
  }

  // ── Admin panel: session protection ─────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    // Login page is always accessible
    if (pathname === "/admin/login") return NextResponse.next();

    // Check for Supabase session via access token cookie
    const accessToken = req.cookies.get("sb-access-token")?.value
      || req.cookies.get(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split("//")[1]?.split(".")[0]}-auth-token`)?.value;

    // Parse the auth token from Supabase cookie format
    // Supabase stores session as JSON in a cookie
    let isAuthenticated = false;

    const cookieStore = req.cookies;
    const allCookies = cookieStore.getAll();

    // Find the Supabase auth cookie (format: sb-<project-ref>-auth-token)
    const authCookie = allCookies.find(
      (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
    );

    if (authCookie) {
      try {
        const parsed = JSON.parse(decodeURIComponent(authCookie.value));
        // Check token expiry
        const expiresAt = parsed.expires_at || 0;
        if (expiresAt > Math.floor(Date.now() / 1000)) {
          isAuthenticated = true;
        }
      } catch {
        isAuthenticated = false;
      }
    }

    if (!isAuthenticated) {
      const loginUrl = new URL("/admin/login", req.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/shopify/:path*", "/admin/:path*"],
};