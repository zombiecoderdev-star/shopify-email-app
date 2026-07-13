"use client";

import dynamic from "next/dynamic";

const NewCampaign = dynamic(() => import("./NewCampaign"), { ssr: false });

export default function NewCampaignPage() {
  return <NewCampaign />;
}
