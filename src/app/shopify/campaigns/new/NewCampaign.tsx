"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppBridge } from "@shopify/app-bridge-react";
import CampaignWizard from "@/components/CampaignWizard";

export default function NewCampaign() {
  const shopify = useAppBridge();
  const router = useRouter();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const toast = (msg: string, opts?: { isError?: boolean }) => shopify.toast.show(msg, opts);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Campaign</h1>
          <p className="text-sm text-gray-400 mt-1">
            Pick a template, choose an audience, then save, schedule, or send.
          </p>
        </div>
        <Link
          href={`/shopify/campaigns?shop=${shop}`}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </Link>
      </div>

      <CampaignWizard
        shop={shop}
        onSaved={() => router.push(`/shopify/campaigns?shop=${shop}`)}
        showToast={toast}
      />
    </div>
  );
}
