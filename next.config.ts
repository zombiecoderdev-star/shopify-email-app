import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CSP frame-ancestors headers are set dynamically in src/middleware.ts
  // because Shopify requires per-shop headers, not a static value.
  allowedDevOrigins: ['clobber-imitate-hatred.ngrok-free.dev'],
};

export default nextConfig;
