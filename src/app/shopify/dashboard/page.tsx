"use client";

import dynamic from "next/dynamic";

// Disable SSR for the entire dashboard because:
// 1. useAppBridge() only works in the browser (inside Shopify's iframe)
// 2. App Bridge reads window.location and parent frame — not available on server
// 3. Prevents the hydration mismatch error
const Dashboard = dynamic(() => import("./Dashboard"), { ssr: false });

export default function DashboardPage() {
  return <Dashboard />;
}