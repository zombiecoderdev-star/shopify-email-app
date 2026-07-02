import { NextRequest, NextResponse } from "next/server";

// Shopify requires the Content-Security-Policy frame-ancestors header to be
// set DYNAMICALLY per shop — a static header in next.config.ts is not enough
// and causes the iframe to disconnect/fail after a few seconds.
//
// This middleware runs on every request to /shopify/* pages and sets the
// correct CSP header using the shop domain from the ?shop= query param
// that Shopify appends when it embeds your app.

export function middleware(req: NextRequest) {
  const response = NextResponse.next();

  // Only apply to embedded app pages, not API routes
  if (req.nextUrl.pathname.startsWith("/shopify")) {
    const shop = req.nextUrl.searchParams.get("shop");

    // Build frame-ancestors: allow Shopify admin + the specific shop domain
    // If no shop param yet, allow all myshopify.com as fallback
    const frameAncestors = shop
      ? `https://admin.shopify.com https://${shop} https://${shop}.myshopify.com`
      : `https://admin.shopify.com https://*.myshopify.com`;

    response.headers.set(
      "Content-Security-Policy",
      `frame-ancestors ${frameAncestors};`
    );

    // Bypass ngrok browser warning interstitial
    response.headers.set("ngrok-skip-browser-warning", "true");
  }

  return response;
}

export const config = {
  matcher: ["/shopify/:path*"],
};
