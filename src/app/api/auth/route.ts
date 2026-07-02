import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { buildAuthorizeUrl, isValidShopDomain } from "@/lib/shopify";

// GET /api/auth?shop=my-store.myshopify.com
//
// Entry point for installing the app. Matches steps 2-3 of the OAuth
// diagram: we receive the shop's domain, then redirect the merchant's
// browser to Shopify's own consent screen, asking for our app's scopes.

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");

  if (!shop || !isValidShopDomain(shop)) {
    return NextResponse.json(
      { error: "Missing or invalid ?shop= parameter" },
      { status: 400 }
    );
  }

  // "state" is a random value we generate, send to Shopify, and check
  // again when Shopify redirects back — this prevents a CSRF attack where
  // someone tricks a merchant into completing OAuth for the wrong shop.
  const state = crypto.randomBytes(16).toString("hex");

  const authorizeUrl = buildAuthorizeUrl(shop, state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("shopify_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutes is plenty for the merchant to click "approve"
  });

  return response;
}
