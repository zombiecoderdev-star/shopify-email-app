import { NextRequest, NextResponse } from "next/server";
import {
  verifyHmac,
  exchangeCodeForToken,
  isValidShopDomain,
  SHOPIFY_API_KEY,
} from "@/lib/shopify";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/auth/callback?shop=...&code=...&state=...&hmac=...
//
// Shopify lands the merchant's browser here after they approve the
// permissions screen. Matches steps 5-6 of the OAuth diagram: we verify
// the request really came from Shopify, exchange the one-time code for a
// permanent access token, then save it against the shop in Supabase.

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const shop = searchParams.get("shop");
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!shop || !code || !isValidShopDomain(shop)) {
    return NextResponse.json({ error: "Invalid callback request" }, { status: 400 });
  }

  // 1. Check the state cookie we set in /api/auth matches what came back.
  const savedState = req.cookies.get("shopify_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.json({ error: "State mismatch — possible CSRF" }, { status: 403 });
  }

  // 2. Verify the HMAC signature to confirm this request really came
  //    from Shopify and wasn't forged.
  if (!verifyHmac(searchParams)) {
    return NextResponse.json({ error: "Invalid HMAC signature" }, { status: 403 });
  }

  // 3. Exchange the one-time code for a permanent (offline) access token.
  const { access_token, scope } = await exchangeCodeForToken(shop, code);

  // 4. Save (or update, if reinstalling) the shop + token in Supabase.
  const { error } = await supabaseAdmin
    .from("shops")
    .upsert(
      {
        shop_domain: shop,
        access_token,
        scope,
        is_active: true,
        installed_at: new Date().toISOString(),
        uninstalled_at: null,
      },
      { onConflict: "shop_domain" }
    );

  if (error) {
    console.error("Failed to save shop:", error);
    return NextResponse.json({ error: "Database error saving shop" }, { status: 500 });
  }

  // 5. Installation complete — redirect the merchant into the embedded app.
  //    Shopify opens our app at:
  //    https://{shop}/admin/apps/{api_key}
  //    which embeds our /shopify/dashboard page in an iframe inside admin.
  //    Shopify automatically appends ?shop=...&host=... to our URL so
  //    App Bridge knows which shop it's talking to.
  const response = NextResponse.redirect(
    `https://${shop}/admin/apps/${SHOPIFY_API_KEY}`
  );
  response.cookies.delete("shopify_oauth_state");
  return response;
}
