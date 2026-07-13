"use client";

import dynamic from "next/dynamic";

const Campaigns = dynamic(() => import("./Campaigns"), { ssr: false });

export default function CampaignsPage() {
  return <Campaigns />;
}
