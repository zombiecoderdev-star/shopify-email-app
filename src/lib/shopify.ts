// Small shared config + helpers for talking to Shopify's OAuth + Admin API.
// We deliberately do NOT use the @shopify/shopify-api library's auth.begin()
// helper, because it's built around classic Express req/res and fights with
// Next.js App Router's NextRequest/NextResponse. Writing OAuth by hand here
// is ~3 small functions and means you can see exactly what's happening at
// each step of the OAuth diagram, rather than it being hidden in a library.

import crypto from "crypto";

export const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!;
export const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!;
export const SHOPIFY_SCOPES = process.env.SHOPIFY_SCOPES || "";
export const SHOPIFY_APP_URL = (process.env.SHOPIFY_APP_URL || "").replace(
  /\/$/,
  ""
);
export const SHOPIFY_API_VERSION = "2024-10";

// Builds the URL we send the merchant's browser to in order to show
// Shopify's consent screen. Matches "step 3: app redirects to OAuth consent"
// in the diagram.
export function buildAuthorizeUrl(shop: string, state: string) {
  const redirectUri = `${SHOPIFY_APP_URL}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: SHOPIFY_API_KEY,
    scope: SHOPIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

// Verifies the HMAC Shopify attaches to every request to prove it really
// came from Shopify and wasn't tampered with. Matches "step 2: includes
// shop domain and HMAC" in the diagram.
export function verifyHmac(searchParams: URLSearchParams) {
  const params = Object.fromEntries(searchParams.entries());
  const { hmac, ...rest } = params;
  if (!hmac) return false;

  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("&");

  const generatedHash = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET)
    .update(message)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(generatedHash),
    Buffer.from(hmac)
  );
}

// Exchanges the one-time auth code for a permanent access token.
// Matches "step 6: app exchanges code for access token" in the diagram.
export async function exchangeCodeForToken(shop: string, code: string) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: SHOPIFY_API_KEY,
      client_secret: SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<{ access_token: string; scope: string }>;
}

// Validates that a shop param actually looks like a myshopify domain,
// to avoid building redirect URLs to arbitrary attacker-supplied hosts.
export function isValidShopDomain(shop: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}
