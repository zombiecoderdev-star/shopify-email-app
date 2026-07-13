"use client";

import dynamic from "next/dynamic";

const CampaignDetail = dynamic(() => import("./CampaignDetail"), { ssr: false });

export default function CampaignDetailPage() {
  return <CampaignDetail />;
}
